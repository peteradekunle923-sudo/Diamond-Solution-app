import { initializeApp, getApp, getApps, type AppOptions } from "firebase-admin/app";
import { getFirestore as getFirestoreSDK } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

async function getFirestore() {
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
      if (options.projectId) {
        initializeApp(options);
        console.log(`[Firebase Admin] Initialized with explicit project: ${options.projectId}`);
      } else {
        initializeApp();
      }
    } catch (err: any) {
      console.error("[Firebase Admin] Initialization failed:", err.message);
      if (getApps().length === 0) {
        initializeApp();
      }
    }
  }

  const app = getApp();
  let db: any;
  if (databaseId) {
    db = getFirestoreSDK(app, databaseId);
    console.log(`[Firestore] Target database specified: ${databaseId}`);
  } else {
    db = getFirestoreSDK(app);
  }
  return db;
}

async function main() {
  const db = await getFirestore();
  console.log("Fetching latest system logs from firestore database...");
  const snapshot = await db.collection("system_logs")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();
    
  if (snapshot.empty) {
    console.log("No system logs found.");
    return;
  }
  
  snapshot.forEach((doc: any) => {
    console.log(`\n--- Log [${doc.id}] ---`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

main().catch(err => {
  console.error("Error fetching logs:", err);
});
