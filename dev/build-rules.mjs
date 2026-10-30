// Generates ../database.rules.json - the Realtime Database rules that decide who
// may read and change what. Edit the rules here (comments and small helpers keep
// them readable), then: npm run rules   (and npm run test:rules)
//
// Realtime Database rules cascade: a read/write granted on a node can't be taken
// back below it. So nothing is granted on the root or on "whaapp-v2" itself.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NS = 'whaapp-v2';
// Path builder: plain strings are literal path text, E(expr) is a rules expression.
// cat('owners/', E('$k')) → 'owners/'+$k
const E = expr => ({ expr });
const cat = (...parts) => parts.filter(p => p !== '')
  .reduce((a, p) => (typeof p === 'string' && typeof a[a.length - 1] === 'string' ? a[a.length - 1] += p : a.push(p), a), [])
  .map(p => typeof p === 'string' ? `'${p}'` : p.expr).join('+');
const at = (...parts) => `root.child(${cat(NS + '/', ...parts)})`;                       // current data
const atNew = (up, ...parts) => `newData${'.parent()'.repeat(up)}.child(${cat(...parts)})`; // data after this write

const ROLE = `${at('users/', E('auth.uid'), '/role')}.val()`;
const MAIN = `${at('users/', E('auth.uid'), '/main')}.val()`;
const MEMBER = `(auth != null && ${at('users/', E('auth.uid'))}.exists())`;
// Ranks: gl (Guild Leader) > rl (Raid Leader) > officer > member; guests have no login.
const GL = `(auth != null && ${ROLE} === 'gl')`;
const OFFICER = `(auth != null && ${ROLE} === 'officer')`;
const RAIDLEAD = `(auth != null && ${ROLE} === 'rl')`;
const STAFF = `(auth != null && (${ROLE} === 'gl' || ${ROLE} === 'rl' || ${ROLE} === 'officer'))`;
// The signed-in user leads this raid (raids/{id}.leaderUid, set by the Guild Leader or by a Raid Leader creating it)
const leads = raid => `${at('raids/', E(raid), '/leaderUid')}.val() === auth.uid`;
// Who may manage a raid's sign-ups / votes: Guild Leader and officers on every raid, a Raid Leader on the raids they lead
const RAID_MANAGER = raid => `(${GL} || ${OFFICER} || (${RAIDLEAD} && ${leads(raid)}))`;
// Character k (an expression) is the signed-in user's: they own it, or it's an alt of their main
const mine = k => `(auth != null && (${at('owners/', E(k))}.val() === auth.uid || (${at('users/', E('auth.uid'), '/main')}.isString() && ${at('alts/', E(MAIN), '/', E(k))}.exists())))`;

// Profile fields of members/$k stay as they were (for staff edits of someone else's character)
const PROFILE_SAME = ['spec', 'flexSpec', 'type', 'timezone'].map(f => `newData.child('${f}').val() === data.child('${f}').val()`).join(' && ');
// For nested profile values (professions, resistances): own character, a newly created record, or unchanged
const OWN_OR_SAME = `${mine('$k')} || !${at('members/', E('$k'))}.exists() || newData.val() === data.val()`;

// A member's first name-only sign-in: one update creates users/{uid} {main, role:'member', nameOnly:true},
// owners/{char} and loginIndex/{char} - only for a character on the roster that has no login yet.
const SELF_NAME_LOGIN = `auth != null && auth.uid === $uid && !data.exists()
  && newData.child('role').val() === 'member' && newData.child('nameOnly').val() === true
  && newData.child('main').isString()
  && ${at('members/', E("newData.child('main').val()"))}.exists()
  && !${at('owners/', E("newData.child('main').val()"))}.exists()`;
// For owners/$k and loginIndex/$k in that same update
const NAME_CLAIM = `(${atNew(2, 'users/', E('auth.uid'), '/main')}.val() === $k && ${atNew(2, 'users/', E('auth.uid'), '/nameOnly')}.val() === true && !${at('users/', E('auth.uid'))}.exists())`;

