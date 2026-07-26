# Compilación de producción del frontend, servida por nginx. Solo se usa para
# `make preview`: en producción el destino es Cloudflare Pages (ADR-001).
#
# Las variables VITE_ se incrustan en el JavaScript al compilar, así que son
# argumentos de build y no variables de ejecución. La clave anónima es pública
# por diseño; lo que protege los datos son las políticas RLS.
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_APP_URL=$VITE_APP_URL

RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
