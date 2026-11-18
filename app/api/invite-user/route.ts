import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { ALLOWED_DOMAINS, isAllowedEmail, isAllowedUser } from "@/lib/access"

/**
 * Invite a new team member. Creates a confirmed auth user with a temporary
 * password (so they can log in immediately without an email round-trip) and
 * sets up their profile. The inviter shares the temp password with them and
 * they change it from their Profile page after first login.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (server-only).
 */
export async function POST(req: Request) {
  // Only editors with a Threecolts account can invite
  const supabase = await createClient()
  const {
    data: { user: inviter },
  } = await supabase.auth.getUser()
  if (!inviter || !isAllowedUser(inviter)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { data: inviterProfile } = await supabase.from("profiles").select("app_role").eq("id", inviter.id).single()
  if (inviterProfile?.app_role !== "editor") {
    return Response.json({ error: "Only editors can invite people." }, { status: 403 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return Response.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in project settings." },
      { status: 500 },
    )
  }

  const { email, fullName, role, tempPassword } = await req.json()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 })
  }
  if (!isAllowedEmail(email.trim())) {
    return Response.json({ error: `Only ${ALLOWED_DOMAINS.map(d => "@" + d).join(" or ")} email addresses can be invited.` }, { status: 400 })
  }
  if (!fullName || fullName.trim().length < 2) {
    return Response.json({ error: "Enter the member's full name." }, { status: 400 })
  }
  if (!tempPassword || tempPassword.length < 8) {
    return Response.json({ error: "Temporary password must be at least 8 characters." }, { status: 400 })
  }

  const admin = createAdminClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // Create the user with a confirmed email so they can log in right away
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim() },
    })

    if (createError) {
      const msg = createError.message.includes("already been registered")
        ? "A user with this email already exists."
        : createError.message
      return Response.json({ error: msg }, { status: 400 })
    }

    const newUserId = created.user.id

    // Upsert profile (a DB trigger may have created a stub already)
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: newUserId,
        full_name: fullName.trim(),
        role: role?.trim() || "Team Member",
        // Invited by an editor = a teammate. Self sign-ups start as viewers (scripts/016)
        app_role: "editor",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )

    if (profileError) {
      console.error("Profile upsert failed:", profileError)
      // User exists but profile failed — surface but don't fail entirely
      return Response.json({
        ok: true,
        warning: "User created but profile setup had an issue: " + profileError.message,
      })
    }

    return Response.json({ ok: true })
  } catch (error) {
    console.error("Invite user error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to invite user" },
      { status: 500 },
    )
  }
}
