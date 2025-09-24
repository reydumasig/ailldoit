# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Install curl for health checks and other utilities
RUN apk add --no-cache curl bash

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN echo "Building application..." && \
    npm run build && \
    echo "Build completed successfully" && \
    ls -la dist/ && \
    echo "Build verification complete"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 8080

# Health check - Cloud Run will handle this, but keep for local testing
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

# Start the application with better error handling
CMD ["sh", "-c", "echo 'Starting Ailldoit application...' && echo 'Environment:' && env | grep -E '(NODE_ENV|PORT|DATABASE_URL)' && echo 'Checking dist directory:' && ls -la dist/ && echo 'Starting server...' && node dist/index.js"]
