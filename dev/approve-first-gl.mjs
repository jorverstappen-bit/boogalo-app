// LIVE SITE, ONCE: makes the first Guild Leader by accepting their login request (after that, the Guild Leader accepts everyone on the Accounts page).
// 1. The Guild Leader opens the site → "I'm on the roster" (or "Join the guild") → name + password → Request.
// 2. A Firebase project owner runs:  npx firebase login   (once), then
//    npm run approve-first-gl -- "First Last"
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT = process.env.FIREBASE_PROJECT || 'boogalo-app';
const name = process.argv[2];
if (!name) { console.error('Usage: npm run approve-first-gl -- "First Last"'); process.exit(1); }
const fb = (...args) => execFileSync('npx', ['firebase', ...args, '--project', PROJECT], { encoding: 'utf8' });
const requests = JSON.parse(fb('database:get', '/whaapp-v2/requests') || 'null') || {};
const found = Object.entries(requests).filter(([, r]) => r && String(r.name).toLowerCase() === name.toLowerCase());
if (found.length !== 1) {
  console.error(found.length ? `${found.length} requests for "${name}" - decline the extra ones in the Firebase console first.` : `No login request for "${name}". Ask them to request one on the sign-in screen first.`);
  process.exit(1);
}
const [uid, r] = found[0];
const upd = { [`users/${uid}`]: { main: r.char, role: 'gl' }, [`owners/${r.char}`]: uid, [`loginIndex/${r.char}`]: r.email, [`requests/${uid}`]: null };
const file = join(tmpdir(), `approve-gl-${Date.now()}.json`);
writeFileSync(file, JSON.stringify(upd));
try { fb('database:update', '/whaapp-v2', file, '--force'); } finally { unlinkSync(file); }
console.log(`${r.name} is now the Guild Leader. They can sign in with their name and password.`);
