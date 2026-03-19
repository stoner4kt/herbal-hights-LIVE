// netlify/functions/save-data.js
//
// Dual-purpose Netlify Function for Herbal Heights:
//
//   POST /save-data?action=upload-product
//     Body: { name, price, stock, [category], [description], image (Base64) }
//     → Uploads image to Cloudinary, saves product to Firestore `products`
//
//   POST /save-data?action=checkout
//     Body: { orderId, customerName, totalAmount, items[], whatsapp,
//             email, address, notes, [receiptUrl] }
//     → Saves order to Firestore `orders`,
//       appends row to Google Sheet (with auto-headers if sheet is empty)
//
// Recommended environment variables (set in Netlify dashboard):
//   SERVICE_ACCOUNT_JSON          – single JSON string containing
//                                   { project_id, client_email, private_key }
//                                   (literal \n sequences accepted)
//
// Legacy environment variables still supported for backwards compatibility:
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//   GOOGLE_SHEET_ID
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY

const admin      = require("firebase-admin");
const cloudinary = require("cloudinary").v2;
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT }               = require("google-auth-library");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Restore real newlines from Netlify env var strings. */
const fixKey = (raw) => (raw ? raw.replace(/\\n/g, "\n") : undefined);

let parsedServiceAccount = null;

/**
 * Resolve service-account credentials from a single env var first, then
 * gracefully fall back to legacy per-service env vars.
 */
function getServiceAccount() {
  if (parsedServiceAccount) return parsedServiceAccount;

  if (process.env.SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
      parsedServiceAccount = {
        projectId: credentials.project_id,
        clientEmail: credentials.client_email,
        privateKey: fixKey(credentials.private_key),
      };
      return parsedServiceAccount;
    } catch (err) {
      throw new Error(`Invalid SERVICE_ACCOUNT_JSON: ${err.message}`);
    }
  }

  parsedServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: fixKey(process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY),
  };

  return parsedServiceAccount;
}

/** Return a plain JSON response. */
const respond = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ─── Firebase Admin ───────────────────────────────────────────────────────────

