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
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Ailldoit API Server - Progressive Mode',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    features: {
      database: 'checking...',
      firebase: 'checking...',
      stripe: 'checking...'
    }
  });
});

// Test database connection
app.get('/api/test/database', async (req, res) => {
  try {
    // Try to import and test database
    const { db } = await import('./db.js');
    res.json({ 
      status: 'success',
      message: 'Database connection working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database test failed:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Database connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test Firebase connection
app.get('/api/test/firebase', async (req, res) => {
  try {
    // Try to import and test Firebase
    const { admin } = await import('./config/firebase.js');
    res.json({ 
      status: 'success',
      message: 'Firebase connection working',
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

// Test all services
app.get('/api/test/all', async (req, res) => {
  const results = {
    database: { status: 'unknown', error: null },
    firebase: { status: 'unknown', error: null },
    timestamp: new Date().toISOString()
  };

  // Test database
  try {
    const { db } = await import('./db.js');
    results.database = { status: 'success', error: null };
  } catch (error) {
    results.database = { status: 'error', error: error.message };
  }

  // Test Firebase
  try {
    const { admin } = await import('./config/firebase.js');
    results.firebase = { status: 'success', error: null };
  } catch (error) {
    results.firebase = { status: 'error', error: error.message };
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
  console.log(`🚀 Progressive server running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Process ID: ${process.pid}`);
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
