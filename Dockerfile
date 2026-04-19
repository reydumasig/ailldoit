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

# Copy package files and install all dependencies for the build.
# Use `npm ci` so the platform-specific rollup/esbuild optional deps resolve
# correctly for whatever architecture Docker is targeting (linux/amd64 in Cloud
# Build, linux/arm64 when a dev builds locally on Apple Silicon). Previously we
# force-installed @rollup/rollup-linux-x64-musl, which broke arm64 builds.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

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

# Create .env file so Vite sees all Firebase + Stripe config at build time
RUN echo "VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY" > .env && \
    echo "VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN" >> .env && \
    echo "VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID" >> .env && \
    echo "VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET" >> .env && \
    echo "VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID" >> .env && \
    echo "VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID" >> .env && \
    echo "VITE_STRIPE_PUBLIC_KEY=$VITE_STRIPE_PUBLIC_KEY" >> .env && \
    echo "VITE_STRIPE_STARTER_PRICE_ID=$VITE_STRIPE_STARTER_PRICE_ID" >> .env && \
    echo "VITE_STRIPE_GROWTH_PRICE_ID=$VITE_STRIPE_GROWTH_PRICE_ID" >> .env && \
    echo "✅ .env file for Vite created:"
RUN cat .env

# 🔥 Debug print to confirm vars are set inside the build container
RUN echo "🔥 Checking env vars in container:" && env | grep VITE_

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
RUN npm ci --omit=dev --no-audit --no-fund

# Copy the built application from the builder stage
COPY --from=builder /app/dist ./dist

# Copy environment file for runtime
COPY --from=builder /app/.env .env

# Expose the port the app runs on
EXPOSE 8080

# Set the entrypoint to run the production server
CMD ["npm", "start"]