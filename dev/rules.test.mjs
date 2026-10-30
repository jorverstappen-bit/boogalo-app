// Tests for ../database.rules.json against the local database emulator.
// Run: npm run test:rules   (starts the emulator, runs this file, stops it)
import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove } from 'firebase/database';

const NS = 'whaapp-v2';
const DAY = 86400000;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-whaapp',
    // emulators:exec sets this; the test emulator runs on its own ports (firebase.test.json) so it never clears the dev data
    database: { rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'), host: '127.0.0.1', port: Number((process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9100').split(':')[1]) },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async ctx => {
    const now = Date.now();
    await set(ref(ctx.database()), {
      [NS]: {
        users: { gl1: { main: 'Gl', role: 'gl' }, rl1: { main: 'Rl', role: 'rl' }, off1: { main: 'Off', role: 'officer' }, m1: { main: 'Alice', role: 'member' }, m2: { main: 'Bob', role: 'member' } },
        owners: { Gl: 'gl1', Rl: 'rl1', Off: 'off1', Alice: 'm1', Bob: 'm2' },
        loginIndex: { Alice: 'a@whaapp.invalid', Bob: 'b@whaapp.invalid' },
        alts: { Alice: { Alicealt: 'Alicealt' } },
        members: { Alice: { name: 'Alice' }, Bob: { name: 'Bob' }, Carol: { name: 'Carol' } },
        raids: { r1: { id: 'r1', name: 'Molten Core', date: '2026-11-01', leaderUid: 'rl1' }, r2: { id: 'r2', name: 'Onyxia', date: '2026-11-04', leaderUid: 'gl1' } },
        signups: { r1: { Bob: { name: 'Bob', status: 'ready', at: 1 } }, r2: { Bob: { name: 'Bob', status: 'ready', at: 1 } } },
        requests: { new9: { char: 'Carol', name: 'Carol', email: 'c@whaapp.invalid', kind: 'login', at: now } },
        applications: { a1: { id: 'a1', name: 'Applicant', status: 'pending' } },
        quests: { q1: { id: 'q1', title: 'Farm herbs', uid: 'm2' } },
        leaves: { l1: { id: 'l1', name: 'Bob', ck: 'Bob', from: '2026-11-01', to: '2026-11-03' } },
        ge: { players: { Alice: { name: 'Alice', data: { isGEMember: false } }, Bob: { name: 'Bob', data: { isGEMember: true } } }, bank: { flask: 2 } },
        staff: { weights: { Alice: { Tank: 3 } }, groups: [['Alice']] },
      },
      whaapp: { roster: [{ name: 'OldPlayer' }] },
      roster: [{ name: 'BoogaloPlayer' }],
    });
  });
});

const guest = () => env.unauthenticatedContext().database();
const as = uid => env.authenticatedContext(uid).database();
const r = (db, path) => ref(db, path ? `${NS}/${path}` : NS);
// ── Reading ──────────────────────────────────────────────────────
test('public data is readable by guests; nothing grants the whole tree', async () => {
  for (const p of ['members', 'raids', 'signups', 'quests', 'owners', 'loginIndex', 'alts', 'ge', 'staff/groups', 'meta'])
    await assertSucceeds(get(r(guest(), p)));
  await assertFails(get(ref(guest())));
  await assertFails(get(r(as('gl1'))));
  await assertFails(get(ref(as('gl1'))));
});
test('private data is not readable by guests or members', async () => {
  for (const p of ['users', 'applications', 'staff/weights', 'requests', 'leaves']) await assertFails(get(r(guest(), p)));
  for (const p of ['users', 'applications', 'staff/weights', 'requests']) await assertFails(get(r(as('m1'), p)));
  await assertSucceeds(get(r(as('m1'), 'leaves')));
  await assertSucceeds(get(r(as('m1'), 'users/m1')));
  await assertFails(get(r(as('m1'), 'users/m2')));
});
test('login requests: staff read all, an account reads only its own', async () => {
  await assertSucceeds(get(r(as('gl1'), 'requests')));
  await assertSucceeds(get(r(as('off1'), 'requests')));
  await assertSucceeds(get(r(as('new9'), 'requests/new9')));
  await assertFails(get(r(as('new1'), 'requests/new9')));
});
test('staff read applications, users and weights', async () => {
  for (const uid of ['gl1', 'off1']) for (const p of ['applications', 'users', 'staff/weights']) await assertSucceeds(get(r(as(uid), p)));
});

