import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Hybrid Firebase config - correct project IDs with existing API keys
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY, // Use existing API key from Replit Secrets
  authDomain: "ailldoit-6d0e0.firebaseapp.com",  // Correct domain for ailldoit-6d0e0
  projectId: "ailldoit-6d0e0",                   // Correct project ID
  storageBucket: "ailldoit-6d0e0.appspot.com",  // Correct storage bucket
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, // Use existing
  appId: import.meta.env.VITE_FIREBASE_APP_ID,  // Use existing
};

// Debug logs for hardcoded Firebase config
console.log('✅ Firebase configuration loaded successfully');
console.log('🔍 Current Firebase Project ID:', firebaseConfig.projectId);
console.log('🔍 Full Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket
});

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);