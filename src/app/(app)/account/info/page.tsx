"use client";

/**
 * /account/info — Profile information: username, display name, email, phone, avatar
 */

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { User, Mail, Phone, Check, AlertCircle, Trash2 } from "lucide-react";

type Profile = {
  username: string | null;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
};

export default function InfoPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Status
  const [displayNameStatus, setDisplayNameStatus] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Load profile
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/user/me");
        if (!res.ok) throw new Error("Failed to load profile");
        const data = await res.json();
        setProfile(data);
        setDisplayName(data.displayName || "");
        setPhone(data.phone || "");
        setEmail(data.email || "");
        setAvatarUrl(data.avatarUrl || null);
        if (data.avatarUrl) {
          setAvatarPreview(data.avatarUrl);
        }
      } catch (err) {
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [reloadKey]);

  async function handleSaveDisplayName(e: React.FormEvent) {
    e.preventDefault();
    setDisplayNameError("");
    setDisplayNameStatus("");
    setDisplayNameSaving(true);

    try {
      const res = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDisplayNameError(data.error || "Failed to update display name");
        return;
      }
      setProfile(data);
      setDisplayNameStatus("Display name updated");
    } catch (err) {
      setDisplayNameError("Failed to update display name");
    } finally {
      setDisplayNameSaving(false);
    }
  }

  async function handleSavePhone(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError("");
    setPhoneStatus("");

    const phoneValue = phone.trim() || null;
    if (phoneValue && !/^[+0-9 ()-]*$/.test(phoneValue)) {
      setPhoneError("Phone can only contain +, digits, spaces, parentheses, and hyphens");
      return;
    }
    if (phoneValue && phoneValue.length > 32) {
      setPhoneError("Phone must be 32 characters or less");
      return;
    }

    setPhoneSaving(true);
    try {
      const res = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneError(data.error || "Failed to update phone");
        return;
      }
      setProfile(data);
      setPhone(data.phone || "");
      setPhoneStatus("Phone updated");
    } catch (err) {
      setPhoneError("Failed to update phone");
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailStatus("");
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: email, currentPassword: emailPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailError(data.error || "Failed to change email.");
        return;
      }
      const saved = data.email ?? email;
      setProfile((p) => (p ? { ...p, email: saved } : p));
      setEmailStatus(`Verification email sent to ${saved}. Check your inbox to confirm.`);
      setEmail("");
      setEmailPw("");
    } catch {
      setEmailError("Failed to change email.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError("");
    setAvatarStatus("");

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file");
      return;
    }

    try {
      // Read file and resize to 256x256
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imgData = e.target?.result as string;

        // Create image element to resize
        const img = new Image();
        img.onload = async () => {
          // Create canvas and resize
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setAvatarError("Failed to process image");
            return;
          }

          // Draw image centered and cropped
          const scale = Math.max(256 / img.width, 256 / img.height);
          const x = (256 / scale - img.width) / 2;
          const y = (256 / scale - img.height) / 2;
          ctx.scale(scale, scale);
          ctx.drawImage(img, x, y);

          // Convert to JPEG data URL
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

          // Check size
          if (dataUrl.length > 140000) {
            setAvatarError("Avatar too large (max 140KB)");
            return;
          }

          setAvatarPreview(dataUrl);
          setAvatarUrl(dataUrl);

          // Auto-save
          try {
            const res = await fetch("/api/user/me", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ avatarUrl: dataUrl }),
            });
            const data = await res.json();
            if (!res.ok) {
              setAvatarError(data.error || "Failed to save avatar");
              return;
            }
            setProfile(data);
            setAvatarStatus("Avatar updated");
          } catch {
            setAvatarError("Failed to save avatar");
          }
        };
        img.onerror = () => setAvatarError("Failed to load image");
        img.src = imgData;
      };
      reader.onerror = () => setAvatarError("Failed to read file");
      reader.readAsDataURL(file);
    } catch (err) {
      setAvatarError("Failed to process avatar");
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError("");
    setAvatarStatus("");

    try {
      const res = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(data.error || "Failed to remove avatar");
        return;
      }
      setProfile(data);
      setAvatarUrl(null);
      setAvatarPreview(null);
      setAvatarStatus("Avatar removed");
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    } catch {
      setAvatarError("Failed to remove avatar");
    }
  }

  if (loading) {
    return <PageSkeleton variant="list" rows={4} />;
  }

  if (error) {
    return (
      <ErrorState
        title="Couldn't load your profile"
        message="Please try again."
        onRetry={() => {
          setError("");
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  if (!profile) {
    return (
      <ErrorState
        title="Couldn't load your profile"
        message="Please try again."
        onRetry={() => {
          setError("");
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/10 text-chart-5">
              <User className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Avatar</CardTitle>
              <CardDescription>Upload your profile picture (JPEG or PNG, max 140KB)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar Preview */}
          {avatarPreview && (
            <div className="flex items-start gap-4">
              <img
                src={avatarPreview}
                alt="Avatar preview"
                className="w-24 h-24 rounded-lg object-cover border border-border"
              />
              <div className="flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove Avatar
                </Button>
              </div>
            </div>
          )}

          {!avatarPreview && (
            <div className="flex items-center justify-center w-24 h-24 rounded-lg border-2 border-dashed border-border bg-muted/30">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          )}

          <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
            Change Avatar
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleAvatarChange}
            />
          </label>

          {avatarError && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" /> {avatarError}</p>}
          {avatarStatus && <p className="text-sm text-pos flex items-center gap-1"><Check className="h-3.5 w-3.5" /> {avatarStatus}</p>}
        </CardContent>
      </Card>

      {/* Username (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Username</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="text"
            value={profile.username || ""}
            disabled
            className="max-w-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">Your username cannot be changed.</p>
        </CardContent>
      </Card>

      {/* Display Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display Name</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveDisplayName} className="space-y-3 max-w-sm">
            <Input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your full name"
              maxLength={80}
            />
            {displayNameError && <p className="text-sm text-destructive">{displayNameError}</p>}
            {displayNameStatus && <p className="text-sm text-pos flex items-center gap-1"><Check className="h-3.5 w-3.5" /> {displayNameStatus}</p>}
            <Button type="submit" disabled={displayNameSaving}>
              {displayNameSaving ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Phone */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pos/10 text-pos">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Phone</CardTitle>
              <CardDescription>Optional phone number for your profile</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePhone} className="space-y-3 max-w-sm">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              maxLength={32}
            />
            <p className="text-xs text-muted-foreground">Accepts +, digits, spaces, parentheses, and hyphens.</p>
            {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
            {phoneStatus && <p className="text-sm text-pos flex items-center gap-1"><Check className="h-3.5 w-3.5" /> {phoneStatus}</p>}
            <Button type="submit" disabled={phoneSaving}>
              {phoneSaving ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Email</CardTitle>
              <CardDescription>Recovery email used to reset a forgotten password</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Current: <span className="font-medium text-foreground">{profile?.email || "none set"}</span>
          </p>
          <form onSubmit={handleChangeEmail} className="space-y-3 max-w-sm">
            <div>
              <label className="text-xs font-medium text-muted-foreground">New email</label>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Current password</label>
              <Input type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
            </div>
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
            {emailStatus && <p className="text-sm text-pos flex items-center gap-1"><Check className="h-3.5 w-3.5" /> {emailStatus}</p>}
            <Button type="submit" disabled={emailSaving || !email || !emailPw}>
              {emailSaving ? "Saving…" : "Update email"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
