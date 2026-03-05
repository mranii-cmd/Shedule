# Minimal Dockerfile for the API service
FROM node:20-alpine as base

WORKDIR /app

# Install dependencies (production)
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Start the API
CMD ["node", "server.js"]