import { getApps, initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyDNqEQMPlJohOk0E_-FVfbZufCaiaDyXXY",
  authDomain: "nexora-global-ffb63.firebaseapp.com",
  projectId: "nexora-global-ffb63",
  storageBucket: "nexora-global-ffb63.firebasestorage.app",
  messagingSenderId: "208693955984",
  appId: "1:208693955984:web:ac94b0b0cae8adc2b8b715",
  measurementId: "G-W9G6X3PVHH"
};

export function getFirebaseApp() {
  return getApps()[0] || initializeApp(firebaseConfig);
}

export async function getDatabase() {
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(getFirebaseApp());
}
