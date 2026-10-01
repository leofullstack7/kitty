"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type Me = {
  id: string;
  username: string;
  role: "ADMIN" | "KITTY" | "USER";
  displayName: string;
  balance: number;
  kittySlug?: string | null;
  unread?: number;
  investedCop?: number;
  spentCop?: number;
  earnedCop?: number;
  sentCop?: number;
};

const CACHE_KEY = "kitty_me_v2";
const CACHE_TTL = 120_000;

const Ctx = createContext<{ me: Me | null; refresh: () => Promise<void>; loading: boolean }>({
  me: null,
  refresh: async () => {},
  loading: true,
});

function readCache(): Me | null | undefined {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { at: number; me: Me | null };
    if (Date.now() - parsed.at > CACHE_TTL) return undefined;
    return parsed.me;
  } catch {
    return undefined;
  }
}

function writeCache(me: Me | null) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), me }));
  } catch {
    /* ignore quota */
  }
}

export function clearSessionCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const inflight = useRef<Promise<void> | null>(null);
  const router = useRouter();

  async function refresh() {
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          setMe(null);
          writeCache(null);
          return;
        }
        const data = await res.json();
        setMe(data.me);
        writeCache(data.me ?? null);
      } catch {
        setMe(null);
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    return inflight.current;
  }

  useEffect(() => {
    const cached = readCache();
    if (cached !== undefined) {
      setMe(cached);
      setLoading(false);
    }
    void refresh();
  }, []);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/explore");
    router.prefetch("/login");
    if (!me) return;
    router.prefetch("/wallet");
    if (me.role === "ADMIN") router.prefetch("/admin");
    if (me.role === "KITTY") {
      router.prefetch("/studio");
      router.prefetch("/inbox");
    }
    if (me.role === "USER") router.prefetch("/inbox");
  }, [me, router]);

  return <Ctx.Provider value={{ me, refresh, loading }}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}
