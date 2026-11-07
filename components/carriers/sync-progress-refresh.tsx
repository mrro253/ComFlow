"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh only while a queued run or verification flow is active. */
export function SyncProgressRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    const visible = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [active, router]);
  return null;
}
