"use client"

import { useState, useEffect, useRef } from "react"
import { User, Mail, Briefcase, Globe, Camera, Check, Key, LogOut, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { updateProfileClient, getCurrentUserProfileClient, uploadAvatarClient } from "@/lib/data-client"
import { useStore } from "@/lib/store"

const timezones = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
]

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

export default function ProfilePage() {
  const router = useRouter()
  const { setCurrentUser, setProfiles, profiles } = useStore()
  /** Show the change everywhere (top bar, calendar avatars) without a reload */
  const publish = (p: import("@/lib/database.types").Profile) => {
    setCurrentUser(p)
    setProfiles(profiles.map(x => (x.id === p.id ? p : x)))
  }
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [userId, setUserId] = useState<string | null>(null)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("")
  const [timezone, setTimezone] = useState("America/New_York")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState("")
  
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true)
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          setUserId(user.id)
          setEmail(user.email || "")
          
          // Fetch profile from database
          const profile = await getCurrentUserProfileClient()
          if (profile) {
            setFullName(profile.full_name || "")
            setRole(profile.role || "")
            setTimezone(profile.timezone || "America/New_York")
            setAvatarUrl(profile.avatar_url)
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchUserData()
  }, [])

  const handleSave = async () => {
    if (!userId) return
    
    setIsSaving(true)
    setSaveError("")
    
    try {
      publish(await updateProfileClient(userId, {
        full_name: fullName.trim(),
        role: role.trim(),
        timezone,
      }))
      
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error("Error saving profile:", error)
      setSaveError(error instanceof Error ? error.message : "Failed to save profile")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return

    setIsUploadingAvatar(true)
    setSaveError("")

    try {
      // Upload to Supabase Storage and persist the public URL on the profile
      const publicUrl = await uploadAvatarClient(userId, file)
      publish(await updateProfileClient(userId, { avatar_url: publicUrl }))
      setAvatarUrl(publicUrl)
    } catch (error) {
      console.error("Error uploading avatar:", error)
      setSaveError(error instanceof Error ? error.message : "Failed to upload avatar")
    } finally {
      setIsUploadingAvatar(false)
      // Reset the input so re-selecting the same file re-triggers onChange
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const handleChangePassword = async () => {
    setPasswordError("")
    
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match")
      return
    }
    
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters")
      return
    }

    setIsChangingPassword(true)
    
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      
      if (error) {
        setPasswordError(error.message)
        return
      }

      setPasswordSaved(true)
      setNewPassword("")
      setConfirmPassword("")
      setTimeout(() => {
        setPasswordSaved(false)
        setShowPasswordForm(false)
      }, 2000)
    } finally {
      setIsChangingPassword(false)
    }
  }

  const displayAvatarUrl = avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName || email)}`

  if (isLoading) {
    return (
      <div className="px-12 py-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-10 flex flex-col max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] text-on-surface">Profile</h1>
        <p className="text-sm text-on-surface-variant">Your details and account.</p>
      </div>

      {/* Avatar Section */}
      <div className="py-8 border-b border-border last:border-b-0">
        <div className="flex items-center gap-8">
          <div className="relative">
            <div className="h-20 w-20 rounded-full overflow-hidden border border-border bg-surface-container-low">
              {isUploadingAvatar ? (
                <div className="h-full w-full bg-surface-container-high flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <img
                  src={displayAvatarUrl}
                  alt="Profile"
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
          <div>
            <h2 className="text-[24px] font-semibold text-on-surface">{fullName || "Your Name"}</h2>
            <p className="text-on-surface-variant">{role || "Role"}</p>
            <p className="text-sm text-on-surface-variant mt-1">{email || "Loading..."}</p>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="py-8 border-b border-border last:border-b-0">
        <div className="flex items-center gap-3 mb-6">
          <div>
            <h2 className="text-[22px] text-on-surface">Personal information</h2>
            <p className="text-sm text-on-surface-variant">Your name, title and timezone.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Full Name */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] text-on-surface-variant">Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full h-10 px-3.5 rounded-lg border border-outline-variant bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-colors focus:outline-none focus:border-on-surface/40 focus:ring-2 focus:ring-ring/10"
              placeholder="Enter your full name"
            />
          </div>

          {/* Email (Read-only) */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] text-on-surface-variant">Email
            </label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full h-10 px-3.5 rounded-lg border border-border bg-surface-container-low text-sm text-on-surface-variant cursor-not-allowed"
            />
            <p className="text-xs text-on-surface-variant">Email cannot be changed</p>
          </div>

          {/* Role */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] text-on-surface-variant">Title
            </label>
            {/* Free text: type any title, or pick a common one */}
            <input
              type="text"
              list="profile-title-options"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Social Media Manager"
              className="w-full h-10 px-3.5 rounded-lg border border-outline-variant bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-colors focus:outline-none focus:border-on-surface/40 focus:ring-2 focus:ring-ring/10"
            />
            <datalist id="profile-title-options">
              {roles.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>

          {/* Timezone */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] text-on-surface-variant">Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full h-10 px-3.5 rounded-lg border border-outline-variant bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-colors focus:outline-none focus:border-on-surface/40 focus:ring-2 focus:ring-ring/10"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error Message */}
        {saveError && (
          <p className="text-sm text-error mt-4">{saveError}</p>
        )}

        {/* Save Button */}
        <div className="flex justify-end mt-8">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="h-5 w-5" />
                Saved
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </div>

      {/* Account Section */}
      <div className="py-8 border-b border-border last:border-b-0">
        <div className="flex items-center gap-3 mb-6">
          <div>
            <h2 className="text-[22px] text-on-surface">Account</h2>
            <p className="text-sm text-on-surface-variant">Password and sign-out.</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Change Password */}
          <div className="flex items-center justify-between py-3 border-b border-outline-variant/30">
            <div>
              <p className="text-sm font-medium text-on-surface">Change password</p>
              <p className="text-xs text-on-surface-variant">Set a new password for this account.</p>
            </div>
            <button
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="inline-flex items-center h-9 px-4 rounded-full border border-outline-variant text-on-surface text-[13px] font-medium hover:bg-surface-container-low transition-colors"
            >
              {showPasswordForm ? "Cancel" : "Change password"}
            </button>
          </div>

          {/* Password Form - Removed "Current Password" field per Bug 3 */}
          {showPasswordForm && (
            <div className="p-5 rounded-xl border border-border flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[13px] text-on-surface-variant">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-outline-variant bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-colors focus:outline-none focus:border-on-surface/40 focus:ring-2 focus:ring-ring/10"
                  placeholder="Enter new password"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[13px] text-on-surface-variant">Confirm New password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-outline-variant bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-colors focus:outline-none focus:border-on-surface/40 focus:ring-2 focus:ring-ring/10"
                  placeholder="Confirm new password"
                />
              </div>
              {passwordError && (
                <p className="text-sm text-error">{passwordError}</p>
              )}
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
                className="self-end inline-flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 transition-colors disabled:opacity-50"
              >
                {isChangingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : passwordSaved ? (
                  <>
                    <Check className="h-4 w-4" />
                    Password updated
                  </>
                ) : (
                  "Update password"
                )}
              </button>
            </div>
          )}

          {/* Sign Out */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-on-surface">Sign out</p>
              <p className="text-xs text-on-surface-variant">Sign out of your account on this device</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full border border-error/30 text-error text-[13px] font-medium hover:bg-error-container transition-colors disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
