/** Read a Google Doc/Sheet/Slides link as text — works when it's shared as "anyone with the link" */
export async function readGoogleDoc(url: string | null | undefined): Promise<{ text: string | null; status: "read" | "not-shared" | "none" }> {
  const m = url?.trim().match(/^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) return { text: null, status: "none" }
  const exportUrl = m[1] === "document"
    ? `https://docs.google.com/document/d/${m[2]}/export?format=txt`
    : m[1] === "spreadsheets"
      ? `https://docs.google.com/spreadsheets/d/${m[2]}/export?format=csv`
      : `https://docs.google.com/presentation/d/${m[2]}/export/txt`
  try {
    // A doc that isn't public redirects to a Google sign-in page
    const res = await fetch(exportUrl, { redirect: "manual", cache: "no-store" })
    const type = res.headers.get("content-type") ?? ""
    if (res.status !== 200 || type.includes("text/html")) return { text: null, status: "not-shared" }
    return { text: (await res.text()).slice(0, 30000), status: "read" }
  } catch {
    return { text: null, status: "not-shared" }
  }
}
