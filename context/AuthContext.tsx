'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | any | null;
  riderProfile: any | null;
  loading: boolean;
  loginAsGuest: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  riderProfile: null,
  loading: true,
  loginAsGuest: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | any | null>(null);
  const [riderProfile, setRiderProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loginAsGuest = () => {
    const guestUser = {
      uid: 'guest_' + Math.random().toString(36).substring(7),
      displayName: 'Guest Rider',
      email: 'guest@ridesync.dev',
      isGuest: true
    };
    const guestProfile = {
      uid: guestUser.uid,
      username: 'Guest Rider',
      medical_profile: { blood_group: 'O+' },
      motorcycle: { make: 'KTM', model: 'RC 390' },
      created_at: new Date().toISOString()
    };
    setUser(guestUser);
    setRiderProfile(guestProfile);
    setLoading(false);
  };

  const logout = async () => {
    if (user?.isGuest) {
      setUser(null);
      setRiderProfile(null);
    } else {
      await auth.signOut();
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setUser(fbUser);
        try {
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            setRiderProfile(userDoc.data());
          } else {
            const initialProfile = {
              uid: fbUser.uid,
              username: fbUser.displayName || 'Rider',
              email: fbUser.email,
              created_at: new Date().toISOString(),
            };
            await setDoc(doc(db, 'users', fbUser.uid), initialProfile);
            setRiderProfile(initialProfile);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else if (!user?.isGuest) {
        setUser(null);
        setRiderProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.isGuest]);

  return (
    <AuthContext.Provider value={{ user, riderProfile, loading, loginAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

