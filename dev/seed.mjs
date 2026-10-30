// Fills the local emulator with demo data (never touches the live database).
//  - whaapp/      : made-up guild data in the current (pre-accounts) format, for the RL to import
//  - demo logins: a Guild Leader and a Raid Leader (everyone else requests one on the sign-in screen)
// Usage (with `npm run dev` running in another terminal): npm run seed [-- --force]
import { execFileSync } from 'node:child_process';

const DB = 'http://127.0.0.1:9000';
const NS = '?ns=demo-whaapp-default-rtdb';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const call = async (method, path, body) => {
  const res = await fetch(`${DB}/${path}.json${NS}`, { method, headers: H, body: body && JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

// Demo logins (test values for the local emulator only)
export const DEMO_LOGINS = [
  ['Raidboss Demo', 'rl', 'whaapp-rl', 'Warrior', 'Protection', 'Tank'],
  ['Fate Bringer', 'gl', 'whaapp-rl', 'Warlock', 'Affliction', 'Ranged'],
  ['Brenna Vale', 'officer', 'whaapp-officer', 'Priest', 'Holy', 'Healer'],
  ['Tom Ironfield', 'member', '-', 'Paladin', 'Holy', 'Healer'],
];

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const P = (name, cls, spec, type, extra = {}) => ({ name, cls, spec, flexSpec: '', type, dispel: [], interrupt: 0, present: true, resFrost: false, resNature: false, resFire: false, ...extra });
const roster = [
  P('Raidboss Demo', 'Warrior', 'Protection', 'Tank'),
  P('Brenna Vale', 'Priest', 'Holy', 'Healer'),
  P("Cass O'Neil", 'Mage', 'Frost', 'Ranged'),
  P('Dorin Ash', 'Rogue', 'Combat', 'Melee'),
  P('Elwyn Brook', 'Druid', 'Restoration', 'Healer'),
  P('Fenna Holt', 'Hunter', 'Marksmanship', 'Ranged'),
  P('Garrick Stone', 'Paladin', 'Holy', 'Healer'),
  P('Hilde Marsh', 'Warlock', 'Destruction', 'Ranged'),
  P('Ivo Thorne', 'Shaman', 'Restoration', 'Healer'),
  P('Jory Pike', 'Warrior', 'Fury', 'Melee'),
  P('Kael Dunn', 'Mage', 'Fire', 'Ranged'),
];
const raid = (id, name, date, max, extra = {}) => ({
  id, name, date, start: '20:00', end: '23:00', max, extra: '', rl: 'Raidboss Demo', notes: '',
  signedUp: [], confirmed: [], attended: [], signupStatus: {}, status: 'upcoming', rosterPosted: false, pug: false, cleanup: false,
  raidGroups: Array.from({ length: Math.ceil(max / 5) }, () => []), ...extra,
});
const oldData = {
  roster,
  alts: { 'Dorin Ash': ['Dorin Alt'] },
  raids: [
    raid('demoraid1', 'Molten Core', day(2), 40, { signedUp: ['Brenna Vale', "Cass O'Neil", 'Elwyn Brook'], signupStatus: { 'Fenna Holt': 'tentative' } }),
    raid('demoraid2', 'Onyxia', day(5), 40, { signedUp: ['Jory Pike'] }),
  ],
  applications: [{ id: 'demoapp1', name: 'Mira Quill', cls: 'Priest', spec: 'Shadow', role: 'Ranged', flexSpec: '', professions: ['Tailoring'],
    note: "Hi! <img src=x onerror=alert('xss')> - this should show as plain text", status: 'pending', gs: null, gsNote: 'Check armory manually' }],
  quests: [{ id: 'demoq1', title: 'Farm 20 Fire Resistance potions', desc: 'For Molten Core', reward: '50g', workers: [], by: 'Raidboss Demo', date: day(0), status: 'open' }],
  leaves: [{ id: 'demolv1', name: 'Kael Dunn', from: day(4), to: day(8), note: 'Holiday', by: 'Kael Dunn' }],
  guildEffort: { data: { 'Brenna Vale': { isGEMember: true, requests: [], note: '', lastContrib: '' } }, bank: {}, extra: [], profs: {} },
};

const force = process.argv.includes('--force');
const existing = await call('GET', '', undefined).catch(() => null);
if (existing && !force) {
  console.log('The emulator already has data - nothing changed. Use `npm run seed -- --force` to wipe and reseed.');
  process.exit(0);
}
await call('PUT', '', { whaapp: oldData, roster: [{ name: 'Old Boogalo Player', cls: 'Warrior' }] });
for (const args of DEMO_LOGINS) execFileSync('node', [new URL('./demo-user.mjs', import.meta.url).pathname, ...args], { stdio: 'inherit' });
console.log('Seeded the local emulator. Sign in as Fate Bringer (Guild Leader), then Accounts → Import data now.');
