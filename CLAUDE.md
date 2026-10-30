# We Have An App - Raid Manager

## What this is
A web app for managing World of Warcraft raids for the guild "We Have An App" (formerly "Boogalo", a TBC guild now moving to WoW Forever). No build step: `index.html` plus two scripts in `js/`.

> **History:** Oct 2026 relaunch (Boogalo → We Have An App) put data under `whaapp/`. The accounts update moved all data to `whaapp-v2/`, one record per path, protected by database rules; `whaapp/` and the old un-prefixed Boogalo data are read-only and imported once by the RL (Accounts page → Import). `seedRaids()` is disabled.

## Stack
- Pure HTML/CSS/JS - no framework, no bundler. Fonts: Cinzel + Inter (Google Fonts). Icons: Tabler (CDN).
- `index.html` - all UI and app logic. Keeps in-memory state (`ROSTER`, `raidSchedule`, `quests`, …); `save*()` → `fbSet(key, data)`; incoming data → `applyFirebaseKey(key, data)`.
- `js/sync.js` - Firebase environments (`FB_ENVS`: emulator on localhost/127.0.0.1, staging on Netlify branch deploys when configured, otherwise prod), the per-record mapping (`SYNC`: each collection → paths like `members/{char}`, `signups/{raid}/{char}`), diff-based `fbSet` (writes only changed records), sign-in and invite claiming.
- `js/accounts.js` - Guild Leader's Accounts page + the raid-leader picker on raids: approve/decline login requests, roles, remove login, keeping logins attached on rename/remove/set-as-main, one-time import.
- Character keys: `charKey(name)` percent-encodes `. # $ [ ] / %`.
- localStorage keeps a per-browser copy (`whaapp-*` keys) for fast loading only.

## Accounts and security
- **Members sign in with just their name** - a "name-only" login (`users/{uid}.nameOnly: true`) whose hidden address/password are derived from the main character (`nameOnlyEmail()`/`NAME_ONLY_PASSWORD` in js/sync.js; deliberately not secret). The first name sign-in of a roster member creates it (rules: only for a roster character without a login).
- **Officers and leaders sign in with a password** (random hidden address `{32 hex}@whaapp.invalid`). They request it on the sign-in screen ("Leader password", `requests/{uid}`), the Guild Leader accepts it on the Accounts page, then sets their rank. The rules never give a name-only login a rank above member.
- New players apply with the Join form (no password); once accepted they sign in by name.
- Ranks live in `whaapp-v2/users/{uid}.role`: `gl` Guild Leader > `rl` Raid Leader > `officer` > `member`; guests browse without logging in.
  - Guild Leader: everything, plus accounts/ranks and assigning each raid's leader (`raids/{id}.leaderUid`).
  - Raid Leader: creates raids (leads them automatically) and manages only the raids they lead; roster and planning pages like before.
  - Officer: helps on every raid (not the leader field), reads applications. Member: own characters, sign-ups, leave, quests, Guild Effort requests.
- Alts: a member adds a new character as an alt of their own main instantly (no approval; it shares the main's login) via `addAltCharacter()` in js/accounts.js - one update writes `alts/{main}/{alt}` and `members/{alt}`. Existing roster characters can't be claimed as alts (rules). Raid sign-ups let the player pick which of their characters goes.
  - In the UI both Guild Leader and Raid Leader use `VIEW==='rl'`; `isGL()` and `canManageRaids(r)` (pass the raid) tell them apart.
- **The database rules are the security**, not the UI. Source: `dev/build-rules.mjs` → generates `database.rules.json`. After any change: `cd dev && npm run test:rules`. When adding a feature that writes data, add its path to `SYNC` (js/sync.js), to the rules, to `_canWrite` (mirror of the rules), and a test.
- Escape user text in HTML with `esc()`; pass values to inline handlers with `jsArg()` (no surrounding quotes): `onclick="fn(${jsArg(name)})"`.
- Never put real passwords or keys in docs or commits.

## Local development
`cd dev && npm install && npm run dev` → http://localhost:5050 against local emulators (needs Java 21). `npm run seed` loads demo data. Details: `dev/README.md`.

## Deployment
- Deploy repo: https://github.com/jorverstappen-bit/boogalo-app (Netlify builds from its `master`; repo name unchanged)
- Working fork: https://github.com/0xHermanD/we-have-an-app-wow - changes go in via pull requests to the deploy repo
- Live site: https://wehaveanapp.netlify.app (once the Netlify site rename is done; repo/folder keep the `boogalo-app` name)
- Rules are published separately from the site (Firebase console or `firebase deploy --only database`). Go-live order: `plan.md` → "Go-live checklist".

## How to make and ship a change
1. Branch in the fork; edit; run it locally (`dev/`), and `npm run test:rules` if rules or data paths changed
2. Commit, push the branch, open a PR against `jorverstappen-bit/boogalo-app` `master`
3. When the PR is merged, Netlify redeploys automatically
4. Bigger work follows `plan.md`

## CSS conventions
- CSS variables defined in `:root` at the top - always use vars, never hardcode colors
- Light theme overrides via `[data-theme="light"]`
- Class naming is short/abbreviated (`.sb` = sidebar, `.ni` = nav item, `.ph` = page header, etc.)

## Key sections in index.html
- Lines 1–~300: CSS (all styles in one `<style>` block)
- Then HTML: login screen (`#auth`), sidebar `.sb` (one nav per role: `#nav-rl`, `#nav-officer`, `#nav-par`, `#nav-guest`), pages `.page`
- Then the `<script>` blocks with all app logic; `applyFirebaseKey` near the end; `js/sync.js` and `js/accounts.js` load last
