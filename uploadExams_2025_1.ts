import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { revalida2025_1Part1 } from './src/data/revalida2025_1Part1';

async function run() {
  console.log("Initializing Firebase Admin with Application Default Credentials...");
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: 'staziamed-revalida-prod'
  });

  const db = getFirestore(app, 'staziamed-revalida-prod');
  
  console.log(`Loaded ${revalida2025_1Part1.length} questions to upload.`);

  let count = 0;
  for (const q of revalida2025_1Part1 as any[]) {
    const num = q.originalNumber || q.questionNumber;
    const docId = `REV-2025.1-Q${num}`;
    
    q.id = docId;
    q.canonicalQuestionId = docId;
    q.code = docId;
    q.origin = "REVALIDA_INEP";
    if (!q.images) q.images = [];
    if (!q.riskFlags) q.riskFlags = { hasAmbiguity: false, ambiguityNote: "" };

    const qRef = db.collection('questions').doc(docId);
    
    q.updatedAt = new Date().toISOString();
    q.createdAt = new Date().toISOString();

    await qRef.set(q, { merge: true });
    count++;
    if (count % 10 === 0) {
      console.log(`Uploaded ${count} / ${revalida2025_1Part1.length}...`);
    }
  }

  console.log(`Upload complete! ${count} questions uploaded successfully.`);
}

run().catch(console.error);
