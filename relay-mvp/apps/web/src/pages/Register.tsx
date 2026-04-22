import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ORIGIN_URL } from "../config.js";

export function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErr(null);
      setBusy(true);
      try {
        const r = await fetch(`${ORIGIN_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email,
            password,
            slug,
            displayName: displayName.trim() || undefined,
          }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!r.ok) {
          setErr(j.message || j.error || r.statusText);
          return;
        }
        nav("/reader", { replace: true });
        window.location.reload();
      } catch (x) {
        setErr(x instanceof Error ? x.message : "register failed");
      } finally {
        setBusy(false);
      }
    },
    [email, password, slug, displayName, nav],
  );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-extrabold text-twx-text dark:text-twx-dark-text">Create account</h1>
      <p className="mt-1 text-sm text-twx-muted dark:text-twx-dark-muted">Choose a public <strong>handle</strong> (slug) and a password. Your actor gets a new Ed25519 key on the server.</p>

      <form onSubmit={onSubmit} className="mt-6 max-w-sm space-y-3">
        <div>
          <label className="block text-sm font-medium" htmlFor="slug">
            Handle (3–32: a–z, 0–9, _)
          </label>
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            className="mt-0.5 w-full rounded border border-twx-border bg-twx-raised px-3 py-2 font-mono text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
            pattern="[a-z0-9_]{3,32}"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="dn">
            Display name (optional)
          </label>
          <input
            id="dn"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-0.5 w-full rounded border border-twx-border bg-twx-raised px-3 py-2 text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="em2">
            Email
          </label>
          <input
            id="em2"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-0.5 w-full rounded border border-twx-border bg-twx-raised px-3 py-2 text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="pw2">
            Password (min 8)
          </label>
          <input
            id="pw2"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-0.5 w-full rounded border border-twx-border bg-twx-raised px-3 py-2 text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
            minLength={8}
            required
          />
        </div>
        {err ? <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-twx-blue py-2.5 text-[15px] font-bold text-white transition hover:bg-twx-blue-hover disabled:opacity-50"
        >
          {busy ? "…" : "Register"}
        </button>
      </form>

      <p className="mt-4 text-sm text-twx-muted dark:text-twx-dark-muted">
        Already have an account?{" "}
        <Link to="/sign-in" className="font-semibold text-twx-blue">
          Sign in
        </Link>
      </p>
    </div>
  );
}
