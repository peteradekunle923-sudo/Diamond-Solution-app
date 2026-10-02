import "dotenv/config";
import express from "express";
import axios from "axios";
import { initializeApp, getApp, getApps, cert, type AppOptions } from "firebase-admin/app";
import { getFirestore as getFirestoreSDK, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { GoogleGenAI } from "@google/genai";
import { BrevoClient } from "@getbrevo/brevo";

import firebaseAppletConfig from "./firebase-applet-config.json";
import { DEPARTMENT_PRICES } from "./src/constants";

let dbInstance: any = null;
const memoryOtpCache = new Map<string, any>();

const NGN_TO_USD = 1500;
const AFFILIATE_COMMISSION_RATE = 0.25;

// The price a department/course actually costs, as the server trusts it - never the client's
// claimed "amount". Custom faculties (admin-added, priced via the `faculties` collection)
// override the static DEPARTMENT_PRICES map, mirroring the merge logic the client uses to
// display prices in CourseList.tsx.
async function getDepartmentPrice(db: any, department: string): Promise<{ ngn: number; usd: number }> {
  try {
    const facultySnap = await db.collection("faculties").where("name", "==", department).limit(1).get();
    if (!facultySnap.empty) {
      const data = facultySnap.docs[0].data();
      if (!data.isDeleted) {
        const ngn = data.price || DEPARTMENT_PRICES[department]?.ngn || 10000;
        const usd = data.priceUSD || DEPARTMENT_PRICES[department]?.usd || Math.ceil(ngn / NGN_TO_USD);
        return { ngn, usd };
      }
    }
  } catch (err: any) {
    console.error("[getDepartmentPrice] Faculty lookup failed:", err.message);
  }
  return DEPARTMENT_PRICES[department] || { ngn: 10000, usd: 7 };
}

function computeCommission(price: number, userCurrency: string, referrerCurrency: string): number {
  let commission = price * AFFILIATE_COMMISSION_RATE;
  if (userCurrency !== referrerCurrency) {
    if (userCurrency === "USD" && referrerCurrency === "NGN") commission *= NGN_TO_USD;
    else if (userCurrency === "NGN" && referrerCurrency === "USD") commission /= NGN_TO_USD;
  }
  return referrerCurrency === "NGN" ? Math.floor(commission) : commission;
}

const getBrevoConfig = () => {
  let apiKey = (process.env.BREVO_API_KEY || "").trim();
  if (apiKey.startsWith('"') && apiKey.endsWith('"')) {
    apiKey = apiKey.substring(1, apiKey.length - 1).trim();
  }
  if (apiKey.startsWith("'") && apiKey.endsWith("'")) {
    apiKey = apiKey.substring(1, apiKey.length - 1).trim();
  }

  let fromEmail = (process.env.BREVO_FROM_EMAIL || "no-reply@diamondsolution.com").trim();
  if (fromEmail.startsWith('"') && fromEmail.endsWith('"')) {
    fromEmail = fromEmail.substring(1, fromEmail.length - 1).trim();
  }
  if (fromEmail.startsWith("'") && fromEmail.endsWith("'")) {
    fromEmail = fromEmail.substring(1, fromEmail.length - 1).trim();
  }

  return { apiKey, fromEmail };
};

const brevoConfig = getBrevoConfig();
const brevoClient = brevoConfig.apiKey ? new BrevoClient({ apiKey: brevoConfig.apiKey }) : null;

let resolvedSenderEmail: string | null = null;

const resolveBrevoSender = async (): Promise<string> => {
  if (resolvedSenderEmail) {
    return resolvedSenderEmail;
  }

  const { apiKey, fromEmail } = getBrevoConfig();

  // If a custom non-default email is specified in the environment, use it
  if (process.env.BREVO_FROM_EMAIL && process.env.BREVO_FROM_EMAIL.trim()) {
    resolvedSenderEmail = fromEmail;
    return resolvedSenderEmail;
  }

  // Otherwise, attempt to auto-discover active verified senders from your Brevo account
  if (apiKey) {
    try {
      const response = await axios.get("https://api.brevo.com/v3/senders", {
        headers: {
          "api-key": apiKey
        },
        timeout: 4000
      });
      const senders = response.data?.senders || [];
      const activeSender = senders.find((s: any) => s.active === true);
      if (activeSender && activeSender.email) {
        console.log(`[Brevo] Dynamically auto-discovered verified sender: ${activeSender.email}`);
        resolvedSenderEmail = activeSender.email;
        return resolvedSenderEmail;
      }
    } catch (err: any) {
      console.warn("[Brevo] Auto-discovery of verified senders failed. Falling back to default.", err.message);
    }
  }

  resolvedSenderEmail = fromEmail || "no-reply@diamondsolution.com";
  return resolvedSenderEmail;
};

const formatBrevoError = (err: any): string => {
  let msg = err.message || "Unknown error";
  if (err.statusCode) {
    msg += ` (Status: ${err.statusCode})`;
  }
  if (err.body) {
    try {
      const bodyStr = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
      if (bodyStr.includes("unrecognised IP address") || bodyStr.includes("authorised_ips")) {
        return `Brevo API rejected the request due to IP restrictions on your Brevo account (unrecognised IP address). Please go to https://app.brevo.com/security/authorised_ips and disable IP whitelisting or add your app's dynamic IP. Details: ${bodyStr}`;
      }
      msg += ` - Response: ${bodyStr}`;
    } catch (e) {
      // ignore
    }
  }
  return msg;
};

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: { 'User-Agent': 'aistudio-build' }
  }
}) : null;

const JWT_SECRET = process.env.JWT_SECRET || "diamond_solution_secret_key_98765";

// Rate limiters
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per 15 minutes for OTP
  message: { error: "Too many OTP requests. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const payoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 requests per hour for payout
  message: { error: "Too many payout requests. Please try again after an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to verify Firebase ID tokens on sensitive routes
async function verifyFirebaseToken(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header. Please authenticate first." });
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    // Ensure Firebase app and options are fully initialized
    await getFirestore();
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    next();
  } catch (error: any) {
    console.error("[Auth Middleware] Token verification failed:", error.message);
    return res.status(401).json({ error: "Unauthorized access. Invalid session or token." });
  }
}

// Admin checker
async function checkIsAdmin(uid: string) {
  try {
    // Fallback authentication check using Firebase Auth Admin SDK (does not require Firestore permissions)
    const userRecord = await getAuth().getUser(uid);
    if (userRecord.email === "peteradekunle923@gmail.com" || userRecord.customClaims?.admin === true) {
      return true;
    }
  } catch (authErr: any) {
    console.warn("[Auth Helper] Auth lookup for admin check fallback failed:", authErr.message);
  }

  try {
    const db = await getFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      return data?.role === "admin" || data?.email === "peteradekunle923@gmail.com";
    }
  } catch (error) {
    console.error("[Auth Helper] Failed to check admin role via Firestore:", error);
  }
  return false;
}

