# syntax=docker/dockerfile:1

# ---- 依赖层（同时作为 verify 一次性服务的运行环境） ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# ---- 构建检查：类型检查 + 生产构建 ----
FROM deps AS build
RUN npm run build

# ---- 纯静态 Web：nginx 仅托管 dist，无业务后端 ----
FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# ---- verify 目标：复用含 devDependencies 与源码的 deps 层 ----
FROM deps AS verify
ENV BASE_URL=http://web/
CMD ["sh", "-c", "npm test && npm run build && npx tsx scripts/check-requirements.ts"]
