// Test script to run migration for campaign 66
// Run this in the browser console while logged into the app

async function runMigration() {
  try {
    console.log('🔄 Starting migration for campaign 66...');
    
    // Get the current user's Firebase token
    const user = firebase.auth().currentUser;
    if (!user) {
      console.error('❌ No user logged in');
      return;
    }
    
    const token = await user.getIdToken();
    console.log('✅ Got Firebase token');
    
    // Check migration status
    console.log('🔍 Checking migration status...');
    const statusResponse = await fetch('/api/campaigns/66/migration-status', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const status = await statusResponse.json();
    console.log('📊 Migration status:', status);
    
    if (status.needsMigration) {
      console.log('🔄 Running migration...');
      
      // Run migration
      const migrationResponse = await fetch('/api/campaigns/66/migrate-assets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await migrationResponse.json();
      console.log('✅ Migration result:', result);
      
      if (result.success) {
        console.log('🎉 Migration successful! Refreshing page...');
        window.location.reload();
      } else {
        console.error('❌ Migration failed:', result.message);
      }
    } else {
      console.log('✅ No migration needed');
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

// Run the migration
runMigration();
