# SurvAIPro — Project Brief

Consolidated brief loaded automatically every Claude Code session. It exists so
context stops getting lost between sessions. **Keep it current** — when a feature
ships, a key is added, or a decision is made, update the relevant section here.

> ⚠️ **Always launch Claude Code from `C:\Users\USER\.claude\Git\survai-pro`** (the
> repo root), not the parent `…\.claude\Git` folder. Session history and memory are
> scoped to the launch folder; using two folders previously split this project's
> history across two places.

## What it is

SurvAIPro is a SaaS for exterior-cleaning firms (first customer: **LBC Clean**,
lbcclean.co.uk) that turns a site survey into a client proposal and on to payment.
Flow: **site survey → AI-drafted proposal → send/share → e-sign → deposit**.
Owner/primary user: **Conan** (conan@lbcclean.co.uk).

## Stack & commands

- **Next.js 14 (App Router) + React 18 + TypeScript**, Tailwind, `sonner` toasts, `lucide-react` icons
- **Prisma + PostgreSQL**; **NextAuth** (credentials); **OpenAI** (transcription, dictation, drafting); **Resend** (email); **Stripe** (deposits); **Google Maps** (geocode, Street View/aerial, Places autocomplete)
- Storage: local (`STORAGE_TYPE=local`) or Vercel Blob
- **Deployed on Vercel** at `survai-pro.vercel.app`

```
npm run dev         # local dev
npm run build       # prisma generate && next build
npm run typecheck   # tsc --noEmit   (run after edits — see note below)
npm run lint
npm run db:push     # push schema to DB
npm run db:studio   # inspect data
```

> Note: `node`/`npx` are not always on the PATH of the non-interactive shell Claude
> uses here; typecheck/build may need to be run by the user in their own terminal.

## Architecture

- `app/(app)/…` — authed UI (dashboard, surveys, proposals, gallery, settings)
- `app/api/…` — route handlers (surveys, proposals, team/invites, geo, organization, stripe pay, share links)
- `app/p/[token]` + `app/api/p/[token]` — public client-facing proposal (accept / pay)
- `lib/` — `email.ts` (Resend), `geo.ts` (Google Maps geocode + imagery), `ai.ts` (OpenAI), `db.ts`, `storage.ts`, `stripe.ts`, `session.ts`
- `components/` — `proposal-document.tsx`, `address-input.tsx`, `pricing-editor.tsx`, etc.
- Prisma models: User, Invite, Organization, GalleryPhoto, SiteSurvey, SurveyPhoto, VoiceNote, Transcript, ProposalTemplate, Proposal, ShareLink, ProposalSection, PricingLineItem

## Environment / secrets (status as of 2026-07-21)

Local values live in `.env` (gitignored). **Production values must be set on Vercel**
by the hosting contractor — the deployed app does not read the local `.env`.

| Var | Purpose | Status |
|---|---|---|
| `DATABASE_URL` | Postgres | ✅ set (local) |
| `NEXTAUTH_SECRET` | auth | ✅ |
| `NEXTAUTH_URL` | auth/callbacks + email links | ⚠️ currently a temporary `trycloudflare.com` tunnel — breaks on restart; needs a stable domain for prod |
| `OPENAI_API_KEY` | AI features | ✅ set (verify billing/credit) |
| `GOOGLE_MAPS_API_KEY` | geocode, imagery, autocomplete | ✅ set |
| `WHAT3WORDS_API_KEY` | w3w address | ✅ key `FKJ7G3FG` set and **verified working** (convert-to-3wa returns results). Earlier key `2QDI2U3F` was QuotaExceeded — replaced |
| `RESEND_API_KEY` | email sending | ✅ **already set on Vercel (~2026-07-19) and works.** Local `.env` is empty (fine — local dev only). The real past blocker was the unverified sender domain, NOT the key |
| `EMAIL_FROM` | verified sender | ✅ **already set on Vercel (~2026-07-19)** + local (`LBC Clean <proposals@lbcclean.co.uk>`). Just confirm the Vercel value is a sender on the now-verified `lbcclean.co.uk` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage | ✅ set on Vercel (prod uploads use Blob) |
| `STRIPE_SECRET_KEY` | deposits | ✅ test key |

