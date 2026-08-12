import { readFileSync, readdirSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const key = readdirSync('.').find(f => /firebase-adminsdk.*\.json$/.test(f));
if (!key) { console.error('❌ Clé de service introuvable'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(readFileSync(key, 'utf8'))) });
const db = getFirestore();

const id = 'ism-dakar';
const maintenant = Date.now();
const anProchain = new Date(); anProchain.setFullYear(anProchain.getFullYear() + 1);

await db.collection('establishments').doc(id).set({
  name: 'Institut Supérieur de Management',
  level: 'universite',
  city: 'Dakar',
  country: 'Sénégal',
  licenseCode: 'EST-ISM-2026',
  licenseValidUntil: anProchain.getTime(),
  maxTeachers: 10,
  maxLearners: 300,
  isActive: true,
  createdAt: maintenant,
  updatedAt: maintenant,
}, { merge: true });

console.log('✅ establishments/' + id + ' créé (licence valable jusqu\'au ' + anProchain.toLocaleDateString('fr-FR') + ')');
process.exit(0);
