import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  if (getApps().length === 0) {
    // Try new environment variable first, then fallback to existing one
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_NEW || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (!serviceAccount) {
      console.error('Firebase Admin initialization failed due to missing or invalid FIREBASE_SERVICE_ACCOUNT_KEY_NEW environment variable');
      throw new Error('Firebase service account configuration missing');
    }
    
    try {
      const serviceAccountKey = JSON.parse(serviceAccount);
      
      // Validate required fields
      if (!serviceAccountKey.project_id) {
        throw new Error('Service account JSON is missing the required project_id property');
      }
      
      const app = initializeApp({
        credential: cert(serviceAccountKey),
        storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || `${serviceAccountKey.project_id}.appspot.com`,
      });
      console.log('✅ Firebase Admin SDK initialized successfully');
      return app;
    } catch (parseError) {
      console.error('Firebase Admin initialization failed due to missing or invalid FIREBASE_SERVICE_ACCOUNT_KEY_NEW environment variable');
      console.error('Failed to parse Firebase service account:', parseError);
      throw parseError;
    }
  }
  return getApps()[0];
};

// Export Firebase services
export const firebaseApp = initializeFirebase();
export const auth = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);