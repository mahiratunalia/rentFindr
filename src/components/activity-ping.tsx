"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 min — enough to make "last active" meaningful without pinging on every navigation
const STORAGE_KEY = "rentfindr:last-activity-ping";

// Invisible — mounted once at the root so every authenticated page view keeps
// a profile's "last active" signal fresh, throttled via localStorage so it
// doesn't fire an API call on every single route change.
export function ActivityPing() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    const last = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    if (Date.now() - last < PING_INTERVAL_MS) return;
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    fetch("/api/activity/ping", { method: "POST" }).catch(() => {});
  }, [status]);

  return null;
}
