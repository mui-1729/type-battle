FROM node:22-slim AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/realtime ./apps/realtime

# Install dependencies and build
RUN npm ci
RUN npm run build -w @type-battle/shared
RUN npm run build -w @type-battle/realtime

# Final image
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/realtime/package.json ./apps/realtime/
COPY --from=builder /app/apps/realtime/dist ./apps/realtime/dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "@type-battle/realtime"]
