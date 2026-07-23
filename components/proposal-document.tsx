import { formatCurrency, calculateProposalTotals, lineNet, PricingItem } from "@/lib/utils"

type Photo = {
  id: string
  fileUrl: string
  caption?: string | null
}

type Section = {
  id: string
  type: string
  title: string
  content: string
  photoIds?: string | null
}

type LineItem = PricingItem & {
  id: string
  description: string
  unit: string
}

export type ProposalDocumentData = {
  clientName: string
  templateName: string
  // Live cover facts (from the current survey); the cover prefers these over the
  // snapshot stored at generation time, so edits show through immediately.
  title?: string
  clientCompany?: string | null
  siteAddress?: string
  sections: Section[]
  pricingLineItems: LineItem[]
  photos: Photo[]
  organization: {
    name: string
    logoUrl?: string | null
    brandColor: string
    secondaryColor: string
    email?: string | null
    phone?: string | null
    website?: string | null
    signOffName?: string | null
    headshotUrl?: string | null
    signatureImageUrl?: string | null
  }
  // The user who created the proposal - their sign-off wins over the org's
  preparer?: {
    name?: string | null
    signOffName?: string | null
    headshotUrl?: string | null
    signatureImageUrl?: string | null
  } | null
  // Site location from the survey - shown on the cover when geocoded.
  // what3words stays optional until the w3w integration is wired up.
  latitude?: number | null
  longitude?: number | null
  what3words?: string | null
  // Org toggle: whether to show GPS/what3words on the cover (default true)
  showCoordinates?: boolean
  // Client view handles optional extras interactively (checkboxes to add to the
  // total), so the static "Optional extras" list is suppressed there.
  hideOptionalExtras?: boolean
}

