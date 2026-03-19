# 🌿 Herbal Hights Website

A complete cannabis e-commerce website with Firebase backend, admin panel, and proof-of-payment order flow.

---

## 📁 File Structure

```
herbal-hights/
├── index.html          → Homepage (hero, featured products, reviews, about)
├── products.html       → Full product catalogue with cart
├── checkout.html       → Order form with proof of payment upload
├── admin.html          → Admin dashboard (password-protected)
├── firebase-config.js  → Firebase configuration (EDIT THIS FIRST)
└── README.md           → This file
```

---

## 🚀 Quick Setup (Step-by-Step)

### Step 1: Create a Firebase Project
1. Go to https://console.firebase.google.com
2. Click **"Add project"** → Name it "herbal-hights" → Create
3. After creation, click **"</> Web"** to register your web app
4. Copy the `firebaseConfig` object shown

### Step 2: Update firebase-config.js
Open `firebase-config.js` and replace the placeholder values:
```js
const firebaseConfig = {
  apiKey: "AIzaSy...",           // from Firebase console
  authDomain: "herbal-hights.firebaseapp.com",
  projectId: "herbal-hights",
  storageBucket: "herbal-hights.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Step 3: Enable Firebase Services

**Firestore Database:**
1. Firebase Console → Build → Firestore Database → Create database
2. Start in **test mode** (you'll update rules later)
3. Choose a region close to your users

**Storage:**
1. Firebase Console → Build → Storage → Get started
2. Start in test mode

**Authentication:**
1. Firebase Console → Build → Authentication → Get started
2. Enable **Email/Password** sign-in method

### Step 4: Create the Admin Account

1. Go to **Authentication → Users → Add user**
2. Enter an email and password for your admin
3. Copy the **UID** that appears next to the user

4. Go to **Firestore Database → Start collection**
   - Collection ID: `admins`
   - Document ID: paste your admin UID
   - Add field: `isAdmin` = `true` (boolean)

### Step 5: Update Firestore Security Rules

In Firebase Console → Firestore Database → Rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /products/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /orders/{doc} {
      allow read: if request.auth != null;
      allow create: if true;
    }
    match /reviews/{doc} {
      allow read: if true;
      allow create: if true;
      allow write: if request.auth != null;
    }
    match /admins/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Step 6: Update Storage Rules

In Firebase Console → Storage → Rules:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

### Step 7: Update Contact Details

In all HTML files, find and replace:
- `27000000000` → Your WhatsApp number (with country code, no +)
- `YOUR_ACC_NUMBER` → Your bank account number (checkout.html)
- `YOUR_NUMBER` → Your CapiPay/Capitec number (checkout.html)

---

## 🖥️ Pages Overview

### Homepage (index.html)
- Age verification gate
- Hero section with call-to-action
- Featured products loaded from Firebase
- Customer reviews (submit & display)
- About / Our Story section

### Products (products.html)
- Full product catalogue from Firebase
- Filter by category (Flower, Edibles, Drinks, Accessories)
- Add to cart functionality
- Cart drawer with quantity controls
- Checkout button

### Checkout (checkout.html)
- Order summary with cart items
- Customer details form (name, WhatsApp, email, address)
- Bank payment instructions
- **Proof of Payment image upload** (required before submitting)
- Order saved to Firestore with POP image URL

### Admin Panel (admin.html)
Access at: `yoursite.com/admin.html`

**Features:**
- Login with email/password (must be in `admins` collection)
- **Overview Dashboard:** Stats (products, orders, revenue) + recent orders
- **Products Tab:** View all products, update stock levels inline, edit/delete
- **Orders Tab:** View all orders, filter by status, view POP images, update status
- **Add Product Tab:** Upload new products with image, price, stock, category

---

## 📦 Deploying

### Option A: Firebase Hosting (Recommended)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Set public directory to your project folder
firebase deploy
```

### Option B: Netlify
1. Drag and drop the folder to https://app.netlify.com/drop

### Option C: Vercel
```bash
npm install -g vercel
vercel
```

---

## 🔧 Customisation

### Business Details
Update in all pages:
- Business name: "Herbal Hights" (already set)
- WhatsApp number: `wa.me/27XXXXXXXXXX`
- Bank details in `checkout.html`

### Colors
The green/yellow theme is defined in each page's Tailwind config:
```js
primary: "#2D6A2D",      // dark green
secondary: "#F5C518",    // yellow
```

### Product Categories
Edit the filter buttons in `products.html` and the dropdown in `admin.html` to match your categories.

---

## ❓ Troubleshooting

**"Access denied. Not an admin account."**
→ Make sure the `admins` collection exists with your user's UID and `isAdmin: true`

**Products not loading**
→ Check your Firebase config in `firebase-config.js`
→ Make sure Firestore rules allow read access

**Images not uploading**
→ Check Storage rules allow write access
→ Verify Storage is enabled in Firebase Console

**CORS errors**
→ You need to serve the files over HTTP (not open as file://)
→ Use a local server: `npx serve .` or `python3 -m http.server 8000`