function getFirebaseApp() {
  if (admin.apps.length > 0) return admin.apps[0];

  const { projectId, clientEmail, privateKey } = getServiceAccount();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing credentials. Set SERVICE_ACCOUNT_JSON (recommended) or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

// ─── Cloudinary ───────────────────────────────────────────────────────────────

function getCloudinary() {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY    ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error(
      "Missing Cloudinary env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
    );
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  return cloudinary;
}

/**
 * Upload a Base64 data-URI (or raw Base64 string) to Cloudinary.
 * @param {string} base64   - The image data.
 * @param {string} [folder] - Optional Cloudinary folder (e.g. "payments").
 * @returns {Promise<string>} Secure URL of the uploaded asset.
 */
async function uploadToCloudinary(base64, folder) {
  const cld = getCloudinary();

  // Accept both "data:image/png;base64,XXXX" and raw base64 strings.
  const dataUri = base64.startsWith("data:")
    ? base64
    : `data:image/jpeg;base64,${base64}`;

  const uploadOptions = { resource_type: "image" };
  if (folder) uploadOptions.folder = folder;

  const result = await cld.uploader.upload(dataUri, uploadOptions);
  return result.secure_url;
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

const SHEET_HEADERS = [
  "Order_ID",
  "Customer_Name",
  "Total_Amount",
  "Receipt_URL",
  "Timestamp",
];

async function getFirstSheet() {
  const { clientEmail, privateKey } = getServiceAccount();

  if (!process.env.GOOGLE_SHEET_ID || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Sheets credentials. Set GOOGLE_SHEET_ID plus SERVICE_ACCOUNT_JSON (recommended) or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY"
    );
  }

  const auth = new JWT({
    email:  clientEmail,
    key:    privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
  await doc.loadInfo();
  return doc.sheetsByIndex[0];
}

async function appendOrderToSheet({ orderId, customerName, totalAmount, receiptUrl = "" }) {
  const sheet = await getFirstSheet();

  // Try loading the existing header row; throws if the sheet is completely empty.
  let hasHeaders = false;
  try {
    await sheet.loadHeaderRow();
    hasHeaders = !!(sheet.headerValues && sheet.headerValues.length > 0);
  } catch {
    hasHeaders = false;
  }

  // Auto-create the required headers if the sheet is empty.
  if (!hasHeaders) {
    await sheet.setHeaderRow(SHEET_HEADERS);
  }

  await sheet.addRow({
    Order_ID:          orderId        ?? "",
    Customer_Name:     customerName   ?? "",
    Total_Amount:      totalAmount    ?? "",
    Receipt_URL:      receiptUrl      ?? "",
    Timestamp:         new Date().toISOString(),
  });
}

// ─── Route A: Admin — Product Upload ─────────────────────────────────────────

async function handleProductUpload(data) {
  const { name, price, stock, category = "", description = "", image } = data;

  // --- Validation ---
  const errors = [];
  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("'name' is required and must be a non-empty string.");
  }
  if (price === undefined || price === null || isNaN(Number(price))) {
    errors.push("'price' is required and must be a number.");
  }
  if (stock === undefined || stock === null || isNaN(parseInt(stock))) {
    errors.push("'stock' is required and must be an integer.");
  }
  if (!image || typeof image !== "string") {
    errors.push("'image' is required and must be a Base64-encoded string.");
  }
  if (errors.length) {
    return respond(400, { error: "Validation failed.", details: errors });
  }

  // --- Step 1: Upload image to Cloudinary ---
  let imageUrl;
  try {
    imageUrl = await uploadToCloudinary(image, "products");
    console.log("[Cloudinary] Product image uploaded:", imageUrl);
  } catch (err) {
    console.error("[Cloudinary Error - Product Upload]", err.message);
    return respond(502, {
      error:   "Image upload to Cloudinary failed.",
      details: err.message,
    });
  }

  // --- Step 2: Save product to Firestore ---
  let docId;
  try {
    getFirebaseApp();
    const db = admin.firestore();
    const docRef = await db.collection("products").add({
      name:        name.trim(),
      price:       Number(price),
      stock:       parseInt(stock),
      category:    category.trim(),
      description: description.trim(),
      imageUrl,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    docId = docRef.id;
    console.log("[Firestore] Product saved with ID:", docId);
  } catch (err) {
    console.error("[Firestore Error - Product Upload]", err.message);
    return respond(502, {
      error:   "Failed to save product to Firestore.",
      details: err.message,
    });
  }

  return respond(200, {
    message:   "Product uploaded successfully.",
    productId: docId,
    imageUrl,
  });
}

// ─── Route B: User — Checkout ─────────────────────────────────────────────────

async function handleCheckout(data) {
  const {
    orderId,
    customerName,
    totalAmount,
    items        = [],
    whatsapp     = "",
    email        = "",
    address      = "",
    notes        = "",
    receiptUrl   = "",
  } = data;

  // --- Validation ---
  const errors = [];
  if (!orderId || typeof orderId !== "string") {
    errors.push("'orderId' is required.");
  }
  if (!customerName || typeof customerName !== "string" || !customerName.trim()) {
    errors.push("'customerName' is required.");
  }
  if (totalAmount === undefined || totalAmount === null || isNaN(Number(totalAmount))) {
    errors.push("'totalAmount' is required and must be a number.");
  }
  if (errors.length) {
    return respond(400, { error: "Validation failed.", details: errors });
  }

  // --- Step 1: Save order to Firestore (fatal if this fails) ---
  let firestoreDocId;
  try {
    getFirebaseApp();
    const db = admin.firestore();
    const docRef = await db.collection("orders").add({
      orderId,
      customerName:    String(customerName).trim(),
      totalAmount:     Number(totalAmount),
      items,
      whatsapp:        String(whatsapp).trim(),
      email:           String(email).trim(),
      address:         String(address).trim(),
      notes:           String(notes).trim(),
      receiptUrl:      String(receiptUrl || "").trim(),
      status:          "pending",
      createdAt:       admin.firestore.FieldValue.serverTimestamp(),
    });
    firestoreDocId = docRef.id;
    console.log("[Firestore] Order saved with ID:", firestoreDocId);
  } catch (err) {
    console.error("[Firestore Error - Checkout]", err.message);
    // Firestore is the source of truth — a failure here is fatal.
    return respond(502, {
      error:   "Failed to save order to Firestore.",
      details: err.message,
    });
  }

  // --- Step 2: Append row to Google Sheet (non-fatal) ---
  let sheetsWarning = null;
  try {
    await appendOrderToSheet({ orderId, customerName, totalAmount, receiptUrl });
    console.log("[Google Sheets] Order row appended for:", orderId);
  } catch (err) {
    // A Sheets failure must NOT block a confirmed order.
    sheetsWarning = err.message;
    console.warn(
      "[Google Sheets Warning - Checkout] Sheet sync failed but Firestore order was saved successfully.",
      err.message
    );
  }

  const responseBody = {
    message:     "Order placed successfully.",
    firestoreId: firestoreDocId,
    orderId,
  };

  if (sheetsWarning) {
    responseBody.warning =
      "Order saved to database, but Google Sheets sync failed. Check function logs for details.";
  }

  return respond(200, responseBody);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // Only POST is supported.
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed. Use POST." });
  }

  // Route is determined by the `action` query parameter.
  const action = (event.queryStringParameters || {}).action;
  if (!action) {
    return respond(400, {
      error: "Missing required query parameter: 'action'.",
      hint:  "Use ?action=upload-product or ?action=checkout",
    });
  }

  // Parse body.
  let body;
  try {
    body = JSON.parse(event.body);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Body must be a JSON object.");
    }
  } catch (err) {
    return respond(400, { error: "Invalid request body: " + err.message });
  }

  // Dispatch to the correct route handler.
  switch (action) {
    case "upload-product":
      return handleProductUpload(body);

    case "checkout":
      return handleCheckout(body);

    default:
      return respond(400, {
        error: `Unknown action: "${action}".`,
        hint:  "Valid values: upload-product, checkout",
      });
  }
};
