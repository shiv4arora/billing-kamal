FROM node:20-alpine

# Install openssl for Prisma + bash for the start script
RUN apk add --no-cache openssl bash

WORKDIR /app

# Copy workspace package files first (for layer caching)
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install all workspace dependencies
RUN npm install

# Copy all source files
COPY . .

# Build frontend (Vite) + backend (tsc)
RUN npm run build

# Create the data directory so SQLite can write there on first boot
RUN mkdir -p /data

# Expose the port Express listens on
EXPOSE 4000

# On start: push schema, seed (idempotent upserts), then run compiled app
CMD ["sh", "-c", "mkdir -p /data && cd /app/backend && npx prisma db push && npx tsx prisma/seed.ts && node dist/index.js"]
