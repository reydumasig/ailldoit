import { config } from 'dotenv';
import express from "express";
import http from "http";
import { registerRoutes } from "./routes";

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
})();
