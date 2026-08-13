// Client-side PDF export. Renders a DOM element to a multi-page A4 PDF and shares
// it via the native share sheet (WhatsApp / email / Files) with a download
// fallback. Libraries are dynamically imported so they never touch the main bundle.

// Rasterise an element into a PDF Blob. The element may be a hidden print copy —
// we temporarily force it visible off-screen at A4 width so html2canvas can see it.
// In the cloned DOM (never the live page): drop print-hidden controls, reveal
// print-only content, and swap form fields for plain text so nothing is clipped.
function cleanCloneForPrint(clonedDoc: Document) {
  const style = clonedDoc.createElement("style")
  style.textContent = `
    .no-print,[class~="print:hidden"]{display:none !important}
    [class~="print:block"]{display:block !important}
  `
  clonedDoc.head.appendChild(style)

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
  try {
    canvas = await html2canvas(el, {
      useCORS: true,
      scale: 2,
      backgroundColor: "#ffffff",
      windowWidth: width,
      onclone: (doc) => cleanCloneForPrint(doc),
    })
  } finally {
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
  while (heightLeft > 0) {
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
export async function sharePdf(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: "application/pdf" })
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

// Convenience: build the PDF from an element and share/download it.
export async function exportAndShare(el: HTMLElement, filename: string, title: string): Promise<void> {
  const blob = await elementToPdfBlob(el)
  await sharePdf(blob, filename, title)
}
