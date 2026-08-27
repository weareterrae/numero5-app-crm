"use client";

import { useEffect } from "react";

/** Regista o service worker mínimo — em silêncio, sem bloquear nada se falhar. */
export function PwaRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
