"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("Service Worker registration failed:", err);
        });
    }
  }, []);

  return null;
}
