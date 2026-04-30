---
title: Grabby Voice
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
fullWidth: true
pinned: false
---

# Matcha Moments — frontend

Cafe-aesthetic, mobile-first PWA that walks a customer through a 5-clip guided
video review and, on submit, hands them a matcha redemption code.

This repo is a **standalone Next.js app**. It calls Humeo's deployed public
review APIs (`https://humeo.app/api/public/reviews/*`) — no backend changes
needed in the Humeo monorepo for v1.

The original Humeo codebase lives at `reference/` for type / pattern lookups.
It's gitignored, so it never ships with this repo.

---

## Tech stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **`@ffmpeg/ffmpeg`** (ffmpeg.wasm) — client-side concatenation of the 5 recorded clips into one video before upload
- **`getUserMedia` + `MediaRecorder`** — standard browser camera APIs (no native install required)
- **`zod`** — shared validation schemas, mirrors the ones in Humeo's `src/lib/reviews/types.ts`

Why a PWA over Expo: the customer-facing flow has to start in a tabletop QR scan
in a cafe. Asking the customer to install an app kills conversion. Browser-based
flow opens in 2 seconds, no install, works on iOS Safari and Android Chrome.

---

## What it does (5 screens)

1. `/` — QR landing context screen (dev-only; in prod, the cafe's QR deep-links straight to `/c/[slug]`)
2. `/c/[slug]` — Cafe landing: brand, big "Free matcha, on the house" headline, consent copy, primary CTA
3. `/c/[slug]/record` — Guided 5-clip recorder (video preview → prompt card → record button → auto-advance)
4. `/preview` — ffmpeg.wasm stitches the clips, uploads to Humeo, polls submission status, shows the rendered preview
5. `/reward` — Confetti, reward code in a dark card, "show this screen to your server"

The `[slug]` route is a real Next.js dynamic segment that fetches its campaign
from `${NEXT_PUBLIC_HUMEO_API_URL}/api/public/reviews/campaign/[slug]`, the same
endpoint Humeo's existing public review flow already uses
(`reference/src/app/api/public/reviews/campaign/[slug]/route.ts`).

---

## Getting started

```bash
cp .env.example .env.local      # then edit NEXT_PUBLIC_HUMEO_API_URL if needed
npm install
npm run dev                     # http://localhost:3000
```

### Test on your phone (recommended)

`getUserMedia` only works on `https://` (or `http://localhost`). Easiest path:

```bash
npx ngrok http 3000
```

Then open the `https://*.ngrok-free.app` URL on your phone, scan the QR or load
`/c/sageandstone` directly. iOS Safari and Android Chrome will prompt for
camera and mic. Allow both.

---

## How it talks to Humeo

```
matcha-moments PWA                   Humeo backend (deployed)
-----------------                    ------------------------
GET  /c/[slug]            ──────►    GET  /api/public/reviews/campaign/[slug]
                          ◄──────    { id, slug, restaurantName, rulesConfig, ... }

stitch clips locally (ffmpeg.wasm)

POST /preview submit      ──────►    POST /api/public/reviews/submit
                                       FormData: video, slug, consentAccepted,
                                                 deviceKey, durationSeconds, tableId
                          ◄──────    { submissionId, status, decision, reward }

poll every 6s             ──────►    GET  /api/public/reviews/submission/[id]?slug=...
                          ◄──────    { status, decision, feedback, reward }
```

`src/lib/humeoApi.ts` is the only place that fetches from `humeo.app`. If
Humeo's `review_campaigns` row doesn't yet have `mode` / `prompts` / `theme`
columns, `getCampaign()` augments the response with a hardcoded fallback
prompts list — flagged with `TODO` so we drop it once the BE migration ships.

### Fields Humeo's BE will eventually need

To remove the fallback, Humeo's `review_campaigns` schema would add:
- `mode text` — `'single_take' | 'guided_clips'`
- `prompts jsonb` — array of `{ step, title, tip, camera, maxSeconds }`
- `theme text` — `'default' | 'cafe-cream'`

Until then the matcha-moments app silently injects the cafe defaults.

---

## Why client-side ffmpeg.wasm?

Humeo's `/api/public/reviews/submit` accepts a single video file. We want a
multi-clip guided UX without forking Humeo's submit flow. Stitching the 5
recordings in the browser solves that with zero backend changes.

Trade-offs:
- 8MB WASM download, lazy-loaded only after the customer finishes recording
- 3-6 seconds of stitch time on a modern phone for ~50s of total video
- `next.config.js` sets COOP/COEP headers (required for `SharedArrayBuffer`)

If cafe staff start hearing complaints about phone heat, swap to a
multi-clip upload + server-side ffmpeg endpoint. Humeo's worker
(`reference/src/lib/server/processInterview.ts`) already uses ffmpeg, so the
migration is mostly a new submit endpoint.

---

## Project layout

```
src/
  app/
    layout.tsx                    Fonts (Fraunces / DM Sans / DM Mono), global CSS
    page.tsx                      QR landing (dev-only)
    c/[slug]/
      page.tsx                    Server component — fetches campaign
      LandingClient.tsx           Cafe landing screen
      record/
        page.tsx                  Server component — fetches campaign
        GuidedRecordingClient.tsx 5-clip guided recorder
    preview/page.tsx              Stitch + upload + preview
    reward/page.tsx               Reward code reveal
    globals.css
  components/                     Button, MatchaCircle, ProgressPips, PromptCard,
                                  RecordButton, RecordingBadge, RenderShimmer,
                                  Confetti, RewardCard
  hooks/
    useGuidedRecording.ts         getUserMedia + MediaRecorder + hard cap
    useSubmissionPolling.ts       Mirrors Humeo's PublicReviewRecordingClient polling
  lib/
    humeoApi.ts                   Typed fetch wrapper for /api/public/reviews/*
    ffmpeg.ts                     ffmpeg.wasm concatClips() helper
    recordingStore.ts             In-tab clip store, useRecordingStore() hook
    utils.ts                      cn(), ensureDeviceKey()
    reviews/
      types.ts                    Zod schemas + types (mirrors Humeo's)
      public.ts                   Display helpers (verbatim from Humeo)
reference/                        Humeo's repo (gitignored, read-only library)
matcha-moments-prototype_2.html   Original wireframe (visual spec)
```

---

## Out of scope (v1)

- Per-clip re-record (current "re-record" wipes all 5 — flagged as a known
  product call in `matcha-moments-prototype_2.html` dev notes)
- Email-me-a-copy of the final video
- Staff-side redemption screen
- Reward expiry / redemption tracking
- Native iOS/Android wrapping (Humeo can ship this as a Capacitor or PWA-installed shortcut later)

---

## Deploying

Vercel — connect this repo, set `NEXT_PUBLIC_HUMEO_API_URL=https://humeo.app`,
done. The COOP/COEP headers in `next.config.js` carry over on Vercel.

CORS: confirm `humeo.app` allow-lists this app's deploy domain
(e.g. `matcha.humeo.app`) on the `/api/public/reviews/*` routes.
