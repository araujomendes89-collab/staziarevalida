import { initializeApp } from "firebase/app";
import { getFirestore, collection, getCountFromServer } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyA0xv7NM9CSTBf5-lYd1_3KRMf1XzqUBjY",
  authDomain: "staziamed-revalida-prod.firebaseapp.com",
  projectId: "staziamed-revalida-prod",
  storageBucket: "staziamed-revalida-prod.firebasestorage.app",
  messagingSenderId: "186513473712",
  appId: "1:186513473712:web:d7f1f2df30799938757b75",
};

const TARGET_DB_ID = ""; // Default db

const app = initializeApp(firebaseConfig, "target-count-app");
const db = getFirestore(app, TARGET_DB_ID);

const collectionsToCount = [
  "editions",
  "errors",
  "guidelines",
  "knowledge_nodes",
  "osce_stations",
  "progress",
  "questions",
  "users",
];

async function main() {
  console.log(`\nCounting documents in target database: ${TARGET_DB_ID}...`);
  const counts = {};
  for (const colName of collectionsToCount) {
    try {
      const colRef = collection(db, colName);
      const snapshot = await getCountFromServer(colRef);
      counts[colName] = snapshot.data().count;
      console.log(`- ${colName}: ${counts[colName]}`);
    } catch (err) {
      counts[colName] = `PERMISSION_OR_ERROR: ${err.message}`;
      console.error(`- ${colName}: ${err.message}`);
    }
  }
  console.log("\nSummary:", JSON.stringify(counts, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
