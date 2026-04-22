import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ORIGIN_URL } from "../config.js";

type Providers = { local: boolean; google: boolean };

export function SignIn() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);

  useEffect(() => {
    void fetch(`${ORIGIN_URL}/auth/providers`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setProviders(j as Providers))
      .catch(() => setProviders({ local: true, google: false }));
  }, []);

  const onGoogle = useCallback(() => {
    window.location.assign(`${ORIGIN_URL}/auth/oauth/google?return_to=${encodeURIComponent("/reader")}`);
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErr(null);
      setBusy(true);
      try {
        const r = await fetch(`${ORIGIN_URL}/auth/login-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });
        if (!r.ok) {
          const t = await r.text();
          setErr(t || `HTTP ${r.status}`);
          return;
        }
        nav("/reader", { replace: true });
        window.location.reload();
      } catch (x) {
        setErr(x instanceof Error ? x.message : "sign in failed");
      } finally {
        setBusy(false);
      }
    },
    [email, password, nav],
  );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-extrabold text-twx-text dark:text-twx-dark-text">Sign in</h1>
      <p className="mt-1 text-sm text-twx-muted dark:text-twx-dark-muted">Email + password, or continue with Google when configured on the server.</p>

      {providers?.google ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={onGoogle}
            className="w-full max-w-sm rounded-full border border-twx-border bg-white py-2.5 text-[15px] font-semibold text-twx-text shadow-sm dark:border-twx-dark-border dark:bg-twx-dark-raised dark:text-twx-dark-text"
          >
            Continue with Google
          </button>
        </div>
      ) : null}

      {providers?.local ? (
        <form onSubmit={onSubmit} className="mt-6 max-w-sm space-y-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="em">
              Email
            </label>
            <input
              id="em"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-0.5 w-full rounded border border-twx-border bg-twx-raised px-3 py-2 text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="pw">
              Password
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-0.5 w-full rounded border border-twx-border bg-twx-raised px-3 py-2 text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
              required
            />
          </div>
          {err ? <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-twx-blue py-2.5 text-[15px] font-bold text-white transition hover:bg-twx-blue-hover disabled:opacity-50"
          >
            {busy ? "…" : "Sign in"}
          </button>
        </form>
      ) : null}

      <p className="mt-4 text-sm text-twx-muted dark:text-twx-dark-muted">
        No account?{" "}
        <Link to="/register" className="font-semibold text-twx-blue">
          Create one
        </Link>
        {" · "}
        <Link to="/" className="text-twx-blue">
          Home
        </Link>
      </p>
    </div>
  );
}
