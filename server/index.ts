import { config } from 'dotenv';
// Load environment variables BEFORE importing anything that reads process.env
// at module load (Sentry DSN, Stripe client, etc).
config();

// Sentry MUST init before any http/undici consumer is constructed — its
// auto-instrumentation patches the network libs on init, and anything
// constructed earlier (an http.Agent, a Stripe client's fetch, etc.) would
// miss that patch. Keep this import/init at the very top of server boot.
import { initSentry, Sentry, isSentryEnabled } from "./observability/sentry";
initSentry();
// PostHog init is order-insensitive (no network patching), but we start it
// here so the funnel is live before the first route handler runs.
import { initPostHog, shutdownPostHog } from "./observability/posthog";
import { exiftool } from "exiftool-vendored";
initPostHog();

import express from "express";
import http from "http";
import { registerRoutes } from "./routes";
import { startPhotoWorker } from "./workers/photo-worker";

const app = express();

// In Sentry v10 the request + tracing handlers are wired automatically by
// `expressIntegration()` (set up during Sentry.init). We only need to mount
// the error handler manually, and we do that AFTER routes register below.

// Stripe webhooks MUST receive the raw body bytes so
// `stripe.webhooks.constructEvent` can verify the signature. Mount
// express.raw on this specific path BEFORE express.json() so the JSON
// parser doesn't consume the body first — otherwise `req.body` becomes a
// parsed object, signature verification fails, and every webhook returns
// 400 silently (symptom: Stripe Checkout succeeds but credits never land).
app.use(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json', limit: '2mb' })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Serve video files statically
app.use('/videos', express.static('videos'));
app.use('/videos', express.static('.', {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
  }
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

(async () => {
  // CRITICAL: Set up static file serving BEFORE routes to avoid middleware conflicts
  let httpServer;

  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 DEVELOPMENT: Setting up Vite...');
    httpServer = await registerRoutes(app);
    // Sentry error handler must sit between the API routes and vite's
    // middleware so 5xx responses from our endpoints get captured before
    // the SPA-catch-all sends them to the browser as "something broke."
    if (isSentryEnabled()) {
      Sentry.setupExpressErrorHandler(app);
    }
    const { setupVite } = await import("./vite");
    await setupVite(app, httpServer);
  } else {
    console.log('🚀 PRODUCTION: Setting up static file serving...');
    // Production static file serving - BEFORE routes registration
    const path = await import("path");
    const fs = await import("fs");

    const distPath = path.resolve(process.cwd(), "dist/public");
    console.log('📁 Static files path:', distPath);

    if (!fs.existsSync(distPath)) {
      throw new Error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
    }

    // Serve static assets first (CSS, JS, images)
    app.use('/assets', express.static(path.join(distPath, 'assets')));
    app.use(express.static(distPath));
    console.log('✅ Static file serving configured BEFORE routes');

    httpServer = await registerRoutes(app);

    // Error handler AFTER routes, BEFORE the SPA catch-all. Captures any
    // unhandled exception from an API route into Sentry (+ the default
    // 500 JSON response the app's own middleware sends).
    if (isSentryEnabled()) {
      Sentry.setupExpressErrorHandler(app);
    }

    // Catch-all route for SPA - AFTER all API routes. Serves index.html for
    // any non-API path so client-side routing (wouter) can resolve it. Never
    // call setupVite here — that's the dev HMR server and has no business
    // running in production.
    app.use("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 8080 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  // Create an HTTP server explicitly
  // const server = http.createServer(app);
  
  const port = parseInt(process.env.PORT || '8080', 10);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`🌍 SERVER: listening on port ${port} (${process.env.NODE_ENV || "development"})`);
  });

  // Boot the photo-pipeline worker in-process. Any error at startup is
  // non-fatal — the HTTP server is still useful (browse UI, upload) even
  // if jobs can't run yet. REDIS_URL missing will throw before we get here.
  let photoWorker: ReturnType<typeof startPhotoWorker> | null = null;
  try {
    photoWorker = startPhotoWorker();
    console.log("🎞️  PHOTO WORKER: started (in-process)");
  } catch (err: any) {
    console.error("❌ PHOTO WORKER: failed to start — jobs will queue but not run:", err?.message ?? err);
  }

  // Graceful shutdown. SIGTERM is what Cloud Run sends when scaling down.
  const shutdown = async (signal: string) => {
    console.log(`🛑 SERVER: received ${signal}, shutting down…`);
    try {
      await photoWorker?.stop();
    } catch (err: any) {
      console.error("⚠️ SERVER: worker stop errored:", err?.message ?? err);
    }
    // Flush PostHog before the process exits — Cloud Run gives us ~10s
    // between SIGTERM and SIGKILL and we'd otherwise lose the last batch
    // of funnel events (which is exactly the user whose session is being
    // disrupted by the scale-down — the interesting one).
    try {
      await shutdownPostHog();
    } catch (err: any) {
      console.error("⚠️ SERVER: posthog shutdown errored:", err?.message ?? err);
    }
    // Kill the long-running ExifTool daemon so Cloud Run doesn't leak
    // Perl subprocesses on scale-down. exiftool-vendored keeps a pool
    // of processes open for fast repeat reads — we end them here.
    try {
      await exiftool.end();
    } catch (err: any) {
      console.error("⚠️ SERVER: exiftool shutdown errored:", err?.message ?? err);
    }
    httpServer.close(() => {
      console.log("👋 SERVER: closed HTTP server, bye");
      process.exit(0);
    });
    // Safety net — don't hang forever if something is stuck.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Process-level error capture. Without these, an unhandled promise
  // rejection from a background task (e.g., a post-response writeback)
  // would silently bypass Sentry. We don't exit — Node's default is to
  // log and continue, which matches what we want here.
  process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ UNHANDLED REJECTION:", reason);
    if (isSentryEnabled()) {
      Sentry.captureException(reason, {
        tags: { origin: "unhandledRejection" },
        extra: { promise: String(promise) },
      });
    }
  });

  process.on("uncaughtException", (err) => {
    console.error("❌ UNCAUGHT EXCEPTION:", err);
    if (isSentryEnabled()) {
      Sentry.captureException(err, {
        tags: { origin: "uncaughtException" },
      });
    }
    // Exit after capture — an uncaught exception means app state is suspect.
    // Sentry will flush via its before-exit hook. Give it a short window.
    setTimeout(() => process.exit(1), 2000).unref();
  });
})();
