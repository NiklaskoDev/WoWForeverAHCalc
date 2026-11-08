# Forever AH Crafting

A crafting-profit calculator for WoW Forever / Classic auction houses. To use it, double-click `start.bat` (needs Python) and keep its window open. Live Blizzard prices don't work if you open `index.html` directly. The app saves your data per browser and address, so enter your API key once at `http://localhost:8778/`.

## Unraid

Each push to `main` publishes `ghcr.io/niklaskodev/wowforeverahcalc:latest`.

1. In the Unraid terminal, install the template:

   ```bash
   curl -fsSL -o /boot/config/plugins/dockerMan/templates-user/my-forever-ah.xml https://raw.githubusercontent.com/NiklaskoDev/WoWForeverAHCalc/main/unraid/forever-ah.xml
   ```

2. Go to **Docker → Add Container** and choose **forever-ah** under Template.
3. Enter your Blizzard Client ID and Secret, region, ruleset and auction house, then click **Apply**.
4. Open the WebUI from the container's icon.

Data is kept in `/mnt/user/appdata/forever-ah`, owned by `nobody:users`. Keep the port on your home network, since the app has no login. Use **Check for Updates** on the Docker tab to get new versions.

## Home server (Docker)

The container serves the app and fetches Forever prices in the background, even with no browser open.

1. Copy this folder to the server.
2. Copy `.env.example` to `.env` and fill in your Blizzard API client, ruleset and auction house. Find the right house first with **Compare houses** (see below).
3. Run `docker compose up -d --build` and open `http://<server-ip>:8778/`.

- Prices and sale rates are shared by every device and kept in a Docker volume across restarts.
- Keep it on your home network or behind your own login. The app has no login of its own. `.env` stays on the server, and the web pages can't read it.
- To change market, edit `.env`, then run `docker compose up -d`. Sale rates restart for the new market.
- Skills and your own prices are still saved per browser.
- Vendor prices and exact item checks still need an API key entered in the browser. The disenchant auction scan needs it too.
- Logs: `docker logs forever-ah`.

## Getting prices

1. **WoW Forever (Blizzard API, unofficial):** on **Settings & sync**, add a free API client from https://develop.battle.net/access/clients. Keep the game version on WoW Forever, click **Load realms / rulesets**, and pick your ruleset and any house of your faction. Click **Compare houses**, use the house whose prices match the game, then **Update prices now**. Prices refresh hourly while the page is open. These routes are undocumented and may change.
   - **Auctionator fallback:** do a full scan and `/reload`, then click **Link Auctionator file** on **Prices** (Chrome/Edge) and choose `WTF/Account/<ACCOUNT>/SavedVariables/Auctionator.lua`. Prices re-import when the file changes while the page is open. Use **Import once** in Firefox.
2. **Classic realms (Blizzard API):** on **Settings & sync**, create a free API client at https://develop.battle.net/access/clients and paste its Client ID and Secret. Pick a game version and your realm, then click **Update prices**. Prices refresh every hour while the page is open. Don't use this for Forever: Classic realms are a different economy.
   - **Check item IDs & load item info** uses the game version selected there, so keep it on WoW Forever for Forever item data.
3. **By hand:** type prices into the **Prices** tab, or paste `Item name, price` lines.

## Tabs

- **Best crafts:** enter your profession skills. Crafts are ranked by profit per craft or by profit using your whole budget. Three views: one ranked list, top N per profession, or best crafts per 25-skill bracket.
- **Budget planner:** shows how many of a recipe you can afford, with a shopping list and crafting steps. It follows the actual AH listings, so cost goes up as the cheapest listings run out. It also tells you where extra crafts stop paying off.
- **Disenchanting:** a DE calculator, expected value by item level, a craft-and-disenchant comparison, and an AH scan for items listed below their disenchant value.
- **Recipes:** 2,415 WoW Forever recipes from 9 professions. Fix anything wrong with **Edit**, or use **+ Add recipe** for anything missing.

## Data notes

- **Sold / day** is an estimate. Blizzard's API has no sales data, so the app counts listings that vanish between hourly updates. It needs the app open for about 6 hours before it shows numbers. Cancelled auctions can be counted as sales, and the figure is for the whole auction house. You can type your own number on **Prices**.
- Recipes and reagents come from the WoW Forever database at https://metaforge.app (unofficial). Most required-skill values are marked as estimates there, so a recipe can unlock slightly earlier or later in-game. 79 recipes are left out because a reagent has no item data. Items listed twice with different IDs appear as `Name [id]`.
- Vendor prices for thread, vials and dyes are estimates. The Blizzard item sync replaces them with the real prices.
