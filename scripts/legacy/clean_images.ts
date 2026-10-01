import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'staziamed-revalida-prod'
});
const db = getFirestore(app, 'staziamed-revalida-prod');

const FOLDERS = [
  '/Volumes/PortableSSD/STAZIAMED REVALIDA/staziamed-revalida (1)/public/images/2025_1',
  '/Volumes/PortableSSD/STAZIAMED REVALIDA/staziamed-revalida (1)/public/images/2025_2'
];

async function run() {
  const badFiles = new Set<string>();

  // 1. Identify and delete bad files
  for (const folder of FOLDERS) {
    if (!fs.existsSync(folder)) continue;
    const files = fs.readdirSync(folder);
    for (const f of files) {
      if (!f.endsWith('.png') && !f.endsWith('.jpeg')) continue;
      const p = path.join(folder, f);
      const stats = fs.statSync(p);
      
      if (stats.size < 35000) {
        badFiles.add(f);
        fs.unlinkSync(p);
        console.log(`Deleted fake image: ${f} (${stats.size} bytes)`);
      }
    }
  }

  // 2. Update Firestore
  const snapshot = await db.collection('questions').where('examYear', '==', 2025).get();
  let updatedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    let needsUpdate = false;
    let newClinicalCase = data.clinicalCase;
    let newImages = data.images || [];

    // Filter images array
    const originalLength = newImages.length;
    newImages = newImages.filter((img: any) => !badFiles.has(img.filename));
    if (newImages.length !== originalLength) {
      needsUpdate = true;
    }

    // Remove [IMAGEM: ...] tags for bad files from clinicalCase
    for (const badFile of badFiles) {
      const tag = `[IMAGEM: ${badFile}]`;
      if (newClinicalCase.includes(tag)) {
        newClinicalCase = newClinicalCase.replace(tag, '').replace(/\n{3,}/g, '\n\n').trim();
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await doc.ref.update({
        clinicalCase: newClinicalCase,
        images: newImages
      });
      updatedCount++;
      console.log(`Updated question: ${doc.id}`);
    }
  }
  
  console.log(`Finished! Updated ${updatedCount} questions in Firestore.`);
}

run().catch(console.error);