async function getFirestore() {
  if (dbInstance) return dbInstance;

  const config: any = firebaseAppletConfig || {};
  const databaseId = config.firestoreDatabaseId && config.firestoreDatabaseId !== "(default)" ? config.firestoreDatabaseId : undefined;

  if (getApps().length === 0) {
    try {
      const options: AppOptions = {};
      if (config.projectId) {
        options.projectId = config.projectId;
      }

      // Outside Google Cloud (e.g. a Netlify/AWS Lambda function) there is no ambient
      // Application Default Credential to discover, so a real service account key must be
      // supplied explicitly. Generate one in Firebase Console -> Project Settings ->
      // Service Accounts -> Generate new private key, and set its full JSON content as the
      // FIREBASE_SERVICE_ACCOUNT_KEY environment variable. When this isn't set (e.g. running
      // on a GCP-hosted platform, or locally with `gcloud auth application-default login`),
      // we fall back to the previous ADC-based behavior unchanged.
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(serviceAccountJson);
          options.credential = cert(serviceAccount);
          if (!options.projectId) {
            options.projectId = serviceAccount.project_id;
          }
        } catch (parseErr: any) {
          console.error("[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", parseErr.message);
        }
      }

      if (options.credential) {
        initializeApp(options);
        console.log(`[Firebase Admin] Initialized with explicit service account credential (project: ${options.projectId}).`);
      } else if (options.projectId) {
        initializeApp(options);
        console.log(`[Firebase Admin] Initialized with explicit project: ${options.projectId}`);
      } else {
        initializeApp();
        console.log(`[Firebase Admin] Initialized with ADC.`);
      }
    } catch (err: any) {
      console.error("[Firebase Admin] Initialization failed:", err.message);
      if (getApps().length === 0) {
        initializeApp();
      }
    }
  }

  try {
    const app = getApp();
    // In AI Studio, enterprise databases must be explicitly targeted by ID.
    let db: any;
    if (databaseId) {
      db = getFirestoreSDK(app, databaseId);
      console.log(`[Firestore] Target database specified: ${databaseId}`);
    } else {
      db = getFirestoreSDK(app);
    }

    dbInstance = db;
    return dbInstance;
  } catch (err: any) {
    console.error(`[Firestore] Failed to obtain database instance: ${err.message}`);
    throw err;
  }
}

