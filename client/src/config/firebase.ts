import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Firebase config for ailldoit-6d0e0 project
const firebaseConfig = {
  apiKey: "AIzaSyBws685hYqlPxIyzirqyFLOZ4G-D2zwKbY",
  authDomain: "ailldoit-6d0e0.firebaseapp.com",
  projectId: "ailldoit-6d0e0",
  storageBucket: "ailldoit-6d0e0.firebasestorage.app",
  messagingSenderId: "481184449900",
  appId: "1:481184449900:web:627e5e0142defac2d95f49",
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