import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'staziamed-revalida-prod',
});

const db = getFirestore('staziamed-revalida-prod');

const correctUid = 'cQjACVALpedbijS0WiCwuFRJgxj2';
const wrongUid = 'cQjACVALpedbijSOWiCwuFRJgxj2';

// Cria o documento com o UID correto
await db.collection('users').doc(correctUid).set({
  id: correctUid,
  name: 'João Paulo Mendes',
  email: 'araujomendes@staziamed.com.br',
  role: 'ADMIN',
  tier: 'ADMIN',
  plan: 'admin',
});

console.log('Documento criado corretamente para UID:', correctUid);

// Remove o documento antigo com o UID errado
await db.collection('users').doc(wrongUid).delete();

console.log('Documento antigo removido:', wrongUid);

process.exit(0);
