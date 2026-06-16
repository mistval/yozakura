FROM node:24-bookworm-slim AS web-builder
WORKDIR /app

COPY client/package*.json ./client/
RUN npm ci --prefix client

COPY client/index.html client/postcss.config.js client/tsconfig.json client/tsconfig.node.json client/vite.config.ts ./client/
COPY client/src ./client/src
RUN npm run build --prefix client

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

COPY server/package*.json ./server/
RUN npm ci --prefix server

COPY server/index.ts server/tsconfig.json ./server/
COPY server/src ./server/src
RUN npm run build --prefix server

COPY --from=web-builder /app/client/dist ./client/dist

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=4396
ENV YOZAKURA_DATA_DIR=/app/data
ENV YOZAKURA_FRONTEND_DIST_DIR=/app/client/dist

EXPOSE 4396
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:4396/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "server/dist/index.js"]
