FROM node:20-alpine

# Install openssl for Prisma
RUN apk add --no-cache openssl

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

# Expose the port Express listens on
EXPOSE 4000

# On start: push schema, seed (idempotent upserts), then run compiled app
CMD cd backend && npx prisma db push && npx tsx prisma/seed.ts && node dist/index.js
