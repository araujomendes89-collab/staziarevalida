import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'staziamed-revalida-prod'
});
const db = getFirestore(app, 'staziamed-revalida-prod');

async function run() {
  const rawData = fs.readFileSync('/tmp/revalida_2026_1_full.json', 'utf8');
  const questions = JSON.parse(rawData);

  console.log(`Starting upload of ${questions.length} questions for Revalida 2026/1...`);
  
  const batchSize = 25;
  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = db.batch();
    const chunk = questions.slice(i, i + batchSize);
    
    for (const q of chunk) {
      const qNum = q.questionNumber || q.originalNumber;
      const docId = `REV-2026.1-Q${qNum}`;
      const docRef = db.collection('questions').doc(docId);
      
      const firestoreDoc = {
        ...q,
        id: docId,
        code: docId,
        canonicalQuestionId: docId,
        origin: 'INEP_OFICIAL',
        examEdition: 'Revalida INEP 2026/1 — Caderno 01',
        examYear: 2026,
        originalNumber: qNum,
        bookletType: 'CAD-01-AZUL',
        isAnnulled: q.correctAnswer === 'ANNULLED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      batch.set(docRef, firestoreDoc, { merge: true });
    }
    
    await batch.commit();
    console.log(`Uploaded batch ${i / batchSize + 1} (${chunk.length} questions)`);
  }
  
  console.log('✅ Successfully uploaded all 100 questions of Revalida 2026/1 to Firestore!');
}

run().catch(console.error);
