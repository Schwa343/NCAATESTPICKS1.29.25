// lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB8q8UhEX32ggSok5e26LZzTtrMOii1J8A",
  authDomain: "ncaa-survivor-bracket.firebaseapp.com",
  projectId: "ncaa-survivor-bracket",
  storageBucket: "ncaa-survivor-bracket.firebasestorage.app",
  messagingSenderId: "177571956153",
  appId: "1:177571956153:web:6c1825f6d1e4e333eaa268",
  measurementId: "G-NQL6TKZHC9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firestore database
export const db = getFirestore(app);