// ── Login requests and approval ──────────────────────────────────
const req = (name) => ({ char: name, name, email: 'x@whaapp.invalid', kind: 'login', at: 1 });
test('a new account can ask for a login for itself, nothing more', async () => {
  await assertSucceeds(set(r(as('new1'), 'requests/new1'), req('Carol')));
  await assertFails(set(r(as('new1'), 'requests/new2'), req('Carol')));
  await assertFails(set(r(guest(), 'requests/anon'), req('Carol')));
  await assertFails(set(r(as('new1'), 'requests/new1'), { char: 'Carol', name: 'x'.repeat(61), email: 'x@whaapp.invalid' }));
});
test('an account that already has a login can\'t file requests with it', async () => {
  await assertFails(set(r(as('m1'), 'requests/m1'), req('Bob')));
});
test('nobody but the RL can turn a request into a login', async () => {
  for (const uid of ['new9', 'new1', 'm1', 'off1']) {
    await assertFails(set(r(as(uid), 'users/new9'), { main: 'Carol', role: 'member' }));
    await assertFails(set(r(as(uid), 'loginIndex/Carol'), 'evil@whaapp.invalid'));
  }
  await assertFails(set(r(as('new9'), 'owners/Carol'), 'new9'));
  await assertFails(set(r(as('m1'), 'owners/Bob'), 'm1'));
});
test('the RL approves a request in one update (and can replace an old login)', async () => {
  await assertSucceeds(update(r(as('gl1')), {
    'users/new9': { main: 'Carol', role: 'member' }, 'owners/Carol': 'new9', 'loginIndex/Carol': 'c@whaapp.invalid', 'requests/new9': null,
  }));
  await assertSucceeds(update(r(as('gl1')), { 'users/m2': null, 'users/new8': { main: 'Bob', role: 'member' }, 'owners/Bob': 'new8', 'loginIndex/Bob': 'n@whaapp.invalid' }));
});

