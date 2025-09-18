import admin from 'firebase-admin';

// Try new environment variable first, then fallback to existing one
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_NEW || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccount) {
  console.error('Firebase Admin initialization failed due to missing or invalid FIREBASE_SERVICE_ACCOUNT_KEY_NEW environment variable');
  console.warn('Firebase Admin not configured - both FIREBASE_SERVICE_ACCOUNT_KEY_NEW and FIREBASE_SERVICE_ACCOUNT_KEY missing');
} else {
  try {
    const serviceAccountKey = JSON.parse(serviceAccount);
    
    // Validate required fields
    if (!serviceAccountKey.project_id) {
      throw new Error('Service account JSON is missing the required project_id property');
    }
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountKey),
        storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || `${serviceAccountKey.project_id}.appspot.com`,
      });
      console.log('✅ Firebase Admin initialized successfully');
    }
  } catch (error) {
    console.error('Firebase Admin initialization failed due to missing or invalid FIREBASE_SERVICE_ACCOUNT_KEY_NEW environment variable');
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

export { admin };