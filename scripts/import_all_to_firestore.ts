import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";
import { SEED_QUESTIONS } from "../src/data/questionsData";
import { SEED_INEDITAS_QUESTIONS } from "../src/data/ineditasData";
import { SEED_MEDICAL_GUIDELINES } from "../src/data/guidelinesData";
import { REVALIDA_EDITIONS_INVENTORY } from "../src/data/revalidaInventoryData";
import { SEED_OSCE_STATIONS } from "../src/data/osceStationsData";
import { INITIAL_KNOWLEDGE_GRAPH } from "../src/data/knowledgeGraphData";
import { DEFAULT_USER } from "../src/services/storageService";

import { ALL_CANONICAL_QUESTIONS } from "../src/data/allOfficialQuestions";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

async function main() {
  console.log("🚀 Starting database update to Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. All canonical questions (including extracted 2021 batch)
  const allQuestions: any[] = ALL_CANONICAL_QUESTIONS;

  // Deduplicate by ID
  const uniqueQuestionsMap = new Map<string, any>();
  for (const q of allQuestions) {
    if (q && q.id) {
      uniqueQuestionsMap.set(q.id, q);
    }
  }

  const uniqueQuestions = Array.from(uniqueQuestionsMap.values());
  console.log(`📦 Updating ${uniqueQuestions.length} unique questions into 'questions' collection...`);
  
  let qSuccess = 0;
  for (const q of uniqueQuestions) {
    try {
      const qRef = doc(db, "questions", q.id);
      const payload = sanitizeForFirestore({
        ...q,
        updatedAt: new Date().toISOString(),
        targetDatabase: firebaseConfigJson.firestoreDatabaseId
      });
      await setDoc(qRef, payload, { merge: true });
      qSuccess++;
    } catch (err) {
      console.error(`Failed to import question ${q.id}:`, err);
    }
  }
  console.log(`✅ Successfully updated ${qSuccess}/${uniqueQuestions.length} questions.`);

  // 2. Import Medical Guidelines
  console.log(`📋 Updating ${SEED_MEDICAL_GUIDELINES.length} guidelines into 'guidelines' collection...`);
  let gSuccess = 0;
  for (const g of SEED_MEDICAL_GUIDELINES) {
    try {
      const gRef = doc(db, "guidelines", g.id);
      const payload = sanitizeForFirestore({
        ...g,
        updatedAt: new Date().toISOString()
      });
      await setDoc(gRef, payload, { merge: true });
      gSuccess++;
    } catch (err) {
      console.error(`Failed to import guideline ${g.id}:`, err);
    }
  }
  console.log(`✅ Successfully updated ${gSuccess}/${SEED_MEDICAL_GUIDELINES.length} guidelines.`);

  // 3. Import Editions Inventory (including 2026/1, 2026/2, ENAMED 2025)
  console.log(`📚 Updating ${REVALIDA_EDITIONS_INVENTORY.length} editions into 'editions' collection...`);
  let eSuccess = 0;
  for (const ed of REVALIDA_EDITIONS_INVENTORY) {
    try {
      const edRef = doc(db, "editions", ed.id);
      const payload = sanitizeForFirestore({
        ...ed,
        updatedAt: new Date().toISOString()
      });
      await setDoc(edRef, payload, { merge: true });
      eSuccess++;
    } catch (err) {
      console.error(`Failed to import edition ${ed.id}:`, err);
    }
  }
  console.log(`✅ Successfully updated ${eSuccess}/${REVALIDA_EDITIONS_INVENTORY.length} editions.`);

  // 4. Import OSCE Stations
  console.log(`🩺 Updating ${SEED_OSCE_STATIONS.length} OSCE stations into 'osce_stations' collection...`);
  let oSuccess = 0;
  for (const osce of SEED_OSCE_STATIONS) {
    try {
      const oRef = doc(db, "osce_stations", osce.id);
      const payload = sanitizeForFirestore({
        ...osce,
        updatedAt: new Date().toISOString()
      });
      await setDoc(oRef, payload, { merge: true });
      oSuccess++;
    } catch (err) {
      console.error(`Failed to import OSCE station ${osce.id}:`, err);
    }
  }
  console.log(`✅ Successfully updated ${oSuccess}/${SEED_OSCE_STATIONS.length} OSCE stations.`);

  // 5. Import Knowledge Graph Nodes
  console.log(`🧠 Updating ${INITIAL_KNOWLEDGE_GRAPH.length} knowledge nodes into 'knowledge_nodes' collection...`);
  let kSuccess = 0;
  for (const node of INITIAL_KNOWLEDGE_GRAPH) {
    try {
      const kRef = doc(db, "knowledge_nodes", node.id);
      const payload = sanitizeForFirestore({
        ...node,
        updatedAt: new Date().toISOString()
      });
      await setDoc(kRef, payload, { merge: true });
      kSuccess++;
    } catch (err) {
      console.error(`Failed to import node ${node.id}:`, err);
    }
  }
  console.log(`✅ Successfully updated ${kSuccess}/${INITIAL_KNOWLEDGE_GRAPH.length} knowledge nodes.`);

  // 6. Import Default Candidate User Profile
  console.log(`👤 Updating candidate profile for ${DEFAULT_USER.email} into 'users' collection...`);
  try {
    const userRef = doc(db, "users", DEFAULT_USER.id);
    const payload = sanitizeForFirestore({
      ...DEFAULT_USER,
      updatedAt: new Date().toISOString()
    });
    await setDoc(userRef, payload, { merge: true });
    console.log(`✅ Successfully updated candidate user profile.`);
  } catch (err) {
    console.error(`Failed to import candidate user profile:`, err);
  }

  console.log("🎉 All Firestore collections updated and synced successfully!");
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_all_to_firestore"));
if (isDirectExecution) {
  main().catch((err) => {
  console.error("Fatal error during database update:", err);
  process.exit(1);
});
}
