# Dev tooling (local only - never shipped)

Everything here runs on your machine against the **Firebase emulators**: a local database and login server. Nothing touches the live guild data.

Needs Node and Java 21 (`brew install openjdk@21`). First time: `cd dev && npm install`.

## Run the app locally

```bash
cd dev && npm run dev
```

- App: http://localhost:5050 (tab title shows `[EMULATOR]`)
- Emulator UI (browse the database and logins): http://localhost:4000
- Data is kept between runs in `dev/emulator-data/` (git-ignored). Delete that folder to start over.

First run only, in a second terminal:

```bash
cd dev && npm run seed
```

This loads made-up guild data in the **old** format (as if it came from today's live app) plus demo logins:

| Character | Role | Password |
|---|---|---|
| Fate Bringer | Guild Leader | `whaapp-rl` |
| Raidboss Demo | Raid Leader | `whaapp-rl` |
| Brenna Vale | Officer | `whaapp-officer` |
| Tom Ironfield | Member | - (signs in by name) |

These are the old shared view keys, used as **local test passwords only** - they are public in the repo history, so real leaders must choose their own.

Walkthrough:
1. Sign in as Fate Bringer (Guild Leader) → Accounts (sidebar) → **Import data now**: copies the old-format data into the new layout.
2. In a second tab at `http://127.0.0.1:5050` (different address = separate login): sign in as any roster member with just their name (e.g. `Cass O'Neil`), or "Join the guild" as a new player. For a leader: "Leader password" → name + password → Request.
3. Back as the Guild Leader: accept new players' applications in RL Review (they then sign in by name); accept leader password requests on Accounts, then set the rank.
4. Raid leaders: as Guild Leader, edit a raid → Raid Leader → pick Raidboss Demo. Signed in as Raidboss Demo you can then run that raid but not the others.

More demo logins: `npm run demo-user -- "First Last" <gl|rl|officer|member> <password, or - for members> [Class] [Spec] [Role]`.

## Database rules

- Source: `build-rules.mjs` (readable, with comments) → generates `../database.rules.json`.
- `npm run rules` regenerates; `npm run test:rules` regenerates and runs `rules.test.mjs` (guest, member, officer, Raid Leader, Guild Leader, login requests, raid leaders, old data) in a throwaway emulator.

## Other scripts

- `npm run approve-first-gl -- "First Last"` - once, on the live site: makes the first Guild Leader by accepting their login request (see the go-live checklist in `../plan.md`).
- `backup/backup.yml` - nightly backup job, for a **private** repo (instructions inside).
