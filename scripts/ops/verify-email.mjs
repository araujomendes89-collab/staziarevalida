import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp({
  projectId: 'staziamed-revalida-prod',
});

const uid = 'cQjACVALpedbijS0WiCwuFRJgxj2';

await getAuth().updateUser(uid, {
  emailVerified: true,
});

console.log('E-mail marcado como verificado com sucesso para UID:', uid);
process.exit(0);
