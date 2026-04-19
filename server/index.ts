import { config } from 'dotenv';
import express from "express";
import http from "http";
import { registerRoutes } from "./routes";
import { startPhotoWorker } from "./workers/photo-worker";

// Load environment variables
config();

const app = express();
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

    const { setupVite } = await import("./vite");
    await setupVite(app, httpServer);
    
    // Catch-all route for SPA - AFTER all API routes
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
    httpServer.close(() => {
      console.log("👋 SERVER: closed HTTP server, bye");
      process.exit(0);
    });
    // Safety net — don't hang forever if something is stuck.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
