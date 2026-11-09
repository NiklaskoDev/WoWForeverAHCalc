FROM python:3.12-alpine
RUN apk add --no-cache su-exec && mkdir -p /data /app/web
COPY server/server.py /app/server.py
COPY server/entrypoint.sh /entrypoint.sh
COPY addon/ /app/addon/
COPY index.html app-core.js app-ui.js data-items.js data-recipes.js data-forever.js /app/web/
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
ENV PUID=99 PGID=100
EXPOSE 8080
VOLUME /data
ENTRYPOINT ["/entrypoint.sh"]
