FROM node:22-alpine

WORKDIR /app
COPY server.js index.html Movies.ico ./
COPY vlc-handler ./vlc-handler

ENV NODE_ENV=production \
    MOVIES_PORT=3000 \
    MOVIES_BIND_ADDRESS=0.0.0.0 \
    MOVIES_ROOT=/video \
    MOVIES_CACHE_PATH=/data/cache.json \
    MOVIES_PID_PATH=/data/server.pid

EXPOSE 3000
CMD ["node", "server.js"]
