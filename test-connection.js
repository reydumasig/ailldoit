// Test script to verify Cloud SQL connection string format
import postgres from 'postgres';

// Test different connection string formats
const connectionStrings = [
  // Format 1: Using public IP
  'postgresql://postgres:password@35.184.33.188:5432/ailldoit_staging',
  
  // Format 2: Using Cloud SQL proxy format
  'postgresql://postgres:password@/ailldoit_staging?host=/cloudsql/ailldoit-6d0e0:us-central1:ailldoit-staging-db',
  
  // Format 3: With SSL
  'postgresql://postgres:password@35.184.33.188:5432/ailldoit_staging?sslmode=require'
];

console.log('Testing Cloud SQL connection string formats...');
console.log('Connection name: ailldoit-6d0e0:us-central1:ailldoit-staging-db');
console.log('Public IP: 35.184.33.188');
console.log('Port: 5432');
console.log('');

for (let i = 0; i < connectionStrings.length; i++) {
  console.log(`Format ${i + 1}: ${connectionStrings[i]}`);
  console.log('');
}
