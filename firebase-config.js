
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCj4LAcQpgOzz1GvLLrC-PwivEeJZlPoAs",
  authDomain: "cuan-in.firebaseapp.com",
  projectId: "cuan-in",
  storageBucket: "cuan-in.firebasestorage.app",
  messagingSenderId: "35029423646",
  appId: "1:35029423646:web:59c488a64ee40e4a96c00f"
};

const app = initializeApp(firebaseConfig);


const db = getFirestore(app); 
const auth = getAuth(app);    


export { db, auth };

console.log("Firebase berhasil dikoneksikan! 🚀");