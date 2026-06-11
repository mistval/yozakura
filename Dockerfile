FROM node:24-bookworm-slim AS web-builder
WORKDIR /app

COPY client/package*.json ./client/
RUN npm ci --prefix client

COPY client ./client
RUN npm run build --prefix client

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix server

COPY server ./server
COPY --from=web-builder /app/client/dist ./client/dist

RUN mkdir -p /app/data

ENV PORT=3001
ENV DATA_DIR=/app/data

EXPOSE 3001
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "server/index.js"]