// Builds and returns the Express app with all routes registered, but does not start
// listening or add static-file/dev-server middleware - that's the caller's job (see
// server.ts for the long-running-process entry point, and netlify/functions/api.ts for
// the serverless entry point). Keeping this separate from "how it's actually run" is what
// lets the exact same route code run on either.
export async function createApp() {
  // Initialize Firebase Admin and Firestore before setting up routes
  try {
    await getFirestore();
  } catch (err: any) {
    console.error("[Firebase] Initial connection failed, but proceeding to start server:", err.message);
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // OTP Request Endpoint
  app.post("/api/otp/request", otpLimiter, async (req, res) => {
    try {
      const parsedBody = z.object({
        userId: z.string().min(1, "userId is required"),
        email: z.string().email("Invalid email address"),
        purpose: z.string().min(1, "purpose is required"),
        name: z.string().optional()
      }).parse(req.body);

      const { userId, email, purpose, name } = parsedBody;
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const docId = `${userId}_${purpose}`;

      // Store in memory cache as primary/fallback mechanism
      memoryOtpCache.set(docId, {
        userId,
        email,
        purpose,
        code,
        createdAt,
        expiresAt
      });

      // Attempt to save to Firestore, but gracefully proceed on permission or database errors
      try {
        const db = await getFirestore();
        await db.collection("otp_codes").doc(docId).set({
          userId,
          email,
          purpose,
          code,
          createdAt,
          expiresAt
        });
      } catch (dbErr: any) {
        console.log(`[OTP Request] Firestore save bypassed, relying on secure memory cache:`, dbErr.message);
      }

      console.log(`[OTP Request] Generated code for user ${userId} purpose ${purpose}`);

      let emailSent = false;
      let emailError = "";

      if (brevoClient) {
        try {
          let subject = `Verification Code: ${code}`;
          let htmlContent = "";

          if (purpose === 'device_verification') {
            subject = `Security Alert: Device Verification`;
            htmlContent = `
              <div style="font-family: sans-serif; padding: 25px; color: #0a0c10; max-width: 600px; margin: auto; border: 1px solid #1e40af; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; margin-top: 0;">New Device Login Attempt</h2>
                <p>Hello ${name || "Scholar"},</p>
                <p>We noticed a login attempt to your Diamond Solution account from a <strong>new device</strong>.</p>
                <p>To authorize this device, please enter the following 6-digit confirmation code:</p>
                <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #1e40af; text-align: center;">
                  <span style="font-size: 32px; font-weight: 900; color: #1e40af; letter-spacing: 5px;">${code}</span>
                </div>
                <p>If you did not attempt to sign in, please ignore this email and secure your account immediately.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
                <p style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin: 0;">Diamond Solution Security Protocol</p>
              </div>
            `;
          } else if (purpose === 'device_reactivation') {
            subject = `Diamond Solution: Reactivation OTP Code`;
            htmlContent = `
              <div style="font-family: sans-serif; padding: 25px; color: #0a0c10; max-width: 600px; margin: auto; border: 1px solid #C9930A; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #C9930A; border-bottom: 2px solid #C9930A; padding-bottom: 10px; margin-top: 0;">Device Reactivation Code</h2>
                <p>Hello ${name || "Scholar"},</p>
                <p>We received your reactivation fee payment of ₦1,000 for your Diamond Solution account.</p>
                <p>To finalize your reactivation and enroll your current device, please enter the following 6-digit verification code:</p>
                <div style="background-color: #fdfaf2; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #C9930A; text-align: center;">
                  <span style="font-size: 32px; font-weight: 900; color: #C9930A; letter-spacing: 5px;">${code}</span>
                </div>
                <p>Entering this code allows you to register your current device as your primary device. This action will log you out from all other devices.</p>
                <p>If you did not make this request, please contact institutional support immediately.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
                <p style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin: 0;">Institutional Access Control • Diamond Solution</p>
              </div>
            `;
          } else {
            const actionLabel = purpose === 'password_change' ? 'Password Reset / Authority Verification' : 'Institutional Protocol Verification';
            htmlContent = `
              <div style="font-family: sans-serif; padding: 20px; color: #0a0c10;">
                <h2 style="color: #C9930A;">Security Protocol Verification</h2>
                <p>Someone is attempting to perform a <strong>${actionLabel}</strong> operation on target: <strong>${email}</strong>.</p>
                <div style="background: #f4f4f4; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #C9930A;">${code}</span>
                </div>
                <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 2px;">Institutional Access Control • Diamond Solution</p>
              </div>
            `;
          }

          const senderEmail = await resolveBrevoSender();
          await brevoClient.transactionalEmails.sendTransacEmail({
            sender: { email: senderEmail, name: 'Diamond Solution' },
            to: [{ email }],
            subject,
            htmlContent
          });
          emailSent = true;
        } catch (brevoErr: any) {
          const detailedError = formatBrevoError(brevoErr);
          console.error("[Brevo] Failed to send OTP email:", detailedError);
          emailError = `Email delivery failure: ${detailedError}`;
        }
      } else {
        console.warn("[OTP] BREVO_API_KEY is not configured. Email dispatch skipped.");
        emailError = "Institutional email gateway is not configured (BREVO_API_KEY missing).";
      }

      // Log to Firestore for admin/trial visibility (Do NOT return OTP in response)
      try {
        const db = await getFirestore();
        await db.collection("system_logs").add({
          purpose: `OTP Request: ${purpose}`,
          email,
          otp: code,
          targetId: userId,
          createdAt: new Date().toISOString(),
          emailSent,
          emailError
        });
      } catch (logErr) {
        // ignore logging errors
      }

      res.json({ success: true, emailSent, error: emailError });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.issues[0].message });
      }
      console.error("[OTP Request Error]:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // OTP Verification Endpoint
  app.post("/api/otp/verify", otpLimiter, async (req, res) => {
    try {
      const parsedBody = z.object({
        userId: z.string().min(1, "userId is required"),
        purpose: z.string().min(1, "purpose is required"),
        code: z.string().length(6, "Code must be exactly 6 digits").regex(/^\d+$/, "Code must contain only digits")
      }).parse(req.body);

      const { userId, purpose, code } = parsedBody;

      const docId = `${userId}_${purpose}`;
      let data: any = null;

      // Check local memory cache first
      const cached = memoryOtpCache.get(docId);
      if (cached) {
        data = cached;
      }

      // Try checking Firestore
      try {
        const db = await getFirestore();
        const docRef = db.collection("otp_codes").doc(docId);
        const otpDoc = await docRef.get();
        if (otpDoc.exists) {
          data = otpDoc.data() || {};
        }
      } catch (dbErr: any) {
        console.log(`[OTP Verify] Firestore lookup bypassed, relying on secure memory cache:`, dbErr.message);
      }

      if (!data) {
        return res.status(400).json({ error: "Verification code not found or expired" });
      }

      if (data.code !== code) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      if (new Date() > new Date(data.expiresAt)) {
        memoryOtpCache.delete(docId);
        try {
          const db = await getFirestore();
          await db.collection("otp_codes").doc(docId).delete();
        } catch (e) {}
        return res.status(400).json({ error: "Verification code has expired" });
      }

      // Delete the doc on successful verification
      memoryOtpCache.delete(docId);
      try {
        const db = await getFirestore();
        await db.collection("otp_codes").doc(docId).delete();
      } catch (e) {}

      // Return a short-lived signed verification token (15 mins)
      const token = jwt.sign({ userId, purpose, verified: true }, JWT_SECRET, { expiresIn: '15m' });

      res.json({ success: true, token });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.issues[0].message });
      }
      console.error("[OTP Verify Error]:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Activate affiliate immediately without fee or approval
  app.post("/api/activate-affiliate", verifyFirebaseToken, async (req, res) => {
    try {
      const { userId } = z.object({
        userId: z.string().min(1, "userId is required")
      }).parse(req.body);

      let targetUserId = (req as any).uid;
      if (userId && userId !== (req as any).uid) {
        const isAdminUser = await checkIsAdmin((req as any).uid);
        if (!isAdminUser) {
          return res.status(403).json({ error: "Forbidden: You can only activate affiliate status for your own account." });
        }
        targetUserId = userId;
      }

      let referralCode = `DS${targetUserId.substring(0, 5).toUpperCase()}`;
      let success = true;

      try {
        const db = await getFirestore();
        const userRef = db.collection("users").doc(targetUserId);
        const userDoc = await userRef.get();

        const userData = userDoc.exists ? userDoc.data() || {} : {};

        if (userData.affiliateStatus === 'active' && userData.referralCode) {
          return res.json({ success: true, message: "Asset already activated", referralCode: userData.referralCode });
        }

        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        referralCode = userData.referralCode || `DS${randomPart}`;

        const updateData = {
          affiliateStatus: "active",
          isAffiliate: true,
          isPartner: true,
          referralCode: referralCode,
          updatedAt: new Date().toISOString()
        };

        if (!userData.activatedAt) {
          (updateData as any).activatedAt = new Date().toISOString();
        }

        await userRef.set(updateData, { merge: true });
        console.log(`[Affiliate] User ${targetUserId} auto-activated in Firestore. Code: ${referralCode}`);
      } catch (dbErr: any) {
        console.error(`[Affiliate Activation] Firestore operation failed:`, dbErr.message);
        throw dbErr;
      }

      res.json({ success: true, message: "Protocol Activated", referralCode });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      console.error("[Affiliate Activation] Protocol Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: permanently delete a user (Auth account + all Firestore records)
  app.post("/api/admin/delete-user", verifyFirebaseToken, async (req, res) => {
    try {
      const { targetUserId } = z.object({
        targetUserId: z.string().min(1, "targetUserId is required")
      }).parse(req.body);

      const callerUid = (req as any).uid;

      const isAdminUser = await checkIsAdmin(callerUid);
      if (!isAdminUser) {
        return res.status(403).json({ error: "Forbidden: Admin privileges are required to delete users." });
      }

      if (targetUserId === callerUid) {
        return res.status(400).json({ error: "You cannot delete your own account from the admin panel." });
      }

      const db = await getFirestore();
      const targetDoc = await db.collection("users").doc(targetUserId).get();
      const targetEmail = targetDoc.exists ? targetDoc.data()?.email : undefined;

      if (targetEmail && String(targetEmail).toLowerCase() === "peteradekunle923@gmail.com") {
        return res.status(403).json({ error: "This account cannot be deleted." });
      }

      // Remove the Firebase Auth account so the credentials stop working immediately
      try {
        await getAuth().deleteUser(targetUserId);
      } catch (authErr: any) {
        if (authErr.code !== "auth/user-not-found") {
          console.error("[Admin Delete User] Auth deletion failed:", authErr.message);
          throw authErr;
        }
      }

      // Remove Firestore records
      const batch = db.batch();
      batch.delete(db.collection("users").doc(targetUserId));
      batch.delete(db.collection("admins").doc(targetUserId));
      await batch.commit();

      try {
        await db.collection("system_logs").add({
          purpose: "Admin User Deletion",
          targetId: targetUserId,
          targetEmail: targetEmail || null,
          performedBy: callerUid,
          createdAt: new Date().toISOString()
        });
      } catch (logErr) {
        // Non-fatal: deletion already succeeded, logging is best-effort
      }

      res.json({ success: true, message: "User permanently deleted." });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      console.error("[Admin Delete User] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Public profile lookup: returns only non-sensitive display fields for a batch of user IDs.
  // Used by the leaderboard/dashboard rankings so the client never needs broad read access
  // to the users collection (which also holds email, balance, and bank details).
  app.post("/api/public-profiles", verifyFirebaseToken, async (req, res) => {
    try {
      const { userIds } = z.object({
        userIds: z.array(z.string().min(1)).min(1).max(100)
      }).parse(req.body);

      const db = await getFirestore();
      const uniqueIds = Array.from(new Set(userIds));

      const docs = await Promise.all(
        uniqueIds.map((id) => db.collection("users").doc(id).get().catch(() => null))
      );

      const profiles = docs
        .filter((d): d is FirebaseFirestore.DocumentSnapshot => !!d && d.exists)
        .map((d) => {
          const data = d.data() || {};
          const uName = (typeof data.username === 'string' ? data.username : '').trim();
          const dName = (typeof data.displayName === 'string' ? data.displayName : '').trim();
          const fName = (typeof data.fullName === 'string' ? data.fullName : (typeof data.name === 'string' ? data.name : '')).trim();
          const email = (typeof data.email === 'string' ? data.email : '').trim();

          let resolvedName = '';
          if (uName && uName.toLowerCase() !== 'scholar' && !uName.includes('@')) {
            resolvedName = uName.charAt(0).toUpperCase() + uName.slice(1);
          } else if (dName && dName.toLowerCase() !== 'scholar' && !dName.includes('@')) {
            resolvedName = dName.charAt(0).toUpperCase() + dName.slice(1);
          } else if (fName && fName.toLowerCase() !== 'scholar' && !fName.includes('@')) {
            resolvedName = fName.charAt(0).toUpperCase() + fName.slice(1);
          } else if (email && email.includes('@')) {
            const rawPrefix = email.split('@')[0];
            const stripped = rawPrefix.replace(/\d+$/, '');
            const clean = stripped.length >= 2 ? stripped : rawPrefix;
            resolvedName = clean.charAt(0).toUpperCase() + clean.slice(1);
          } else if (uName) {
            resolvedName = uName.charAt(0).toUpperCase() + uName.slice(1);
          } else if (dName) {
            resolvedName = dName.charAt(0).toUpperCase() + dName.slice(1);
          } else {
            resolvedName = 'Scholar';
          }

          const rawUniv = data.university || data.institutionalName || data.institution || data.school || data.college || "University of Ibadan";

          return {
            id: d.id,
            username: uName || resolvedName,
            displayName: resolvedName,
            department: data.department || "",
            university: rawUniv,
            role: data.role || "student"
          };
        });

      res.json({ profiles });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      console.error("[Public Profiles] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Translation endpoint
  app.post("/api/translate", async (req, res) => {
    const { text, targetLang } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    try {
      if (!genAI) {
        return res.json({ translated: text, source: 'fallback' });
      }

      const prompt = `Translate the following text or array of strings to ${targetLang}. Return ONLY the translation. If it's single string, return string. If array, return array in JSON format. Text: ${JSON.stringify(text)}`;

      const result = await genAI.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt
      });
      let translatedText = result.text.trim();

      // Clean up potential markdown code blocks
      if (translatedText.startsWith("```json")) {
        translatedText = translatedText.replace(/^```json\n/, "").replace(/\n```$/, "");
      } else if (translatedText.startsWith("```")) {
        translatedText = translatedText.replace(/^```\n/, "").replace(/\n```$/, "");
      }

      try {
        const parsed = JSON.parse(translatedText);
        res.json({ translated: parsed });
      } catch {
        res.json({ translated: translatedText });
      }
    } catch (error: any) {
      console.error("[Translate] Error:", error.message);
      res.json({ translated: text, error: error.message });
    }
  });

  // OTP Email endpoint
  app.post("/api/send-otp", async (req, res) => {
    const { email, token, action, targetId } = req.body;

    try {
      console.log(`[OTP] Dispatching ${token} for ${action} to ${email}`);
      let emailSent = false;
      let emailError = "";

      if (brevoClient) {
        try {
          const senderEmail = await resolveBrevoSender();
          await brevoClient.transactionalEmails.sendTransacEmail({
            sender: { email: senderEmail, name: 'Diamond Solution' },
            to: [{ email }],
            subject: `Verification Code: ${token}`,
            htmlContent: `
              <div style="font-family: sans-serif; padding: 20px; color: #0a0c10;">
                <h2 style="color: #C9930A;">Security Protocol Verification</h2>
                <p>Someone is attempting to perform a <strong>${action}</strong> operation on target: <strong>${targetId || email}</strong>.</p>
                <div style="background: #f4f4f4; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #C9930A;">${token}</span>
                </div>
                <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 2px;">Institutional Access Control • Diamond Solution</p>
              </div>
            `
          });
          emailSent = true;
        } catch (brevoErr: any) {
          const detailedError = formatBrevoError(brevoErr);
          console.error("[Brevo] Failed to send email:", detailedError);
          emailError = `Email delivery failure: ${detailedError}`;
        }
      } else {
        console.warn("[OTP] BREVO_API_KEY is not configured. Email dispatch skipped.");
        emailError = "Institutional email gateway is not configured (BREVO_API_KEY missing).";
      }

      // Log to Firestore for admin visibility
      try {
        const db = await getFirestore();
        if (db) {
          await db.collection("system_logs").add({
            purpose: `OTP Dispatch: ${action}`,
            email,
            otp: token,
            targetId: targetId || email,
            createdAt: new Date().toISOString(),
            emailSent,
            emailError
          });
        }
      } catch (logErr: any) {
        // Suppress expected errors when Admin SDK lacks credentials in preview environment
        if (!logErr.message.includes("NOT_FOUND") && !logErr.message.includes("PERMISSION_DENIED")) {
          console.warn("[OTP] Logging failed, but proceeding:", logErr.message);
        }
      }

      res.json({ success: true, emailSent, error: emailError, token });
    } catch (error: any) {
      console.error("[OTP] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Config endpoint for client-side keys
  app.get("/api/config", (req, res) => {
    res.json({
      paystackPublicKey: process.env.VITE_PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY || ""
    });
  });

  // Payout endpoint
  app.post("/api/payout", verifyFirebaseToken, payoutLimiter, async (req, res) => {
    try {
      const parsedBody = z.object({
        amount: z.number().positive("Amount must be positive"),
        accountNumber: z.string().min(5, "Invalid account number").max(30, "Account number too long"),
        bankCode: z.string().min(1, "Bank code is required"),
        accountName: z.string().min(1, "Account name is required"),
        reference: z.string().min(1, "Reference is required"),
        userId: z.string().min(1, "userId is required")
      }).parse(req.body);

      const { amount, accountNumber, bankCode, accountName, reference, userId } = parsedBody;
      const secretKey = process.env.PAYSTACK_SECRET_KEY;

      let targetUserId = (req as any).uid;
      if (userId && userId !== (req as any).uid) {
        const isAdminUser = await checkIsAdmin((req as any).uid);
        if (!isAdminUser) {
          return res.status(403).json({ error: "Forbidden: You cannot request payouts for another user's account." });
        }
        targetUserId = userId;
      }

      let db = await getFirestore();
      const userRef = db.collection("users").doc(targetUserId);
      const userDoc = await userRef.get().catch((err: any) => {
        console.error("[Payout] Firestore user lookup failed closed:", err.message);
        throw new Error("DURABLE_STORE_CONNECTIVITY_ERROR");
      });

      if (!userDoc.exists) {
        return res.status(404).json({ error: "User profile not found in durable storage." });
      }

      const userData = userDoc.data() || {};

      // Restrict payout to users who paid for a departmental course (excluding admin/moderators)
      let hasPaidCourse = false;
      let currency = userData.currency || "NGN";

      if (userData.role === 'admin' || userData.role === 'moderator' || userData.hasPaidCourse === true) {
        hasPaidCourse = true;
      } else {
        // Double check database payments as backup
        const paymentsSnap = await db.collection("payments")
          .where("userId", "==", targetUserId)
          .get().catch((err: any) => {
            console.error("[Payout] Firestore payments lookup failed closed:", err.message);
            throw new Error("DURABLE_STORE_CONNECTIVITY_ERROR");
          });

        hasPaidCourse = paymentsSnap.docs.some((doc: any) => {
          const d = doc.data();
          const isSuccess = d.status === 'success' || d.status === 'paid';
          const isNotReactivation = d.purpose !== 'reactivation';
          const hasDeptOrCourse = !!(
            d.dept_name ||
            d.department ||
            d.courseId ||
            d.type === 'department_access' ||
            doc.id.startsWith('dept_pay_') ||
            doc.id.includes('_course_')
          );
          return isSuccess && isNotReactivation && hasDeptOrCourse;
        });
      }

      if (!hasPaidCourse) {
        return res.status(403).json({ error: "Access Denied: You must purchase at least one departmental course to unlock affiliate payout privileges." });
      }

      // Enforce the affiliate's REAL balance server-side. The withdrawal request's "amount"
      // field was only ever bounded by a balance the client computed from the same
      // (forgeable) commission records - never a real check. Recompute the ground truth here
      // from actual successful commissions minus actual successful prior payouts.
      const commissionsSnap = await db.collection("affiliates")
        .where("referrerUid", "==", targetUserId)
        .where("status", "==", "success")
        .get().catch((err: any) => {
          console.error("[Payout] Firestore affiliates lookup failed closed:", err.message);
          throw new Error("DURABLE_STORE_CONNECTIVITY_ERROR");
        });
      const totalEarned = commissionsSnap.docs.reduce((sum: number, d: any) => {
        const data = d.data();
        return (data.commissionCurrency || 'NGN') === currency ? sum + (data.commissionAmount || 0) : sum;
      }, 0);

      const priorWithdrawalsSnap = await db.collection("withdrawals")
        .where("userId", "==", targetUserId)
        .where("status", "==", "success")
        .get().catch((err: any) => {
          console.error("[Payout] Firestore withdrawals lookup failed closed:", err.message);
          throw new Error("DURABLE_STORE_CONNECTIVITY_ERROR");
        });
      const totalWithdrawn = priorWithdrawalsSnap.docs.reduce((sum: number, d: any) => {
        const data = d.data();
        return (data.currency || 'NGN') === currency ? sum + (data.amount || 0) : sum;
      }, 0);

      const realBalance = totalEarned - totalWithdrawn;
      if (amount > realBalance) {
        console.error(`[Payout] Requested payout ${amount} ${currency} exceeds real balance ${realBalance} ${currency} for user ${targetUserId}.`);
        return res.status(400).json({ error: "Requested amount exceeds this affiliate's verified commission balance." });
      }

      if (currency === "USD" && amount < 10) {
        return res.status(400).json({ error: "The minimum payout amount for USD is $10." });
      } else if (currency === "NGN" && amount < 10000) {
        return res.status(400).json({ error: "The minimum payout amount for NGN is ₦10,000." });
      }

      if (bankCode === 'INTL') {
        console.log(`[Payout] INTL payout requested for ${accountName} using ${accountNumber}`);
        return res.json({ success: true, message: "International payout logged for manual processing", reference, isManual: true });
      }

      const isNoSecretKey = !secretKey ||
                            secretKey === 'sk_test_placeholder' ||
                            secretKey === 'undefined' ||
                            secretKey === 'null' ||
                            secretKey === '' ||
                            !secretKey.startsWith('sk_');

      // Same reasoning as the payment-simulation gate below: a missing/invalid key is not
      // proof this is a dev environment - only actually simulate the payout outside production.
      if (isNoSecretKey) {
        if (process.env.NODE_ENV === 'production') {
          console.error("[Payout] PAYSTACK_SECRET_KEY is missing or invalid in production - refusing to fake a payout.");
          return res.status(500).json({ error: "Payout gateway is not configured. Please contact support before retrying." });
        }
        console.warn("[Payout] Payout simulated - no secret key.");
        return res.json({ success: true, message: "Payout simulated", reference });
      }

      // 1. Create Transfer Recipient
      const recipientRes = await axios.post('https://api.paystack.co/transferrecipient', {
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN"
      }, {
        headers: { Authorization: `Bearer ${secretKey}` }
      });

      const recipientCode = recipientRes.data.data.recipient_code;

      // 2. Initiate Transfer
      const transferRes = await axios.post('https://api.paystack.co/transfer', {
        source: "balance",
        amount: amount * 100, // Convert to kobo
        recipient: recipientCode,
        reason: "Affiliate Commission Withdrawal",
        reference
      }, {
        headers: { Authorization: `Bearer ${secretKey}` }
      });

      res.json(transferRes.data);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      if (error.message === "DURABLE_STORE_CONNECTIVITY_ERROR") {
        return res.status(503).json({ error: "Durable storage service temporarily unavailable. Please retry shortly." });
      }
      const details = error.response?.data?.message || error.message;
      console.error("[Payout] Error:", details);
      res.status(500).json({ error: "Payout failed", details });
    }
  });

  // Course payment verification. This endpoint is now the ONLY place a department payment
  // is ever granted - it independently verifies the transaction with Paystack (status,
  // amount, currency, one-time use) and writes the resulting payments/users/affiliates
  // records itself via the Admin SDK. The client no longer writes any of these documents;
  // Firestore rules block it from doing so (see firestore.rules), because a client-writable
  // "status: success" record is exactly what previously let anyone grant themselves paid
  // access, or mint themselves affiliate commission, for free.
  app.post("/api/verify-departmental-payment", verifyFirebaseToken, async (req, res) => {
    try {
      const parsedBody = z.object({
        reference: z.string().min(1, "Reference is required"),
        userData: z.object({
          uid: z.string().optional(),
          email: z.string().optional(),
          displayName: z.string().optional(),
          username: z.string().optional()
        }).optional(),
        department: z.string().min(1, "Department is required"),
        currency: z.enum(["NGN", "USD"]).optional().default("NGN"),
        referrerId: z.string().optional().nullable()
      }).parse(req.body);

      const { reference, department, currency, referrerId } = parsedBody;
      const secretKey = process.env.PAYSTACK_SECRET_KEY;
      const callerUid = (req as any).uid;
      let targetUid = callerUid;

      if (parsedBody.userData?.uid && parsedBody.userData.uid !== callerUid) {
        const isAdminUser = await checkIsAdmin(callerUid);
        if (!isAdminUser) {
          return res.status(403).json({ error: "Forbidden: You can only verify payments for your own account." });
        }
        targetUid = parsedBody.userData.uid;
      }

      const db = await getFirestore();
      const userDocRef = db.collection("users").doc(targetUid);
      const userDocSnap = await userDocRef.get();
      const existingUserData = userDocSnap.exists ? userDocSnap.data() || {} : {};

      const userEmail = parsedBody.userData?.email || existingUserData.email || (req as any).email || '';
      const userDisplayName = parsedBody.userData?.displayName || parsedBody.userData?.username || existingUserData.displayName || existingUserData.username || 'Scholar';

      const paymentId = `dept_pay_${targetUid}_${department}`;
      const paymentRef = db.collection("payments").doc(paymentId);

      const existingPayment = await paymentRef.get();
      if (existingPayment.exists && existingPayment.data()?.status === 'success') {
        await userDocRef.set({ hasPaidCourse: true, updatedAt: new Date().toISOString() }, { merge: true });
        return res.json({ success: true, alreadyGranted: true });
      }

      const priceInfo = await getDepartmentPrice(db, department);
      const expectedPrice = currency === 'USD' ? priceInfo.usd : priceInfo.ngn;

      // Simulation references are a local-development convenience (see the "DEBUG MODE"
      // dialogs in the client) and must never be honored in production - otherwise any
      // signed-in user can grant themselves a paid course by submitting a fabricated sim_
      // reference, with no Paystack call ever made.
      const isSimulation = process.env.NODE_ENV !== 'production' && !!reference && reference.startsWith('sim_');
      const noKey = !secretKey ||
                    secretKey === 'sk_test_placeholder' ||
                    secretKey === 'undefined' ||
                    secretKey === 'null' ||
                    secretKey === '' ||
                    !secretKey.startsWith('sk_');

      console.log(`[Paystack Verify] Reference: ${reference}, department: ${department}, isSimulation: ${isSimulation}, noKey: ${noKey}`);

      if (noKey && process.env.NODE_ENV === 'production') {
        console.error("[Paystack Verify] PAYSTACK_SECRET_KEY is missing or invalid in production - refusing to grant access without real verification.");
        return res.status(500).json({ error: "Payment gateway is not configured. Please contact support before retrying." });
      }

      if (!isSimulation && !noKey) {
        let txData: any;
        try {
          const verifyRes = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${secretKey}` }
          });
          txData = verifyRes.data?.data;
        } catch (verifyErr: any) {
          // A failed verification call - for ANY reason, including an invalid merchant key -
          // must never be treated as proof of payment. Failing open here (as this endpoint
          // used to on an "invalid_Key" response) is exactly what let a misconfigured secret
          // key turn every payment attempt into a free pass.
          console.error("[Paystack Verify] Verification API call failed:", verifyErr.response?.data || verifyErr.message);
          return res.status(502).json({ error: "Could not verify payment with the payment gateway. Please contact support before retrying." });
        }

        if (!txData || txData.status !== "success") {
          return res.status(400).json({ error: "Payment failed at gateway: " + (txData?.gateway_response || 'Unknown') });
        }

        // Amount/currency must match what this department actually costs - the client's
        // claimed price is never trusted for granting access, otherwise a token payment
        // could be submitted as "proof" of a full-price purchase.
        if (txData.currency !== currency || txData.amount !== expectedPrice * 100) {
          console.error(`[Paystack Verify] Amount mismatch for ${reference}: expected ${expectedPrice * 100} ${currency}, gateway reports ${txData.amount} ${txData.currency}`);
          return res.status(400).json({ error: "Payment amount does not match the department fee." });
        }

        // Anti-replay: a single successful reference must not be usable to grant more than
        // one payment record, otherwise one real transaction could be resubmitted to unlock
        // every department for free.
        const priorUse = await db.collection("payments").where("reference", "==", reference).limit(5).get();
        const alreadyConsumed = priorUse.docs.some((d: any) => d.id !== paymentId && d.data()?.status === 'success');
        if (alreadyConsumed) {
          return res.status(400).json({ error: "This payment reference has already been used." });
        }
      }
      // isSimulation and the dev-only missing-key path intentionally skip real verification.

      const now = new Date().toISOString();
      let referrerData: any = null;
      let referrerCurrency = 'NGN';
      let commissionAmount = 0;

      if (referrerId && referrerId !== targetUid) {
        const referrerSnap = await db.collection("users").doc(referrerId).get();
        if (referrerSnap.exists) {
          referrerData = referrerSnap.data();
          referrerCurrency = referrerData.currency || 'NGN';
          commissionAmount = computeCommission(expectedPrice, currency, referrerCurrency);
        }
      }

      await paymentRef.set({
        id: paymentId,
        userId: targetUid,
        amount: expectedPrice,
        currency,
        status: 'success',
        type: 'department_access',
        dept_name: department,
        department,
        reference,
        courseId: 'all_dept',
        studentName: userDisplayName,
        email: userEmail,
        paidAt: now,
        createdAt: now
      });

      await userDocRef.set({ hasPaidCourse: true, updatedAt: now }, { merge: true });

      if (referrerData) {
        const commissionId = `comm_${paymentId}`;
        await db.collection("affiliates").doc(commissionId).set({
          id: commissionId,
          referrerUid: referrerId,
          referrerName: referrerData.displayName || 'Affiliate',
          referredUid: targetUid,
          referredName: userDisplayName,
          paymentAmount: expectedPrice,
          paymentCurrency: currency,
          commissionAmount,
          commissionCurrency: referrerCurrency,
          commissionRate: AFFILIATE_COMMISSION_RATE,
          status: 'success',
          createdAt: now
        });
      }

      // Dispatch Emails (Upline & Admin) - best-effort, never blocks the response. Referrer
      // identity/email come from the Firestore doc the server just looked up, not from
      // anything the client claimed.
      if (brevoClient) {
        try {
          const senderEmail = await resolveBrevoSender();
          const adminEmail = 'peteradekunle923@gmail.com';
          brevoClient.transactionalEmails.sendTransacEmail({
            sender: { email: senderEmail, name: 'Diamond Solution' },
            to: [{ email: adminEmail }],
            subject: `Course Purchase Alert: ${userDisplayName || "A user"} bought a course`,
            htmlContent: `
              <div style="font-family: sans-serif; padding: 25px; color: #0a0c10; max-width: 600px; margin: auto; border: 1px solid #C9930A; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #C9930A; border-bottom: 2px solid #C9930A; padding-bottom: 10px; margin-top: 0;">Course Purchase Notification</h2>
                <p>Hello Administrator,</p>
                <p>A student has successfully completed a course purchase on the platform. Here are the details:</p>
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #C9930A;">
                  <p style="margin: 0 0 10px 0;"><strong>Student Name:</strong> ${userDisplayName || "Scholar"}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Student Email:</strong> ${userEmail || "No email"}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Department:</strong> ${department || "N/A"}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Amount Paid:</strong> ${currency === "USD" ? "$" : "₦"}${expectedPrice.toLocaleString()}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Reference ID:</strong> ${reference || "N/A"}</p>
                  <p style="margin: 0;"><strong>Referred By:</strong> ${referrerData ? `Yes (ID: ${referrerId})` : "No"}</p>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
                <p style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin: 0;">Administrator Control Board • Diamond Solution</p>
              </div>
            `
          }).catch(err => console.error("Could not send admin path email:", formatBrevoError(err)));

          if (referrerData?.email) {
            const referrerCurrencySymbol = referrerCurrency === 'USD' ? '$' : '₦';
            brevoClient.transactionalEmails.sendTransacEmail({
              sender: { email: senderEmail, name: 'Diamond Solution' },
              to: [{ email: referrerData.email }],
              subject: `Commission Earned: 25% Rewards Dispatched!`,
              htmlContent: `
                <div style="font-family: sans-serif; padding: 25px; color: #0a0c10; max-width: 600px; margin: auto; border: 1px solid #10b981; border-radius: 12px; background-color: #ffffff;">
                  <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px; margin-top: 0;">New Reward Commission! 🎁</h2>
                  <p>Dear ${referrerData.displayName || 'Affiliate'},</p>
                  <p>We are excited to inform you that a student you referred (<strong>${userDisplayName || "Scholar"}</strong>) has purchased a course in <strong>${department || "Department"}</strong>.</p>
                  <p>As part of the Diamond Solution referral program, your 25% commission has been calculated and successfully credited to your affiliate wallet.</p>
                  <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #10b981; text-align: center;">
                    <span style="font-size: 13px; color: #15803d; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; display: block; margin-bottom: 5px;">Your Net Reward</span>
                    <span style="font-size: 32px; font-weight: 900; color: #15803d;">${referrerCurrencySymbol}${commissionAmount.toLocaleString()}</span>
                  </div>
                  <p>Check your **Affiliate Terminal** in the app to view your net balance, update your payment authority details, and place withdrawal requests.</p>
                  <p>Thank you for helping us grow!</p>
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
                  <p style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin: 0;">Secured Affiliate Engine • Diamond Solution</p>
                </div>
              `
            }).catch(err => console.error("Could not send upline path email:", formatBrevoError(err)));
          }
        } catch (emailErr: any) {
          console.error("[Email Notification] Could not dispatch email notifications:", formatBrevoError(emailErr));
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      console.error("[Course Payment] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reactivation fee verification (suspension unblock, or the first step of a device-block
  // unblock). Like course payments, this used to be a pure client-side Firestore write with
  // no Paystack check at all - a suspended user could just set their own status back to
  // 'active'. Now the server independently verifies the reference before writing anything.
  app.post("/api/verify-reactivation-payment", verifyFirebaseToken, async (req, res) => {
    try {
      const { reference, deviceId } = z.object({
        reference: z.string().min(1, "Reference is required"),
        deviceId: z.string().optional()
      }).parse(req.body);

      const uid = (req as any).uid;
      const secretKey = process.env.PAYSTACK_SECRET_KEY;

      const db = await getFirestore();
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        return res.status(404).json({ error: "User profile not found." });
      }
      const userData = userSnap.data() || {};

      const isDeviceBlocked = userData.status === 'device_blocked' || userData.deviceBlockPending === true;
      if (userData.status !== 'suspended' && !isDeviceBlocked && !userData.reactivationPaid) {
        return res.status(400).json({ error: "This account is not currently restricted - nothing to reactivate." });
      }

      // Mirrors exactly what the client sends to Paystack in Reactivation.tsx: no explicit
      // currency is set on the Paystack config there, so the charge always settles in NGN,
      // with the USD fee converted to its NGN-equivalent for non-Nigerian accounts.
      const isNigerian = userData.country === 'Nigeria' || !userData.country;
      const feeNGN = 1000;
      const feeUSD = 2;
      const expectedAmount = isNigerian ? feeNGN * 100 : Math.round(feeUSD * NGN_TO_USD * 100);
      const expectedCurrency = 'NGN';

      const isSimulation = process.env.NODE_ENV !== 'production' && reference.startsWith('sim_');
      const noKey = !secretKey ||
                    secretKey === 'sk_test_placeholder' ||
                    secretKey === 'undefined' ||
                    secretKey === 'null' ||
                    secretKey === '' ||
                    !secretKey.startsWith('sk_');

      if (noKey && process.env.NODE_ENV === 'production') {
        console.error("[Reactivation Payment] PAYSTACK_SECRET_KEY is missing or invalid in production - refusing to grant access without real verification.");
        return res.status(500).json({ error: "Payment gateway is not configured. Please contact support before retrying." });
      }

      if (!isSimulation && !noKey) {
        let txData: any;
        try {
          const verifyRes = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${secretKey}` }
          });
          txData = verifyRes.data?.data;
        } catch (verifyErr: any) {
          console.error("[Reactivation Payment] Verification API call failed:", verifyErr.response?.data || verifyErr.message);
          return res.status(502).json({ error: "Could not verify payment with the payment gateway. Please contact support before retrying." });
        }

        if (!txData || txData.status !== "success") {
          return res.status(400).json({ error: "Payment failed at gateway: " + (txData?.gateway_response || 'Unknown') });
        }
        if (txData.currency !== expectedCurrency || txData.amount !== expectedAmount) {
          console.error(`[Reactivation Payment] Amount mismatch for ${reference}: expected ${expectedAmount} ${expectedCurrency}, gateway reports ${txData.amount} ${txData.currency}`);
          return res.status(400).json({ error: "Payment amount does not match the reactivation fee." });
        }

        const existing = await db.collection("payments").doc(reference).get();
        if (existing.exists && existing.data()?.status === 'success') {
          return res.status(400).json({ error: "This payment reference has already been used." });
        }
      }

      const now = new Date().toISOString();
      const purpose = isDeviceBlocked ? 'device_reactivation' : 'reactivation';

      await db.collection("payments").doc(reference).set({
        userId: uid,
        email: userData.email || null,
        amount: expectedAmount / 100,
        currency: expectedCurrency,
        purpose,
        status: 'success',
        reference,
        createdAt: now
      });

      const updatePayload: any = {
        status: 'active',
        isBlocked: false,
        deviceBlockPending: false,
        blockedUntil: null,
        reactivationPaid: true,
        suspensionReason: null,
        reactivatedAt: now,
        lastStudyDate: now
      };

      if (deviceId) {
        updatePayload.registeredDeviceIds = [deviceId];
      }

      await userRef.set(updatePayload, { merge: true });

      res.json({ success: true, isDeviceBlocked: false, message: "Account reactivated and access granted." });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      console.error("[Reactivation Payment] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Final step of a device-block reactivation: consumes the short-lived token issued by
  // /api/otp/verify (proof the user controls their registered email) to atomically swap the
  // registered device and restore access.
  app.post("/api/complete-device-reactivation", verifyFirebaseToken, async (req, res) => {
    try {
      const { token, deviceId } = z.object({
        token: z.string().min(1, "Verification token is required"),
        deviceId: z.string().min(1, "deviceId is required")
      }).parse(req.body);

      const uid = (req as any).uid;

      let payload: any;
      try {
        payload = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(400).json({ error: "Invalid or expired verification token. Please request a new code." });
      }

      if (!payload?.verified || payload.purpose !== 'device_reactivation' || payload.userId !== uid) {
        return res.status(403).json({ error: "Verification token does not match this request." });
      }

      const db = await getFirestore();
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        return res.status(404).json({ error: "User profile not found." });
      }
      const userData = userSnap.data() || {};

      if (userData.reactivationPaid !== true) {
        return res.status(403).json({ error: "Reactivation fee has not been confirmed as paid." });
      }

      const now = new Date().toISOString();
      await userRef.set({
        status: 'active',
        isBlocked: false,
        deviceBlockPending: false,
        blockedUntil: null,
        reactivationPaid: true,
        registeredDeviceIds: [deviceId],
        reactivatedAt: now,
        lastStudyDate: now
      }, { merge: true });

      res.json({ success: true, message: "Device registered and access restored." });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      console.error("[Complete Device Reactivation] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/send-device-verification-email", async (req, res) => {
    const { email, code, name } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Missing email or code" });

    try {
      if (brevoClient) {
        const senderEmail = await resolveBrevoSender();
        await brevoClient.transactionalEmails.sendTransacEmail({
          sender: { email: senderEmail, name: 'Diamond Solution' },
          to: [{ email }],
          subject: `Security Alert: Device Verification`,
          htmlContent: `
            <div style="font-family: sans-serif; padding: 25px; color: #0a0c10; max-width: 600px; margin: auto; border: 1px solid #1e40af; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; margin-top: 0;">New Device Login Attempt</h2>
              <p>Hello ${name || "Scholar"},</p>
              <p>We noticed a login attempt to your Diamond Solution account from a <strong>new device</strong>.</p>
              <p>To authorize this device, please enter the following 6-digit confirmation code:</p>
              <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #1e40af; text-align: center;">
                <span style="font-size: 32px; font-weight: 900; color: #1e40af; letter-spacing: 5px;">${code}</span>
              </div>
              <p>If you did not attempt to sign in, please ignore this email and secure your account immediately.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
              <p style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin: 0;">Diamond Solution Security Protocol</p>
            </div>
          `
        });
      }
      res.json({ success: true });
    } catch (err: any) {
      const detailedError = formatBrevoError(err);
      console.error("[Device Verification] Error sending email:", detailedError);
      res.status(500).json({ error: detailedError });
    }
  });

  // --- WHATSAPP INTEGRATION ---

  // Send message to Admin's WhatsApp when a user types in support
  app.post("/api/whatsapp/notify-admin", verifyFirebaseToken, async (req: any, res) => {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;

    if (!token || !phoneId || !adminNumber) {
      return res.json({ success: false, message: "WhatsApp API not configured in environment variables." });
    }

    try {
      const parsedBody = z.object({
        userId: z.string().min(1, "userId is required"),
        userName: z.string().min(1, "userName is required"),
        text: z.string().min(1, "text is required")
      }).parse(req.body);

      const { userId, userName, text } = parsedBody;

      if (userId !== req.uid) {
        const isAdminUser = await checkIsAdmin(req.uid);
        if (!isAdminUser) {
          return res.status(403).json({ error: "Forbidden: You can only notify support for your own account." });
        }
      }

      const messageBody = `*New Institutional Support Query*\n*From:* ${userName} (ID: ${userId})\n*Message:* ${text}\n\n_Reply format: ${userId}: your message_`;

      const payload = {
        messaging_product: "whatsapp",
        to: adminNumber,
        type: "text",
        text: { body: messageBody }
      };

      await axios.post(`https://graph.facebook.com/v17.0/${phoneId}/messages`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      console.error("[WhatsApp Send Error]:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to send WhatsApp message" });
    }
  });

  // Verification for WhatsApp Webhook (Meta)
  app.get("/api/whatsapp/webhook", (req, res) => {
    const verify_token = process.env.WHATSAPP_VERIFY_TOKEN || "diamond_solution_webhook123";
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === verify_token) {
        console.log("[WhatsApp Webhook] VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  });

  // Receive messages from Admin's WhatsApp and route back to User
  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const body = req.body;
      if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
          const whatsappMsg = body.entry[0].changes[0].value.messages[0];
          const fromNumber = whatsappMsg.from; // Sender's WhatsApp number
          const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;

          // Only accept messages from the configured admin number
          if (adminNumber && fromNumber.replace('+', '') === adminNumber.replace('+', '')) {
            const rawText = whatsappMsg.text?.body || "";

            // Expected format: "userId: reply text" or just assume last active user if we build a mapping.
            // For simplicity, we can extract the first part if it has a colon.
            // i.e "a1b2c: Hello there!"
            let targetUserId = "";
            let replyText = rawText;

            if (rawText.includes(":")) {
              const parts = rawText.split(":");
              const potentialId = parts[0].trim();
              if (potentialId.length >= 20 && potentialId.length <= 40) { // Firebase UID is typically 28 characters
                targetUserId = potentialId;
                replyText = parts.slice(1).join(":").trim();
              }
            }

            const db = await getFirestore();

            if (targetUserId) {
              // Direct exact match lookup instead of prefix substring scan
              const chatRef = db.collection("chats").doc(targetUserId);
              const chatDoc = await chatRef.get();
              if (chatDoc.exists) {
                await chatRef.collection("messages").add({
                  senderId: "admin",
                  text: replyText,
                  createdAt: new Date().toISOString()
                });
                await chatRef.update({
                  lastMessageAt: new Date().toISOString(),
                  unreadCount: FieldValue.increment(1)
                });
                console.log(`[WhatsApp Webhook] Reply routed to user ${targetUserId}`);
              } else {
                console.warn(`[WhatsApp Webhook] Direct chat lookup failed for user ${targetUserId}`);
              }
            } else {
              // If no ID prefix provided, reply to the user who messaged last
              const recentChats = await db.collection("chats").orderBy("lastMessageAt", "desc").limit(1).get();
              if (!recentChats.empty) {
                const docId = recentChats.docs[0].id;
                await db.collection("chats").doc(docId).collection("messages").add({
                  senderId: "admin",
                  text: replyText,
                  createdAt: new Date().toISOString()
                });
                await db.collection("chats").doc(docId).update({
                  lastMessageAt: new Date().toISOString(),
                  unreadCount: FieldValue.increment(1)
                });
                console.log(`[WhatsApp Webhook] Auto-routed reply to most recent user ${docId}`);
              }
            }
          }
        }
        res.sendStatus(200);
      } else {
        res.sendStatus(404);
      }
    } catch (e) {
      console.error("[WhatsApp Webhook] Error", e);
      res.sendStatus(500);
    }
  });

  return app;
}
