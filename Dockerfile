# --- etapa 1: compilar el frontend ---
FROM node:22-slim AS build
WORKDIR /app
COPY client/package*.json client/
RUN npm ci --prefix client
COPY client client
RUN npm run build --prefix client

# --- etapa 2: imagen final (API + estáticos) ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json server/
RUN npm ci --prefix server --omit=dev
COPY server/src server/src
COPY --from=build /app/client/dist client/dist

# la base de datos SQLite vive aquí: montar un volumen persistente
VOLUME /app/server/data

EXPOSE 3999
CMD ["node", "server/src/index.js"]
