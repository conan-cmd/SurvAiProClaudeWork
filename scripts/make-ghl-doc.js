// Generates a Word .docx (OOXML) brief for the GoHighLevel integrator.
// No external deps: builds the document XML and a STORED zip by hand.
const fs = require("fs")
const path = require("path")

const NAVY = "1F2A44", BLUE = "2563EB", GREY = "6B7280"
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function run(text, o = {}) {
  const rpr = []
  if (o.bold) rpr.push("<w:b/>")
  if (o.italic) rpr.push("<w:i/>")
  if (o.size) rpr.push(`<w:sz w:val="${o.size}"/>`)
  if (o.color) rpr.push(`<w:color w:val="${o.color}"/>`)
  if (o.font) rpr.push(`<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}"/>`)
  const rprXml = rpr.length ? `<w:rPr>${rpr.join("")}</w:rPr>` : ""
  return `<w:r>${rprXml}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}
function para(runs, o = {}) {
  const ppr = []
  const spacing = `<w:spacing w:before="${o.before || 0}" w:after="${o.after != null ? o.after : 120}"/>`
  ppr.push(spacing)
  if (o.indent) ppr.push(`<w:ind w:left="${o.indent}"/>`)
  if (o.shade) ppr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`)
  const pprXml = `<w:pPr>${ppr.join("")}</w:pPr>`
  const body = Array.isArray(runs) ? runs.join("") : runs
  return `<w:p>${pprXml}${body}</w:p>`
}

// content helpers
const B = []
const title = (t) => B.push(para(run(t, { bold: true, size: 40, color: NAVY }), { after: 80 }))
const h1 = (t) => B.push(para(run(t, { bold: true, size: 30, color: NAVY }), { before: 260, after: 100 }))
const h2 = (t) => B.push(para(run(t, { bold: true, size: 24, color: BLUE }), { before: 180, after: 60 }))
const p = (t) => B.push(para(run(t, { size: 22 })))
const note = (t) => B.push(para(run(t, { size: 20, italic: true, color: GREY })))
const bullet = (t, bold) => B.push(para(run("•  ", { size: 22, color: BLUE, bold: true }) + run(t, { size: 22, bold: !!bold }), { indent: 360, after: 60 }))
const code = (t) => B.push(para(run(t, { size: 18, font: "Consolas" }), { shade: "F2F2F2", after: 40 }))
const spacer = () => B.push(para(run("", {}), { after: 40 }))

// ---------- DOCUMENT CONTENT ----------
title("SurvAIPro × GoHighLevel — Integration Brief")
note("Prepared for the GHL setup — everything you need to build the lifecycle sequences. Questions to Conan (conan@lbcclean.co.uk).")

h1("1. What this is")
p("SurvAIPro is a SaaS for exterior-cleaning / trades firms (AI-drafted proposals, e-sign, deposits, RAMS). It sells on a 14-day free trial (card required), then Monthly £49 or Annual £499 for the first 100 founding members, and £99 / £990 after that.")
p("The app is the source of truth for subscription status. Whenever something happens (trial starts, trial ending, cancels, payment fails, converts), the app POSTs an event to a GoHighLevel Inbound Webhook. Your job is to build the workflows that react to those events with email + SMS.")

h1("2. Connecting it (one-time)")
bullet("In GHL, create a Workflow with the trigger “Inbound Webhook”. Copy the webhook URL it gives you.", true)
bullet("Send that URL to Conan — he sets it as GHL_WEBHOOK_URL on the app host (Vercel). Nothing else is needed on your side to receive data.", true)
bullet("To capture the payload shape in GHL: after the URL is set, Conan triggers a test trial signup; the event lands in your workflow so you can map the fields.", true)

h1("3. The webhook payload")
p("Each event is a JSON POST with these fields:")
code('{ "event": "trial_started", "email": "jo@firm.co.uk", "name": "Jo Bloggs",')
code('  "company": "Bloggs Cleaning", "plan": "monthly", "status": "trialing",')
code('  "billingUrl": "https://survai-pro.vercel.app/settings" }')
spacer()
bullet("event — the lifecycle event (see section 4). Branch your workflows on this.")
bullet("email — match or create the contact on this.")
bullet("name — contact full name.  company — business name.")
bullet("plan — monthly | annual | (empty).  status — Stripe status (trialing/active/past_due/canceled).")
bullet("billingUrl — link to send them to update card / reactivate. Use in email + SMS.")

