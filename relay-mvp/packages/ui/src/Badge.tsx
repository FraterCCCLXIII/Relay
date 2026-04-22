import type { ReactNode } from "react";

export function Badge(props: { children: ReactNode; tone?: "neutral" | "info" | "warn" | "ok" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    info: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
    ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  };
  const t = tones[props.tone ?? "neutral"];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${t}`}>{props.children}</span>;
}
