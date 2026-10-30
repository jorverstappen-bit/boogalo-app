// LOCAL EMULATOR ONLY: creates a login (and roster entry if missing) for demos.
// Members get a name-only login (they sign in with just their name; the password argument is ignored);
// officers and leaders get a password login.
// Usage: npm run demo-user -- "First Last" <gl|rl|officer|member> <password|-> [Class] [Spec] [Role]
import { createHash } from 'node:crypto';

const [name, role = 'member', givenPassword, cls = 'Warrior', spec = 'Arms', type = 'Melee'] = process.argv.slice(2);
if (!name || (!givenPassword && role !== 'member') || !['gl', 'rl', 'officer', 'member'].includes(role)) {
  console.error('Usage: npm run demo-user -- "First Last" <gl|rl|officer|member> <password> [Class] [Spec] [Role]');
  process.exit(1);
}
const DB = 'http://127.0.0.1:9000', NS = '?ns=demo-whaapp-default-rtdb';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key';
const charKey = n => String(n).trim().replace(/[.#$\[\]\/%]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const db = async (method, path, body) => {
  const r = await fetch(`${DB}/${path}.json${NS}`, { method, headers: { Authorization: 'Bearer owner' }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
};
const nameOnly = role === 'member';
// same as nameOnlyEmail() / NAME_ONLY_PASSWORD in js/sync.js
const email = nameOnly
  ? 'n-' + createHash('sha256').update('whaapp:' + charKey(name)).digest('hex').slice(0, 40) + '@whaapp.invalid'
  : crypto.randomUUID().replace(/-/g, '') + '@whaapp.invalid';
const password = nameOnly ? 'whaapp-name-only-login' : givenPassword;
const res = await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
const acct = await res.json();
if (!res.ok) { console.error('Could not create the account:', acct.error?.message); process.exit(1); }
const k = charKey(name), uid = acct.localId, upd = {};
const oldUid = await db('GET', `whaapp-v2/owners/${encodeURIComponent(k)}`);
if (oldUid) upd[`users/${oldUid}`] = null;
upd[`users/${uid}`] = nameOnly ? { main: k, role, nameOnly: true } : { main: k, role };
upd[`owners/${k}`] = uid;
upd[`loginIndex/${k}`] = email;
if (!(await db('GET', `whaapp-v2/members/${encodeURIComponent(k)}`)))
  upd[`members/${k}`] = { name, cls, spec, flexSpec: '', type, dispel: [], interrupt: 0, present: true, resFrost: false, resNature: false, resFire: false };
await db('PATCH', 'whaapp-v2', upd);
console.log(`Login ready in the local emulator: ${name} (${role}${nameOnly ? ', signs in by name' : ''}).`);
