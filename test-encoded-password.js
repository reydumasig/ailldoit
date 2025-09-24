// Test with URL-encoded password
import postgres from 'postgres';

// Original password: +(@\+luT53MMH:>
// URL-encoded: %2B%28%40%5C%2B%5CluT53MMH%3A%3E
const connectionString = 'postgresql://postgres:%2B%28%40%5C%2B%5CluT53MMH%3A%3E@35.184.33.188:5432/ailldoit-staging-db?sslmode=require';

console.log('Testing with URL-encoded password...');
console.log('Connection string:', connectionString);
console.log('');

try {
  const sql = postgres(connectionString, {
    ssl: { rejectUnauthorized: false },
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  console.log('✅ Connection string format is valid');
  console.log('Attempting to connect...');
  
  const result = await sql`SELECT 1 as test`;
  console.log('✅ Connection successful!');
  console.log('Test query result:', result);
  
  await sql.end();
} catch (error) {
  console.error('❌ Connection failed:', error.message);
  console.error('Error details:', error);
}
