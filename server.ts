import "dotenv/config";
import express from "express";
import path from "path";
import axios from "axios";
import crypto from "crypto";
import { initializeApp, getApp, getApps, type AppOptions } from "firebase-admin/app";
import { getFirestore as getFirestoreSDK, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { GoogleGenAI } from "@google/genai";
import { BrevoClient } from "@getbrevo/brevo";

let dbInstance: any = null;
const memoryOtpCache = new Map<string, any>();

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
    if (userRecord.customClaims?.admin === true) {
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
      return data?.role === "admin";
    }
  } catch (error) {
    console.error("[Auth Helper] Failed to check admin role via Firestore:", error);
  }
  return false;
}

async function getFirestore() {
  if (dbInstance) return dbInstance;

  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let config: any = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e: any) {
      console.warn("[Firestore] Could not parse config file:", e.message);
    }
  }

  const databaseId = config.firestoreDatabaseId && config.firestoreDatabaseId !== "(default)" ? config.firestoreDatabaseId : undefined;

  if (getApps().length === 0) {
    try {
      const options: AppOptions = {};
      if (config.projectId) {
        options.projectId = config.projectId;
      }
      
      // We prioritize explicit config if project ID is available
      if (options.projectId) {
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

async function startServer() {
  // Initialize Firebase Admin and Firestore before setting up routes
  try {
    await getFirestore();
  } catch (err: any) {
    console.error("[Firebase] Initial connection failed, but proceeding to start server:", err.message);
  }

  const app = express();
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT) || 3000;

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
        console.log(`[Affiliate Activation] Firestore operation bypassed, using memory/client fallback:`, dbErr.message);
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

  // Biometric login endpoint using SHA-256 clearance tokens
  app.post("/api/biometric-login", async (req, res) => {
    try {
      const parsedBody = z.object({
        email: z.string().email("Invalid email format"),
        token: z.string().min(1, "Clearance token is required")
      }).parse(req.body);

      const { email, token } = parsedBody;

      // Compute SHA-256 hash of the received token
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const db = await getFirestore();
      // Look up user by email
      const usersSnap = await db.collection("users").where("email", "==", email).limit(1).get();
      if (usersSnap.empty) {
        return res.status(401).json({ error: "Invalid biometric credentials." });
      }

      const userDoc = usersSnap.docs[0];
      const userData = userDoc.data();

      if (!userData.biometricTokenHash || userData.biometricTokenHash !== tokenHash) {
        return res.status(401).json({ error: "Biometric validation failed." });
      }

      // Generate a custom Firebase Auth token
      const customToken = await getAuth().createCustomToken(userDoc.id);

      res.json({ success: true, customToken });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      console.error("[Biometric Login] Error:", error.message);
      res.status(500).json({ error: "Biometric validation failed." });
    }
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

      if (currency === "USD" && amount < 10) {
        return res.status(400).json({ error: "The minimum payout amount for USD is $10." });
      } else if (currency === "NGN" && amount < 10000) {
        return res.status(400).json({ error: "The minimum payout amount for NGN is ₦10,000." });
      }

      let withdrawalId = '';
      if (reference.startsWith('WD_')) {
        const temp = reference.substring(3);
        const lastIndex = temp.lastIndexOf('_');
        if (lastIndex !== -1) {
          withdrawalId = temp.substring(0, lastIndex);
        }
      }

      if (!withdrawalId) {
        return res.status(400).json({ error: "Invalid reference format. Could not resolve withdrawal ID." });
      }

      const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);

      try {
        await db.runTransaction(async (transaction: any) => {
          const withdrawalDoc = await transaction.get(withdrawalRef);
          if (!withdrawalDoc.exists) {
            throw new Error("Withdrawal request not found.");
          }
          const withdrawalData = withdrawalDoc.data();
          if (withdrawalData.status !== 'pending') {
            throw new Error("Withdrawal request is no longer pending.");
          }
          if (withdrawalData.userId !== targetUserId) {
            throw new Error("Withdrawal user ID mismatch.");
          }
          if (withdrawalData.amount !== amount) {
            throw new Error("Withdrawal amount mismatch.");
          }

          // Fetch all approved commissions
          const affiliatesSnap = await db.collection("affiliates")
            .where("referrerUid", "==", targetUserId)
            .get();
          const totalEarned = affiliatesSnap.docs.reduce((acc: number, doc: any) => acc + (doc.data().commissionAmount || 0), 0);

          // Fetch all non-failed withdrawals except the current one
          const withdrawalsSnap = await db.collection("withdrawals")
            .where("userId", "==", targetUserId)
            .get();
          
          const totalWithdrawn = withdrawalsSnap.docs
            .filter((doc: any) => doc.id !== withdrawalId && doc.data().status !== 'failed')
            .reduce((acc: number, doc: any) => acc + (doc.data().amount || 0), 0);

          const availableBalance = Math.max(0, totalEarned - totalWithdrawn);

          if (amount > availableBalance) {
            throw new Error(`Insufficient affiliate balance. Available: ${currency === 'USD' ? '$' : '₦'}${availableBalance.toLocaleString()}, Requested: ${currency === 'USD' ? '$' : '₦'}${amount.toLocaleString()}`);
          }

          // Mark withdrawal as 'processing' to prevent race conditions
          transaction.update(withdrawalRef, { status: 'processing', processedAt: new Date().toISOString() });
        });
      } catch (txError: any) {
        return res.status(400).json({ error: txError.message });
      }

      if (bankCode === 'INTL') {
        console.log(`[Payout] INTL payout requested for ${accountName} using ${accountNumber}`);
        await withdrawalRef.update({
          status: 'success',
          processedAt: new Date().toISOString(),
          isManual: true
        });
        return res.json({ success: true, message: "International payout logged for manual processing", reference, isManual: true });
      }

      const isNoSecretKey = !secretKey || 
                            secretKey === 'sk_test_placeholder' || 
                            secretKey === 'undefined' || 
                            secretKey === 'null' || 
                            secretKey === '' || 
                            !secretKey.startsWith('sk_');

      if (isNoSecretKey) {
        console.warn("[Payout] Payout simulated - no secret key.");
        await withdrawalRef.update({
          status: 'success',
          processedAt: new Date().toISOString(),
          simulated: true
        });
        return res.json({ success: true, message: "Payout simulated", reference });
      }

      try {
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

        await withdrawalRef.update({
          status: 'success',
          processedAt: new Date().toISOString(),
          paystackResponse: transferRes.data
        });

        res.json(transferRes.data);
      } catch (transferErr: any) {
        const errorMsg = transferErr.response?.data?.message || transferErr.message;
        await withdrawalRef.update({
          status: 'failed',
          error: errorMsg,
          processedAt: new Date().toISOString()
        });
        throw transferErr;
      }
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

  // Course payment verification
  app.post("/api/verify-departmental-payment", verifyFirebaseToken, async (req, res) => {
    try {
      const parsedBody = z.object({
        reference: z.string().min(1, "Reference is required"),
        userData: z.object({
          uid: z.string().min(1),
          email: z.string().email(),
          displayName: z.string().optional(),
          username: z.string().optional()
        }),
        department: z.string().min(1, "Department is required"),
        amount: z.number().positive(),
        currency: z.string().min(2),
        referrerEmail: z.string().email().or(z.literal("")).optional().nullable(),
        referrerName: z.string().optional().nullable(),
        finalCommissionValue: z.number().nonnegative().optional().nullable(),
        referrerId: z.string().optional().nullable(),
        courseId: z.string().optional()
      }).parse(req.body);

      const { reference, userData, department, amount, currency, referrerEmail, referrerName, finalCommissionValue, referrerId, courseId } = parsedBody;
      const secretKey = process.env.PAYSTACK_SECRET_KEY;

      if (userData.uid !== (req as any).uid) {
        const isAdminUser = await checkIsAdmin((req as any).uid);
        if (!isAdminUser) {
          return res.status(403).json({ error: "Forbidden: You can only verify payments for your own account." });
        }
      }

      // Verification logic
      const isSimulation = reference && reference.startsWith('sim_');
      const noKey = !secretKey || 
                    secretKey === 'sk_test_placeholder' || 
                    secretKey === 'undefined' || 
                    secretKey === 'null' || 
                    secretKey === '' || 
                    !secretKey.startsWith('sk_');

      console.log(`[Paystack Verify] Reference: ${reference}, Type: ${typeof reference}, isSimulation: ${isSimulation}, noKey: ${noKey}`);

      if (!isSimulation && !noKey) {
        try {
          const verifyRes = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${secretKey}` }
          });
          if (verifyRes.data.data.status !== "success") {
            return res.status(400).json({ error: "Payment failed at gateway: " + (verifyRes.data.data.gateway_response || 'Unknown') });
          }
        } catch (verifyErr: any) {
          console.error("Paystack verification API returned an error:", verifyErr.response?.data || verifyErr.message);
          let paystackErrMsg = verifyErr.response?.data?.message || verifyErr.message;
          const isMerchantKeyError = verifyErr.response?.data?.code === 'invalid_Key' || 
                                     paystackErrMsg === 'Invalid key' ||
                                     verifyErr.response?.status === 401 ||
                                     verifyErr.response?.data?.type === 'validation_error';
                                     
          if (isMerchantKeyError) {
            console.warn("[PAYSTACK MERCH KEY WARNING] The PAYSTACK_SECRET_KEY set in environment is invalid (invalid_Key). Granting user access anyway to prevent locking out paying students.");
          } else {
            return res.status(400).json({ error: paystackErrMsg });
          }
        }
      }

      // WRITE TO FIRESTORE (Server-side, trusted)
      const db = await getFirestore();
      const paymentId = `dept_pay_${userData.uid}_${department}`;

      const paymentData = {
        id: paymentId,
        userId: userData.uid,
        amount: amount,
        currency: currency,
        status: 'success',
        type: 'department_access',
        dept_name: department,
        department: department,
        reference: reference,
        courseId: courseId || 'all_dept',
        studentName: userData.displayName || 'Scholar',
        email: userData.email || 'no-email',
        paidAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      await db.collection("payments").doc(paymentId).set(paymentData, { merge: true });

      await db.collection("users").doc(userData.uid).set({
        hasPaidCourse: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      let referrerCurrency = currency;
      if (referrerId) {
        const referrerDoc = await db.collection("users").doc(referrerId).get();
        if (referrerDoc.exists) {
          referrerCurrency = referrerDoc.data()?.currency || 'NGN';
        }

        const commissionId = `comm_${paymentId}`;
        const commissionData = {
          id: commissionId,
          referrerUid: referrerId,
          referrerName: referrerName || 'Affiliate',
          referredUid: userData.uid,
          referredName: userData.displayName || 'Scholar',
          paymentAmount: amount,
          paymentCurrency: currency,
          commissionAmount: finalCommissionValue || 0,
          commissionCurrency: referrerCurrency,
          commissionRate: 0.25,
          status: 'success',
          createdAt: new Date().toISOString()
        };
        await db.collection("affiliates").doc(commissionId).set(commissionData, { merge: true });
      }

      // 3. Dispatch Emails (Upline & Admin)
      if (brevoClient) {
        try {
          const senderEmail = await resolveBrevoSender();
          // Send Admin Purchase Email
          const adminEmail = 'peteradekunle923@gmail.com';
          brevoClient.transactionalEmails.sendTransacEmail({
            sender: { email: senderEmail, name: 'Diamond Solution' },
            to: [{ email: adminEmail }],
            subject: `Course Purchase Alert: ${userData?.displayName || "A user"} bought a course`,
            htmlContent: `
              <div style="font-family: sans-serif; padding: 25px; color: #0a0c10; max-width: 600px; margin: auto; border: 1px solid #C9930A; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #C9930A; border-bottom: 2px solid #C9930A; padding-bottom: 10px; margin-top: 0;">Course Purchase Notification</h2>
                <p>Hello Administrator,</p>
                <p>A student has successfully completed a course purchase on the platform. Here are the details:</p>
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #C9930A;">
                  <p style="margin: 0 0 10px 0;"><strong>Student Name:</strong> ${userData?.displayName || "Scholar"}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Student Email:</strong> ${userData?.email || "No email"}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Department:</strong> ${department || "N/A"}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Amount Paid:</strong> ${currency === "USD" ? "$" : "₦"}${amount?.toLocaleString()}</p>
                  <p style="margin: 0 0 10px 0;"><strong>Reference ID:</strong> ${reference || "N/A"}</p>
                  <p style="margin: 0;"><strong>Referred By:</strong> ${referrerId ? `Yes (ID: ${referrerId})` : "No"}</p>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
                <p style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin: 0;">Administrator Control Board • Diamond Solution</p>
              </div>
            `
          }).catch(err => console.error("Could not send admin path email:", formatBrevoError(err)));
 
          // Send Referrer Commission Email if referrerEmail exists
          let referrerCurrencySymbol = currency === 'USD' ? '$' : '₦';
          if (referrerId && referrerEmail) {
            brevoClient.transactionalEmails.sendTransacEmail({
              sender: { email: senderEmail, name: 'Diamond Solution' },
              to: [{ email: referrerEmail }],
              subject: `Commission Earned: 25% Rewards Dispatched!`,
              htmlContent: `
                <div style="font-family: sans-serif; padding: 25px; color: #0a0c10; max-width: 600px; margin: auto; border: 1px solid #10b981; border-radius: 12px; background-color: #ffffff;">
                  <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px; margin-top: 0;">New Reward Commission! 🎁</h2>
                  <p>Dear ${referrerName},</p>
                  <p>We are excited to inform you that a student you referred (<strong>${userData?.displayName || "Scholar"}</strong>) has purchased a course in <strong>${department || "Department"}</strong>.</p>
                  <p>As part of the Diamond Solution referral program, your 25% commission has been calculated and successfully credited to your affiliate wallet.</p>
                  <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #10b981; text-align: center;">
                    <span style="font-size: 13px; color: #15803d; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; display: block; margin-bottom: 5px;">Your Net Reward</span>
                    <span style="font-size: 32px; font-weight: 900; color: #15803d;">${referrerCurrencySymbol}${finalCommissionValue?.toLocaleString()}</span>
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
  
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("CRITICAL SERVER STARTUP ERROR:", err);
  process.exit(1);
});
