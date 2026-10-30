# We Have An App - Raid Manager

Raid management web app for the WoW guild **We Have An App** (formerly Boogalo): raid calendar and sign-ups, attendance, roster, groups and buff assignments, Quest Board, Guild Effort, profiles and raid strategy pages.

Live site: https://wehaveanapp.netlify.app (once the Netlify site rename is done - see `CLAUDE.md`)

## How it's built

- `index.html` plus `js/sync.js` and `js/accounts.js` - plain HTML/CSS/JS, no build step.
- Data lives in Firebase Realtime Database (`whaapp-v2/`), one record per path, synced live to every open browser.
- Members sign in with just their character name; officers and leaders also need a password (accepted by the Guild Leader). Ranks: Guild Leader → Raid Leader → Officer → member → guest; the Guild Leader picks who leads each raid. Guests can browse without logging in.
- Database rules (`database.rules.json`, generated from `dev/build-rules.mjs`) decide who may read and change what; they're covered by automated tests.

## Local development

```bash
cd dev && npm install && npm run dev
```

Opens http://localhost:5050 against local Firebase emulators (needs Java 21) - never the live data. See `dev/README.md` for demo data and logins.

## Deploying

Netlify deploys `master` of [jorverstappen-bit/boogalo-app](https://github.com/jorverstappen-bit/boogalo-app). Work happens in the fork [0xHermanD/we-have-an-app-wow](https://github.com/0xHermanD/we-have-an-app-wow) and reaches the live site through pull requests. The database rules are published separately; follow the go-live checklist in `plan.md`.
