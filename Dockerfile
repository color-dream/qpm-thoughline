# qpm-thoughtline · 网页版静态站点
# 构建:docker build -t qpm-thoughtline:local .
# 运行:docker run -p 10109:80 qpm-thoughtline:local

# ---------- 构建 ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- 运行 ----------
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
