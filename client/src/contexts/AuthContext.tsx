import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '@/config/firebase';
import type { Auth } from 'firebase/auth';
import { apiRequest } from '@/lib/queryClient';

interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  firebaseUid: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authAttempts, setAuthAttempts] = useState(0);
  const maxAuthAttempts = 3;

  useEffect(() => {
    // Add a safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      console.error('⏰ SAFETY TIMEOUT: Auth initialization took too long, forcing completion');
      setLoading(false);
    }, 15000); // 15 second safety timeout

    // Clear the safety timeout when auth completes normally
    const clearSafetyTimeout = () => {
      clearTimeout(safetyTimeout);
    };
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      console.log('🔍 Auth state changed:', firebaseUser ? 'User logged in' : 'No user');
      console.log('🕐 Auth state change timestamp:', new Date().toISOString());
      console.log('🔄 Auth attempts so far:', authAttempts);
      
      // Circuit breaker: if too many failed attempts, stop trying
      if (authAttempts >= maxAuthAttempts) {
        console.error('🚫 CIRCUIT BREAKER: Too many auth attempts, stopping to prevent infinite loop');
        clearSafetyTimeout();
        setLoading(false);
        return;
      }
      
      try {
        if (firebaseUser) {
          console.log('🔑 Verifying user with backend...');
          console.log('👤 Firebase user UID:', firebaseUser.uid);
          console.log('📧 Firebase user email:', firebaseUser.email);
          
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.error('⏰ Backend verification timeout after 10 seconds');
            controller.abort();
          }, 10000);
          
          try {
            // Get Firebase ID token
            console.log('🎫 Getting Firebase ID token...');
            const idToken = await firebaseUser.getIdToken();
            console.log('✅ Firebase ID token obtained, length:', idToken.length);
            
            // Send token to backend for user creation/update
            console.log('📡 Sending verification request to backend...');
            const response = await fetch('/api/auth/verify', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json',
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('📥 Backend response received:', response.status, response.statusText);
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error('❌ Backend verification failed:', response.status, response.statusText, errorText);
              throw new Error(`Failed to verify user: ${response.status} - ${errorText}`);
            }
            
            console.log('📋 Parsing backend response...');
            const userData = await response.json();
            console.log('✅ User verified successfully:', userData.email, 'User ID:', userData.id);
            
            setUser(userData);
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              console.error('⏰ Backend verification request timed out');
              throw new Error('Backend verification timed out - server may be down');
            }
            throw fetchError;
          }
        } else {
          console.log('👤 No Firebase user, showing login');
          setUser(null);
        }
      } catch (error: any) {
        console.error('❌ Auth state change error:', error);
        console.error('🔍 Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
        
        // Increment auth attempts counter
        setAuthAttempts(prev => prev + 1);
        
        // If there's an error, sign out the user to clear any invalid state
        if (firebaseUser && authAttempts < maxAuthAttempts - 1) {
          console.log('🚪 Signing out due to verification error (attempt', authAttempts + 1, 'of', maxAuthAttempts, ')');
          await firebaseSignOut(auth);
        }
        setUser(null);
      } finally {
        console.log('✅ Auth loading complete at:', new Date().toISOString());
        clearSafetyTimeout();
        setLoading(false);
      }
    });

    // Return cleanup function that clears both the auth listener and safety timeout
    return () => {
      clearSafetyTimeout();
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      console.log('🔑 Attempting login with email:', email);
      const result = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ Firebase login successful:', result.user.uid);
      // User state will be updated by onAuthStateChanged
    } catch (error: any) {
      console.error('❌ Login failed:', error.code, error.message);
      setLoading(false);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    setLoading(true);
    try {
      console.log('🔥 Starting Firebase signup process...');
      const result = await createUserWithEmailAndPassword(auth, email, password);
      console.log('✅ Firebase user created successfully:', result.user.uid);
      
      // Send additional user data to backend
      const idToken = await result.user.getIdToken();
      console.log('🔑 Got Firebase ID token, updating profile...');
      
      const profileResponse = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ firstName, lastName }),
      });
      
      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        console.error('❌ Profile update failed:', errorText);
        throw new Error(`Profile update failed: ${errorText}`);
      }
      
      console.log('✅ Profile updated successfully');
      // User state will be updated by onAuthStateChanged
    } catch (error) {
      console.error('❌ Signup error:', error);
      setLoading(false);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // User state will be updated by onAuthStateChanged
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      console.log('🚪 Signing out user...');
      await firebaseSignOut(auth);
      setUser(null);
      setLoading(false);
      console.log('✅ User signed out successfully');
    } catch (error) {
      console.error('❌ Sign out error:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}