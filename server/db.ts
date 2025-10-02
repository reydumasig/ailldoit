import { config } from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Load environment variables
config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE: DATABASE_URL not found in environment');
  console.log('🔍 DATABASE: Available env vars:', Object.keys(process.env).filter(key => key.includes('DATABASE')));
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log('🔍 DATABASE: Database connection setup starting...');
console.log('  - DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('  - DATABASE_URL prefix:', process.env.DATABASE_URL?.substring(0, 30) + '...');
console.log('  - NODE_ENV:', process.env.NODE_ENV);

console.log('🔗 DATABASE: Creating connection pool...');
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  // Optimized settings for Google Cloud SQL
  max: 5, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: false // SSL is disabled in the connection string
});

console.log('🗄️ DATABASE: Creating Drizzle instance...');
const db = drizzle({ client: pool, schema });

console.log('✅ DATABASE: Database pool and drizzle instance created successfully');

// Test the connection
console.log('🧪 DATABASE: Testing database connection...');
pool.query('SELECT 1 as test')
  .then(() => {
    console.log('✅ DATABASE: Connection test successful');
  })
  .catch((error: any) => {
    console.error('❌ DATABASE: Connection test failed:', error.message);
  });

export { pool, db };