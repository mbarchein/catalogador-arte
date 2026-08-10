# Production build of the frontend, served by nginx. It is used only for
# `make preview`: in production the destination is Cloudflare Pages (ADR-001).
#
# The VITE_ variables are embedded in the JavaScript on building, so they are
# build arguments and not run-time variables. The anonymous key is public
# by design; what protects the data are the RLS policies.
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
