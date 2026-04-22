import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { OriginClient } from "@relay-mvp/sdk";
import { ORIGIN_URL } from "./config.js";

const STORAGE = "relay_mvp_demo_actor_slug";

type Ctx = {
  slug: string;
  setSlug: (s: string) => void;
  client: OriginClient;
};

const DemoActorContext = createContext<Ctx | null>(null);

export function DemoActorProvider(props: { children: ReactNode }) {
  const [slug, setSlugState] = useState(() => localStorage.getItem(STORAGE) ?? "bob");

  useEffect(() => {
    localStorage.setItem(STORAGE, slug);
  }, [slug]);

  const setSlug = useCallback((s: string) => setSlugState(s.toLowerCase()), []);

  const client = useMemo(() => new OriginClient({ baseUrl: ORIGIN_URL, demoActorSlug: slug }), [slug]);

  const v = useMemo(() => ({ slug, setSlug, client }), [slug, setSlug, client]);

  return <DemoActorContext.Provider value={v}>{props.children}</DemoActorContext.Provider>;
}

export function useDemoActor(): Ctx {
  const c = useContext(DemoActorContext);
  if (!c) throw new Error("DemoActorProvider missing");
  return c;
}
