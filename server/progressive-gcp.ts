import express from 'express';

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// Middleware
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    platform: 'Google Cloud Run'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Ailldoit API Server - Google Cloud Progressive Mode',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: 'Google Cloud Run',
    features: {
      database: 'Google Cloud SQL (testing...)',
      firebase: 'Google Cloud Firebase (testing...)',
      secrets: 'Google Cloud Secret Manager (testing...)'
    }
  });
});

// Test Google Cloud SQL connection
app.get('/api/test/database', async (req, res) => {
  try {
    // Try to import and test Google Cloud SQL database
    const { db } = await import('./db-gcp.js');
    
    // Test a simple query
    const result = await db.execute('SELECT 1 as test');
    
    res.json({ 
      status: 'success',
      message: 'Google Cloud SQL connection working',
      database: 'Cloud SQL',
      test_query: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Google Cloud SQL test failed:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Google Cloud SQL connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test Firebase connection
app.get('/api/test/firebase', async (req, res) => {
  try {
    // Try to import and test Firebase
    const { admin } = await import('./config/firebase-gcp.js');
    res.json({ 
      status: 'success',
      message: 'Firebase connection working',
      platform: 'Google Cloud',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Firebase test failed:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Firebase connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test environment variables
app.get('/api/test/env', (req, res) => {
  const requiredVars = [
    'DATABASE_URL',
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'REPLICATE_API_TOKEN'
  ];
  
  const envStatus = requiredVars.map(varName => ({
    name: varName,
    present: !!process.env[varName],
    value: process.env[varName] ? '***hidden***' : 'missing'
  }));
  
  res.json({
    status: 'info',
    message: 'Environment variables check',
    variables: envStatus,
    timestamp: new Date().toISOString()
  });
});

// Test all services
app.get('/api/test/all', async (req, res) => {
  const results = {
    environment: { status: 'unknown', error: null },
    database: { status: 'unknown', error: null },
    firebase: { status: 'unknown', error: null },
    timestamp: new Date().toISOString()
  };

  // Test environment variables
  const requiredVars = ['DATABASE_URL', 'FIREBASE_SERVICE_ACCOUNT_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length === 0) {
    results.environment = { status: 'success', error: null };
  } else {
    results.environment = { status: 'error', error: `Missing: ${missingVars.join(', ')}` };
  }

  // Test database (only if env vars are present)
  if (results.environment.status === 'success') {
    try {
      const { db } = await import('./db-gcp.js');
      const result = await db.execute('SELECT 1 as test');
      results.database = { status: 'success', error: null };
    } catch (error) {
      results.database = { status: 'error', error: error.message };
    }

    // Test Firebase
    try {
      const { admin } = await import('./config/firebase-gcp.js');
      results.firebase = { status: 'success', error: null };
    } catch (error) {
      results.firebase = { status: 'error', error: error.message };
    }
  }

  res.json(results);
});

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Google Cloud Progressive server running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Process ID: ${process.pid}`);
  console.log(`☁️  Platform: Google Cloud Run`);
  console.log(`🔧 Testing mode: Progressive feature loading`);
});

// Handle process errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});
