"use client";

import { useEffect } from "react";
import { applyPreferencesInBrowser, type Accent, type Theme } from "@/lib/preferences";

/**
 * If the user changed their theme on another device, the saved profile wins:
 * fix this browser's cookies and appearance.
 */
export function PrefsSync({ theme, accent }: { theme: Theme; accent: Accent }) {
  useEffect(() => {
    const d = document.documentElement;
    if (d.dataset.theme !== theme || d.dataset.accent !== accent) {
      applyPreferencesInBrowser({ theme, accent });
    }
  }, [theme, accent]);
  return null;
}
