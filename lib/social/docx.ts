import { strFromU8, unzipSync } from "fflate"

/**
 * Plain text from a .docx (Google Docs → File → Download → Microsoft Word).
 * Runs in the browser, so the brief never has to be shared publicly.
 * Keeps paragraphs, line breaks, tabs, table cells and bullets ("- ").
 */
export function docxToText(data: Uint8Array): string {
  const files = unzipSync(data, { filter: f => f.name === "word/document.xml" })
  const xml = files["word/document.xml"]
  if (!xml) throw new Error("That file isn't a Word document.")
  const body = strFromU8(xml)

  const paragraphs = body.split(/<\/w:p>/).map(p => {
    const bullet = /<w:numPr>/.test(p) ? "- " : ""
    const text = p
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<[^>]+>/g, "")
    return bullet + decodeEntities(text).trimEnd()
  })
  return paragraphs.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

/** Text from an uploaded brief: .docx, .txt or .md */
export async function briefFileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith(".docx")) return docxToText(new Uint8Array(await file.arrayBuffer()))
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) return (await file.text()).trim()
  if (name.endsWith(".pdf")) throw new Error("PDFs lose their layout. Download the Doc as Microsoft Word (.docx) instead.")
  throw new Error("Upload a .docx or .txt file, or paste the text.")
}
