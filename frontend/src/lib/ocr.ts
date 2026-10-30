// Tesseract OCR running inside the page (tesseract.js): no install, works on every device.
// Good for printed bills; handwriting goes to the AI reader instead (see readBill.ts).

/** Make a photo small enough to read quickly and send cheaply (longest side ≤ maxSide, JPEG). */
export async function shrinkImage(blob: Blob, maxSide = 2000): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  if (scale === 1 && blob.type === 'image/jpeg' && blob.size < 4_000_000) return blob
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the image'))), 'image/jpeg', 0.85))
}

/** Turn each page of a scanned PDF into an image (first few pages only). */
export async function pdfPagesToImages(file: Blob, maxPages = 3): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
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

/** Read the text in images. lang: 'eng', or 'kan+eng' for Kannada bills. */
export async function ocrImages(images: Blob[], lang: string, onProgress?: (pct: number) => void): Promise<{ lines: string[]; confidence: number }> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(lang, 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100)) },
  })
  try {
    const lines: string[] = []
    let conf = 0
    for (const img of images) {
      const { data } = await worker.recognize(img)
      lines.push(...data.text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean))
      conf += data.confidence
    }
    return { lines, confidence: Math.round(conf / Math.max(1, images.length)) }
  } finally {
    await worker.terminate()
  }
}