h1("4. Events you'll receive")
h2("trial_started")
p("When: signup + card added, 14-day trial begins. Do: onboarding sequence (welcome, get-first-proposal-out, tips).")
h2("trial_ending")
p("When: 3 days before the trial ends. Do: value recap + “keep your founding £49” nudge with billingUrl.")
h2("subscription_active")
p("When: trial converts to paid, or a renewal succeeds. Do: thank-you + power-user tips + ask for review/referral.")
h2("subscription_canceled")
p("When: they cancel (during trial or a paid plan). Do: win-back sequence + reactivate link (billingUrl).")
h2("subscription_paused")
p("When: they choose to PAUSE (1–3 months) instead of cancelling — billing + access are suspended, then auto-resume. Do: a light “enjoy your break” note, then a “you resume soon” nudge near the resume date. Keep it warm, not salesy.")
h2("payment_failed")
p("When: a card is declined / subscription past due. Do: dunning — SMS + email to update card (billingUrl).")
note("For subscription_canceled and subscription_paused, the reason the user selected is passed in the “status” field as “reason: <their choice>”. Use it to branch messaging (e.g. price objection vs missing feature).")

h1("5. Recommended sequences + starter copy")
note("Copy below is a starting point — adapt tone/timing. Merge fields shown as {name}, {company}, {billingUrl}.")

h2("A. Trial onboarding  (trigger: trial_started)")
bullet("Day 0 — Email — Subject: “Welcome to SurvAIPro 🎉 Let's get your first proposal out”")
p("Hi {name}, welcome aboard! You've got 14 days of full access. Fastest win: do a 2-minute site survey and let the AI draft the proposal for you. [Create your first proposal]. Reply to this email any time you're stuck — a real person answers.")
bullet("Day 0 — SMS")
p("Welcome to SurvAIPro, {name}! Your 14-day trial is live. Try building your first AI proposal — takes 2 mins. Need a hand? Just reply.")
bullet("Day 2 — Email — Subject: “3 things that win more jobs with SurvAIPro”")
p("Tips: 1) Add photos + aerial measurements on site — they flow straight into your pricing. 2) Take a deposit at sign-off. 3) Generate RAMS in one tap. [Watch 60-sec demo]")
bullet("Day 5 — Email — Subject: “How {similar firm} quotes in half the time”  (social proof / short case study)")
bullet("Day 10 — Email + SMS — Subject: “Your trial ends in 4 days — lock in £49/mo”  (backup to trial_ending)")

h2("B. Trial ending  (trigger: trial_ending, ~day 11)")
bullet("Email — Subject: “Your SurvAIPro trial ends in 3 days”")
p("Hi {name}, hope you've felt the difference. Keep your founding price of £49/mo (it rises to £99 once the first 100 spots go). Nothing to do if you're staying — or manage your plan here: {billingUrl}")
bullet("SMS")
p("Hi {name}, your SurvAIPro trial ends in 3 days. Keep your founding £49/mo before it goes to £99: {billingUrl}")

h2("C. Win-back  (trigger: subscription_canceled)")
bullet("Immediate — Email — Subject: “Sorry to see you go — can we ask why?”")
p("Hi {name}, your account and data are safe for 30 days. Would you tell us what was missing? [Too expensive] [Not enough time] [Missing a feature] [Just testing]. Changed your mind? Reactivate in one click: {billingUrl}")
bullet("Day 1 — SMS")
p("Hi {name}, you cancelled SurvAIPro — no worries, your data's safe for 30 days. If you'd like to come back: {billingUrl}")
bullet("Day 3 — Email — objection handling (price vs a single extra job pays for a year; offer a 10-min setup call).")
bullet("Day 7 — Email — Subject: “Come back — first month on us”  (coupon code, e.g. COMEBACK).")
bullet("Day 30 — Email — last call before data is removed.")