## Known gotchas / decisions

- **DNS for lbcclean.co.uk is on CLOUDFLARE, not IONOS.** Nameservers `jakub/piper.ns.cloudflare.com`. Records added in the IONOS panel are inert. The Resend records (MX `send`, TXT `send` SPF, TXT `resend._domainkey` DKIM) **are now live in Cloudflare (verified 2026-07-21)** + DMARC present — hit Verify in Resend. See [[email-deliverability-setup]].
- **Email:** `lib/email.ts` never falls back to Resend's sandbox in production — it throws if `EMAIL_FROM` is unset. Invite sends **swallow errors** (return a share link instead), so a failed send can look silent.
- **Stripe:** deposits currently go to one platform account; per-user Stripe Connect not built. See [[stripe-connect-pending]].
- **Team accounts:** email invites + join flow, per-user sign-off (name/headshot/signature) on proposals they create, creator attribution, dashboard metrics filterable by team member.

## Feature status — outstanding

- **what3words** — integration not built; key present but plan inactive. See [[what3words-geo-feature]].
- **Lat/lng on proposal** — coordinates are stored on `SiteSurvey` but not rendered on `components/proposal-document.tsx`.
- **Settings toggles** — show/hide coordinates & w3w on proposals: not built.
- **Client-selectable optional items — BUILT 2026-07-21.** Client ticks optional extras on `app/p/[token]`, live total updates, signs for that total. Selected IDs + `agreedTotal` persisted on `Proposal` at sign time (server recomputes the total, never trusts the client); deposit uses `agreedTotal`. ⚠️ **Needs `npm run db:push`** (added `Proposal.selectedOptionalIds`, `Proposal.agreedTotal`) **+ redeploy**. Files: `signature-pad.tsx`, `p/[token]/page.tsx`, `api/p/[token]/accept/route.ts`, `proposal-document.tsx` (new `hideOptionalExtras`), `lib/utils.ts` (new `lineGross`).
- **Photo upload — FIXED 2026-07-21.** Root cause: large iPhone/HEIC camera-roll photos exceeded Vercel's ~4.5MB serverless body cap; the multipart route's non-JSON error then made `res.json()` throw the opaque *"the string didn't match the expected pattern"* on iOS Safari. Fix: `photo-manager.tsx` now streams direct to Blob (`@vercel/blob/client` → `/api/blob/upload`, which now whitelists image types incl. `image/heic` + octet-stream) and creates records via new route `api/surveys/[surveyId]/photos/from-blob`, with a safe multipart fallback for local/small files and robust error parsing. ⚠️ Needs **redeploy** to reach clients (server code + new route; Blob only active on Vercel).
- **HEIC display follow-up (not done)** — HEIC photos now upload, but `<img>` won't render HEIC on Chrome/Android, so clients on non-Safari browsers may see broken proposal images. Proper fix = server-side HEIC→JPEG conversion on upload (needs an image lib, e.g. sharp/heic-convert — not currently a dep).
- **T&C accidental-send guard (idea, for later)** — replace the "this is a general template" disclaimer text on terms & conditions with a **tick-to-accept popup** the user must confirm before sending, so the template can't go out unreviewed by mistake. Preferred over passive text.
- **Manual location fallback** — for addresses Google can't geocode (e.g. "West Reservoir Water Sports Centre, N4 2HA"): not built. Note the address box is already free-text, so typing works; only the geo/imagery step silently no-ops.
- **Clipboard fix (done 2026-07-21)** — proposal Share now shows a copyable box + Copy/native-Share buttons (iOS Safari lost the user gesture after the async link creation and silently failed while claiming success). Same bug pattern still present in `app/(app)/settings/page.tsx:102` (team-invite copy).

## Conventions

- Match surrounding code style; comment density is light and purposeful.
- API routes validate with `zod`, return `{ error }` + status on failure.
- Best-effort side effects (imagery, email on invites) must never fail the main action.
- `lib/*` server modules use `import "server-only"`.
