import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";

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

      log(logLine);
    }
  });

  next();
});

(async () => {
  console.log('🚀 Starting Ailldoit server...');
  
  // Check required environment variables
  const requiredEnvVars = [
    'DATABASE_URL'
  ];
  
  // Optional but recommended environment variables
  const optionalEnvVars = [
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'REPLICATE_API_TOKEN'
  ];
  
  const missingRequired = requiredEnvVars.filter(varName => !process.env[varName]);
  const missingOptional = optionalEnvVars.filter(varName => !process.env[varName]);
  
  if (missingRequired.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingRequired.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease configure these in your Cloud Run service secrets.');
    console.error('For now, starting in maintenance mode...');
  } else if (missingOptional.length > 0) {
    console.warn('⚠️  Missing optional environment variables:');
    missingOptional.forEach(varName => console.warn(`   - ${varName}`));
    console.warn('Some features may not work properly. Starting in limited mode...');
  }
  
  if (missingRequired.length > 0) {
    
    // Start a minimal server that shows maintenance message
    app.get('*', (req, res) => {
      if (req.path === '/api/health') {
        // Health check should return 200 OK even in maintenance mode
        res.status(200).json({
          status: 'maintenance',
          message: 'Service in maintenance mode - missing environment variables',
          missingVars: missingRequired,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Missing environment variables. Please configure secrets in Cloud Run.',
          missingVars: missingRequired
        });
      }
    });
    
    const port = parseInt(process.env.PORT || '8080', 10);
    const maintenanceServer = app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Maintenance server running on port ${port}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Process ID: ${process.pid}`);
    });
    return;
  }
  
  console.log('✅ All required environment variables are configured');
  console.log('📦 Environment variables:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL ? '***configured***' : 'missing',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '***configured***' : 'missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '***configured***' : 'missing',
    FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? '***configured***' : 'missing',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? '***configured***' : 'missing',
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN ? '***configured***' : 'missing'
  });
  
  try {
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      const { setupVite } = await import("./vite");
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 8080 for Cloud Run compatibility.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '8080', 10);
    
    // Add error handling for server startup
    server.on('error', (err: any) => {
      console.error('Server error:', err);
      process.exit(1);
    });
    
    server.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Process ID: ${process.pid}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Starting maintenance mode instead...');
    
    // Fallback to maintenance mode if server startup fails
    app.get('*', (req, res) => {
      if (req.path === '/api/health') {
        res.status(200).json({
          status: 'maintenance',
          message: 'Server startup failed, running in maintenance mode',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Server startup failed, running in maintenance mode',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
    
    const port = parseInt(process.env.PORT || '8080', 10);
    const fallbackServer = app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Maintenance server running on port ${port}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Process ID: ${process.pid}`);
    });
  }
})();
