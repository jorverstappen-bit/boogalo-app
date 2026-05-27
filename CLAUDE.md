# Boogalo — TBC Raid Manager

## What this is
A single-file web app (`index.html`) for managing World of Warcraft: The Burning Crusade raids. No build step, no dependencies to install — everything is self-contained in one HTML file.

## Stack
- Pure HTML/CSS/JS — no framework, no bundler
- Fonts: Cinzel (headers) + Inter (body) via Google Fonts
- Icons: Tabler Icons via CDN
- State: localStorage (persists across sessions in the browser)

## Deployment
- GitHub repo: https://github.com/jorverstappen-bit/boogalo-app
- Live site: https://boogalo.netlify.app
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
