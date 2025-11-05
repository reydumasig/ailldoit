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

console.log("Hehehhaw", import.meta.env);

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
  
  // Show user-friendly error message
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
    background: #1e293b; color: #f1f5f9; z-index: 9999; 
    display: flex; align-items: center; justify-content: center; 
    font-family: system-ui, -apple-system, sans-serif;
  `;
  errorDiv.innerHTML = `
    <div style="text-align: center; max-width: 500px; padding: 2rem;">
      <h1 style="color: #ef4444; margin-bottom: 1rem;">Configuration Error</h1>
      <p style="margin-bottom: 1rem;">Firebase configuration is missing or incomplete.</p>
      <p style="font-size: 0.875rem; opacity: 0.7;">Missing fields: ${missingFields.join(', ')}</p>
      <p style="font-size: 0.875rem; opacity: 0.7; margin-top: 1rem;">Please check your environment variables.</p>
    </div>
  `;
  document.body.appendChild(errorDiv);
  
  throw new Error(`Firebase configuration incomplete. Missing: ${missingFields.join(', ')}`);
} else {
  console.log('✅ Firebase configuration loaded successfully');
}

let app, auth, storage;

try {
  console.log('🔥 Initializing Firebase app.............');
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase app initialized successfully');
  
  console.log('🔐 Initializing Firebase Auth...');
  auth = getAuth(app);
  console.log('✅ Firebase Auth initialized successfully');
  
  console.log('📦 Initializing Firebase Storage...');
  storage = getStorage(app);
  console.log('✅ Firebase Storage initialized successfully');
} catch (error: any) {
  console.error('❌ Firebase initialization failed:', error);
  
  // Show user-friendly error message
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
    background: #1e293b; color: #f1f5f9; z-index: 9999; 
    display: flex; align-items: center; justify-content: center; 
    font-family: system-ui, -apple-system, sans-serif;
  `;
  errorDiv.innerHTML = `
    <div style="text-align: center; max-width: 500px; padding: 2rem;">
      <h1 style="color: #ef4444; margin-bottom: 1rem;">Firebase Error</h1>
      <p style="margin-bottom: 1rem;">Failed to initialize Firebase services.</p>
      <p style="font-size: 0.875rem; opacity: 0.7;">${error.message}</p>
      <button onclick="window.location.reload()" style="
        margin-top: 1rem; padding: 0.5rem 1rem; 
        background: #3b82f6; color: white; border: none; 
        border-radius: 0.375rem; cursor: pointer;
      ">Retry</button>
    </div>
  `;
  document.body.appendChild(errorDiv);
  
  throw error;
}

export { app, auth, storage };