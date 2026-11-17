"use client"

import { useParams } from "next/navigation"
import { CampaignAssets } from "@/components/campaign-assets"

/** /campaigns/<id>: the campaign's assets (mood board, videos, design assets, socials) */
export default function CampaignAssetsPage() {
  const { id } = useParams<{ id: string }>()
  return <CampaignAssets campaignId={id} />
}
