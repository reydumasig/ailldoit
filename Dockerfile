# Stage 1: Build the application
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./
# Install all dependencies, including devDependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build both the client and server
RUN npm run build

# Stage 2: Create the production image
FROM node:20-alpine
WORKDIR /app

# Copy the build artifacts and package files from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json

# Only install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port and define the start command
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1
CMD ["npm", "start"]
