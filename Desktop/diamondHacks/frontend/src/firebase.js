// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBqGNWJ6xJGGkOrK2_gJgcONOhzF7ylT4M",
  authDomain: "judgingapp-f8341.firebaseapp.com",
  projectId: "judgingapp-f8341",
  storageBucket: "judgingapp-f8341.firebasestorage.app",
  messagingSenderId: "70048330193",
  appId: "1:70048330193:web:db330b0e15bf962d4d70f0"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
