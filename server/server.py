"""Serves the app and keeps WoW Forever auction data fresh in the background.

Credentials come from the environment only. No endpoint reads or changes them.
"""
import base64
import email.utils
import functools
import gzip
import http.server
import json
import os
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request

CLIENT_ID = os.environ.get('BLIZZARD_CLIENT_ID', '').strip()
CLIENT_SECRET = os.environ.get('BLIZZARD_CLIENT_SECRET', '').strip()
REGION = os.environ.get('FOREVER_REGION', 'eu').strip().lower()
RULESET = os.environ.get('FOREVER_RULESET', '').strip()
HOUSE = os.environ.get('FOREVER_HOUSE', '').strip()
POLL_MINUTES = max(1, int(os.environ.get('POLL_MINUTES', '5') or 5))
DATA_DIR = os.environ.get('DATA_DIR', '/data')
WEB_DIR = os.environ.get('WEB_DIR', '/app/web')
PORT = int(os.environ.get('PORT', '8080'))

RULESET_NAMES = {'1': 'PvP', '2': 'Normal', '3': 'Roleplay', '15': 'Roleplay PvP'}
LABEL = f'Forever {RULESET_NAMES.get(RULESET, "ruleset " + RULESET)} · house {HOUSE}'
MAX_BOOK = 120
MAX_GAP_HOURS = 3
MAX_SALES_HOURS = 336

lock = threading.Lock()
status = {'enabled': False, 'ts': 0, 'dataTs': 0, 'label': LABEL, 'error': '', 'lastCheck': 0}
market_gz = None
token = None
last_modified = {'reg': None, 'com': None}


# ---------------------------------------------------------------- storage
def path(name):
    return os.path.join(DATA_DIR, name)


