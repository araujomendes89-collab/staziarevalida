import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function run() {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: 'staziamed-revalida-prod'
  });
  const db = getFirestore(app, 'staziamed-revalida-prod');
  
  const snap = await db.collection('questions').get();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.images && data.images.length > 0) {
      let updatedCase = data.clinicalCase;
      let changed = false;
      for (const img of data.images) {
        // If the tag is not in the text, PREPEND it so it appears ABOVE the text (like Q5 in real PDF)
        const tag = `[IMAGEM: ${img.url.split('/').pop()}]`;
        if (!updatedCase.includes(tag) && !updatedCase.includes(img.url)) {
          updatedCase = tag + "\n\n" + updatedCase;
          changed = true;
        }
      }
      if (changed) {
        await doc.ref.update({ clinicalCase: updatedCase });
        count++;
      }
    }
  }
  console.log(`Updated clinicalCase tags for ${count} questions.`);
}

run().catch(console.error);
