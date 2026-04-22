import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div className="px-4 py-10">
      <div className="mb-2 inline-block rounded bg-twx-raised px-2 py-0.5 text-sm font-bold text-twx-blue dark:bg-twx-dark-raised">Relay</div>
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Happen in real time, stay origin‑true</h1>
      <p className="mt-3 max-w-lg text-lg text-twx-muted dark:text-twx-dark-muted">
        A minimal social surface: an origin‑authoritative feed, follows, and channel overlays. WebSocket is acceleration only; HTTP
        is always the source of truth.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          to="/reader"
          className="inline-flex items-center justify-center rounded-full bg-twx-blue px-5 py-2.5 text-center text-[15px] font-bold text-white hover:bg-twx-blue-hover"
        >
          See home
        </Link>
        <Link
          to="/publisher"
          className="inline-flex items-center justify-center rounded-full border border-twx-border px-5 py-2.5 text-center text-[15px] font-bold text-twx-text dark:border-twx-dark-border dark:text-twx-dark-text"
        >
          Post
        </Link>
        <Link to="/diagnostics" className="text-center text-sm text-twx-blue hover:underline">
          System
        </Link>
      </div>
    </div>
  );
}
