import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { initializeApp, getApp, getApps, type AppOptions } from "firebase-admin/app";
import { getFirestore as getFirestoreSDK, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";

import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";

let dbInstance: any = null;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

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
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Activate affiliate immediately without fee or approval
  app.post("/api/activate-affiliate", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    try {
      const db = await getFirestore();
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      // If user doc doesn't exist, we create a skeleton or wait
      // But usually, they should exist by the time they reach dashboard
      const userData = userDoc.exists ? userDoc.data() || {} : {};

      // If already active, just return success
      if (userData.affiliateStatus === 'active' && userData.referralCode) {
        return res.json({ success: true, message: "Asset already activated", referralCode: userData.referralCode });
      }

      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      const referralCode = userData.referralCode || `DS-${randomPart}`;

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

      console.log(`[Affiliate] User ${userId} auto-activated. Code: ${referralCode}`);
      res.json({ success: true, message: "Protocol Activated", referralCode });
    } catch (error: any) {
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
      
      const result = await genAI.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
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

      if (resend) {
        try {
          await resend.emails.send({
            from: 'Diamond Solution <onboarding@resend.dev>',
            to: email,
            subject: `Verification Code: ${token}`,
            html: `
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
        } catch (resendErr: any) {
          console.error("[Resend] Failed to send email:", resendErr.message);
          throw new Error(`Email delivery failure: ${resendErr.message}`);
        }
      } else {
        console.warn("[OTP] RESEND_API_KEY is not configured. Email dispatch skipped.");
        throw new Error("Institutional email gateway is not configured (RESEND_API_KEY missing). Please contact administration.");
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
            createdAt: new Date().toISOString()
          });
        }
      } catch (logErr: any) {
        // Suppress expected errors when Admin SDK lacks credentials in preview environment
        if (!logErr.message.includes("NOT_FOUND") && !logErr.message.includes("PERMISSION_DENIED")) {
          console.warn("[OTP] Logging failed, but proceeding:", logErr.message);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[OTP] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Payout endpoint
  app.post("/api/payout", async (req, res) => {
    const { amount, accountNumber, bankCode, accountName, reference, userId } = req.body;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    try {
      if (bankCode === 'INTL') {
        console.log(`[Payout] INTL payout requested for ${accountName} using ${accountNumber}`);
        return res.json({ success: true, message: "International payout logged for manual processing", reference, isManual: true });
      }

      if (!secretKey || secretKey === 'sk_test_placeholder') {
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
      const details = error.response?.data?.message || error.message;
      console.error("[Payout] Error:", details);
      res.status(500).json({ error: "Payout failed", details });
    }
  });

  // Course payment verification
  app.post("/api/verify-departmental-payment", async (req, res) => {
    const { reference, userId, department, amount, currency, courseId } = req.body;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    try {
      const db = await getFirestore();
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
      const userData = userDoc.data() || {};

      // Verification logic
      const isSimulation = reference && reference.startsWith('sim_');
      const isDev = process.env.NODE_ENV !== 'production';
      const noKey = !secretKey || secretKey === 'sk_test_placeholder';

      if (!(isSimulation || (noKey && isDev))) {
        if (!secretKey) return res.status(500).json({ error: "Secret key missing" });
        const verifyRes = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
          headers: { Authorization: `Bearer ${secretKey}` }
        });
        if (verifyRes.data.data.status !== "success") {
          return res.status(400).json({ error: "Payment failed" });
        }
      }

      const paymentId = `dept_pay_${userId}_${department}`;
      const batch = db.batch();

      // 1. Create Payment Record
      batch.set(db.collection("payments").doc(paymentId), {
        id: paymentId,
        userId,
        department,
        dept_name: department,
        amount,
        currency,
        status: "success",
        courseId,
        reference,
        createdAt: new Date().toISOString()
      }, { merge: true });

      // 2. Handle Affiliate Commission
      if (userData.referredByUid) {
        const referrerId = userData.referredByUid;
        const referrerRef = db.collection("users").doc(referrerId);
        const referrerDoc = await referrerRef.get();

        if (referrerDoc.exists) {
          const referrerData = referrerDoc.data() || {};
          const commissionInPayerCurrency = amount * 0.25;
          const referrerCurrency = referrerData.currency || "NGN";
          
          let commissionAmount = commissionInPayerCurrency;
          const NGN_TO_USD = 1500;

          if (currency !== referrerCurrency) {
            if (currency === "USD" && referrerCurrency === "NGN") commissionAmount *= NGN_TO_USD;
            else if (currency === "NGN" && referrerCurrency === "USD") commissionAmount /= NGN_TO_USD;
          }
          
          if (referrerCurrency === "NGN") commissionAmount = Math.floor(commissionAmount);

          batch.update(referrerRef, {
            balance: FieldValue.increment(commissionAmount)
          });

          const commId = `comm_${paymentId}`;
          batch.set(db.collection("affiliates").doc(commId), {
            id: commId,
            referrerUid: referrerId,
            referredUid: userId,
            referredName: userData.displayName || "Scholar",
            commissionAmount,
            commissionCurrency: referrerCurrency,
            status: "success",
            createdAt: new Date().toISOString()
          }, { merge: true });
        }
      }

      await batch.commit();
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Course Payment] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Middleware to verify admin status
  const verifyAdmin = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await getAuth(getApp()).verifyIdToken(idToken);
      const userRef = (await getFirestore()).collection("users").doc(decodedToken.uid);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
         return res.status(403).json({ error: "Forbidden: Not an administrator" });
      }
      
      req.admin = decodedToken;
      next();
    } catch (error: any) {
      console.error("[Auth] Token verification failed:", error.message);
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
  };

  // Admin approval endpoint
  app.post("/api/admin/approve-affiliate", verifyAdmin, async (req, res) => {
    const { targetUserId } = req.body;
    
    try {
      const db = await getFirestore();
      const userRef = db.collection("users").doc(targetUserId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
      
      const userData = userDoc.data() || {};
      if (userData.affiliateStatus === 'active') {
        return res.status(400).json({ error: "User is already an active affiliate" });
      }

      // Generate unique referral code only on approval
      const referralCode = "DS-" + Math.random().toString(36).substring(2, 8).toUpperCase();

      await userRef.update({
        affiliateStatus: "active",
        isAffiliate: true,
        isPartner: true, // Sync with AdminDashboard registry check
        referralCode: referralCode,
        activatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      console.log(`[Admin] Affiliate [${targetUserId}] APPROVED. Code: ${referralCode}`);
      res.json({ success: true, message: "User approved successfully", referralCode });
    } catch (error: any) {
      console.error("[Admin Approval] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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
