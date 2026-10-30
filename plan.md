# We Have An App - improvement plan

Goal: make the raid manager safe to use (real logins, a database that enforces who may change what), stop lost sign-ups, and clean up, without changing the no-build setup.

## Decisions

| Topic | Decision |
|---|---|
| Login | **Members: character name only.** Officers and leaders: name + password (requested on the sign-in screen, accepted by the Guild Leader). No Discord, no Google, no email, no invite codes. |
| Ranks | Guild Leader → Raid Leader → Officer → member → guest. Guild Leader: accounts, ranks, picks each raid's leader. Raid Leader: runs the raids they lead. Officer: helps on every raid. |
| TBC raid pages | Keep as reference. |
| Old Boogalo/TBC data | Keep, read-only (staff can still read it). |
| Deploy source | Netlify deploys `jorverstappen-bit/boogalo-app` `master`; work arrives by PR from the fork `0xHermanD/we-have-an-app-wow`. |
| Stack | Plain HTML/CSS/JS, no bundler. Dev-only tooling lives in `dev/` and never ships. |

## Status - built on branch `accounts-and-security` (2026-10-30), tested locally, not live

| Area | What changed | Checked |
|---|---|---|
| Escaping (was: HTML injection) | `esc()` on ~200 places that print stored text; `jsArg()` for ~190 values passed to buttons, so names like `Cass O'Neil` work. | Test application with `<img onerror=…>` shows as text; a character named `Zed "Q" <b>Bold</b> & Co's` shows literally on all 27 RL pages, no double escaping, no script errors, its buttons work. |
| Lost sign-ups | Every record has its own path (`signups/{raid}/{char}`, `members/{char}`, `quests/{id}`, …) and a save writes only the records that changed. Two people saving at once no longer overwrite each other. (Replaces the planned interim "transactions" step.) | Sign-ups stored per character in the emulator. |
| Accounts | Name + password login; new players pick a password in the Join form, roster members via "I'm on the roster"; the RL approves on the **Accounts** page (or by approving the application). Shared RL/Officer keys and name-only login removed. | Sign-up → RL approval → sign-in, for new and existing players; wrong password and "not approved yet" messages. |
| Database rules | `database.rules.json` (generated from `dev/build-rules.mjs`): guests read public pages and can send an application; members change only their own characters, sign-ups, leave, quests, Guild Effort requests; officers manage raids/planning; only the RL manages logins and roles; old data read-only. | 19 automated rules tests pass (on separate emulator ports); in the app, a member's attempts to edit others' sign-ups, rename raids, read applications or make themselves RL are refused by the database. |
| One-time import | RL → Accounts → **Import data now** copies `whaapp/` into the new layout; the old data stays untouched. | Demo import: 11 characters, 2 raids, 1 quest, sign-ups and leave carried over. |
| Environments | localhost / 127.0.0.1 → local emulators; Netlify branch deploys → staging (when configured); else production. | Local runs never touch live data. |
| Backups | `dev/backup/backup.yml`: nightly export for a **private** repo. | Not run (needs a service-account key). |
| Docs / leftovers | README, CLAUDE.md (no passwords), `dev/README.md`; old Boogalo names removed from `PREFERRED_RAID_GROUPS`. | - |

Behaviour changes the guild will notice:
- Members sign in with just their name (so anyone can sign in as any member - by choice). Officers and leaders need a password. Guests can still browse.
- Renaming a character is RL-only (members used to rename themselves).
- Members can add alts that are new characters, not characters already on the roster; the RL links those.
- The old Boogalo/pre-accounts data is readable by RL and officers only.

Not done / deliberately left:
- Old **reviews** and **spec request** code: no page shows them and they no longer sync; left in place (inert) rather than risk breaking something by deleting.
- Not tested against real Firebase - only the local emulators. Go-live step 5 checks the hidden login address format (`…@whaapp.invalid`) before anything changes.
- Optional later: Firebase App Check against application spam; a separate staging Firebase project; splitting more out of `index.html`.

## Go-live checklist (in this order, one evening)

Needs: a Firebase **project owner** (console + `npx firebase login`) and whoever merges PRs in `jorverstappen-bit/boogalo-app`.

**Before**
1. [ ] **Backup:** Firebase console → Realtime Database → Data → ⋮ → Export JSON. Store privately (both repos are public).
2. [ ] **Turn on logins:** Authentication → Get started → Sign-in method → **Email/Password** → Enable.
3. [ ] **Web config:** Project settings → General → Your apps → add a Web app if there is none → copy `apiKey` (check `projectId` = `boogalo-app`, `authDomain` = `boogalo-app.firebaseapp.com`) → put it in `FB_ENVS.prod` in `js/sync.js` (it's meant to be public). Without it the live site only offers guest mode.
4. [ ] **Current rules:** Realtime Database → Rules → copy them somewhere (that's the undo). If they're anything other than fully open (`".read": true, ".write": true`), someone has customised them: compare before replacing.
5. [ ] **Login address check:** Authentication → Users → Add user → email `test@whaapp.invalid`, any password → then delete that user. If Firebase refuses the address, stop: `LOGIN_DOMAIN` in `js/sync.js` needs another domain before merging.

**Go live**
6. [ ] Open and merge the PR (fork → `jorverstappen-bit/boogalo-app` `master`). Netlify deploys in ~30 s.
7. [ ] **Right after:** publish the new rules: paste `database.rules.json` in the console → Publish (or `npx firebase deploy --only database --project boogalo-app` from the repo root).
8. [ ] **First Guild Leader:** they open the site → "I'm on the roster" → name + password → Request. A Firebase owner runs `cd dev && npm run approve-first-gl -- "<name>"`. Then the Guild Leader signs in → **Accounts → Import data now** and checks the counts.
9. [ ] Guild Leader: set ranks (Raid Leaders, Officers) on Accounts and pick a leader for each upcoming raid.
10. [ ] Tell the guild: sign in with your character name. Officers/leaders: "Leader password" → the Guild Leader accepts it and sets your rank.

**After**
11. [ ] Nightly backups: new **private** repo + `dev/backup/backup.yml` (instructions in the file).
12. [ ] Optional: rename the Netlify site to `wehaveanapp`.

**Undo** (if something is badly wrong): Netlify → Deploys → publish the previous deploy, and paste back the rules from step 4. The old app works again on `whaapp/`, which the new version never changes. Anything entered in the new version after go-live isn't in the old data.

## Earlier console prep (still useful)
- Access check: at least two trusted **owners** on the Firebase project and the Netlify site.
- `database.rules.interim.json`: a stop-gap that only locks the old Boogalo data, for use **before** go-live if go-live is delayed. Apply only if the current rules are fully open; it blocks the new version, so replace it with `database.rules.json` at go-live step 7.
