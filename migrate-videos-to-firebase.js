// Migration script to move all existing videos from local storage to Firebase Storage
// This will help eliminate the "Video Expired" issues permanently

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
const app = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET
});

const bucket = getStorage(app).bucket();

async function uploadLocalVideoToFirebase(localPath, filename) {
  try {
    if (!fs.existsSync(localPath)) {
      console.log(`❌ Local file not found: ${localPath}`);
      return null;
    }

    const storagePath = `videos/${filename}`;
    
    // Upload file to Firebase Storage
    const [file] = await bucket.upload(localPath, {
      destination: storagePath,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: uuidv4(),
        },
      },
      public: true,
    });

    // Get public download URL
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '03-17-2125', // Far future date
    });

    console.log(`✅ Uploaded ${filename} to Firebase Storage`);
    return url;
  } catch (error) {
    console.error(`❌ Failed to upload ${filename}:`, error);
    return null;
  }
}

async function migrateVideos() {
  console.log('🚀 Starting video migration to Firebase Storage...');
  
  try {
    // Get all video assets from database
    const { stdout } = await execAsync(`
      curl -s -X POST "http://localhost:5000/api/execute-sql" \\
        -H "Content-Type: application/json" \\
        -d '{"query": "SELECT a.id, a.url, a.campaign_id FROM assets a WHERE a.type = '\''video'\'' AND a.url LIKE '\''/videos/%'\'';"}'
    `);
    
    const result = JSON.parse(stdout);
    const localVideos = result.rows || [];
    
    console.log(`📊 Found ${localVideos.length} local video assets to migrate`);
    
    const videosDir = path.join(process.cwd(), 'videos');
    const migrations = [];
    
    for (const video of localVideos) {
      const [assetId, localUrl, campaignId] = video;
      const filename = localUrl.replace('/videos/', '');
      const localPath = path.join(videosDir, filename);
      
      console.log(`🔄 Migrating ${filename} for campaign ${campaignId}...`);
      
      const firebaseUrl = await uploadLocalVideoToFirebase(localPath, filename);
      
      if (firebaseUrl) {
        migrations.push({
          assetId,
          oldUrl: localUrl,
          newUrl: firebaseUrl,
          campaignId
        });
      }
    }
    
    // Update database with new Firebase URLs
    console.log(`📝 Updating ${migrations.length} database records...`);
    
    for (const migration of migrations) {
      const updateQuery = `UPDATE assets SET url = '${migration.newUrl}' WHERE id = ${migration.assetId};`;
      
      try {
        await execAsync(`
          curl -s -X POST "http://localhost:5000/api/execute-sql" \\
            -H "Content-Type: application/json" \\
            -d '{"query": "${updateQuery}"}'
        `);
        
        console.log(`✅ Updated asset ${migration.assetId} for campaign ${migration.campaignId}`);
      } catch (error) {
        console.error(`❌ Failed to update asset ${migration.assetId}:`, error);
      }
    }
    
    console.log('🎉 Video migration completed!');
    console.log(`📊 Summary: ${migrations.length} videos migrated to Firebase Storage`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateVideos();
}