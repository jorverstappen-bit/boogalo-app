# We Have An App — Raid Manager

## What this is
A single-file web app (`index.html`) for managing World of Warcraft raids for the guild "We Have An App" (formerly "Boogalo", a TBC guild now moving to WoW Forever). No build step, no dependencies to install — everything is self-contained in one HTML file.

> **Relaunch note (Oct 2026):** The app was rebranded from Boogalo → We Have An App and reset for a fresh start. Shared data (roster, raids, progression, stats, guild effort) now lives under a Firebase path namespace `FB_NS='whaapp/'` (see the Firebase section of index.html); the old TBC/Boogalo data remains untouched under the un-prefixed paths. localStorage keys use the `whaapp-` prefix. View passwords: Raid Leader `whaapp-rl`, Officer `whaapp-officer` (RL_KEY/OFFICER_KEY near the top of the script). `seedRaids()` is disabled so raids start empty.

## Stack
- Pure HTML/CSS/JS — no framework, no bundler
- Fonts: Cinzel (headers) + Inter (body) via Google Fonts
- Icons: Tabler Icons via CDN
- State: localStorage (persists across sessions in the browser)

## Deployment
- GitHub repo: https://github.com/jorverstappen-bit/boogalo-app (repo name unchanged)
- Live site: https://wehaveanapp.netlify.app (rename the Netlify site in the Netlify dashboard — Site settings → Change site name; the repo/folder keep the `boogalo-app` name)
- Auto-deploys: every push to `master` triggers a Netlify redeploy (~30s)

## How to make and ship a change
1. Edit `index.html`
2. `git add index.html && git commit -m "description" && git push`
3. Netlify redeploys automatically

## CSS conventions
- CSS variables defined in `:root` at the top — always use vars, never hardcode colors
- Light theme overrides via `[data-theme="light"]`
- Class naming is short/abbreviated (`.sb` = sidebar, `.ni` = nav item, `.ph` = page header, etc.)

## Key sections in index.html
- Lines 1–~150: CSS (all styles in one `<style>` block)
- After CSS: HTML structure (sidebar `.sb`, main content `.main`, pages `.page`)
- Bottom of file: `<script>` block with all JS logic
