# Multi-stage build for GestAd
FROM node:20-alpine AS base

WORKDIR /usr/src/app

# Stage 1: Install dependencies
FROM base AS dependencies

COPY package*.json ./

# Install ALL dependencies (including devDependencies for potential builds)
RUN npm install --no-audit --no-fund

# Stage 2: Production dependencies only
FROM base AS prod-dependencies

COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --no-audit --no-fund

# Stage 3: Production image
FROM node:20-alpine AS production

WORKDIR /usr/src/app

# Copy production dependencies
COPY --from=prod-dependencies /usr/src/app/node_modules ./node_modules

# Copy package files
COPY package*.json ./

# Copy application source
COPY src ./src
COPY public ./public

# Create directories for uploads and logs
RUN mkdir -p uploads logs

# Create non-root user
RUN addgroup -g 1001 -S app \
  && adduser -S -u 1001 -G app app \
  && chown -R app:app /usr/src/app

# Switch to non-root user
USER app

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Start application
CMD ["node", "src/index.js"]