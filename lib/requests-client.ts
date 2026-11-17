"use client"

import { createClient } from "@/lib/supabase/client"
import type { Request, RequestFields, RequestUpdate } from "@/lib/requests"

export class RequestsNotSetUp extends Error {}

const notSetUp = (msg: string) => /(requests|request_updates)/.test(msg) && /(exist|schema cache|not find)/i.test(msg)

export async function listRequests(): Promise<Request[]> {
  const { data, error } = await createClient().from("requests").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })
  if (error) { if (notSetUp(error.message)) throw new RequestsNotSetUp(); throw error }
  return (data ?? []) as Request[]
}

export type NewRequest = Partial<Omit<Request, "id" | "created_at" | "updated_at">> & { title: string }

export async function createRequest(r: NewRequest): Promise<Request> {
  const { data, error } = await createClient().from("requests").insert(r).select().single()
  if (error) throw error
  return data as Request
}

export async function updateRequest(id: string, updates: Partial<Request> & { fields?: RequestFields }): Promise<Request> {
  const { data, error } = await createClient().from("requests").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single()
  if (error) throw error
  return data as Request
}

export async function deleteRequest(id: string) {
  const { error } = await createClient().from("requests").delete().eq("id", id)
  if (error) throw error
}

export async function listUpdates(requestId: string): Promise<RequestUpdate[]> {
  const { data, error } = await createClient().from("request_updates").select("*").eq("request_id", requestId).order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as RequestUpdate[]
}

export async function postUpdate(u: { request_id: string; author_id: string; body: string; status_from?: string | null; status_to?: string | null }) {
  const { error } = await createClient().from("request_updates").insert(u)
  if (error) throw error
}

export async function deleteUpdate(id: string) {
  const { error } = await createClient().from("request_updates").delete().eq("id", id)
  if (error) throw error
}

/** Claude reads a pasted Linear Ask into the request form (/api/requests/parse) */
export async function parseRequestText(text: string): Promise<{
  kind: "video" | "design" | "other"
  title: string
  requester: string | null
  linear_url: string | null
  due_date: string | null
  date_fixed: string | null
  fields: RequestFields
  unclear: string[]
}> {
  const res = await fetch("/api/requests/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Couldn't read that request")
  return data
}
