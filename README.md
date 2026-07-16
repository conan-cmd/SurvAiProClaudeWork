# SurvAIPro

**From Survey to Proposal in Seconds.**

SurvAIPro helps service businesses turn site-survey photos, written notes and voice notes into polished, branded proposals.

## Stack

- Next.js 14 (App Router) + TypeScript + React
- Tailwind CSS (brand: navy `#0F172A`, blue `#2563EB`, green `#10B981`, grey `#F8FAFC`, Inter)
- PostgreSQL + Prisma
- NextAuth (credentials, JWT sessions) with organisation-level data separation
- Vercel Blob for photo/audio/logo storage
- OpenAI: GPT-4 for proposal generation, Whisper for voice-note transcription
- PDF export via print-optimised A4 layout; secure share links via unguessable tokens

## Getting started

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — PostgreSQL connection string
   - `NEXTAUTH_SECRET` — `openssl rand -base64 32`
   - `NEXTAUTH_URL` — `http://localhost:3000`
   - `OPENAI_API_KEY`
   - `BLOB_READ_WRITE_TOKEN` — from Vercel Blob
3. `npm run db:push` (or `db:migrate` for a migration history)
4. `npm run dev`

## Core flow

Sign up → onboarding (company details, branding, tone, AI-drafted reusable sections you review) → create a site survey on your phone → upload photos (caption, reorder, cover, internal-only) → record a voice note → review & approve the transcript → pick a template (Quick Quote / Consultative / Authority — recommended automatically, always overridable) → AI drafts structured sections → edit everything, add pricing (VAT, discounts, optional items) → export PDF or create a 30-day secure share link → track Draft/Ready/Sent/Won/Lost on the dashboard.

## AI guardrails

- The model is instructed never to invent facts or prices.
- Missing info is flagged with `MISSING:` markers surfaced in the editor.
- Voice transcripts must be explicitly approved before they feed generation.
- Nothing is sent to a client without human review — share/PDF are manual actions.

## Deliberately not in v1

RAMS, pricing brain, accounting/CRM integrations, payments, job scheduling, e-signatures.
