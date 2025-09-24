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

// Configure postgres for Cloud SQL
const sql = postgres(connectionString, {
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 1, // Cloud Run can handle multiple connections
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

console.log('✅ Google Cloud SQL database connection configured');