// Perceived brightness of a hex colour (0-1) so we can pick readable text.
function coverLuminance(hex: string): number {
  const h = hex.replace("#", "")
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return 0
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function CoverSection({ section, data }: { section: Section; data: ProposalDocumentData }) {
  let cover = { title: "", clientName: "", clientCompany: "", siteAddress: "" }
  try {
    cover = { ...cover, ...JSON.parse(section.content) }
  } catch {
    // fall through with defaults
  }
  const org = data.organization
  const company = data.clientCompany ?? cover.clientCompany

  // Lead with the company's brand colour; fall back to navy if it's not a valid
  // hex. Text colour flips to stay readable on light brand colours.
  const brand = /^#[0-9A-Fa-f]{6}$/.test(org.brandColor) ? org.brandColor : "#0F172A"
  const onDark = coverLuminance(brand) < 0.6
  const textColor = onDark ? "#FFFFFF" : "#0F172A"
  const accent = /^#[0-9A-Fa-f]{6}$/.test(org.secondaryColor)
    ? org.secondaryColor
    : onDark
      ? "#FFFFFF"
      : brand

  return (
    <div
      data-track-section="Cover"
      className="doc-page flex flex-col justify-between rounded-lg overflow-hidden"
      style={{ backgroundColor: brand, color: textColor, minHeight: "500px" }}
    >
      <div className="p-10">
        {org.logoUrl ? (
          <div className="inline-block bg-white rounded-lg p-2 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={org.logoUrl} alt={org.name} className="h-12 object-contain" />
          </div>
        ) : (
          <div className="text-2xl font-bold">{org.name}</div>
        )}
      </div>
      <div className="p-10">
        <div
          className="w-16 h-1.5 rounded mb-6"
          style={{ backgroundColor: accent }}
        />
        <h1 className="text-4xl font-bold mb-4">{data.title || cover.title}</h1>
        <p className="text-lg opacity-80">
          Prepared for {data.clientName || cover.clientName}
          {company ? `, ${company}` : ""}
        </p>
        <p className="opacity-60">{data.siteAddress || cover.siteAddress}</p>
        {data.latitude != null && data.longitude != null && data.showCoordinates !== false && (
          <div className="opacity-60 text-sm mt-2 space-y-0.5">
            <p>
              <span className="opacity-70">GPS location:</span>{" "}
              {data.latitude.toFixed(6)}, {data.longitude.toFixed(6)}
            </p>
            {data.what3words && (
              <p>
                <span className="opacity-70">what3words:</span> ///{data.what3words}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="px-10 py-6 text-sm flex flex-wrap gap-x-6 gap-y-1"
        style={{ backgroundColor: onDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)" }}>
        {org.phone && <span>{org.phone}</span>}
        {org.email && <span>{org.email}</span>}
        {org.website && <span>{org.website}</span>}
      </div>
    </div>
  )
}

// Site photos are shown live from the survey (those marked "In proposal"), so
// photos added after the proposal was generated still appear.
function PhotosSection({ data }: { data: ProposalDocumentData }) {
  const photos = data.photos
  if (!photos.length) return null

  return (
    <div className="grid grid-cols-2 gap-4">
      {photos.map((photo) => (
        <figure key={photo.id} className="break-inside-avoid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.fileUrl}
            alt={photo.caption || "Site photo"}
            className="w-full rounded-lg object-cover aspect-[4/3]"
          />
          {photo.caption && (
            <figcaption className="text-sm text-gray-500 mt-1.5">{photo.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}

function PricingSection({ data }: { data: ProposalDocumentData }) {
  const items = data.pricingLineItems
  if (!items.length) {
    return <p className="text-gray-400 italic">No pricing added yet.</p>
  }
  const totals = calculateProposalTotals(items)
  const optional = items.filter((i) => i.isOptional)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b-2" style={{ borderColor: data.organization.brandColor }}>
            <th className="py-2 pr-2 font-semibold">Description</th>
            <th className="py-2 px-2 font-semibold text-right">Qty</th>
            <th className="py-2 px-2 font-semibold text-right">Unit price</th>
            <th className="py-2 pl-2 font-semibold text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.filter((i) => !i.isOptional).map((item) => (
            <tr key={item.id} className="border-b border-gray-100">
              <td className="py-2.5 pr-2">
                {item.description}
                {item.discount > 0 && (
                  <span className="text-xs text-emerald-600 ml-2">({item.discount}% discount)</span>
                )}
              </td>
              <td className="py-2.5 px-2 text-right whitespace-nowrap">
                {item.quantity} {item.unit}
              </td>
              <td className="py-2.5 px-2 text-right">{formatCurrency(item.unitPrice)}</td>
              <td className="py-2.5 pl-2 text-right font-medium">{formatCurrency(lineNet(item))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-2 text-right text-gray-500">Subtotal</td>
            <td className="py-2 pl-2 text-right">{formatCurrency(totals.subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="py-1 text-right text-gray-500">VAT</td>
            <td className="py-1 pl-2 text-right">{formatCurrency(totals.vat)}</td>
          </tr>
          <tr className="text-base font-bold">
            <td colSpan={3} className="py-2 text-right">Total</td>
            <td className="py-2 pl-2 text-right" style={{ color: data.organization.brandColor }}>
              {formatCurrency(totals.total)}
            </td>
          </tr>
        </tfoot>
      </table>

      {optional.length > 0 && !data.hideOptionalExtras && (
        <div className="mt-6">
          <h4 className="font-semibold text-sm mb-2">Optional extras (not included in total)</h4>
          <table className="w-full text-sm">
            <tbody>
              {optional.map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-2 pr-2">{item.description}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="py-2 pl-2 text-right">{formatCurrency(lineNet(item))} + VAT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function VideosSection({ section }: { section: Section }) {
  let videos: { videoId: string; title: string; thumbnail: string; url: string }[] = []
  try {
    videos = JSON.parse(section.content || "[]")
  } catch {
    videos = []
  }
  if (!videos.length) {
    return <p className="text-gray-400 italic">No videos selected yet.</p>
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      {videos.map((v) => (
        <a
          key={v.videoId}
          href={v.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block group break-inside-avoid"
        >
          <div className="relative rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.thumbnail} alt={v.title} className="w-full aspect-video object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-12 h-12 rounded-full bg-black/60 group-hover:bg-red-600 transition flex items-center justify-center">
                <span className="ml-1 border-y-8 border-y-transparent border-l-[14px] border-l-white" />
              </span>
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1.5 leading-snug">{v.title}</p>
        </a>
      ))}
    </div>
  )
}

function GallerySection({ section }: { section: Section }) {
  let photos: { id: string; fileUrl: string; caption: string }[] = []
  try {
    photos = JSON.parse(section.content || "[]")
  } catch {
    photos = []
  }
  if (!photos.length) return <p className="text-gray-400 italic">No gallery photos selected.</p>
  return (
    <div className="grid grid-cols-2 gap-4">
      {photos.map((p) => (
        <figure key={p.id} className="break-inside-avoid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.fileUrl} alt={p.caption || "Similar project"} className="w-full rounded-lg object-cover aspect-[4/3]" />
          {p.caption && (
            <figcaption className="text-sm text-gray-500 mt-1.5">{p.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}

function TextContent({ content }: { content: string }) {
  // Internal editor guidance (MISSING/ASSUMPTION flags) never reaches clients
  const clean = content
    .split("\n")
    .filter((l) => !/^\s*(⚠\s*)?(MISSING|ASSUMPTION)\s*:/i.test(l))
    .join("\n")
  return (
    <div className="space-y-3 text-gray-700 leading-relaxed">
      {clean.split(/\n{2,}|\n(?=- )/).map((block, i) => {
        const lines = block.split("\n").filter(Boolean)
        const isList = lines.every((l) => l.trim().startsWith("- "))
        if (isList && lines.length) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{l.trim().replace(/^- /, "")}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{block}</p>
      })}
    </div>
  )
}

function SignOffBlock({ data }: { data: ProposalDocumentData }) {
  const org = data.organization
  const p = data.preparer
  const headshot = p?.headshotUrl || org.headshotUrl
  const signature = p?.signatureImageUrl || org.signatureImageUrl
  const name = p?.signOffName || p?.name || org.signOffName
  if (!headshot && !signature && !name) return null
  return (
    <div className="mt-8 pt-6 border-t break-inside-avoid flex items-center gap-4">
      {headshot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={headshot} alt={name || org.name}
          className="w-16 h-16 rounded-full object-cover border" />
      )}
      <div>
        {signature && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signature} alt="Signature" className="h-12 mb-1 object-contain" />
        )}
        <p className="font-semibold text-gray-900">{name || org.name}</p>
        <p className="text-sm text-gray-500">
          {org.name}
          {org.phone ? ` · ${org.phone}` : ""}
        </p>
      </div>
    </div>
  )
}

export function ProposalDocument({ data }: { data: ProposalDocumentData }) {
  return (
    <div className="bg-white text-gray-900 font-sans">
      {data.sections.map((section) => {
        if (section.type === "cover") {
          return <CoverSection key={section.id} section={section} data={data} />
        }
        return (
          <section key={section.id} data-track-section={section.title}
            className="py-8 px-2 md:px-0 break-inside-avoid-page">
            <h2
              className="text-xl font-bold mb-1"
              style={{ color: data.organization.brandColor }}
            >
              {section.title}
            </h2>
            <div
              className="w-10 h-1 rounded mb-4"
              style={{ backgroundColor: data.organization.brandColor }}
            />
            {section.type === "photos" ? (
              <PhotosSection data={data} />
            ) : section.type === "pricing" ? (
              <PricingSection data={data} />
            ) : section.type === "videos" ? (
              <VideosSection section={section} />
            ) : section.type === "gallery" ? (
              <GallerySection section={section} />
            ) : (
              <TextContent content={section.content} />
            )}
          </section>
        )
      })}
      <SignOffBlock data={data} />
    </div>
  )
}
