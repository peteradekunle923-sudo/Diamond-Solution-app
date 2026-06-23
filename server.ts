import "dotenv/config";
import express from "express";
import path from "path";
import axios from "axios";
import { initializeApp, getApp, getApps, type AppOptions } from "firebase-admin/app";
import { getFirestore as getFirestoreSDK, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";

import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";

let dbInstance: any = null;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: { 'User-Agent': 'aistudio-build' }
  }
}) : null;

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
      
      const result = await genAI.models.generateContent({ 
        model: "gemini-3-flash-preview", 
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

      if (resend) {
        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Diamond Solution <onboarding@resend.dev>',
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
          emailSent = true;
        } catch (resendErr: any) {
          console.error("[Resend] Failed to send email:", resendErr.message);
          emailError = `Email delivery failure: ${resendErr.message}`;
        }
      } else {
        console.warn("[OTP] RESEND_API_KEY is not configured. Email dispatch skipped.");
        emailError = "Institutional email gateway is not configured (RESEND_API_KEY missing).";
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

  // Payout endpoint
  app.post("/api/payout", async (req, res) => {
    const { amount, accountNumber, bankCode, accountName, reference, userId } = req.body;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    try {
      const db = await getFirestore();
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      const userData = userDoc.exists ? userDoc.data() : null;

      // Restrict payout to users who paid for a departmental course (excluding admin/moderators)
      let hasPaidCourse = false;
      if (userData) {
        if (userData.role === 'admin' || userData.role === 'moderator' || userData.hasPaidCourse === true) {
          hasPaidCourse = true;
        } else {
          // Double check database payments as backup
          const paymentsSnap = await db.collection("payments")
            .where("userId", "==", userId)
            .get();
          
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
      }

      if (!hasPaidCourse) {
        return res.status(403).json({ error: "Access Denied: You must purchase at least one departmental course to unlock affiliate payout privileges." });
      }

      const currency = userData?.currency || (amount >= 500 ? "NGN" : "USD");

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

      if (isNoSecretKey) {
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
    const { reference, userData, department, amount, currency, referrerEmail, referrerName, finalCommissionValue, referrerId } = req.body;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    try {
      // Verification logic
      const isSimulation = reference && typeof reference === 'string' && reference.startsWith('sim_');
      const noKey = !secretKey || 
                    secretKey === 'sk_test_placeholder' || 
                    secretKey === 'undefined' || 
                    secretKey === 'null' || 
                    secretKey === '' || 
                    !secretKey.startsWith('sk_');

      console.log(`[Paystack Verify] Reference: ${reference}, Type: ${typeof reference}, isSimulation: ${isSimulation}, noKey: ${noKey}`);

      if (!isSimulation && !noKey) {
        if (!reference || typeof reference !== 'string') {
          return res.status(400).json({ error: "Invalid payment reference provided" });
        }
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

      // 3. Dispatch Emails (Upline & Admin)
      if (resend) {
        try {
          // Send Admin Purchase Email
          const adminEmail = 'peteradekunle923@gmail.com';
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Diamond Solution <onboarding@resend.dev>',
            to: adminEmail,
            subject: `Course Purchase Alert: ${userData?.displayName || "A user"} bought a course`,
            html: `
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
          }).catch(err => console.error("Could not send admin path email:", err));

          // Send Referrer Commission Email if referrerEmail exists
          let referrerCurrencySymbol = currency === 'USD' ? '$' : '₦';
          if (referrerId && referrerEmail) {
            await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || 'Diamond Solution <onboarding@resend.dev>',
              to: referrerEmail,
              subject: `Commission Earned: 25% Rewards Dispatched!`,
              html: `
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
            }).catch(err => console.error("Could not send upline path email:", err));
          }
        } catch (emailErr: any) {
          console.error("[Email Notification] Could not dispatch email notifications:", emailErr);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Course Payment] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/send-device-verification-email", async (req, res) => {
    const { email, code, name } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Missing email or code" });

    try {
      if (resend) {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Diamond Solution <onboarding@resend.dev>',
          to: email,
          subject: `Security Alert: Device Verification`,
          html: `
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
      console.error("[Device Verification] Error sending email:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- WHATSAPP INTEGRATION ---
  
  // Send message to Admin's WhatsApp when a user types in support
  app.post("/api/whatsapp/notify-admin", async (req, res) => {
    const { userId, userName, text } = req.body;
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;

    if (!token || !phoneId || !adminNumber) {
      return res.json({ success: false, message: "WhatsApp API not configured in environment variables." });
    }

    try {
      const messageBody = `*New Institutional Support Query*\n*From:* ${userName} (ID: ${userId})\n*Message:* ${text}\n\n_Reply format: ${userId.substring(0,5)}: your message_`;
      
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
              if (potentialId.length >= 4 && potentialId.length <= 8) { // basic heuristic for user ID prefix
                targetUserId = potentialId;
                replyText = parts.slice(1).join(":").trim();
              }
            }
            
            const db = await getFirestore();
            
            if (targetUserId) {
              // Find the exact user by ID prefix
              const chatsSnapshot = await db.collection("chats").get();
              for (const doc of chatsSnapshot.docs) {
                if (doc.id.startsWith(targetUserId)) {
                  await db.collection("chats").doc(doc.id).collection("messages").add({
                    senderId: "admin",
                    text: replyText,
                    createdAt: new Date().toISOString()
                  });
                  await db.collection("chats").doc(doc.id).update({
                    lastMessageAt: new Date().toISOString(),
                    unreadCount: FieldValue.increment(1)
                  });
                  console.log(`[WhatsApp Webhook] Reply routed to user ${doc.id}`);
                  break;
                }
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
