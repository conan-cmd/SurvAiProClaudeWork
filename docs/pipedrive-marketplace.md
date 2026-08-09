# Pipedrive Marketplace — Submission Pack for SurvAIPro

Everything needed to register and list the SurvAIPro app. Legal pages are live at
`/privacy` and `/terms` (fill in the `[bracketed]` company details first).

- **Privacy Policy URL:** https://survai-pro.vercel.app/privacy
- **Terms of Service URL:** https://survai-pro.vercel.app/terms
- **OAuth callback URL:** https://survai-pro.vercel.app/api/pipedrive/oauth/callback
- **Website URL:** https://survai-pro.vercel.app
- **Support/contact:** [support@lbcclean.co.uk]

---

## 1. Listing copy

**App name:** SurvAIPro

**Category:** Lead generation / Proposals & quotes (choose the closest in Developer Hub)

**Short summary (~150 chars):**
> Turn a site survey into an AI-drafted proposal, e-signature and deposit — and keep your Pipedrive pipeline updated automatically.

**Full description (~1500 chars):**
> SurvAIPro helps exterior-cleaning and trade firms win more work with less admin. Capture a site survey on your phone — photos, voice notes, measurements from an aerial map — and SurvAIPro drafts a branded client proposal with AI in seconds. Send it, take an e-signature, and collect a deposit, all in one flow.
>
> With the Pipedrive integration, your CRM stays up to date without double entry:
> • When you send a proposal, SurvAIPro creates the organisation, person and deal in Pipedrive automatically.
> • The deal value tracks your quote, and the deal is marked won when the client accepts (or lost if you mark it lost).
> • A note with a link back to the proposal is added to the deal.
> • Starting a new survey, you can import an existing Pipedrive contact so client details prefill instantly.
>
> Spend your time on site, not in spreadsheets — SurvAIPro and Pipedrive keep your quotes and pipeline in sync.

**Setup / install instructions:**
> 1. Install the app and authorise SurvAIPro to access your Pipedrive.
> 2. In SurvAIPro, go to Settings → Pipedrive CRM to confirm you're connected.
> 3. Send a proposal — the matching deal, person and organisation appear in Pipedrive.
> 4. When starting a survey, use "Import from Pipedrive" to pull in an existing contact.

---

## 2. Scopes requested (and why)

| Scope | Why SurvAIPro needs it |
|---|---|
| `deals:full` | Create a deal when a proposal is sent, update its value and status (won/lost), and add a note linking to the proposal. |
| `contacts:full` | Create/update the organisation and person for the deal, and read contacts so users can import one to start a survey. (Persons and organisations both live under `contacts`.) |
| `base` | Default — user/account context. |

> Keep it to the minimum above. Only add `activities:full` if we later create activities/tasks.

---

## 3. Assets to prepare

- **App icon:** square, works on dark backgrounds (use the SurvAIPro mark). PNG.
- **Screenshots (3–5, annotated):**
  1. Survey capture on mobile (photos + notes).
  2. AI-drafted proposal in the editor.
  3. The Pipedrive **deal auto-created** from a sent proposal (show person + org + value + note).
  4. "Import from Pipedrive" contact search on the new-survey screen.
  5. Settings → Pipedrive CRM "Connected" state.
- **Demo video (1–2 min):** show connect → send a proposal in SurvAIPro → the deal appearing in Pipedrive → importing a contact. Narrate what each scope is used for (deals + contacts).
- **Reviewer test account:** a SurvAIPro login with sample data + a Pipedrive test company, credentials shared in the submission.

---

## 4. Step-by-step submission

1. **Developer Sandbox** — sign up (free) at developers.pipedrive.com; choose "I'm building an app that integrates with Pipedrive".
2. **Developer Hub** → **Create an app**. Start as a **Private (unlisted)** app to pilot with LBC (no review), or **Public** for the Marketplace.
3. **Basics:** App name `SurvAIPro`; OAuth callback URL `https://survai-pro.vercel.app/api/pipedrive/oauth/callback`.
4. **Scopes:** `deals:full`, `contacts:full` (+ `base`).
5. **Copy** the Client ID and Client Secret.
6. **Vercel → Settings → Environment Variables (Production):** add `PIPEDRIVE_CLIENT_ID` and `PIPEDRIVE_CLIENT_SECRET`, then **redeploy**.
7. **Test:** Settings → Pipedrive CRM → "Connect with Pipedrive" → authorise → send a test proposal → confirm the deal in Pipedrive. Test uninstall (Pipedrive → installed apps → uninstall) and confirm the connection clears.
8. **Listing content:** fill in short/full description, category, icon, 3–5 screenshots, install instructions, **Privacy Policy URL** `/privacy`, **Terms URL** `/terms`, website, support contact.
9. **Legal:** sign the Developer Partner Agreement. (Confirm any paid-app revenue share in that agreement — it isn't published publicly.)
10. **Submit for review** (public apps). Current turnaround: up to ~21 business days.

---

## 5. Before you publish — checklist

- [ ] Fill in the `[bracketed]` details in `/privacy` and `/terms` (company legal name, address, company number, contact emails) and have a solicitor review them.
- [ ] Confirm `PUBLIC_BASE_URL` / production domain matches the callback URL registered in Pipedrive.
- [ ] Decide public vs private; pilot privately first if unsure.
- [ ] Prepare icon, screenshots, demo video, reviewer test account.
- [ ] Confirm revenue-share terms in the Developer Partner Agreement.

> Note: this is guidance, not legal advice. Have the privacy policy and terms reviewed before publishing.
