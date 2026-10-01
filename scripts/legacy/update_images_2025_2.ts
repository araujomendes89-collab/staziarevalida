import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

const mapping = JSON.parse(fs.readFileSync('/tmp/images_mapping.json', 'utf8'));

async function run() {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: 'staziamed-revalida-prod'
  });
  const db = getFirestore(app, 'staziamed-revalida-prod');
  
  // Group by q_num
  const imagesByQ = {};
  for (const m of mapping) {
    if (!imagesByQ[m.q_num]) imagesByQ[m.q_num] = [];
    imagesByQ[m.q_num].push({
      url: m.url,
      caption: m.caption,
      filename: m.url.split('/').pop()
    });
  }

  let count = 0;
  for (const [q_num, images] of Object.entries(imagesByQ)) {
    const docId = `REV-2025.2-Q${q_num}`;
    await db.collection('questions').doc(docId).set({ images }, { merge: true });
    count++;
  }
  
  console.log(`Updated images for ${count} questions in 2025/2.`);
}

run().catch(console.error);
