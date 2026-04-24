import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Persona } from '../types';
import { toast } from 'sonner';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<Persona>('buffett');

  // Handle redirect result on page load (fallback from popup)
  useEffect(() => {
    getRedirectResult(auth).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const ref = doc(db, 'users', currentUser.uid);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            await setDoc(ref, {
              uid: currentUser.uid,
              displayName: currentUser.displayName || 'User',
              email: currentUser.email || '',
              selectedPersona: 'buffett',
            });
          } else {
            const data = snap.data();
            if (data.selectedPersona) setSelectedPersona(data.selectedPersona);
          }
        } catch (err) {
          console.error('Firestore profile error:', err);
        }
      }
      setIsReady(true);
    });
    return unsub;
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      // Popup was blocked — fall back to redirect flow
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
        toast.info('Popup blocked — redirecting to Google sign-in…');
        await signInWithRedirect(auth, provider);
        return;
      }
      console.error('Login error:', err);
      toast.error(err?.message ?? 'Sign-in failed. Check the console for details.');
    }
  };

  const logout = () => signOut(auth);

  const updatePersona = async (persona: Persona) => {
    if (!user) return;
    setSelectedPersona(persona);
    await setDoc(doc(db, 'users', user.uid), { selectedPersona: persona }, { merge: true });
  };

  return { user, isReady, selectedPersona, login, logout, updatePersona };
}
