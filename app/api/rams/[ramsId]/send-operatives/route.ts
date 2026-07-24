import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSend, sendEmail } from "@/lib/email"
import { publicBaseUrl } from "@/lib/public-url"

type Hazard = {
  hazard: string; whoAtRisk: string; controls: string; ppe: string
  preP?: number; preS?: number; resP?: number; resS?: number
}
type Operative = { name: string; phone: string; email: string }

function parse<T>(s: string | null, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback } catch { return fallback }
}

// RR colour bands (P × S), matching LBC's risk-ranking key.
function band(v: number): { bg: string; fg: string; label: string } {
  if (!v) return { bg: "#f3f4f6", fg: "#9ca3af", label: "—" }
  if (v >= 16) return { bg: "#dc2626", fg: "#ffffff", label: "Urgent" }
  if (v >= 11) return { bg: "#f97316", fg: "#ffffff", label: "High" }
  if (v >= 8) return { bg: "#facc15", fg: "#111827", label: "Medium" }
  if (v >= 2) return { bg: "#22c55e", fg: "#ffffff", label: "Low" }
  return { bg: "#16a34a", fg: "#ffffff", label: "No action" }
}

const esc = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Emails the full RAMS to the operatives listed on the job so site staff have it
// on their phones before works commence.
export async function POST(
  _request: NextRequest,
  { params }: { params: { ramsId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!(await canSend(user.id))) {
    return NextResponse.json(
      { error: "Email isn't set up yet — connect your email in Settings to send." },
      { status: 503 }
    )
  }

  const rams = await db.rams.findFirst({
    where: { id: params.ramsId, organizationId: user.organizationId },
    include: {
      survey: { select: { title: true, clientName: true, clientAddress: true, serviceType: true } },
      organization: { select: { name: true, phone: true, email: true } },
    },
  })
  if (!rams) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Ensure a public sign link exists so recipients can read & sign from the email.
  let token = rams.publicToken
  if (!token) {
    token = randomBytes(12).toString("base64url")
    await db.rams.update({ where: { id: rams.id }, data: { publicToken: token } })
  }
  const signUrl = `${publicBaseUrl(new URL(_request.url).origin)}/r/${token}`

  const sections = parse<Record<string, unknown>>(rams.sections, {})
  const operatives = (Array.isArray(sections.operatives) ? sections.operatives : []) as Operative[]
  const recipients = operatives.filter((o) => o.email && /.+@.+\..+/.test(o.email))
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Add at least one operative with an email address first." },
      { status: 400 }
    )
  }

  const hazards = parse<Hazard[]>(rams.hazards, [])
  const methodRaw = parse<unknown>(rams.methodStatement, [])
  const method: { title: string; steps: string[] }[] = Array.isArray(methodRaw)
    ? (typeof methodRaw[0] === "string"
        ? [{ title: "", steps: (methodRaw as string[]).filter((s) => s && s.trim()) }]
        : (methodRaw as { title: string; steps: string[] }[]).map((g) => ({ title: g.title || "", steps: (g.steps || []).filter((s) => s && s.trim()) })).filter((g) => g.steps.length))
    : []
  const ppe = parse<string[]>(rams.ppe, [])
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).filter((x) => x && x.trim()) : [])

  const org = rams.organization
  const hazardRows = hazards.map((h, i) => {
    const pre = (h.preP || 0) * (h.preS || 0)
    const res = (h.resP || 0) * (h.resS || 0)
    const pb = band(pre), rb = band(res)
    const badge = (v: number, b: { bg: string; fg: string; label: string }) =>
      v ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${b.bg};color:${b.fg};font-weight:700;font-size:12px">${v} · ${b.label}</span>` : "—"
    return `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top">${i + 1}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top">
          <strong>${esc(h.hazard)}</strong>
          ${h.whoAtRisk ? `<div style="color:#6b7280;font-size:13px">Who: ${esc(h.whoAtRisk)}</div>` : ""}
          <div style="font-size:13px;margin-top:4px">${esc(h.controls)}</div>
          ${h.ppe ? `<div style="color:#6b7280;font-size:12px;margin-top:4px">PPE: ${esc(h.ppe)}</div>` : ""}
        </td>
        <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;text-align:center;white-space:nowrap">${badge(pre, pb)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;text-align:center;white-space:nowrap">${badge(res, rb)}</td>
      </tr>`
  }).join("")

  const ul = (items: string[]) =>
    items.length ? `<ul style="margin:4px 0 0;padding-left:20px">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""
  const section = (title: string, inner: string) =>
    inner ? `<h3 style="color:#0f172a;margin:22px 0 6px;font-size:16px">${title}</h3>${inner}` : ""

  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:640px">
    <div style="border-bottom:3px solid #16a34a;padding-bottom:8px;margin-bottom:12px">
      <div style="font-weight:800;color:#0f172a;font-size:18px">${esc(org.name)}</div>
      <div style="color:#6b7280;font-size:12px">${[org.phone, org.email].filter(Boolean).map((x) => esc(x || "")).join(" · ")}</div>
    </div>
    <h2 style="margin:0 0 4px">Risk Assessment &amp; Method Statement</h2>
    <div style="color:#6b7280;font-size:13px">${esc(rams.survey.title)}</div>

    <table style="width:100%;margin-top:12px;font-size:13px;border-collapse:collapse">
      <tr><td style="color:#6b7280;padding:2px 8px 2px 0;width:120px">Client</td><td>${esc(rams.survey.clientName)}</td></tr>
      <tr><td style="color:#6b7280;padding:2px 8px 2px 0">Site</td><td>${esc(rams.survey.clientAddress)}</td></tr>
      <tr><td style="color:#6b7280;padding:2px 8px 2px 0">Activity</td><td>${esc(String(sections.activity || rams.survey.serviceType || ""))}</td></tr>
      ${sections.siteSupervisor ? `<tr><td style="color:#6b7280;padding:2px 8px 2px 0">Supervisor</td><td>${esc(String(sections.siteSupervisor))}</td></tr>` : ""}
      ${sections.emergencyContacts ? `<tr><td style="color:#6b7280;padding:2px 8px 2px 0">Emergency</td><td>${esc(String(sections.emergencyContacts))}</td></tr>` : ""}
      ${sections.nearestHospital ? `<tr><td style="color:#6b7280;padding:2px 8px 2px 0">Nearest A&amp;E</td><td>${esc(String(sections.nearestHospital))}</td></tr>` : ""}
    </table>

    ${sections.descriptionOfWorks ? section("Description of works", `<div>${esc(String(sections.descriptionOfWorks))}</div>`) : ""}
    ${section("Personnel &amp; responsibilities", ul(list(sections.responsibilities)))}
    ${section("Equipment", ul(list(sections.equipment)))}
    ${section("PPE required", ul(ppe.filter((x) => x && x.trim())))}

    ${hazardRows ? `
    <h3 style="color:#0f172a;margin:22px 0 6px;font-size:16px">Main hazards &amp; control measures</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f9fafb">
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">#</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Hazard &amp; controls</th>
        <th style="padding:8px;border:1px solid #e5e7eb">Pre-control</th>
        <th style="padding:8px;border:1px solid #e5e7eb">Residual</th>
      </tr>
      ${hazardRows}
    </table>` : ""}

    ${method.length ? `
    <h3 style="color:#0f172a;margin:22px 0 6px;font-size:16px">Method statement</h3>
    ${method.map((g, gi) => `
      <div style="font-weight:600;margin:10px 0 2px">Step ${gi + 1}${g.title ? ` – ${esc(g.title)}` : ""}</div>
      <ul style="margin:2px 0 0;padding-left:20px">${g.steps.map((s) => `<li style="margin-bottom:3px">${esc(s)}</li>`).join("")}</ul>`).join("")}` : ""}

    ${section("Environmental controls", ul(list(sections.environmentalControls)))}
    ${section("Emergency procedures", ul(list(sections.emergencyProcedures)))}
    ${section("COSHH &amp; hazardous substances", ul(list(sections.coshh)))}
    ${section("Competency", ul(list(sections.competency)))}

    <div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px;font-size:13px;color:#374151;text-align:center">
      <p style="margin:0 0 12px">Please confirm you have read and understood this RAMS by signing:</p>
      <a href="${signUrl}" style="display:inline-block;background:#2563EB;color:#fff;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:8px">Review &amp; sign the RAMS &rarr;</a>
      <p style="margin:12px 0 0;color:#9ca3af;font-size:12px">Any questions, contact your site supervisor before works commence.</p>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:16px">Sent via SurvAIPro on behalf of ${esc(org.name)}.</p>
  </div>`

  const subject = `RAMS — ${rams.survey.title}`
  const sent: string[] = []
  const failed: string[] = []
  for (const op of recipients) {
    try {
      await sendEmail({
        to: op.email,
        replyTo: org.email || user.email,
        subject,
        html,
        fromUserId: user.id,
      })
      sent.push(op.email)
    } catch (e) {
      console.error("RAMS operative send failed:", op.email, e)
      failed.push(op.email)
    }
  }

  if (sent.length === 0) {
    return NextResponse.json({ error: "Couldn't send to any operatives — check the email setup." }, { status: 500 })
  }
  return NextResponse.json({ sent: sent.length, failed })
}
