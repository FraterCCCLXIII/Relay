import { useCallback, useState } from "react";

const DEFAULT_A = "http://127.0.0.1:3001";

/**
 * Manually point at another origin’s **public** HTTP API (CORS + GET).
 * Use this to verify a second node while the app’s normal proxy is your local origin (B).
 */
export function RemoteNode() {
  const [url, setUrl] = useState(DEFAULT_A);
  const [log, setLog] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(
    async (path: string) => {
      setErr(null);
      const u = new URL(path, url.replace(/\/$/, ""));
      setLog((prev) => prev + `\nGET ${u.toString()}\n`);
      const r = await fetch(u.toString());
      const t = await r.text();
      if (t.trimStart().startsWith("<!")) {
        setErr("Got HTML — wrong URL or server error.");
        setLog((prev) => prev + t.slice(0, 200) + "…\n");
        return;
      }
      try {
        const j = JSON.parse(t) as unknown;
        setLog((prev) => prev + JSON.stringify(j, null, 2) + "\n");
      } catch {
        setLog((prev) => prev + t + "\n");
      }
    },
    [url],
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-twx-text dark:text-twx-dark-text">Remote node (federated read test)</h1>
      <p className="mt-2 text-sm text-twx-text/80 dark:text-twx-dark-text/80">
        Enter another Relay MVP origin’s base URL. This page runs <strong>direct</strong> browser fetches (not the Vite proxy) so
        CORS on the <strong>remote</strong> origin must allow this dev origin. Default demo uses the second stack on
        3001 while your UI is on 5173/5174.
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="min-w-0 flex-1 text-sm font-medium text-twx-text dark:text-twx-dark-text" htmlFor="ro-url">
          Remote origin base
        </label>
        <input
          id="ro-url"
          className="w-full rounded border border-twx-border bg-white px-3 py-2 text-sm text-twx-text dark:border-twx-dark-border dark:bg-twx-dark-elevated dark:text-twx-dark-text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          onClick={() => run("/health")}
        >
          GET /health
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-500/30 px-4 py-2 text-sm hover:bg-slate-500/10"
          onClick={() => run("/actors")}
        >
          GET /actors
        </button>
      </div>

      {err ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {err}
        </p>
      ) : null}
      <pre className="mt-4 max-h-96 overflow-auto rounded border border-twx-border bg-slate-50 p-3 text-xs dark:border-twx-dark-border dark:bg-black/20">
        {log || "—"}
      </pre>
    </main>
  );
}
