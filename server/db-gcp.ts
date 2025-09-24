import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is missing!");
  console.error("This should be a Google Cloud SQL connection string.");
  console.error("Format: postgresql://username:password@/database?host=/cloudsql/project:region:instance");
  process.exit(1);
}

// Create postgres connection for Google Cloud SQL
const connectionString = process.env.DATABASE_URL;

// Check if this is a Neon URL (neon.tech) and provide helpful error
if (connectionString.includes('neon.tech') || connectionString.includes('neon.xyz')) {
  console.error("❌ DATABASE_URL is still pointing to Neon database!");
  console.error("Current URL format:", connectionString.substring(0, 50) + "...");
  console.error("You need to update this to a Google Cloud SQL connection string.");
  console.error("Format: postgresql://username:password@/database?host=/cloudsql/project:region:instance");
  console.error("Or use: postgresql://username:password@/database?host=/cloudsql/project:region:instance&sslmode=require");
  process.exit(1);
}

// Check if this is a valid Cloud SQL connection string
if (!connectionString.includes('postgresql://') && !connectionString.includes('postgres://')) {
  console.error("❌ DATABASE_URL is not a valid PostgreSQL connection string!");
  console.error("Current URL format:", connectionString.substring(0, 50) + "...");
  console.error("Required format: postgresql://username:password@host:port/database");
  console.error("For Cloud SQL: postgresql://username:password@35.184.33.188:5432/database");
  process.exit(1);
}

// Configure postgres for Cloud SQL
const sql = postgres(connectionString, {
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 1, // Cloud Run can handle multiple connections
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

console.log('✅ Google Cloud SQL database connection configured');
