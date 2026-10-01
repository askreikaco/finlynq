"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SmartphoneIcon, Check } from "lucide-react";
import { formatDateTimeLocal } from "@/lib/currency";

const STRINGS = {
  title: "Trusted devices",
  description: "Manage devices that can sign in without a password",
  deviceNote: "Trusted devices let you sign in with Google without your password for 30 days.",
  deviceCurrent: "This device",
  createdLabel: "Added",
  lastUsedLabel: "Last used",
  revokeButton: "Revoke",
  revokeAllButton: "Revoke all devices",
  signOutOthersButton: "Sign out other devices",
  signOutOthersConfirm: "Sign out every other device? They will need to sign in again. This device stays signed in.",
  signOutOthersSuccess: "Other devices signed out",
  revokeAllConfirm: "Are you sure? You'll need to sign in again on all devices.",
  revoking: "Revoking…",
  noDevices: "No trusted devices",
  revokeSuccess: "Device revoked",
  revokeAllSuccess: "All devices revoked",
  genericError: "An error occurred",
} as const;

interface Device {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
}

export function TrustedDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | "all" | "others" | null>(null);
  const [message, setMessage] = useState("");

  // Load devices
  useEffect(() => {
    async function loadDevices() {
      try {
        // pf_device is httpOnly with path /api/auth, so the current-device id
        // must come from an /api/auth/ endpoint and be merged here.
        const [res, curRes] = await Promise.all([
          fetch("/api/settings/sign-in-methods"),
          fetch("/api/auth/device-current"),
        ]);
        let currentId: string | null = null;
        if (curRes.ok) {
          currentId = (await curRes.json()).id ?? null;
        }
        if (res.ok) {
          const data = await res.json();
          setDevices(
            ((data.devices || []) as Device[]).map((dev) => ({
              ...dev,
              current: currentId !== null && dev.id === currentId,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load devices:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDevices();
  }, []);

  async function handleRevokeDevice(deviceId: string) {
    setRevoking(deviceId);
    setMessage("");
    try {
      const res = await fetch(`/api/settings/devices?id=${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDevices((d) => d.filter((dev) => dev.id !== deviceId));
        setMessage(STRINGS.revokeSuccess);
      } else {
        setMessage(STRINGS.genericError);
      }
    } catch (err) {
      console.error("Failed to revoke device:", err);
      setMessage(STRINGS.genericError);
    } finally {
      setRevoking(null);
    }
  }

  async function handleRevokeAllDevices() {
    if (!window.confirm(STRINGS.revokeAllConfirm)) {
      return;
    }

    setRevoking("all");
    setMessage("");
    try {
      const res = await fetch("/api/settings/devices?all=1", {
        method: "DELETE",
      });

      if (res.ok) {
        setDevices([]);
        setMessage(STRINGS.revokeAllSuccess);
      } else {
        setMessage(STRINGS.genericError);
      }
    } catch (err) {
      console.error("Failed to revoke all devices:", err);
      setMessage(STRINGS.genericError);
    } finally {
      setRevoking(null);
    }
  }

  async function handleSignOutOthers() {
    if (!window.confirm(STRINGS.signOutOthersConfirm)) {
      return;
    }
    const others = devices.filter((d) => !d.current);
    setRevoking("others");
    setMessage("");
    try {
      // One DELETE per device id (existing endpoint): ?all=1 would also revoke THIS device.
      const results = await Promise.all(
        others.map((d) =>
          fetch(`/api/settings/devices?id=${encodeURIComponent(d.id)}`, { method: "DELETE" }).then(
            (r) => ({ id: d.id, ok: r.ok }),
            () => ({ id: d.id, ok: false })
          )
        )
      );
      const revoked = new Set(results.filter((r) => r.ok).map((r) => r.id));
      setDevices((list) => list.filter((d) => !revoked.has(d.id)));
      setMessage(revoked.size === others.length ? STRINGS.signOutOthersSuccess : STRINGS.genericError);
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <SmartphoneIcon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{STRINGS.title}</CardTitle>
            <CardDescription>{STRINGS.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{STRINGS.deviceNote}</p>

        <div role="status" aria-live="polite">
          {message && (
            <p className="text-sm text-emerald-600 flex items-center gap-2">
              <Check className="h-4 w-4" aria-hidden="true" />
              {message}
            </p>
          )}
        </div>

        {devices.length > 0 ? (
          <>
            <div className="space-y-2">
              {devices.map((device) => (
                <div key={device.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="text-sm flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{device.label}</p>
                      {device.current && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {STRINGS.deviceCurrent}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {STRINGS.createdLabel} {formatDateTimeLocal(device.createdAt)}
                    </p>
                    {device.lastUsedAt && (
                      <p className="text-xs text-muted-foreground">
                        {STRINGS.lastUsedLabel} {formatDateTimeLocal(device.lastUsedAt)}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${STRINGS.revokeButton} ${device.label}`}
                    onClick={() => handleRevokeDevice(device.id)}
                    disabled={device.current || revoking !== null}
                    className={revoking === device.id ? "opacity-60" : ""}
                  >
                    {revoking === device.id ? STRINGS.revoking : STRINGS.revokeButton}
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {devices.some((d) => !d.current) && (
                <Button variant="outline" size="sm" onClick={handleSignOutOthers} disabled={revoking !== null}>
                  {revoking === "others" ? STRINGS.revoking : STRINGS.signOutOthersButton}
                </Button>
              )}
              {devices.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevokeAllDevices}
                  disabled={revoking !== null}
                >
                  {revoking === "all" ? STRINGS.revoking : STRINGS.revokeAllButton}
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{STRINGS.noDevices}</p>
        )}
      </CardContent>
    </Card>
  );
}
