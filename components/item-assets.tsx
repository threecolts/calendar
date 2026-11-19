"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { FileText, Loader2, Paperclip, Play, Trash2 } from "lucide-react"
import {
  deleteAsset, isImage, isVideo, listItemAssets, listSocialPosts, sectionForItem, uploadAsset,
  type CampaignAsset, type CampaignSocialPost,
} from "@/lib/campaign-assets"
import { useStore } from "@/lib/store"
import { cx } from "@/components/kit"

/**
 * The files for one calendar item, at the bottom of the item. Posts made in
 * Social show here on their own; anything uploaded here is filed under the
 * campaign's Assets page too (same rows, tagged with the item).
 */
export function ItemAssets({ item, editable }: {
  item: { id: string; title: string; publish_date: string | null; campaign_id: string | null; channel: string; format: string }
  editable: boolean
}) {
  const { currentUser } = useStore()
  const [files, setFiles] = useState<CampaignAsset[]>([])
  const [social, setSocial] = useState<CampaignSocialPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const input = useRef<HTMLInputElement>(null)

  const load = async () => {
    const [a, s] = await Promise.all([listItemAssets(item.id), listSocialPosts([item])])
    setFiles(a)
    setSocial(s[0] ?? null)
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [item.id])

  const upload = async (list: FileList | null) => {
    if (!list?.length || !item.campaign_id) return
    setBusy(true); setError("")
    try {
      for (const f of Array.from(list)) await uploadAsset(item.campaign_id, sectionForItem(item), f, currentUser?.id ?? null, item.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  const remove = async (a: CampaignAsset) => {
    setError("")
    try { await deleteAsset(a); setFiles(prev => prev.filter(x => x.id !== a.id)) }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't remove it") }
  }

  const frames = social?.frames.filter(f => f.src) ?? []
  const empty = !loading && !files.length && !frames.length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-on-surface-variant">Assets</span>
        {editable && item.campaign_id && (
          <label className={cx("inline-flex items-center gap-1.5 text-[13px] font-medium cursor-pointer underline underline-offset-4 decoration-on-surface/30 hover:decoration-on-surface", busy && "opacity-50 pointer-events-none")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            {busy ? "Uploading…" : "Upload"}
            <input ref={input} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden" onChange={e => upload(e.target.files)} />
          </label>
        )}
      </div>

      {loading && <p className="text-[13px] text-on-surface-variant">Loading…</p>}
      {empty && (
        <p className="text-[13px] text-on-surface-variant">
          {item.campaign_id
            ? "Nothing yet. Posts made in Social appear here on their own; uploads also go to the campaign's Assets page."
            : "Put this item in a campaign to attach files."}
        </p>
      )}

      {frames.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Link href={`/social?item=${item.id}`} className="text-xs text-on-surface-variant hover:text-on-surface">
            From Social{social?.approved ? ` · option ${social.approved} approved` : ""} →
          </Link>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {frames.map(f => (
              <img key={f.name} src={f.src!} alt={f.name} title={`${f.option} · ${f.format}`} className="h-24 w-auto rounded-lg border border-border flex-shrink-0 bg-surface-container-low" />
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {files.map(a => (
            <div key={a.id} className="group relative rounded-lg border border-border overflow-hidden bg-surface-container-low aspect-square">
              <a href={a.src ?? a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block h-full w-full" title={a.title ?? ""}>
                {isImage(a) && a.src ? (
                  <img src={a.src} alt={a.title ?? ""} className="h-full w-full object-cover" />
                ) : (
                  <span className="h-full w-full flex flex-col items-center justify-center gap-1 p-2 text-on-surface-variant">
                    {isVideo(a) ? <Play className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    <span className="text-[11px] text-center line-clamp-2 break-all">{a.title}</span>
                  </span>
                )}
              </a>
              {editable && (
                <button
                  onClick={() => remove(a)}
                  aria-label={`Remove ${a.title ?? "file"}`}
                  className="absolute top-1 right-1 h-7 w-7 inline-flex items-center justify-center rounded-full bg-background/90 text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