// ── Members ─────────────────────────────────────────────────────
test('members sign up their own characters (and alts) only', async () => {
  await assertSucceeds(set(r(as('m1'), 'signups/r1/Alice'), { name: 'Alice', status: 'ready', at: 2 }));
  await assertSucceeds(set(r(as('m1'), 'signups/r1/Alicealt'), { name: 'Alicealt', status: 'bench', at: 3 }));
  await assertFails(set(r(as('m1'), 'signups/r1/Bob'), { name: 'Bob', status: 'absent', at: 4 }));
  await assertFails(set(r(as('m1'), 'signups/r1/Alice'), { name: 'Alice', status: 'hacked', at: 2 }));
  await assertFails(set(r(as('m1'), 'signups/r404/Alice'), { name: 'Alice', status: 'ready', at: 2 }));
  await assertFails(set(r(guest(), 'signups/r1/Carol'), { name: 'Carol', status: 'ready', at: 2 }));
  await assertSucceeds(set(r(as('m2'), 'signups/r1/Bob'), null));
});
test('members edit their own profile, but can\'t create, delete or edit others', async () => {
  await assertSucceeds(set(r(as('m1'), 'members/Alice'), { name: 'Alice', spec: 'Holy' }));
  await assertFails(set(r(as('m1'), 'members/Bob'), { name: 'Bob', spec: 'Holy' }));
  await assertFails(set(r(as('m1'), 'members/Zed'), { name: 'Zed' }));
  await assertFails(remove(r(as('m1'), 'members/Alice')));
});
test('members can\'t touch raids, roles, staff data or other people\'s accounts', async () => {
  await assertFails(set(r(as('m1'), 'raids/r1/name'), 'Mine now'));
  await assertFails(set(r(as('m1'), 'users/m1/role'), 'rl'));
  await assertFails(set(r(as('m1'), 'staff/groups'), [['Alice', 'Bob']]));
  await assertFails(set(r(as('m1'), 'meta/migratedAt'), 1));
});
test('alts: own list only, and never someone else\'s character', async () => {
  await assertSucceeds(update(r(as('m1'), 'alts/Alice'), { Newalt: 'Newalt' }));
  await assertFails(update(r(as('m1'), 'alts/Alice'), { Bob: 'Bob' }));
  await assertFails(update(r(as('m1'), 'alts/Bob'), { Alicealt: 'Alicealt' }));
  await assertFails(update(r(as('m1'), 'alts/Alice'), { Carol: 'Carol' })); // unclaimed guildmate on the roster
  await assertSucceeds(update(r(as('m1'), 'alts/Alice'), { Alicealt: 'Alicealt', Another: 'Another' })); // existing entry kept
});
test('a member can make an alt their main (login moves with it), not someone else\'s character', async () => {
  await assertSucceeds(update(ref(as('m1')), { [`${NS}/owners/Alicealt`]: 'm1', [`${NS}/users/m1/main`]: 'Alicealt' }));
  await assertFails(set(r(as('m2'), 'users/m2/main'), 'Alice'));
});
test('leaves: own characters only', async () => {
  await assertSucceeds(set(r(as('m1'), 'leaves/l2'), { id: 'l2', name: 'Alice', ck: 'Alice' }));
  await assertFails(set(r(as('m1'), 'leaves/l3'), { id: 'l3', name: 'Bob', ck: 'Bob' }));
  await assertFails(remove(r(as('m1'), 'leaves/l1')));
  await assertSucceeds(remove(r(as('m2'), 'leaves/l1')));
});
test('quests: members post as themselves, join any quest, delete only their own', async () => {
  await assertSucceeds(set(r(as('m1'), 'quests/q2'), { id: 'q2', title: 'Mine', uid: 'm1' }));
  await assertFails(set(r(as('m1'), 'quests/q3'), { id: 'q3', title: 'Fake', uid: 'm2' }));
  await assertSucceeds(set(r(as('m1'), 'quests/q1'), { id: 'q1', title: 'Farm herbs', uid: 'm2', workers: ['Alice'] }));
  await assertFails(set(r(as('m1'), 'quests/q1'), { id: 'q1', title: 'Farm herbs', uid: 'm1' }));
  await assertFails(remove(r(as('m1'), 'quests/q1')));
  await assertSucceeds(remove(r(as('m2'), 'quests/q1')));
  await assertFails(set(r(guest(), 'quests/q4'), { id: 'q4', title: 'Anon', uid: '' }));
});
test('Guild Effort: own requests yes, approving yourself no; bank only for GE members', async () => {
  await assertSucceeds(set(r(as('m1'), 'ge/players/Alice'), { name: 'Alice', data: { isGEMember: false, pending: true } }));
  await assertFails(set(r(as('m1'), 'ge/players/Alice'), { name: 'Alice', data: { isGEMember: true } }));
  await assertFails(set(r(as('m1'), 'ge/players/Bob'), { name: 'Bob', data: { isGEMember: true, requests: [] } }));
  await assertFails(set(r(as('m1'), 'ge/bank/flask'), 5));
  await assertSucceeds(set(r(as('m2'), 'ge/bank/flask'), 5));
  await assertFails(set(r(as('m2'), 'ge/extra'), [{ id: 'x' }]));
});

// ── Applications ─────────────────────────────────────────────────
test('anyone can send a new pending application, nothing more', async () => {
  await assertSucceeds(set(r(guest(), 'applications/a2'), { id: 'a2', name: 'New Person', status: 'pending', note: 'hi' }));
  await assertFails(set(r(guest(), 'applications/a3'), { id: 'a3', name: 'Sneaky', status: 'approved' }));
  await assertFails(set(r(guest(), 'applications/a1'), { id: 'a1', name: 'Overwrite', status: 'pending' }));
  await assertFails(set(r(guest(), 'applications/a4'), { id: 'a4', name: 'x'.repeat(61), status: 'pending' }));
  await assertFails(set(r(guest(), 'applications/a5'), { id: 'a5', name: 'Long note', status: 'pending', note: 'x'.repeat(1001) }));
  await assertSucceeds(set(r(as('off1'), 'applications/a1/status'), 'approved'));
});

