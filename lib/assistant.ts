import "server-only"
import OpenAI from "openai"
import { db } from "./db"
import { calculateProposalTotals, formatCurrency, PricingItem } from "./utils"
import { canSend } from "./email"
import { canSendProposal } from "./permissions"
import { performNudge } from "./nudge-send"
import { performProposalSend } from "./proposal-send"
import { parseCallLog } from "./calls"

// The voice/text command assistant: an LLM with read tools it may run freely
// and write tools that are QUEUED, shown to the user, and only executed after
// an explicit confirmation tap. Nothing client-facing ever fires from the
// planning phase.

export type PlannedAction = {
  tool: string
  args: Record<string, unknown>
  summary: string
}

export type AssistantPlan = {
  reply: string
  actions: PlannedAction[]
}

type SessionUser = {
  id: string
  organizationId: string
  name: string | null
  email: string
  role: string
  // Extra fields used by permission helpers pass through untouched.
  [key: string]: unknown
}

const MODEL = "gpt-4o"
const MAX_ROUNDS = 8
const MAX_ACTIONS = 25

function openai(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// ---------------------------------------------------------------- read tools

async function findProposals(orgId: string, args: Record<string, unknown>) {
  const query = typeof args.query === "string" ? args.query.trim() : ""
  const status = typeof args.status === "string" ? args.status.toUpperCase() : ""
  const openedNotAccepted = args.openedButNotAccepted === true
  const notNudgedInDays = typeof args.notNudgedInDays === "number" ? args.notNudgedInDays : null
  const limit = Math.min(typeof args.limit === "number" ? args.limit : 10, 25)

  const where: Record<string, unknown> = { organizationId: orgId }
  if (query) {
    where.OR = [
      { clientName: { contains: query, mode: "insensitive" } },
      { clientEmail: { contains: query, mode: "insensitive" } },
      { survey: { title: { contains: query, mode: "insensitive" } } },
      { survey: { clientCompany: { contains: query, mode: "insensitive" } } },
      { survey: { clientAddress: { contains: query, mode: "insensitive" } } },
    ]
  }
  if (status) where.status = status
  if (openedNotAccepted) {
    where.signedAt = null
    where.views = { some: {} }
  }
  if (notNudgedInDays !== null) {
    const cutoff = new Date(Date.now() - notNudgedInDays * 24 * 60 * 60 * 1000)
    where.AND = [{ OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: cutoff } }] }]
  }

  const rows = await db.proposal.findMany({
    where,
    include: {
      survey: { select: { title: true, clientCompany: true, clientAddress: true } },
      pricingLineItems: true,
      _count: { select: { views: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  })
  return rows.map((p) => {
    const t = calculateProposalTotals(p.pricingLineItems)
    return {
      proposalId: p.id,
      title: p.survey.title,
      clientName: p.clientName,
      clientCompany: p.survey.clientCompany,
      clientEmail: p.clientEmail,
      address: p.survey.clientAddress,
      status: p.status,
      signed: Boolean(p.signedAt),
      sentAt: p.sentAt?.toISOString() ?? null,
      lastNudgeAt: p.lastNudgeAt?.toISOString() ?? null,
      timesOpenedByClient: p._count.views,
      totalNet: t.subtotal,
      totalIncVat: t.total,
    }
  })
}

async function getProposal(orgId: string, args: Record<string, unknown>) {
  const p = await db.proposal.findFirst({
    where: { id: String(args.proposalId || ""), organizationId: orgId },
    include: {
      survey: { select: { title: true, clientCompany: true, clientAddress: true } },
      pricingLineItems: { orderBy: { order: "asc" } },
      _count: { select: { views: true } },
    },
  })
  if (!p) return { error: "Proposal not found" }
  const t = calculateProposalTotals(p.pricingLineItems)
  return {
    proposalId: p.id,
    title: p.survey.title,
    clientName: p.clientName,
    clientEmail: p.clientEmail,
    clientCompany: p.survey.clientCompany,
    address: p.survey.clientAddress,
    status: p.status,
    signed: Boolean(p.signedAt),
    sentAt: p.sentAt?.toISOString() ?? null,
    lastNudgeAt: p.lastNudgeAt?.toISOString() ?? null,
    timesOpenedByClient: p._count.views,
    totalNet: t.subtotal,
    totalVat: t.vat,
    totalIncVat: t.total,
    lineItems: p.pricingLineItems.map((li) => ({
      lineId: li.id,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unitPrice: li.unitPrice,
      vatPercent: li.vat,
      discountPercent: li.discount,
      isOptionalExtra: li.isOptional,
    })),
  }
}

type PricingChange = {
  removeLineIds?: string[]
  addDiscount?: { description: string; amount: number; vatPercent?: number }
  setUnitPrice?: { lineId: string; unitPrice: number }[]
}

function parsePricingChange(args: Record<string, unknown>): PricingChange {
  const c: PricingChange = {}
  if (Array.isArray(args.removeLineIds)) c.removeLineIds = args.removeLineIds.map(String)
  const d = args.addDiscount as { description?: unknown; amount?: unknown; vatPercent?: unknown } | undefined
  if (d && typeof d.amount === "number" && d.amount > 0) {
    c.addDiscount = {
      description: String(d.description || "Discount"),
      amount: d.amount,
      vatPercent: typeof d.vatPercent === "number" ? d.vatPercent : undefined,
    }
  }
  if (Array.isArray(args.setUnitPrice)) {
    c.setUnitPrice = (args.setUnitPrice as { lineId?: unknown; unitPrice?: unknown }[])
      .filter((s) => s && typeof s.unitPrice === "number")
      .map((s) => ({ lineId: String(s.lineId), unitPrice: Number(s.unitPrice) }))
  }
  return c
}

// Applies a pricing change to an in-memory copy of the lines and returns the
// resulting totals. Shared by preview (read) and the simulated result shown to
// the model when a real change is queued.
async function previewPricing(orgId: string, args: Record<string, unknown>) {
  const p = await db.proposal.findFirst({
    where: { id: String(args.proposalId || ""), organizationId: orgId },
    include: { pricingLineItems: true },
  })
  if (!p) return { error: "Proposal not found" }
  const change = parsePricingChange(args)
  const defaultVat = p.pricingLineItems.find((li) => !li.isOptional)?.vat ?? 20

  let lines: PricingItem[] = p.pricingLineItems.map((li) => ({ ...li }))
  if (change.removeLineIds?.length) {
    const ids = new Set(change.removeLineIds)
    const known = new Set(p.pricingLineItems.map((li) => li.id))
    const missing = change.removeLineIds.filter((id) => !known.has(id))
    if (missing.length) return { error: `Unknown line id(s): ${missing.join(", ")}` }
    lines = lines.filter((li) => !ids.has((li as { id?: string }).id || ""))
  }
  if (change.setUnitPrice?.length) {
    for (const s of change.setUnitPrice) {
      const li = lines.find((l) => (l as { id?: string }).id === s.lineId)
      if (!li) return { error: `Unknown line id: ${s.lineId}` }
      li.unitPrice = s.unitPrice
    }
  }
  if (change.addDiscount) {
    lines.push({
      quantity: 1,
      unitPrice: -Math.abs(change.addDiscount.amount),
      vat: change.addDiscount.vatPercent ?? defaultVat,
      discount: 0,
      isOptional: false,
    })
  }
  const t = calculateProposalTotals(lines)
  return { newTotalNet: t.subtotal, newTotalVat: t.vat, newTotalIncVat: t.total }
}

// ---------------------------------------------------------------- execution

async function auditProposal(proposalId: string, byName: string, summary: string) {
  const p = await db.proposal.findUnique({ where: { id: proposalId }, select: { callLog: true } })
  if (!p) return
  const log = parseCallLog(p.callLog)
  log.unshift({ at: new Date().toISOString(), by: `Assistant (${byName})`, summary })
  await db.proposal.update({ where: { id: proposalId }, data: { callLog: JSON.stringify(log.slice(0, 100)) } })
}

async function executeUpdatePricing(user: SessionUser, args: Record<string, unknown>) {
  const proposalId = String(args.proposalId || "")
  const p = await db.proposal.findFirst({
    where: { id: proposalId, organizationId: user.organizationId },
    include: { pricingLineItems: true },
  })
  if (!p) throw new Error("Proposal not found")
  const change = parsePricingChange(args)
  const defaultVat = p.pricingLineItems.find((li) => !li.isOptional)?.vat ?? 20

  if (change.removeLineIds?.length) {
    await db.pricingLineItem.deleteMany({
      where: { id: { in: change.removeLineIds }, proposalId: p.id },
    })
  }
  if (change.setUnitPrice?.length) {
    for (const s of change.setUnitPrice) {
      await db.pricingLineItem.updateMany({
        where: { id: s.lineId, proposalId: p.id },
        data: { unitPrice: s.unitPrice },
      })
    }
  }
  if (change.addDiscount) {
    const maxOrder = Math.max(0, ...p.pricingLineItems.map((li) => li.order))
    await db.pricingLineItem.create({
      data: {
        proposalId: p.id,
        description: change.addDiscount.description,
        quantity: 1,
        unit: "item",
        unitPrice: -Math.abs(change.addDiscount.amount),
        vat: change.addDiscount.vatPercent ?? defaultVat,
        discount: 0,
        isOptional: false,
        order: maxOrder + 1,
      },
    })
  }
  const after = await db.pricingLineItem.findMany({ where: { proposalId: p.id } })
  const t = calculateProposalTotals(after)
  return `Pricing updated — new total ${formatCurrency(t.subtotal)} + VAT (${formatCurrency(t.total)} inc VAT)`
}

export async function executeActions(
  user: SessionUser,
  actions: PlannedAction[],
  origin: string
): Promise<{ summary: string; ok: boolean; detail: string }[]> {
  const results: { summary: string; ok: boolean; detail: string }[] = []
  for (const action of actions.slice(0, MAX_ACTIONS)) {
    try {
      const proposalId = String(action.args?.proposalId || "")
      let detail = "Done"
      switch (action.tool) {
        case "update_pricing":
          detail = await executeUpdatePricing(user, action.args)
          break
        case "send_proposal": {
          if (!(await canSend(user.id))) throw new Error("Email isn't set up for your account")
          const p = await db.proposal.findFirst({
            where: { id: proposalId, organizationId: user.organizationId },
            select: { approvalStatus: true, clientEmail: true },
          })
          if (!p) throw new Error("Proposal not found")
          if (!canSendProposal(user, p)) throw new Error("This proposal needs approver sign-off before sending")
          const to = String(action.args.to || p.clientEmail || "").trim()
          if (!to) throw new Error("No client email on the proposal — add one first")
          const { url } = await performProposalSend(
            proposalId,
            { to: [to], message: typeof action.args.message === "string" ? action.args.message : undefined },
            { id: user.id, name: user.name, email: user.email },
            origin
          )
          detail = `Sent to ${to} — ${url}`
          break
        }
        case "send_nudge": {
          if (!(await canSend(user.id))) throw new Error("Email isn't set up for your account")
          await performNudge(
            proposalId,
            { message: typeof action.args.message === "string" ? action.args.message : undefined },
            { id: user.id, name: user.name, email: user.email },
            origin
          )
          detail = "Nudge sent"
          break
        }
        case "set_status": {
          const status = String(action.args.status || "")
          if (!["WON", "LOST"].includes(status)) throw new Error("Only WON or LOST can be set")
          const p = await db.proposal.findFirst({
            where: { id: proposalId, organizationId: user.organizationId },
            select: { id: true },
          })
          if (!p) throw new Error("Proposal not found")
          await db.proposal.update({
            where: { id: p.id },
            data: { status: status as "WON" | "LOST", ...(status === "WON" ? { wonAt: new Date() } : {}) },
          })
          detail = `Marked as ${status.toLowerCase()}`
          break
        }
        default:
          throw new Error(`Unknown action: ${action.tool}`)
      }
      if (proposalId) {
        await auditProposal(proposalId, user.name || user.email, action.summary).catch(() => {})
      }
      results.push({ summary: action.summary, ok: true, detail })
    } catch (err) {
      results.push({
        summary: action.summary,
        ok: false,
        detail: err instanceof Error ? err.message : "Failed",
      })
    }
  }
  return results
}

// ---------------------------------------------------------------- planning

const WRITE_SUMMARY = {
  type: "string",
  description:
    "One plain-English sentence describing exactly what this does, shown to the user on the confirmation card. Include client name, item names and £ amounts.",
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_proposals",
      description:
        "Search this organisation's proposals by client name, company, email, address or job title; optionally filter by status, by 'opened but not accepted', or by not nudged in N days.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "READY", "SENT", "SIGNED", "DEPOSIT_PAID", "WON", "LOST"] },
          openedButNotAccepted: { type: "boolean" },
          notNudgedInDays: { type: "number" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_proposal",
      description: "Full detail of one proposal: client, status, totals and every pricing line with its lineId.",
      parameters: {
        type: "object",
        properties: { proposalId: { type: "string" } },
        required: ["proposalId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_pricing_change",
      description:
        "Simulate removing lines, changing unit prices and/or adding a £ discount line, returning the resulting totals WITHOUT changing anything. Use this to hit a target total before queueing update_pricing.",
      parameters: {
        type: "object",
        properties: {
          proposalId: { type: "string" },
          removeLineIds: { type: "array", items: { type: "string" } },
          setUnitPrice: {
            type: "array",
            items: {
              type: "object",
              properties: { lineId: { type: "string" }, unitPrice: { type: "number" } },
              required: ["lineId", "unitPrice"],
            },
          },
          addDiscount: {
            type: "object",
            properties: {
              description: { type: "string" },
              amount: { type: "number", description: "Positive £ amount taken off the net total" },
              vatPercent: { type: "number" },
            },
            required: ["description", "amount"],
          },
        },
        required: ["proposalId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_pricing",
      description:
        "QUEUED action: apply a pricing change (remove lines / set unit prices / add a discount line). Same arguments as preview_pricing_change plus a summary.",
      parameters: {
        type: "object",
        properties: {
          proposalId: { type: "string" },
          removeLineIds: { type: "array", items: { type: "string" } },
          setUnitPrice: {
            type: "array",
            items: {
              type: "object",
              properties: { lineId: { type: "string" }, unitPrice: { type: "number" } },
              required: ["lineId", "unitPrice"],
            },
          },
          addDiscount: {
            type: "object",
            properties: {
              description: { type: "string" },
              amount: { type: "number" },
              vatPercent: { type: "number" },
            },
            required: ["description", "amount"],
          },
          summary: WRITE_SUMMARY,
        },
        required: ["proposalId", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_proposal",
      description:
        "QUEUED action: email the client a fresh secure link to the proposal (marks it Sent). Use after any pricing change when the user asked to send/resend.",
      parameters: {
        type: "object",
        properties: {
          proposalId: { type: "string" },
          to: { type: "string", description: "Recipient email; defaults to the proposal's client email" },
          message: { type: "string", description: "Optional short personal note for the email body" },
          summary: WRITE_SUMMARY,
        },
        required: ["proposalId", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_nudge",
      description:
        "QUEUED action: send the client a polite follow-up (nudge) email about their proposal. Use for chasing, not for first sends or after amendments.",
      parameters: {
        type: "object",
        properties: {
          proposalId: { type: "string" },
          message: { type: "string", description: "Optional custom message; a sensible template is used otherwise" },
          summary: WRITE_SUMMARY,
        },
        required: ["proposalId", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_status",
      description: "QUEUED action: mark a proposal WON (verbal go-ahead) or LOST.",
      parameters: {
        type: "object",
        properties: {
          proposalId: { type: "string" },
          status: { type: "string", enum: ["WON", "LOST"] },
          summary: WRITE_SUMMARY,
        },
        required: ["proposalId", "status", "summary"],
      },
    },
  },
]

const WRITE_TOOLS = new Set(["update_pricing", "send_proposal", "send_nudge", "set_status"])

function systemPrompt(userName: string): string {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return `You are the SurvAIPro assistant, acting for ${userName}. Today is ${today}. Currency is GBP (£); dates are en-GB.

You handle voice/typed commands about the user's proposals: finding them, amending pricing, resending, nudging (single or in bulk), and marking won/lost.

Rules:
- Read tools (find_proposals, get_proposal, preview_pricing_change) run immediately — use them freely to establish facts. Never guess line items or totals: always look first.
- Write tools are QUEUED for the user to confirm on screen — they do NOT run now. Queue them in the order they should run. Each needs a precise, self-contained 'summary' with names and £ amounts.
- If a search finds MORE THAN ONE plausible match, or ZERO matches, do not queue any writes — reply asking which one they meant, listing the options with client, title and total.
- When the user names an item loosely ("the bin store cleaning"), match it to the closest real line item; if nothing is close, ask.
- When asked to hit a target total, use preview_pricing_change to get there, prefer a visible discount line (e.g. "Goodwill discount") over silently changing prices, and say in your reply whether you treated the target as net (+VAT) or inc-VAT. If the user didn't specify, assume net (+VAT) and say so clearly.
- Bulk requests: find the matching set, then queue one send_nudge per proposal (max 20) and list who's included in your reply.
- Your final reply is shown above the confirmation card: keep it short, factual and specific (what you found, what will happen when they confirm). No markdown headings; a few short lines at most.`
}

export async function planFromCommand(user: SessionUser, command: string): Promise<AssistantPlan> {
  const actions: PlannedAction[] = []
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(user.name || user.email) },
    { role: "user", content: command },
  ]

  const client = openai()
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      temperature: 0.2,
    })
    const msg = res.choices[0]?.message
    if (!msg) break
    messages.push(msg)

    if (!msg.tool_calls?.length) {
      return { reply: msg.content?.trim() || "Nothing to do.", actions }
    }

    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || "{}")
      } catch {
        args = {}
      }
      let result: unknown
      if (WRITE_TOOLS.has(call.function.name)) {
        if (actions.length >= MAX_ACTIONS) {
          result = { error: "Action limit reached — ask the user to split the request." }
        } else {
          const { summary, ...rest } = args as { summary?: unknown }
          actions.push({
            tool: call.function.name,
            args: rest,
            summary: String(summary || call.function.name),
          })
          // Simulate pricing changes so the model can chain on the new totals.
          result =
            call.function.name === "update_pricing"
              ? { queued: true, position: actions.length, simulated: await previewPricing(user.organizationId, rest) }
              : { queued: true, position: actions.length }
        }
      } else {
        try {
          switch (call.function.name) {
            case "find_proposals":
              result = await findProposals(user.organizationId, args)
              break
            case "get_proposal":
              result = await getProposal(user.organizationId, args)
              break
            case "preview_pricing_change":
              result = await previewPricing(user.organizationId, args)
              break
            default:
              result = { error: "Unknown tool" }
          }
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "Tool failed" }
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  return {
    reply: actions.length
      ? "Here's what I've prepared — review and confirm below."
      : "I couldn't work that one out — try rephrasing with the client's name.",
    actions,
  }
}
