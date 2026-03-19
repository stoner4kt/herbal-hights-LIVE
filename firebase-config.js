// Firebase Configuration for Herbal Hights
// ⚠️ IMPORTANT: Replace these values with your own Firebase project credentials
// Get them from: https://console.firebase.google.com → Project Settings → Your Apps

const firebaseConfig = {
    apiKey: "AIzaSyDbkslxH-2wq14PETFwDs1vaAlB6dS2HFM",
    authDomain: "herbal-hights.firebaseapp.com",
    projectId: "herbal-hights",
    storageBucket: "herbal-hights.firebasestorage.app",
    messagingSenderId: "712515436958",
    appId: "1:712515436958:web:2acae09247d452c2ebd68f",
    measurementId: "G-Z0SQ73X3PN"
  };

// Initialize Firebase (guard against duplicate initialization)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Global Firebase service references
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ─────────────────────────────────────────────
// SETUP INSTRUCTIONS
// ─────────────────────────────────────────────
// 1. Create a Firebase project at https://console.firebase.google.com
// 2. Enable Firestore Database (start in test mode for development)
// 3. Enable Firebase Storage
// 4. Enable Email/Password Authentication
// 5. Copy your config above
//
// FIRESTORE RULES (set in Firebase Console):
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /products/{doc} { allow read: if true; allow write: if request.auth != null; }
//     match /orders/{doc} { allow read, write: if request.auth != null; allow create: if true; }
//     match /reviews/{doc} { allow read: if true; allow create: if true; allow write: if request.auth != null; }
//   }
// }
//
// STORAGE RULES:
// rules_version = '2';
// service firebase.storage {
//   match /b/{bucket}/o {
//     match /{allPaths=**} { allow read, write: if true; }
//   }
// }
//
// ADMIN SETUP:
// After creating your Firebase project, create the admin user in Firebase Auth console.
// Then add their UID to Firestore: Collection "admins" → Document = UID → { isAdmin: true }
// ─────────────────────────────────────────────