const oneLine = s => s.replace(/\s*\n\s*/g, ' ');
const rules = {
  rules: {
    [NS]: {
      meta: { '.read': true, '.write': GL },

      // Logins and ranks are the Guild Leader's: users/{uid} (rank + main character), owners/{char} and
      // loginIndex/{char} (the hidden sign-in address) are written by the Guild Leader only.
      users: {
        '.read': STAFF,
        $uid: {
          '.read': 'auth != null && auth.uid === $uid',
          // the Guild Leader manages logins; a member signing in by name for the first time creates their own name-only login
          '.write': `${GL} || (${SELF_NAME_LOGIN})`,
          // name-only logins (no password) are always plain members: leader ranks need a password login
          '.validate': "newData.hasChildren(['main','role']) && newData.child('role').isString() && newData.child('role').val().matches(/^(gl|rl|officer|member)$/) && (newData.child('nameOnly').val() !== true || newData.child('role').val() === 'member')",
          // a member may move their login to another character they own (alt → main)
          main: { '.write': `auth != null && auth.uid === $uid && data.exists() && ${atNew(3, 'owners/', E('newData.val()'))}.val() === auth.uid` },
        },
      },
      // A new account asks for a login (first time, forgotten password, or with a guild application).
      // Only the account itself writes its request, and only while it has no login yet.
      requests: {
        '.read': STAFF,
        $uid: {
          '.read': 'auth != null && auth.uid === $uid',
          '.write': `${GL} || (auth != null && auth.uid === $uid && !${at('users/', E('$uid'))}.exists())`,
          '.validate': "newData.hasChildren(['char','name','email']) && newData.child('char').isString() && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 60 && newData.child('email').isString() && newData.child('email').val().length <= 100",
        },
      },
      owners: {
        '.read': true,
        $k: { '.write': `${GL} || (auth != null && newData.val() === auth.uid && !data.exists() && (${mine('$k')} || ${NAME_CLAIM}))` },
      },
      loginIndex: {
        '.read': true,
        $k: { '.write': `${GL} || (auth != null && !data.exists() && newData.val() === auth.token.email && ${NAME_CLAIM})` },
      },

      members: {
        '.read': true,
        $k: {
          // own characters: edit; a brand-new alt: create, in the same update that lists it under the member's own main
          // Staff add, remove and rename characters and keep attendance, but never change someone else's
          // profile (spec, role, professions, resistances, timezone) - only the character's own player does.
          '.write': `(${STAFF} && (!data.exists() || !newData.exists() || (${PROFILE_SAME})))
            || (data.exists() && newData.exists() && ${mine('$k')})
            || (auth != null && !data.exists() && newData.exists() && ${atNew(2, 'alts/', E(MAIN), '/', E('$k'))}.exists())`,
          '.validate': "newData.child('name').isString() && newData.child('name').val().length <= 60",
          professions: { $i: { name: { '.validate': OWN_OR_SAME } } },
          secProfessions: { $i: { '.validate': OWN_OR_SAME } },
          resVals: { $s: { '.validate': OWN_OR_SAME } },
        },
      },
      alts: {
        '.read': true,
        $main: {
          '.write': `${STAFF} || (auth != null && ${at('owners/', E('$main'))}.val() === auth.uid)`,
          // Members may only list as alts: characters they own, or new characters that are neither
          // on the roster nor owned. Existing entries stay. (Otherwise anyone could list an
          // unclaimed guildmate as their "alt" and control that character.)
          $alt: { '.validate': `${STAFF} || data.exists() || ${at('owners/', E('$alt'))}.val() === auth.uid
            || (!${at('owners/', E('$alt'))}.exists() && !${at('members/', E('$alt'))}.exists())` },
        },
      },
      // Only the Guild Leader sets or changes a raid's leader. Officers edit every raid (leader unchanged);
      // a Raid Leader creates raids they lead and edits/deletes only those.
      raids: {
        '.read': true,
        $raid: {
          '.write': `${GL}
            || (${OFFICER} && (!newData.exists() || newData.child('leaderUid').val() === data.child('leaderUid').val()))
            || (${RAIDLEAD} && ((!data.exists() && newData.child('leaderUid').val() === auth.uid)
                || (data.child('leaderUid').val() === auth.uid && (!newData.exists() || newData.child('leaderUid').val() === auth.uid))))`,
        },
      },
      signups: {
        '.read': true,
        $raid: {
          $k: {
            '.write': `${RAID_MANAGER('$raid')} || ${mine('$k')}`,
            '.validate': `newData.child('status').isString() && newData.child('status').val().matches(/^(ready|tentative|bench|absent)$/) && ${atNew(3, 'raids/', E('$raid'))}.exists()`,
          },
        },
      },
      operaVotes: {
        '.read': true,
        $raid: { $k: { '.write': `${RAID_MANAGER('$raid')} || ${mine('$k')}`, '.validate': "newData.child('event').isString()" } },
      },
      // Anyone may send one new application; only staff read and decide them
      applications: {
        '.read': STAFF,
        $id: {
          '.write': `${STAFF} || (!data.exists() && newData.exists() && newData.child('status').val() === 'pending')`,
          '.validate': "newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 60 && (!newData.child('note').exists() || (newData.child('note').isString() && newData.child('note').val().length <= 1000))",
        },
      },
      // Members post quests and join any quest; only the poster (or staff) deletes one
      quests: {
        '.read': true,
        $id: {
          '.write': `${STAFF} || (${MEMBER} && (
            (!data.exists() && newData.child('uid').val() === auth.uid)
            || (data.exists() && newData.exists() && newData.child('uid').val() === data.child('uid').val())
            || (data.exists() && !newData.exists() && data.child('uid').val() === auth.uid)))`,
        },
      },
      leaves: {
        '.read': MEMBER,
        $id: {
          '.write': `${STAFF} || (newData.exists() && ${mine("newData.child('ck').val()")} && (!data.exists() || ${mine("data.child('ck').val()")}))
            || (!newData.exists() && ${mine("data.child('ck').val()")})`,
        },
      },
      ge: {
        '.read': true,
        players: {
          $k: {
            // own requests / professions; Guild Effort membership and contributions are staff-only
            '.write': `${STAFF} || (${mine('$k')} && newData.child('data/isGEMember').val() === data.child('data/isGEMember').val() && newData.child('data/lastContrib').val() === data.child('data/lastContrib').val())`,
          },
        },
        bank: { '.write': `${STAFF} || (auth != null && ${at('ge/players/', E(MAIN), '/data/isGEMember')}.val() === true)` },
        extra: { '.write': STAFF },
      },
      // Planning data: everyone reads (buff assignments, groups, progression…), staff write. Weights stay staff-only.
      staff: {
        $key: { '.read': `$key !== 'weights' || ${STAFF}`, '.write': STAFF },
      },
    },
    // Everything else - the pre-accounts data under whaapp/ and the old Boogalo data - is read-only, for staff.
    $other: { '.read': STAFF, '.write': false },
  },
};

// Flatten multi-line expressions
const walk = o => { for (const k in o) { if (typeof o[k] === 'string') o[k] = oneLine(o[k]); else walk(o[k]); } };
walk(rules);
const out = fileURLToPath(new URL('../database.rules.json', import.meta.url));
writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
console.log('wrote', out);
