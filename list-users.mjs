import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp({
  projectId: 'staziamed-revalida-prod',
});

const result = await getAuth().listUsers(10);
result.users.forEach(user => {
  console.log('UID:', user.uid);
  console.log('Email:', user.email);
  console.log('---');
});

process.exit(0);
