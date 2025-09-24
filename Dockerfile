# Stage 1: Build the application
FROM node:20-slim AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for the build)
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the client and server
RUN npm run build

# Stage 2: Create the production image
FROM node:20-slim

WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the built application from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/videos ./videos

# Expose the port the app runs on
EXPOSE 8080

# Set the entrypoint to run the production server
CMD ["npm", "run", "start"]