import admin from 'firebase-admin';

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccount) {
  console.warn('Firebase Admin not configured - FIREBASE_SERVICE_ACCOUNT_KEY missing');
} else {
  try {
    const serviceAccountKey = JSON.parse(serviceAccount);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountKey),
        storageBucket: `${serviceAccountKey.project_id}.appspot.com`,
      });
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

export { admin };