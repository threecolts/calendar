"use client"

import { useState, useRef } from "react"
import { Camera, Loader2, Check, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { updateProfileClient, uploadAvatarClient } from "@/lib/data-client"
import type { Profile } from "@/lib/database.types"
import { useStore } from "@/lib/store"

const roles = [
  "Admin",
  "Creative Director",
  "Production Lead",
  "Content Creator",
  "Editor",
  "Designer",
  "Producer",
  "Coordinator",
]

interface EditMemberDialogProps {
  member: Profile
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function EditMemberDialog({ member, open, onOpenChange, onSaved }: EditMemberDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [fullName, setFullName] = useState(member.full_name)
  const [role, setRole] = useState(member.role || "")
  const { teams, currentUser, setCurrentUser } = useStore()
  const [teamId, setTeamId] = useState<string>(member.team_id ?? "")
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url)
  
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingAvatar(true)
    setError("")

    try {
      // Upload to Supabase Storage — the public URL is saved on Save Changes
      const publicUrl = await uploadAvatarClient(member.id, file)
      setAvatarUrl(publicUrl)
    } catch (err) {
      console.error("Error uploading avatar:", err)
      setError(err instanceof Error ? err.message : "Failed to upload image")
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError("Name is required")
      return
    }
    
    setIsSaving(true)
    setError("")
    
    try {
      const updated = await updateProfileClient(member.id, {
        full_name: fullName.trim(),
        role: role.trim(),
        avatar_url: avatarUrl || null,
        // Only once teams exist (scripts/012), so saving still works before then
        ...(teams.length ? { team_id: teamId || null } : {}),
      })
      
      // Your own row: the top bar picks it up straight away
      if (updated.id === currentUser?.id) setCurrentUser(updated)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onSaved()
        onOpenChange(false)
      }, 1000)
    } catch (err) {
      console.error("Error saving profile:", err)
      setError(err instanceof Error ? err.message : "Failed to save profile")
    } finally {
      setIsSaving(false)
    }
  }

  const displayAvatarUrl = avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-container-low border-none rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[22px] font-semibold text-on-surface">Edit team member</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-6 mt-4">
          {/* Avatar Section */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="h-24 w-24 rounded-full overflow-hidden ring-4 ring-surface-container-high">
                {isUploadingAvatar ? (
                  <div className="h-full w-full bg-surface-container-high flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <img
                    src={displayAvatarUrl}
                    alt={fullName}
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <button 
                onClick={handleAvatarClick}
                disabled={isUploadingAvatar}
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Form Fields */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[13px] text-on-surface-variant">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter full name..."
                className="px-4 py-3 bg-surface-container-lowest rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="member-title" className="text-[13px] text-on-surface-variant">Title</label>
              {/* Free text: type any title, or pick a common one */}
              <input
                id="member-title"
                list="member-title-options"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Social Media Manager"
                className="px-4 py-3 bg-surface-container-lowest rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none text-on-surface"
              />
              <datalist id="member-title-options">
                {roles.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>

            {teams.length > 0 && (
              <div className="flex flex-col gap-2">
                <label htmlFor="member-team" className="text-[13px] text-on-surface-variant">Team</label>
                <select
                  id="member-team"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="px-4 py-3 bg-surface-container-lowest rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none text-on-surface appearance-none cursor-pointer"
                >
                  <option value="">No team</option>
                  {teams.filter(t => !t.parent_id).map(top => [
                    <option key={top.id} value={top.id}>{top.name}</option>,
                    ...teams.filter(t => t.parent_id === top.id).map(sub => (
                      <option key={sub.id} value={sub.id}>{`${top.name} › ${sub.name}`}</option>
                    )),
                  ])}
                </select>
                <p className="text-xs text-on-surface-variant">Their default view when they open the calendar, and the team whose work they can change.</p>
              </div>
            )}


          </div>

          {/* Error Message */}
          {error && (
            <p className="text-sm text-error">{error}</p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 border border-outline-variant rounded-full text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isUploadingAvatar}
              className="flex-1 px-4 py-2.5 bg-primary rounded-full text-sm font-medium text-primary-foreground hover:bg-primary/85 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved!
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