// ── Officers and the Raid Leader ─────────────────────────────────
test('officers manage raids and planning, but not logins or roles', async () => {
  await assertSucceeds(set(r(as('off1'), 'raids/r5'), { id: 'r5', name: 'Zul Gurub', date: '2026-11-02' }));
  await assertSucceeds(set(r(as('off1'), 'signups/r1/Carol'), { name: 'Carol', status: 'ready', at: 5 }));
  await assertSucceeds(set(r(as('off1'), 'staff/groups'), [['Bob']]));
  await assertFails(set(r(as('off1'), 'owners/Carol'), 'off1'));
  await assertFails(set(r(as('off1'), 'users/m1/role'), 'officer'));
  await assertFails(set(r(as('off1'), 'loginIndex/Carol'), 'x@whaapp.invalid'));
  await assertFails(remove(r(as('off1'), 'requests/new9')));
});
test('the RL declines requests, changes roles and removes logins', async () => {
  await assertSucceeds(remove(r(as('gl1'), 'requests/new9')));
  await assertSucceeds(set(r(as('gl1'), 'users/m1/role'), 'officer'));
  await assertFails(set(r(as('gl1'), 'users/m1/role'), 'god'));
  await assertSucceeds(update(r(as('gl1')), { 'owners/Bob': null, 'loginIndex/Bob': null, 'users/m2': null }));
});

test('a member adds a new alt (roster entry + alt link) in one go, no approval', async () => {
  await assertSucceeds(update(r(as('m1')), { 'alts/Alice/Zed Alt': 'Zed Alt', 'members/Zed Alt': { name: 'Zed Alt', cls: 'Mage' } }));
  await assertSucceeds(set(r(as('m1'), 'signups/r1/Zed Alt'), { name: 'Zed Alt', status: 'ready', at: 9 }));
});
test('a member can\'t create roster entries that aren\'t their alts, or take existing characters as alts', async () => {
  await assertFails(set(r(as('m1'), 'members/Loose'), { name: 'Loose', cls: 'Mage' }));
  await assertFails(update(r(as('m1')), { 'alts/Bob/Sneaky': 'Sneaky', 'members/Sneaky': { name: 'Sneaky' } }));
  await assertFails(update(r(as('m1')), { 'alts/Alice/Carol': 'Carol', 'members/Carol': { name: 'Carol', cls: 'Rogue' } }));
  await assertFails(update(r(as('new1')), { 'alts/Alice/X': 'X', 'members/X': { name: 'X' } }));
});

test('nobody changes someone else\'s profile - not even the Guild Leader', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await set(ref(ctx.database(), NS + '/members/Bob'), { name: 'Bob', spec: 'Holy', type: 'Healer', present: true, professions: [{ name: 'Mining' }], resVals: { Fire: 50 } });
  });
  for (const uid of ['gl1', 'rl1', 'off1', 'm1']) {
    await assertFails(set(r(as(uid), 'members/Bob/spec'), 'Shadow'));
    await assertFails(set(r(as(uid), 'members/Bob/type'), 'Ranged'));
    await assertFails(set(r(as(uid), 'members/Bob/professions/0/name'), 'Herbalism'));
    await assertFails(set(r(as(uid), 'members/Bob/resVals/Fire'), 300));
  }
  await assertSucceeds(set(r(as('m2'), 'members/Bob/spec'), 'Shadow'));            // Bob himself
  await assertSucceeds(set(r(as('off1'), 'members/Bob/present'), false));          // attendance is staff's
  await assertSucceeds(set(r(as('gl1'), 'members/Newbie'), { name: 'Newbie', spec: 'Fury', professions: [{ name: 'Mining' }] })); // adding a player
  await assertSucceeds(update(r(as('gl1')), { 'members/Bob': null, 'members/Bobby': { name: 'Bobby', spec: 'Holy', type: 'Healer', professions: [{ name: 'Mining' }], resVals: { Fire: 50 } } })); // rename = move
});

