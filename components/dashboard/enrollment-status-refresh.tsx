"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
/** Refresh derived statuses without a sync click; do not run carrier jobs from a page. */
export function EnrollmentStatusRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const interval = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  return null;
}
