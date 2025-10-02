import admin from 'firebase-admin';

console.log('🔥 FIREBASE ADMIN: Initializing Firebase Admin SDK...');
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccount) {
  console.error('❌ FIREBASE ADMIN: FIREBASE_SERVICE_ACCOUNT_KEY missing from environment');
  console.log('🔍 FIREBASE ADMIN: Available env vars:', Object.keys(process.env).filter(key => key.includes('FIREBASE')));
} else {
  console.log('✅ FIREBASE ADMIN: Service account key found, length:', serviceAccount.length);
  try {
    console.log('🔍 FIREBASE ADMIN: Parsing service account JSON...');
    const serviceAccountKey = JSON.parse(serviceAccount);
    console.log('✅ FIREBASE ADMIN: Service account parsed successfully');
    console.log('🔍 FIREBASE ADMIN: Project ID:', serviceAccountKey.project_id);
    console.log('🔍 FIREBASE ADMIN: Client email:', serviceAccountKey.client_email);
    
    if (!admin.apps.length) {
      console.log('🚀 FIREBASE ADMIN: Initializing Firebase Admin app...');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountKey),
        storageBucket: `${serviceAccountKey.project_id}.appspot.com`,
      });
      console.log('✅ FIREBASE ADMIN: Firebase Admin initialized successfully');
      console.log('🔍 FIREBASE ADMIN: Apps count after init:', admin.apps.length);
    } else {
      console.log('ℹ️ FIREBASE ADMIN: Firebase Admin already initialized');
    }
  } catch (error: any) {
    console.error('❌ FIREBASE ADMIN: Failed to initialize Firebase Admin:', error);
    console.error('🔍 FIREBASE ADMIN: Error details:', {
      message: error.message,
      name: error.name,
      serviceAccountLength: serviceAccount?.length || 0
    });
  }
}

console.log('🔥 FIREBASE ADMIN: Final apps count:', admin.apps.length);
export { admin };