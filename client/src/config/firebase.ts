import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate required config
const requiredFields = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN', 
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingFields = requiredFields.filter(field => !import.meta.env[field]);
if (missingFields.length > 0) {
  console.error('❌ Missing Firebase configuration:', missingFields);
  console.log('Current Firebase config:', {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? '✓' : '❌',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? '✓' : '❌',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ? '✓' : '❌',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ? '✓' : '❌',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ? '✓' : '❌',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ? '✓' : '❌'
  });
} else {
  console.log('✅ Firebase configuration loaded successfully');
  console.log('🔍 Current Firebase Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID);
  console.log('🔍 Full Firebase Config:', {
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
  });
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);