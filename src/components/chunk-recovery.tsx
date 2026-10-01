"use client";

import { useEffect } from "react";

export function ChunkRecovery() {
  useEffect(() => {
    function staleChunk(message: string) {
      return /ChunkLoadError|Loading chunk|_next\/_next|_next\/\/_next/i.test(message);
    }
    function recover() {
      const key = "kitty-chunk-reload";
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    }
    const onError = (event: ErrorEvent) => {
      if (staleChunk(event.message || String(event.error ?? ""))) recover();
    };
    const onReject = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = typeof reason === "string" ? reason : String(reason?.message ?? reason ?? "");
      if (staleChunk(message)) recover();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);
  return null;
}
