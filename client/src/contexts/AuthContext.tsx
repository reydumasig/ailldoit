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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      try {
        if (firebaseUser) {
          // Get Firebase ID token
          const idToken = await firebaseUser.getIdToken();
          
          // Send token to backend for user creation/update
          const response = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (!response.ok) {
            throw new Error('Failed to verify user');
          }
          
          const userData = await response.json();
          
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
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