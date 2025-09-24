// Test with correct database name: ailldoit
import postgres from 'postgres';

const password = '4<7=i-z?;jR3,kTc';
const encodedPassword = encodeURIComponent(password);
const connectionString = `postgresql://postgres:${encodedPassword}@35.184.33.188:5432/ailldoit?sslmode=require`;

console.log('Testing with correct database name: ailldoit');
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
  
  // Test a more complex query
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`;
  console.log('Available tables:', tables);
  
  await sql.end();
} catch (error) {
  console.error('❌ Connection failed:', error.message);
  console.error('Error details:', error);
}
