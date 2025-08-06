import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  if (getApps().length === 0) {
    const app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    return app;
  }
  return getApps()[0];
};

// Export Firebase services
export const firebaseApp = initializeFirebase();
export const auth = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);