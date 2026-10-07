FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# The application is intentionally packaged from the locally built dist/.
COPY dist ./dist

RUN mkdir -p /app/storage/data

EXPOSE 3001
CMD ["node", "dist/main.js"]