def read_json(name, default):
    try:
        with open(path(name), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(name, value):
    tmp = path(name + '.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(value, f, separators=(',', ':'))
    os.replace(tmp, path(name))


# ---------------------------------------------------------------- Blizzard API
def get_token():
    global token
    if token and token[1] > time.time() + 60:
        return token[0]
    basic = base64.b64encode(f'{CLIENT_ID}:{CLIENT_SECRET}'.encode()).decode()
    req = urllib.request.Request('https://oauth.battle.net/token', data=b'grant_type=client_credentials',
                                 headers={'Authorization': 'Basic ' + basic, 'User-Agent': 'forever-ah'})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.load(r)
    token = (j['access_token'], time.time() + j.get('expires_in', 86399))
    return token[0]


def api(route, since=None, retry=True):
    """Returns (json or None if not modified, Last-Modified header)."""
    global token
    query = urllib.parse.urlencode({'namespace': f'dynamic-forever-{REGION}'})
    headers = {'Authorization': 'Bearer ' + get_token(), 'Accept-Encoding': 'gzip', 'User-Agent': 'forever-ah'}
    if since:
        headers['If-Modified-Since'] = since
    req = urllib.request.Request(f'https://{REGION}.api.blizzard.com{route}?{query}', headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = r.read()
            if r.headers.get('Content-Encoding') == 'gzip':
                body = gzip.decompress(body)
            return json.loads(body), r.headers.get('Last-Modified')
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return None, since
        if e.code in (401, 403) and retry:
            token = None
            return api(route, since, False)
        raise


def data_age_ms():
    """When Blizzard generated the current snapshot, which can be well before we downloaded it."""
    stamps = [email.utils.parsedate_to_datetime(v).timestamp() for v in last_modified.values() if v]
    return int(max(stamps) * 1000) if stamps else 0


def fetch_part(key, route, since):
    try:
        return api(route, since)
    except urllib.error.HTTPError as e:
        if key == 'com' and e.code == 404:
            return {'auctions': []}, None
        raise


def fetch_auctions():
    """Returns merged regular + commodity auctions, or None if neither list has changed."""
    base = f'/data/wow/ruleset/{RULESET}/auctions/{HOUSE}'
    routes = {'reg': base, 'com': base + '/commodities'}
    got = {k: fetch_part(k, r, last_modified[k]) for k, r in routes.items()}
    if all(v[0] is None for v in got.values()):
        return None
    for k, r in routes.items():
        if got[k][0] is None:  # one list changed; the other is still needed in full
            got[k] = fetch_part(k, r, None)
    seen, out = set(), []
    for k in routes:
        last_modified[k] = got[k][1]
        for a in got[k][0].get('auctions') or []:
            sig = (a.get('id'), (a.get('item') or {}).get('id'), a.get('quantity'), a.get('buyout'), a.get('unit_price'))
            if sig not in seen:
                seen.add(sig)
                out.append(a)
    return out


# ---------------------------------------------------------------- market math (mirrors app-core.js)
def unit_price(a):
    q = a.get('quantity') or 1
    if a.get('unit_price') is not None:
        return a['unit_price']
    return a['buyout'] / q if a.get('buyout') else None


def market_value(book, total):
    target = max(1, -(-total * 15 // 100))
    n, cost, prev = 0, 0, None
    for p, q in book:
        if prev is not None and n > 0 and p > prev * 1.2:
            break
        take = min(q, target - n)
        cost += p * take
        n += take
        prev = p
        if n >= target:
            break
    return int(cost / n + 0.5)


def aggregate(auctions):
    per = {}
    for a in auctions:
        item = (a.get('item') or {}).get('id')
        unit = unit_price(a)
        if not item or not unit:
            continue
        levels = per.setdefault(item, {})
        unit = int(unit + 0.5)
        levels[unit] = levels.get(unit, 0) + (a.get('quantity') or 1)
    items = {}
    for item, levels in per.items():
        book = sorted(levels.items())
        qty = sum(q for _, q in book)
        items[item] = {'min': book[0][0], 'mkt': market_value(book, qty), 'qty': qty,
                       'book': [list(x) for x in book[:MAX_BOOK]]}
    return items


def update_sales(auctions, now):
    """Infers sales by comparing this snapshot with the previous one. Returns the sales record."""
    cur = {}
    for a in auctions:
        item = (a.get('item') or {}).get('id')
        if not a.get('id') or not item:
            continue
        cur[f"{item}|{a['id']}"] = [item, a['id'], a.get('quantity') or 1, int((unit_price(a) or 0) + 0.5),
                                    1 if a.get('time_left') in ('LONG', 'VERY_LONG') else 0]
    prev = read_json('snapshot.json', None)
    sales = read_json('sales.json', None)
    if not sales or sales.get('label') != LABEL:
        sales = {'label': LABEL, 'hours': 0, 'sold': {}}
    gap = (now - prev['ts']) / 3600 if prev and prev.get('label') == LABEL else None
    if gap is not None and 0 < gap <= MAX_GAP_HOURS:
        old = prev['items']
        changed, gone, fresh = False, [], {}

        def add(item, q):
            sales['sold'][str(item)] = sales['sold'].get(str(item), 0) + q

        for k, p in old.items():
            c = cur.get(k)
            if c is None:
                changed = True
                if p[4]:
                    gone.append(p)
            elif c[2] < p[2]:
                changed = True
                add(p[0], p[2] - c[2])
        for k, c in cur.items():
            if k not in old:
                changed = True
                fresh.setdefault((c[0], c[2]), []).append(c[3])
        for p in gone:
            relisted = fresh.get((p[0], p[2]), [])
            cheaper = next((u for u in relisted if u < p[3]), None)
            if cheaper is not None:
                relisted.remove(cheaper)
            else:
                add(p[0], p[2])
        if not changed:
            return sales
        sales['hours'] += gap
        if sales['hours'] > MAX_SALES_HOURS:
            f = MAX_SALES_HOURS / sales['hours']
            sales['hours'] = MAX_SALES_HOURS
            sales['sold'] = {k: v * f for k, v in sales['sold'].items()}
    write_json('sales.json', sales)
    write_json('snapshot.json', {'ts': now, 'label': LABEL, 'items': cur})
    return sales


# ---------------------------------------------------------------- worker
def publish(market):
    global market_gz
    data = gzip.compress(json.dumps(market, separators=(',', ':')).encode(), 6)
    with lock:
        market_gz = data
        status['ts'] = market['ts']
        status['dataTs'] = market.get('dataTs', 0)
        status['error'] = ''


def refresh():
    auctions = fetch_auctions()
    with lock:
        status['lastCheck'] = int(time.time() * 1000)
        status['error'] = ''
    if auctions is None:
        return False
    now = time.time()
    sales = update_sales(auctions, now)
    market = {'ts': int(now * 1000), 'dataTs': data_age_ms(), 'label': LABEL, 'count': len(auctions), 'items': aggregate(auctions), 'sales': sales}
    write_json('market.json', market)
    publish(market)
    print(f'{time.strftime("%H:%M:%S")} updated: {len(auctions)} auctions, {market["items"].__len__()} items, '
          f'{sales["hours"]:.1f}h of sales data', flush=True)
    return True


def worker():
    while True:
        try:
            refresh()
        except Exception as e:  # keep serving the last good data
            message = f'HTTP {e.code}' if isinstance(e, urllib.error.HTTPError) else str(e)
            with lock:
                status['error'] = 'Last update failed: ' + message
                status['lastCheck'] = int(time.time() * 1000)
            print('update failed:', message, flush=True)
            if not isinstance(e, (urllib.error.URLError, TimeoutError)):
                traceback.print_exc()
        time.sleep(POLL_MINUTES * 60)


# ---------------------------------------------------------------- web
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def send_body(self, body, ctype, gz=False):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        if gz:
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = self.path.split('?', 1)[0]
        if route == '/api/status':
            with lock:
                body = json.dumps(status).encode()
            return self.send_body(body, 'application/json')
        if route == '/api/market':
            with lock:
                data = market_gz
            if data is None:
                return self.send_error(404)
            if 'gzip' in self.headers.get('Accept-Encoding', ''):
                return self.send_body(data, 'application/json', True)
            return self.send_body(gzip.decompress(data), 'application/json')
        return super().do_GET()

    def log_message(self, *args):
        pass


def main():
    missing = [n for n, v in (('BLIZZARD_CLIENT_ID', CLIENT_ID), ('BLIZZARD_CLIENT_SECRET', CLIENT_SECRET),
                              ('FOREVER_RULESET', RULESET), ('FOREVER_HOUSE', HOUSE)) if not v]
    if missing:
        status['error'] = 'Background prices are off. Missing container setting: ' + ', '.join(missing)
        print(status['error'], flush=True)
    else:
        status['enabled'] = True
        os.makedirs(DATA_DIR, exist_ok=True)
        saved = read_json('market.json', None)
        if saved and saved.get('label') == LABEL:
            publish(saved)
        threading.Thread(target=worker, daemon=True).start()
    handler = functools.partial(Handler, directory=WEB_DIR)
    print(f'Serving on port {PORT}', flush=True)
    http.server.ThreadingHTTPServer(('0.0.0.0', PORT), handler).serve_forever()


if __name__ == '__main__':
    main()