h2("D. Dunning / failed payment  (trigger: payment_failed)")
bullet("Immediate — SMS")
p("Hi {name}, your SurvAIPro payment didn't go through. Update your card to keep access: {billingUrl}")
bullet("Immediate — Email — Subject: “Your payment failed — quick fix”")
p("Hi {name}, we couldn't take your latest payment. Update your card here and you're sorted: {billingUrl}. We'll retry automatically over the next few days.")
bullet("Day 2 & Day 4 — reminder email/SMS if still unpaid.")

h1("6. Contact model (suggested)")
bullet("Match/create the contact by email.")
bullet("Add a tag per event: surv_trial, surv_trial_ending, surv_active, surv_canceled, surv_payment_failed.")
bullet("Custom fields: “SurvAIPro Plan” (monthly/annual) and “SurvAIPro Status”. Update on each event.")
bullet("Remove/win-back tags when subscription_active fires again (i.e. they came back).")

h1("7. Deliverability & compliance")
bullet("Send email from a verified/warmed domain; include an unsubscribe link.")
bullet("SMS from a registered number; honour STOP; keep to reasonable hours.")

h1("8. Also on the Stripe side (Conan will enable)")
bullet("Stripe Smart Retries + built-in dunning emails are ON as a belt-and-braces layer for failed payments (independent of GHL).")
bullet("So payment_failed recovery happens both via Stripe's own retries and your GHL SMS/email.")

h1("9. What Conan will provide to finish setup")
bullet("You: the GHL Inbound Webhook URL.")
bullet("Conan: sets GHL_WEBHOOK_URL on the host + confirms the Stripe→app webhook is live so events flow.")
note("Once both are in place, the whole chain runs automatically: Stripe → SurvAIPro → GHL → your sequences.")

// ---------- BUILD DOCX ----------
const documentXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  "<w:body>" + B.join("") +
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:bottom="1134" w:left="1134" w:right="1134"/></w:sectPr>' +
  "</w:body></w:document>"

const contentTypes =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>"

const rels =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>"

const files = [
  { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
  { name: "_rels/.rels", data: Buffer.from(rels) },
  { name: "word/document.xml", data: Buffer.from(documentXml) },
]

// CRC32
const crcTable = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let crc = 0 ^ -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

// Minimal STORED zip
const locals = []
const centrals = []
let offset = 0
for (const f of files) {
  const nameBuf = Buffer.from(f.name)
  const crc = crc32(f.data)
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0)
  lh.writeUInt16LE(20, 4)
  lh.writeUInt16LE(0, 6)
  lh.writeUInt16LE(0, 8) // stored
  lh.writeUInt16LE(0, 10)
  lh.writeUInt16LE(0x21, 12) // date
  lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(f.data.length, 18)
  lh.writeUInt32LE(f.data.length, 22)
  lh.writeUInt16LE(nameBuf.length, 26)
  lh.writeUInt16LE(0, 28)
  locals.push(lh, nameBuf, f.data)

  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0)
  ch.writeUInt16LE(20, 4)
  ch.writeUInt16LE(20, 6)
  ch.writeUInt16LE(0, 8)
  ch.writeUInt16LE(0, 10)
  ch.writeUInt16LE(0, 12)
  ch.writeUInt16LE(0x21, 14)
  ch.writeUInt32LE(crc, 16)
  ch.writeUInt32LE(f.data.length, 20)
  ch.writeUInt32LE(f.data.length, 24)
  ch.writeUInt16LE(nameBuf.length, 28)
  ch.writeUInt16LE(0, 30)
  ch.writeUInt16LE(0, 32)
  ch.writeUInt16LE(0, 34)
  ch.writeUInt16LE(0, 36)
  ch.writeUInt32LE(0, 38)
  ch.writeUInt32LE(offset, 42)
  centrals.push(ch, nameBuf)

  offset += lh.length + nameBuf.length + f.data.length
}
const localPart = Buffer.concat(locals)
const centralPart = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralPart.length, 12)
end.writeUInt32LE(localPart.length, 16)
const zip = Buffer.concat([localPart, centralPart, end])

const out = process.argv[2] || path.join(process.env.USERPROFILE || ".", "Downloads", "SurvAIPro-GHL-Integration-Brief.docx")
fs.writeFileSync(out, zip)
console.log("Wrote", out, "(" + zip.length + " bytes)")
