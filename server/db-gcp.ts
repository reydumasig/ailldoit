import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is missing!");
  console.error("This should be a Google Cloud SQL connection string.");
  console.error("Format: postgresql://username:password@/database?host=/cloudsql/project:region:instance");
  console.error("Starting in maintenance mode...");
  // Don't exit, let the server start in maintenance mode
}

// Create postgres connection for Google Cloud SQL
let sql: any = null;
let db: any = null;

if (process.env.DATABASE_URL) {
  const connectionString = process.env.DATABASE_URL;

  // For now, allow Neon URLs but warn about migration
  if (connectionString.includes('neon.tech') || connectionString.includes('neon.xyz')) {
    console.warn("⚠️  DATABASE_URL is pointing to Neon database - this is temporary for migration");
    console.warn("Current URL format:", connectionString.substring(0, 50) + "...");
    console.warn("TODO: Migrate to Google Cloud SQL for production");
  }

  // Check if this is a valid Cloud SQL connection string
  if (!connectionString.includes('postgresql://') && !connectionString.includes('postgres://')) {
    console.error("❌ DATABASE_URL is not a valid PostgreSQL connection string!");
    console.error("Current URL format:", connectionString.substring(0, 50) + "...");
    console.error("Required format: postgresql://username:password@host:port/database");
    console.error("For Cloud SQL: postgresql://username:password@35.184.33.188:5432/database");
    console.error("Starting without database connection...");
  } else {
    try {
      // Configure postgres for Cloud SQL
      sql = postgres(connectionString, {
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 1, // Cloud Run can handle multiple connections
        idle_timeout: 20,
        connect_timeout: 10,
      });

      db = drizzle(sql, { schema });
      console.log('✅ Google Cloud SQL database connection configured');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      console.error('Starting without database connection...');
    }
  }
} else {
  console.warn('⚠️  No DATABASE_URL provided, starting without database connection');
}

export { db };
