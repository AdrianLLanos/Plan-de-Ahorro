import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDaHNEljMMeGCGm_wDJu8yRMElJhjf6l6Q",
  authDomain: "plan-de-ahorro-8eb8e.firebaseapp.com",
  projectId: "plan-de-ahorro-8eb8e",
  storageBucket: "plan-de-ahorro-8eb8e.firebasestorage.app",
  messagingSenderId: "465869848587",
  appId: "1:465869848587:web:9338b425daaddf020dc70e"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);