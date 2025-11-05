# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Define ARGs for all build-time secrets
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_STRIPE_PUBLIC_KEY
ARG VITE_STRIPE_STARTER_PRICE_ID
ARG VITE_STRIPE_GROWTH_PRICE_ID

# Copy package files and install all dependencies for the build
COPY package.json package-lock.json ./
RUN npm install --force && npm install @rollup/rollup-linux-x64-musl --save-dev

# Copy the rest of the application source code
COPY . .

# Make ARGs available as environment variables for the build process
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_STRIPE_PUBLIC_KEY=$VITE_STRIPE_PUBLIC_KEY
ENV VITE_STRIPE_STARTER_PRICE_ID=$VITE_STRIPE_STARTER_PRICE_ID
ENV VITE_STRIPE_GROWTH_PRICE_ID=$VITE_STRIPE_GROWTH_PRICE_ID

# ❌ Remove COPY .env.docker .env — Cloud Build doesn’t have it
# ✅ Instead, just check for it locally, so local builds still work
RUN if [ -f .env.docker ]; then \
      echo "✅ Using .env.docker locally"; \
      cp .env.docker .env; \
    else \
      echo "ℹ️ No .env.docker file found (skipping)"; \
    fi

# Build the client and server
RUN npm run build

# Stage 2: Create the production image
FROM node:20-alpine

WORKDIR /app

# Install FFmpeg for video processing
RUN apk add --no-cache ffmpeg

# Install only production dependencies
# We copy package files again and run install to ensure a clean production environment
COPY package.json package-lock.json ./
RUN npm install --omit=dev --force

# Copy the built application from the builder stage
COPY --from=builder /app/dist ./dist

# Copy environment file for runtime
# COPY --from=builder /app/.env .env

# Expose the port the app runs on
EXPOSE 8080

# Set the entrypoint to run the production server
CMD ["npm", "start"]