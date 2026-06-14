FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY vitest.config.ts ./
COPY src ./src
COPY tests ./tests
COPY sql ./sql
COPY data ./data
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=base /app/dist ./dist
COPY data ./data
EXPOSE 4000
CMD ["node", "dist/server.js"]
