import "server-only"
import { db } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/crypto"

// BigChange (JobWatch) survey-booking feed. The office books "survey" jobs in
// BigChange; syncing pulls those jobs into SurvAIPro as scheduled site
// surveys so the surveyor opens the app with the visit already waiting.
// Modern REST API: https://api.bigchange.com, Bearer JWT (client-credentials
// via the auth proxy) + Customer-Id header on every call. Jobs are deduped
// via SiteSurvey.externalBookingRef ("bigchange:<jobId>").

const API_BASE = "https://api.bigchange.com"
// Documented: POST /auth/tokens, form-urlencoded client_credentials grant
// (developers.bigchange.com/docs/rest/auth-proxy/get-an-access-token). The
// standard OAuth paths stay as fallbacks in case it ever moves.
const TOKEN_URLS = [`${API_BASE}/auth/tokens`, `${API_BASE}/connect/token`, `${API_BASE}/oauth/token`]

export type BigChangeConfig = {
  clientId: string
  clientSecret: string
  customerId: string
  jobTypeId?: number
  jobTypeName?: string
}

export function parseBigChangeConfig(encrypted: string | null): BigChangeConfig | null {
  if (!encrypted) return null
  try {
    const cfg = JSON.parse(decryptSecret(encrypted)) as BigChangeConfig
    return cfg.clientId && cfg.clientSecret && cfg.customerId ? cfg : null
  } catch {
    return null
  }
}

export function serializeBigChangeConfig(cfg: BigChangeConfig): string {
  return encryptSecret(JSON.stringify(cfg))
}

async function getToken(cfg: BigChangeConfig): Promise<string> {
  // The auth proxy's exact expectations aren't publicly documented, so both
  // standard client-credentials styles are tried on both endpoint candidates:
  // creds in the form body, then creds as a Basic header.
  const errors: string[] = []
  for (const url of TOKEN_URLS) {
    for (const basic of [false, true]) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(basic
            ? {
                Authorization:
                  "Basic " +
                  Buffer.from(
                    `${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`
                  ).toString("base64"),
              }
            : {}),
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          ...(basic ? {} : { client_id: cfg.clientId, client_secret: cfg.clientSecret }),
        }),
        signal: AbortSignal.timeout(12000),
      })
      const json = (await res.json().catch(() => ({}))) as {
        access_token?: string
        error?: string
        error_description?: string
      }
      if (res.ok && json.access_token) return json.access_token
      errors.push(
        `${res.status}${json.error ? ` ${json.error}` : ""}${json.error_description ? `: ${json.error_description}` : ""} (${new URL(url).pathname}, ${basic ? "basic" : "body"})`
      )
      // Wrong endpoint entirely — no point trying the Basic variant on it.
      if (res.status === 404 || res.status === 405) break
    }
  }
  throw new Error(`BigChange token request failed — ${errors.join("; ")}`)
}

async function bcFetch(cfg: BigChangeConfig, path: string): Promise<unknown> {
  const token = await getToken(cfg)
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Customer-Id": cfg.customerId,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`BigChange returned ${res.status} for ${path}${body ? ` — ${body.slice(0, 160)}` : ""}`)
  }
  return res.json()
}

// Responses vary in wrapping ({items}/{data}/{results} or a bare array).
function asArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[]
  if (v && typeof v === "object") {
    for (const k of ["items", "data", "results", "jobs", "jobTypes"]) {
      const inner = (v as Record<string, unknown>)[k]
      if (Array.isArray(inner)) return inner as Record<string, unknown>[]
    }
  }
  return []
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim()) return v.trim()
    if (typeof v === "number") return String(v)
  }
  return null
}

function pickDate(obj: Record<string, unknown>, keys: string[]): Date | null {
  const s = pickString(obj, keys)
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export async function listJobTypes(cfg: BigChangeConfig): Promise<{ id: number; name: string }[]> {
  const raw = asArray(await bcFetch(cfg, "/v1/jobTypes"))
  return raw
    .map((t) => ({
      id: Number(t.id ?? t.jobTypeId ?? t.typeId),
      name: pickString(t, ["name", "description", "label", "jobTypeName"]) || "",
    }))
    .filter((t) => Number.isFinite(t.id) && t.name)
}

export type SyncResult = {
  fetched: number
  imported: number
  skipped: number
  // When jobs came back but none could be mapped, the first job's keys help
  // diagnose which field names this account actually uses.
  debugKeys?: string[]
}

export async function syncSurveyBookings(orgId: string, userId: string): Promise<SyncResult> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { bigchangeApiKey: true },
  })
  const cfg = parseBigChangeConfig(org?.bigchangeApiKey ?? null)
  if (!cfg) throw new Error("BigChange isn't connected")

  // Resolve the survey job type by name when no id is stored yet.
  let typeId = cfg.jobTypeId
  if (!typeId && cfg.jobTypeName) {
    const types = await listJobTypes(cfg)
    const want = cfg.jobTypeName.toLowerCase()
    typeId = (types.find((t) => t.name.toLowerCase() === want) ||
      types.find((t) => t.name.toLowerCase().includes(want)))?.id
    if (!typeId) {
      throw new Error(
        `No BigChange job type matches "${cfg.jobTypeName}" — available: ${types.map((t) => t.name).join(", ").slice(0, 300)}`
      )
    }
  }

  const query = (page: number) =>
    `/v1/jobs?pageNumber=${page}&pageSize=100${typeId ? `&typeId=${typeId}` : ""}`

  let fetched = 0
  let imported = 0
  let skipped = 0
  let debugKeys: string[] | undefined

  for (let page = 1; page <= 5; page++) {
    const jobs = asArray(await bcFetch(cfg, query(page)))
    if (!jobs.length) break
    fetched += jobs.length

    for (const job of jobs) {
      const jobId = pickString(job, ["id", "jobId", "jobID"])
      if (!jobId) continue
      const ref = `bigchange:${jobId}`
      const existing = await db.siteSurvey.findUnique({ where: { externalBookingRef: ref }, select: { id: true } })
      if (existing) {
        skipped++
        continue
      }

      const clientName =
        pickString(job, ["contactName", "contactPersonName", "customerName", "personName"]) || "BigChange booking"
      const company = pickString(job, ["contactParentName", "companyName", "contactCompanyName"])
      const addressParts = [
        pickString(job, ["address", "contactAddress", "location", "street"]),
        pickString(job, ["postcode", "postCode", "contactPostcode", "zip"]),
      ].filter(Boolean)
      const scheduledAt =
        pickDate(job, ["plannedStart", "plannedStartDate", "plannedDate", "scheduledStart", "startDate", "start", "date", "creationDate"])
      const reference = pickString(job, ["reference", "description", "title", "name"])

      await db.siteSurvey.create({
        data: {
          organizationId: orgId,
          createdById: userId,
          title: reference || `${cfg.jobTypeName || "Survey"} — ${clientName}`,
          clientName,
          clientCompany: company,
          clientEmail: pickString(job, ["contactEmail", "email"]),
          clientPhone: pickString(job, ["contactPhone", "phone", "contactMobile", "mobile"]),
          clientAddress: addressParts.join(", ") || "Address to confirm",
          serviceType: cfg.jobTypeName || "Site survey",
          isResidential: !company,
          scheduledAt,
          externalBookingRef: ref,
        },
      })
      imported++
    }

    if (imported === 0 && skipped === 0 && !debugKeys && jobs[0]) {
      debugKeys = Object.keys(jobs[0]).slice(0, 40)
    }
    if (jobs.length < 100) break
  }

  return { fetched, imported, skipped, debugKeys }
}
