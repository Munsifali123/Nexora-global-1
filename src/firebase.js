import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore"; // 1. Add this import

const firebaseConfig = {
  apiKey: "AIzaSyDNqEQMPlJohOk0E_-FVfbZufCaiaDyXXY",
  authDomain: "nexora-global-ffb63.firebaseapp.com",
  projectId: "nexora-global-ffb63",
  storageBucket: "nexora-global-ffb63.firebasestorage.app",
  messagingSenderId: "208693955984",
  appId: "1:208693955984:web:ac94b0b0cae8adc2b8b715",
  measurementId: "G-W9G6X3PVHH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// 2. Initialize and EXPORT Firestore so App.jsx can read it!
export const db = getFirestore(app);