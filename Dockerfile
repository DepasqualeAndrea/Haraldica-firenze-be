# ====================================
# MULTI-STAGE DOCKERFILE - PRODUCTION
# ====================================

# ============ STAGE 1: Builder ============
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for build
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# ============ STAGE 2: Production ============
FROM node:20-alpine AS production

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy email templates to the correct location relative to compiled code
# The email service uses __dirname which resolves to dist/src/modules/public-api/notifications/
# So templates need to be at dist/src/modules/public-api/notifications/templates/
COPY --from=builder /app/src/modules/public-api/notifications/templates ./dist/src/modules/public-api/notifications/templates

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Create directories for uploads/logs with correct permissions
RUN mkdir -p /app/uploads /app/logs /app/storage && \
    chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Start application
CMD ["node", "dist/main.js"]
