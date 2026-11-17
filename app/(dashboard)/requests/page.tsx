import { Suspense } from "react"
import { RequestsView } from "@/components/requests-view"

export default function RequestsPage() {
  return <Suspense><RequestsView /></Suspense>
}
