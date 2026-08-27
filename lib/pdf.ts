// Client-side PDF export. Renders a DOM element to a multi-page A4 PDF and shares
// it via the native share sheet (WhatsApp / email / Files) with a download
// fallback. Libraries are dynamically imported so they never touch the main bundle.

// Rasterise an element into a PDF Blob. The element may be a hidden print copy —
// we temporarily force it visible off-screen at A4 width so html2canvas can see it.
// In the cloned DOM (never the live page): drop print-hidden controls, reveal
// print-only content, and swap form fields for plain text so nothing is clipped.
function cleanCloneForPrint(clonedDoc: Document) {
  const style = clonedDoc.createElement("style")
  // The plain-font override matters: html2canvas mis-measures spaces with the
  // app's adjusted web fonts, silently gluing words together in the PDF.
  style.textContent = `
    .no-print,[class~="print:hidden"]{display:none !important}
    [class~="print:block"]{display:block !important}
    *{font-family:Arial,Helvetica,sans-serif !important;font-kerning:none !important;font-variant-ligatures:none !important}
  `
  clonedDoc.head.appendChild(style)

  // Push blocks (photos, cards, callouts, headings) that would straddle an A4
  // page boundary down onto the next page, so the raster slicing never cuts an
  // element in half. Runs on the laid-out clone; measured in document order so
  // each push reflows what follows before it's measured.
  const root = clonedDoc.querySelector<HTMLElement>('[data-pdf-root="1"]')
  if (root) {
    const pageH = root.getBoundingClientRect().width * (297 / 210)
    root
      .querySelectorAll<HTMLElement>(".break-inside-avoid, figure, section, h2")
      .forEach((c) => {
        const rootTop = root.getBoundingClientRect().top
        const r = c.getBoundingClientRect()
        const top = r.top - rootTop
        if (r.height >= pageH * 0.9) return // taller than a page — let it split
        const startPage = Math.floor(top / pageH)
        const endPage = Math.floor((top + r.height - 2) / pageH)
        if (endPage > startPage) {
          const delta = (startPage + 1) * pageH - top + 10
          const cur = parseFloat(clonedDoc.defaultView?.getComputedStyle(c).marginTop || "0") || 0
          c.style.marginTop = `${cur + delta}px`
        }
      })
  }

  clonedDoc.querySelectorAll("textarea,input,select").forEach((node) => {
    const el = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    let text = ""
    if (el.tagName === "SELECT") {
      const sel = el as HTMLSelectElement
      text = sel.options[sel.selectedIndex]?.text ?? ""
    } else if ((el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio") {
      text = (el as HTMLInputElement).checked ? "☑" : "☐"
    } else {
      text = (el as HTMLInputElement).value ?? ""
    }
    const div = clonedDoc.createElement("div")
    div.textContent = text
    div.style.cssText = "white-space:pre-wrap;font:inherit;color:inherit;padding:1px 0;min-height:1em"
    el.parentNode?.replaceChild(div, el)
  })
}

export async function elementToPdfBlob(el: HTMLElement, opts?: { width?: number }): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default
  const { jsPDF } = await import("jspdf")

  const width = opts?.width ?? 794 // ~A4 width at 96dpi
  const wasHidden = getComputedStyle(el).display === "none"
  const prevStyle = el.getAttribute("style") || ""
  if (wasHidden) {
    Object.assign(el.style, {
      display: "block", position: "fixed", left: "-10000px", top: "0",
      width: `${width}px`, background: "#ffffff", zIndex: "-1",
    })
  }

  let canvas: HTMLCanvasElement
  el.setAttribute("data-pdf-root", "1") // pagination marker for the clone pass
  try {
    canvas = await html2canvas(el, {
      useCORS: true,
      scale: 2,
      backgroundColor: "#ffffff",
      windowWidth: width,
      onclone: (doc) => cleanCloneForPrint(doc),
    })
  } finally {
    el.removeAttribute("data-pdf-root")
    if (wasHidden) el.setAttribute("style", prevStyle)
  }

  const pdf = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW
  const imgH = (canvas.height * pageW) / canvas.width
  const img = canvas.toDataURL("image/jpeg", 0.92)

  let heightLeft = imgH
  let position = 0
  pdf.addImage(img, "JPEG", 0, position, imgW, imgH)
  heightLeft -= pageH
  // The 6pt tolerance stops a rounding sliver becoming a blank trailing page.
  while (heightLeft > 6) {
    position -= pageH
    pdf.addPage()
    pdf.addImage(img, "JPEG", 0, position, imgW, imgH)
    heightLeft -= pageH
  }
  return pdf.output("blob")
}

// Share a Blob as a file via the Web Share API on MOBILE (iOS/Android — where a
// share sheet is how you get a file into WhatsApp/Files), or download it. Desktop
// browsers can also expose navigator.share (e.g. the Windows share dialog), but
// there a straight download is what users expect — so share is mobile-only.
export async function shareFile(blob: Blob, filename: string, title: string, mime: string): Promise<void> {
  const file = new File([blob], filename, { type: mime })
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean
    share?: (data: { files: File[]; title?: string }) => Promise<void>
  }
  const isMobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, but Macs don't have multi-touch screens.
    (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  if (isMobile && nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title })
      return
    } catch (e) {
      // User cancelled the share sheet — don't then force a download.
      if (e instanceof DOMException && e.name === "AbortError") return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function sharePdf(blob: Blob, filename: string, title: string): Promise<void> {
  return shareFile(blob, filename, title, "application/pdf")
}

// Convenience: build the PDF from an element and share/download it.
export async function exportAndShare(el: HTMLElement, filename: string, title: string): Promise<void> {
  const blob = await elementToPdfBlob(el)
  await sharePdf(blob, filename, title)
}
