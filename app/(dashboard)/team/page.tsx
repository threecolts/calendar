"use client"

import { useState } from "react"
import { UserPlus, Pencil, Users } from "lucide-react"
import { useStore } from "@/lib/store"
import { useRefreshData } from "@/components/data-provider"
import { updateProfileClient } from "@/lib/data-client"
import { TeamSkeleton } from "@/components/loading-skeletons"
import { EditMemberDialog } from "@/components/edit-member-dialog"
import { InviteMemberDialog } from "@/components/invite-member-dialog"
import { TeamsManager } from "@/components/teams-manager"
import { Avatar, Button, PageHeader, StatTile, cx } from "@/components/kit"
import type { CampaignWithItems, Profile } from "@/lib/database.types"

export default function TeamPage() {
  const store = useStore()
  // In a team view, only that team's people; everyone in the main view
  const teamMembers: Profile[] = store.teamMembers.filter(m => store.activeTeam === "all" || store.inTeamView(m.team_id))
  const teamName = (id: string | null | undefined) => store.teams.find(t => t.id === id)?.name
  const campaigns: CampaignWithItems[] = store.campaigns
  const { refreshProfiles } = useRefreshData()
  const [editingMember, setEditingMember] = useState<Profile | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  if (store.isLoading) return <TeamSkeleton />

  const allItems = campaigns.flatMap(c => c.items || [])
  const countItems = (memberId: string) => {
    const assigned = allItems.filter(i => i.assignee_id === memberId)
    return {
      total: assigned.length,
      inProgress: assigned.filter(i => i.status === "In progress" || i.status === "In review").length,
      published: assigned.filter(i => i.status === "Published").length,
    }
  }

  const assignedTotal  = allItems.filter(i => i.assignee_id).length
  const publishedTotal = allItems.filter(i => i.status === "Published").length
  const editors        = teamMembers.filter(m => m.app_role === "editor").length

  const handleRoleToggle = async (member: Profile) => {
    const next = member.app_role === "editor" ? "viewer" : "editor"
    await updateProfileClient(member.id, { app_role: next })
    refreshProfiles()
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 max-w-6xl mx-auto">
      <PageHeader
        title="Team"
        subtitle={`${teamMembers.length} member${teamMembers.length !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite
          </Button>
        }
      />

      {teamMembers.length === 0 ? (
        <div className="rounded-2xl border border-border p-16 flex flex-col items-center gap-4 text-center">
          <Users className="h-10 w-10 text-on-surface-variant" />
          <p className="text-sm text-on-surface-variant">No team members yet. Invite someone to get started.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-surface-bright grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border overflow-hidden">
            <StatTile label="Members" value={teamMembers.length} note={`${editors} can edit`} />
            <StatTile label="Items assigned" value={assignedTotal} note={`of ${allItems.length} total`} />
            <StatTile label="Published" value={publishedTotal} />
            <StatTile label="Online now" value={teamMembers.filter(m => m.is_online).length} />
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-[22px] text-on-surface">People</h2>
            <div data-tour="team-table" className="rounded-2xl border border-border bg-surface-bright overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-surface-container-low text-left text-[13px] text-on-surface-variant">
                    <th className="font-normal px-5 py-3">Name</th>
                    {store.teams.length > 0 && <th className="font-normal px-4 py-3">Team</th>}
                    <th className="font-normal px-4 py-3">Access</th>
                    <th className="font-normal px-4 py-3 text-right">Assigned</th>
                    <th className="font-normal px-4 py-3 text-right">In progress</th>
                    <th className="font-normal px-4 py-3 text-right">Published</th>
                    <th className="font-normal px-5 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {teamMembers.map(member => {
                    const { total, inProgress, published } = countItems(member.id)
                    return (
                      <tr key={member.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="relative">
                              <Avatar src={member.avatar_url} name={member.full_name} size={36} />
                              {member.is_online && (
                                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-on-surface border-2 border-surface-bright" aria-label="Online" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-medium text-on-surface truncate">{member.full_name}</span>
                              <span className="block text-[13px] text-on-surface-variant truncate">{member.role || "Team member"}</span>
                            </span>
                          </div>
                        </td>
                        {store.teams.length > 0 && (
                          <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{teamName(member.team_id) ?? "—"}</td>
                        )}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRoleToggle(member)}
                            title="Click to switch between Editor and Viewer"
                            className={cx(
                              "text-xs px-2.5 py-1 rounded-full font-medium border transition-colors",
                              member.app_role === "editor"
                                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/85"
                                : "border-outline-variant text-on-surface-variant hover:border-on-surface/30",
                            )}
                          >
                            {member.app_role === "viewer" ? "Viewer" : "Editor"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-on-surface">{total || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-on-surface">{inProgress || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-on-surface">{published || "—"}</td>
                        <td className="px-5 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setEditingMember(member)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <TeamsManager />

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {editingMember && (
        <EditMemberDialog
          member={editingMember}
          open={!!editingMember}
          onOpenChange={open => !open && setEditingMember(null)}
          onSaved={() => refreshProfiles()}
        />
      )}
    </div>
  )
}
