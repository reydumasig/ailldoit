// Test Cloud SQL connection
import postgres from 'postgres';

const connectionString = 'postgresql://postgres:+(@\\+luT53MMH:>@35.184.33.188:5432/ailldoit-staging-db?sslmode=require';

console.log('Testing Cloud SQL connection...');
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
