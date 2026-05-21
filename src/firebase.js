import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAnalytics } from "firebase/analytics";
const firebaseConfig = {
  apiKey: "AIzaSyDa86VtEK8XlPuNgjHhGJ-0rT7VKN_iSQ0",
  authDomain: "innova-t-f16bb.firebaseapp.com",
  projectId: "innova-t-f16bb",
  storageBucket: "innova-t-f16bb.firebasestorage.app",
  messagingSenderId: "488554463220",
  appId: "1:488554463220:web:8cae020e6851d8e3e803a1",
  measurementId: "G-W6YNZ74S6L"
};

const app = initializeApp(firebaseConfig)
const analytics = getAnalytics(app);
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
