import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Hardcoded Firebase config for ailldoit-6d0e0 project
const firebaseConfig = {
  apiKey: "AIzaSyAFoEgZ5wWM7DbYSKhAPPmQbKdEMjRfkkE",
  authDomain: "ailldoit-6d0e0.firebaseapp.com",
  projectId: "ailldoit-6d0e0",
  storageBucket: "ailldoit-6d0e0.appspot.com",
  messagingSenderId: "648953097935",
  appId: "1:648953097935:web:33c17e7fd4dbcdaec94c97",
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