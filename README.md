# UPInfradesk

A single, searchable index of public Uttar Pradesh infrastructure and investment-facilitation resources — GIS portals, investor systems, policies, and central-agency links — with enough detail on each one that you know what it contains before you tap it.

**Live:** `https://upinfradesk.pages.dev`

## What this is

Not an official government system. Hosts no content of its own, mirrors no documents, stores no credentials, and collects no visitor data. It links out to public sources and explains what each one yields.

See the in-app Instructions page (`[?]`) for full usage — search, badges, the detail panel, pinning, and the monthly maintenance routine.

## Structure

```
index.html            App shell, styles, and logic — single file, no build step
links.json             Content — the only file edited regularly
manifest.webmanifest   PWA metadata
sw.js                   Service worker — offline cache, versioned
icons/                  App icons (192, 512, maskable)
tools/
  check-links.mjs       Local link-health script — run monthly
  generate-icons.ps1    One-off icon generator (re-run only if the mark changes)
```

No npm, no bundler, no framework, no CDN, no webfonts. Plain HTML + CSS + vanilla JS, designed to still work untouched in three years.

## Editing content

`links.json` is the only file you should need to touch day to day. Each entry needs at minimum `id`, `title`, `url`, `category`, `tags`, `note`, `detail.owner`, `detail.whatItGives`, `authRequired`, `mobileFriendly`, `lastVerified`. Full field reference is in the build spec and the in-app Instructions page, section 10.

Rules that matter:
- Never delete a dead link — mark `deprecated: true` and set `replacedBy` if there's a successor.
- For policies, `url` must be the actual document, never a landing page (unless no direct file could be found — mark `directDocument: false` and say so in `quirks`).
- Never invent a `publishedDate` or `lastAmendedDate`. Leave it `null` if the source document doesn't state one.
- Nothing internal ever enters this file or this repository. It's public.

## Monthly maintenance

```
node tools/check-links.mjs
```

Reads `links.json`, checks every URL (max 3 concurrent, 10s timeout), and writes `tools/link-report.md`. It classifies OK / Redirect / Broken / Timeout / TLS error — it never edits `links.json` itself, because a 403 or a TLS warning usually means bot-blocking or a known government-site certificate quirk, not a dead link. Open every flagged link in an actual browser before touching anything.

After checking: update `lastVerified` on anything you confirmed, mark `deprecated` anything actually superseded, bump `lastReviewed` at the top of `links.json`, commit.

## Deployment

Public GitHub repo → Cloudflare Pages (Git-connected). Framework preset: none. Build command: none. Output directory: `/`. Every push to `main` redeploys within ~2 minutes.

When you change anything cached by the service worker (`index.html`, `links.json`, the manifest, icons), bump `CACHE_NAME` in `sw.js` — otherwise phones with the app already installed keep serving a stale shell indefinitely.

## Disclaimer

Independent resource. Not affiliated with the Government of Uttar Pradesh. An unverified link is worse than a missing one — the staleness badges are the honest signal and are never suppressed for a tidier appearance.
