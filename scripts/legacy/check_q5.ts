import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function run() {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: 'staziamed-revalida-prod'
  });
  const db = getFirestore(app, 'staziamed-revalida-prod');
  const doc = await db.collection('questions').doc('REV-2025.2-Q5').get();
  console.log(JSON.stringify(doc.data(), null, 2));
}

run().catch(console.error);
