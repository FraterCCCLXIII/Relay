import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { OriginClient } from "@relay-mvp/sdk";
import { ORIGIN_URL } from "./config.js";

const STORAGE = "relay_mvp_demo_actor_slug";
const useSession = import.meta.env.VITE_USE_SESSION === "1";

type Ctx = {
  slug: string;
  setSlug: (s: string) => void;
  client: OriginClient;
  sessionMode: boolean;
};

const DemoActorContext = createContext<Ctx | null>(null);

export function DemoActorProvider(props: { children: ReactNode }) {
  const [slug, setSlugState] = useState(() => localStorage.getItem(STORAGE) ?? "bob");

  useEffect(() => {
    localStorage.setItem(STORAGE, slug);
  }, [slug]);

  const setSlug = useCallback((s: string) => setSlugState(s.toLowerCase()), []);

  /** After password/OAuth login, server session wins over localStorage. */
  useEffect(() => {
    if (!useSession) return;
    void (async () => {
      try {
        const r = await fetch(`${ORIGIN_URL}/auth/me`, { credentials: "include" });
        if (r.ok) {
          const j = (await r.json()) as { slug?: string };
          if (j.slug) setSlugState(j.slug);
        }
      } catch {
        /* origin down */
      }
    })();
  }, [useSession]);

  const client = useMemo(
    () =>
      new OriginClient({
        baseUrl: ORIGIN_URL,
        demoActorSlug: slug,
        authMode: useSession ? "session" : "header",
      }),
    [slug],
  );

  /** Cookie session: POST /auth/login when the chosen slug changes (or on first run). */
  useEffect(() => {
    if (!useSession) return;
    const u = `${ORIGIN_URL}/auth/login`;
    void (async () => {
      try {
        await fetch(u, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
          credentials: "include",
        });
      } catch {
        /* ignore: origin may be down in dev */
      }
    })();
  }, [slug]);

  const v = useMemo(() => ({ slug, setSlug, client, sessionMode: useSession }), [slug, setSlug, client]);

  return <DemoActorContext.Provider value={v}>{props.children}</DemoActorContext.Provider>;
}

export function useDemoActor(): Ctx {
  const c = useContext(DemoActorContext);
  if (!c) throw new Error("DemoActorProvider missing");
  return c;
}
