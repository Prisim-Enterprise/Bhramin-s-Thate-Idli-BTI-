// Image helpers for bill uploads. Handwritten and scanned bills are read by Sarvam on the server
// (see readBill.ts); these only prepare the images in the browser.

/** Make a photo small enough to send quickly (longest side ≤ maxSide, JPEG). */
export async function shrinkImage(blob: Blob, maxSide = 2200): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  if (scale === 1 && blob.type === 'image/jpeg' && blob.size < 4_000_000) return blob
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the image'))), 'image/jpeg', 0.88))
}

async function openPdf(file: Blob) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
}

/** Number of pages in a PDF. */
export async function pdfPageCount(file: Blob): Promise<number> {
  return (await openPdf(file)).numPages
}

/** Turn each page of a PDF into an image (one bill per page). */
export async function pdfPagesToImages(file: Blob, maxPages = 40): Promise<Blob[]> {
  const doc = await openPdf(file)
  const out: Blob[] = []
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
    out.push(await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/jpeg', 0.9)))
  }
  return out
}
