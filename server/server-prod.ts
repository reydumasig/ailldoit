import { config as config2 } from "dotenv";
import express2, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import path3 from "path";
import fs2 from "fs";

// Load environment variables
config2();

const app = express2();
app.use(express2.json({ limit: '50mb' }));
app.use(express2.urlencoded({ extended: false, limit: '50mb' }));

// Serve video files statically
app.use('/videos', express2.static('videos'));
app.use('/videos', express2.static('.', {
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
  console.log('🚀 PRODUCTION: Setting up static file serving...');
  const distPath = path3.resolve(process.cwd(), "dist/public");
  console.log('🔍 DIAGNOSTIC: Static file path resolution:');
  console.log('  - process.cwd():', process.cwd());
  console.log('  - Resolved distPath:', distPath);
  console.log('  - Directory exists:', fs2.existsSync(distPath));
  if (fs2.existsSync(distPath)) {
    const files = fs2.readdirSync(distPath);
    console.log('  - Files in directory:', files);
    if (fs2.existsSync(path3.join(distPath, 'assets'))) {
      const assetFiles = fs2.readdirSync(path3.join(distPath, 'assets'));
      console.log('  - Asset files:', assetFiles);
    }
  }
  
  if (!fs2.existsSync(distPath)) {
    console.error('❌ DIAGNOSTIC: Build directory not found!');
    console.log('🔍 Checking alternative paths:');
    const altPath1 = path3.resolve(import.meta.dirname, "public");
    const altPath2 = path3.resolve(process.cwd(), "public");
    console.log('  - Alternative path 1:', altPath1, 'exists:', fs2.existsSync(altPath1));
    console.log('  - Alternative path 2:', altPath2, 'exists:', fs2.existsSync(altPath2));
    
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  
  // Serve static assets BEFORE routes registration
  app.use('/assets', express2.static(path3.join(distPath, 'assets')));
  app.use(express2.static(distPath));
  console.log('✅ Static file serving configured BEFORE routes');

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Catch-all route for SPA - AFTER all API routes
  app.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 8080 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '8080', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    console.log(`🚀 PRODUCTION SERVER: serving on port ${port}`);
    console.log(`🌍 Environment: NODE_ENV=${process.env.NODE_ENV}`);
    console.log(`📁 Working directory: ${process.cwd()}`);
    console.log(`📂 Static files served from: ${distPath}`);
  });
})();