// ── Name-only member logins ──────────────────────────────────────
const nameLogin = (uid, k, email = 'n@whaapp.invalid') => ({
  [`${NS}/users/${uid}`]: { main: k, role: 'member', nameOnly: true }, [`${NS}/owners/${k}`]: uid, [`${NS}/loginIndex/${k}`]: email,
});
test('a roster member without a login can create their own name-only member login', async () => {
  const db = env.authenticatedContext('nm1', { email: 'n@whaapp.invalid' }).database();
  await assertSucceeds(update(ref(db), nameLogin('nm1', 'Carol')));
});
test('name-only logins: not for characters that already have one, not off-roster, never a leader rank', async () => {
  const db = env.authenticatedContext('nm2', { email: 'n@whaapp.invalid' }).database();
  await assertFails(update(ref(db), nameLogin('nm2', 'Bob')));                       // Bob already has a login
  await assertFails(update(ref(db), nameLogin('nm2', 'Stranger')));                  // not on the roster
  await assertFails(update(ref(db), { ...nameLogin('nm2', 'Carol'), [`${NS}/users/nm2`]: { main: 'Carol', role: 'officer', nameOnly: true } }));
  await assertFails(update(ref(db), nameLogin('nm2', 'Carol', 'other@whaapp.invalid'))); // index must point at this account
  await env.withSecurityRulesDisabled(async ctx => { await set(ref(ctx.database(), NS + '/users/nm3'), { main: 'Carol', role: 'member', nameOnly: true }); });
  await assertFails(set(r(as('gl1'), 'users/nm3/role'), 'officer'));                 // promote only after a password login
});

// ── Ranks: Guild Leader, Raid Leader ─────────────────────────────
test('a Raid Leader runs the raids they lead, and only those', async () => {
  await assertSucceeds(set(r(as('rl1'), 'raids/r1/name'), 'Molten Core (full clear)'));
  await assertSucceeds(set(r(as('rl1'), 'signups/r1/Bob'), { name: 'Bob', status: 'bench', at: 2 }));
  await assertFails(set(r(as('rl1'), 'raids/r2/name'), 'Mine now'));
  await assertFails(set(r(as('rl1'), 'signups/r2/Bob'), { name: 'Bob', status: 'absent', at: 2 }));
  await assertFails(remove(r(as('rl1'), 'raids/r2')));
});
test('a Raid Leader creates raids they lead, but can\'t hand raids to others or take them', async () => {
  await assertSucceeds(set(r(as('rl1'), 'raids/r3'), { id: 'r3', name: 'BWL', date: '2026-11-06', leaderUid: 'rl1' }));
  await assertFails(set(r(as('rl1'), 'raids/r4'), { id: 'r4', name: 'BWL', date: '2026-11-07', leaderUid: 'gl1' }));
  await assertFails(set(r(as('rl1'), 'raids/r1/leaderUid'), 'm1'));
  await assertFails(set(r(as('rl1'), 'raids/r2/leaderUid'), 'rl1'));
});
test('officers help on every raid but can\'t change who leads it', async () => {
  await assertSucceeds(set(r(as('off1'), 'raids/r2/name'), 'Onyxia (late)'));
  await assertSucceeds(set(r(as('off1'), 'signups/r2/Bob'), { name: 'Bob', status: 'tentative', at: 3 }));
  await assertFails(set(r(as('off1'), 'raids/r2/leaderUid'), 'off1'));
});
test('only the Guild Leader assigns raid leaders, accepts logins and sets ranks', async () => {
  await assertSucceeds(set(r(as('gl1'), 'raids/r2/leaderUid'), 'rl1'));
  await assertFails(set(r(as('rl1'), 'users/m1/role'), 'officer'));
  await assertFails(update(r(as('rl1')), { 'users/new9': { main: 'Carol', role: 'member' }, 'owners/Carol': 'new9', 'loginIndex/Carol': 'c@whaapp.invalid' }));
  await assertSucceeds(set(r(as('gl1'), 'users/rl1/role'), 'officer'));
});

// ── Old data ─────────────────────────────────────────────────────
test('pre-accounts and Boogalo data: staff can read, nobody can write', async () => {
  await assertFails(get(ref(guest(), 'whaapp')));
  await assertFails(get(ref(as('m1'), 'whaapp')));
  await assertSucceeds(get(ref(as('off1'), 'whaapp')));
  await assertSucceeds(get(ref(as('gl1'), 'roster')));
  await assertFails(set(ref(as('gl1'), 'whaapp/roster'), null));
  await assertFails(set(ref(as('gl1'), 'roster'), null));
  await assertFails(set(ref(guest(), 'whaapp/roster'), null));
});
