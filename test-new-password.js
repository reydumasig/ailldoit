// Test with the new password: 4<7=i-z?;jR3,kTc
import postgres from 'postgres';

// URL-encode the password for special characters
const password = '4<7=i-z?;jR3,kTc';
const encodedPassword = encodeURIComponent(password);
const connectionString = `postgresql://postgres:${encodedPassword}@35.184.33.188:5432/ailldoit-staging-db?sslmode=require`;

console.log('Testing with new password...');
console.log('Original password:', password);
console.log('Encoded password:', encodedPassword);
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
