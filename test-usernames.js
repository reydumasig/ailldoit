// Test different usernames
import postgres from 'postgres';

const usernames = ['postgres', 'ailldoit', 'root', 'admin'];
const password = '+(@\\+luT53MMH:>';

console.log('Testing different usernames...');
console.log('Password:', password);
console.log('');

for (const username of usernames) {
  const connectionString = `postgresql://${username}:${password}@35.184.33.188:5432/ailldoit-staging-db?sslmode=require`;
  
  console.log(`Testing username: ${username}`);
  console.log(`Connection string: ${connectionString}`);
  
  try {
    const sql = postgres(connectionString, {
      ssl: { rejectUnauthorized: false },
      max: 1,
      idle_timeout: 5,
      connect_timeout: 5,
    });

    const result = await sql`SELECT 1 as test`;
    console.log(`✅ SUCCESS with username: ${username}`);
    console.log('Test query result:', result);
    
    await sql.end();
    break; // Stop on first success
  } catch (error) {
    console.log(`❌ Failed with username: ${username} - ${error.message}`);
  }
  console.log('');
}
