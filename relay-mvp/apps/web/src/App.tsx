import { NavLink, Route, Routes } from "react-router-dom";
import { DemoActorProvider, useDemoActor } from "./demoActor.js";
import { Landing } from "./pages/Landing.js";
import { ReaderHome } from "./pages/ReaderHome.js";
import { PostDetail } from "./pages/PostDetail.js";
import { ActorPage } from "./pages/ActorPage.js";
import { ChannelPage } from "./pages/ChannelPage.js";
import { Publisher } from "./pages/Publisher.js";
import { Diagnostics } from "./pages/Diagnostics.js";
import { ChannelsList } from "./pages/ChannelsList.js";
import { RemoteNode } from "./pages/RemoteNode.js";
import { SignIn } from "./pages/SignIn.js";
import { Register } from "./pages/Register.js";

const navItem =
  "flex items-center justify-center gap-4 rounded-full px-2 py-2.5 text-xl transition-colors duration-200 md:justify-start md:gap-3 md:px-4 md:py-3 md:text-[20px]";

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    navItem,
    isActive
      ? "font-bold text-twx-text dark:text-twx-dark-text"
      : "font-normal text-twx-text/90 hover:bg-slate-500/10 dark:text-twx-dark-text/90",
  ].join(" ");

function IconHome() {
  return (
    <svg className="h-7 w-7 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955c.44-.44 1.15-.44 1.59 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5"
      />
    </svg>
  );
}

function IconCompose() {
  return (
    <svg className="h-7 w-7 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconHash() {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[1.4rem] font-light leading-none" aria-hidden>
      #
    </span>
  );
}

function IconCog() {
  return (
    <svg className="h-7 w-7 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function Shell() {
  const { slug, setSlug } = useDemoActor();
  return (
    <div className="min-h-screen w-full text-twx-text dark:text-twx-dark-text">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col border-r border-twx-border px-2 py-2 dark:border-twx-dark-border sm:flex md:w-20 lg:w-64 lg:pl-3 lg:pr-2 xl:w-[275px]">
            <div className="mb-1 flex w-full items-center p-2 md:justify-center lg:justify-start">
            <NavLink
              to="/"
              className="flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold text-twx-blue transition hover:bg-sky-500/10"
              title="Relay"
            >
              R
            </NavLink>
            <NavLink
              to="/sign-in"
              className="ml-1 hidden text-[12px] font-medium text-twx-muted underline-offset-2 hover:underline dark:text-twx-dark-muted lg:ml-2 lg:inline"
            >
              Sign in
            </NavLink>
          </div>
          <nav className="mt-0 flex flex-1 flex-col gap-0.5" aria-label="Primary">
            <NavLink to="/reader" className={navClass} title="Home" end>
              <IconHome />
              <span className="hidden lg:inline">Home</span>
            </NavLink>
            <NavLink to="/publisher" className={navClass} title="Post" end>
              <IconCompose />
              <span className="hidden lg:inline">Post</span>
            </NavLink>
            <NavLink to="/channels" className={navClass} title="Channels" end>
              <IconHash />
              <span className="hidden lg:inline">Channels</span>
            </NavLink>
            <NavLink to="/remote" className={navClass} title="Remote node" end>
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-lg" aria-hidden>
                ↗
              </span>
              <span className="hidden lg:inline">Remote</span>
            </NavLink>
            <NavLink to="/diagnostics" className={navClass} title="System" end>
              <IconCog />
              <span className="hidden lg:inline">System</span>
            </NavLink>
            <div className="mt-2 hidden w-full md:block">
              <NavLink
                to="/publisher"
                className="block w-full min-w-0 rounded-full bg-twx-blue py-2.5 text-center text-[15px] font-bold text-white transition hover:bg-twx-blue-hover"
              >
                <span className="lg:hidden">+</span>
                <span className="hidden lg:inline">Post</span>
              </NavLink>
            </div>
          </nav>
          <div className="mb-2 mt-auto hidden flex-col gap-1 md:flex">
            <label className="sr-only" htmlFor="actor">
              Demo actor
            </label>
            <select
              id="actor"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full max-w-full cursor-pointer rounded border border-twx-border bg-twx-raised py-1.5 pl-2 text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
            >
              <option value="alice">Alice</option>
              <option value="bob">Bob</option>
              <option value="mod">Mod</option>
            </select>
            <p className="hidden text-center text-xs text-twx-muted dark:text-twx-dark-muted lg:block">Head auth</p>
          </div>
        </aside>

        <div className="min-h-screen min-w-0 flex-1 border-twx-border dark:border-twx-dark-border sm:border-x">
          <header className="sticky top-0 z-10 border-b border-twx-border bg-twx-bg/85 px-2 py-2 backdrop-blur-md dark:border-twx-dark-border dark:bg-twx-dark-bg/90 sm:hidden">
            <div className="mx-auto flex max-w-feed items-center justify-between">
              <NavLink to="/" className="ml-1 text-xl font-bold text-twx-blue">
                R
              </NavLink>
              <div className="flex flex-1 items-center justify-end gap-1 overflow-x-auto text-sm">
                <NavLink to="/reader" className="shrink-0 rounded-full px-2 py-1 font-medium hover:bg-slate-500/10">
                  Home
                </NavLink>
                <NavLink to="/publisher" className="shrink-0 rounded-full px-2 py-1 font-medium hover:bg-slate-500/10">
                  Post
                </NavLink>
                <NavLink to="/channels" className="shrink-0 rounded-full px-2 py-1 font-medium hover:bg-slate-500/10">
                  #</NavLink>
                <NavLink to="/remote" className="shrink-0 rounded-full px-2 py-1 font-medium hover:bg-slate-500/10">
                  ↗
                </NavLink>
                <NavLink to="/diagnostics" className="shrink-0 rounded-full px-2 py-1 font-medium hover:bg-slate-500/10">
                  ···
                </NavLink>
              </div>
            </div>
          </header>
          <div className="sm:hidden border-b border-twx-border dark:border-twx-dark-border">
            <div className="mx-auto flex max-w-feed items-center gap-2 px-3 py-2">
              <span className="text-xs text-twx-muted dark:text-twx-dark-muted">As</span>
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="ml-auto min-w-0 flex-1 rounded border border-twx-border bg-twx-raised py-1 pl-2 text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
              >
                <option value="alice">Alice</option>
                <option value="bob">Bob</option>
                <option value="mod">Mod</option>
              </select>
            </div>
          </div>
          <div className="mx-auto w-full max-w-feed">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/reader" element={<ReaderHome />} />
              <Route path="/post/:actorId/:objectId" element={<PostDetail />} />
              <Route path="/actor/:actorId" element={<ActorPage />} />
              <Route path="/channels" element={<ChannelsList />} />
              <Route path="/channel/:channelId" element={<ChannelPage />} />
              <Route path="/publisher" element={<Publisher />} />
              <Route path="/diagnostics" element={<Diagnostics />} />
              <Route path="/remote" element={<RemoteNode />} />
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/register" element={<Register />} />
            </Routes>
          </div>
        </div>
        <aside className="hidden min-h-screen w-80 max-w-sm shrink-0 flex-col gap-2 py-1 pl-4 pr-3 xl:flex">
          <div className="sticky top-1 space-y-3 pt-1">
            <div className="rounded-full border border-twx-border bg-twx-raised py-1.5 pl-4 text-twx-muted dark:border-twx-dark-border dark:bg-twx-dark-raised dark:text-twx-dark-muted">
              <span className="text-[15px]">Search</span> <span className="text-sm opacity-60">(MVP)</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-twx-border dark:border-twx-dark-border">
              <h2 className="px-3 py-3 text-xl font-extrabold">What to read</h2>
              <div className="px-3 pb-3 text-sm text-twx-muted dark:text-twx-dark-muted">
                <p className="text-[15px] text-twx-text/90 dark:text-twx-dark-text/90">
                  Relay: origin-authoritative posts, follow graph, and channel overlays. Open <strong>Home</strong> for the timeline.
                </p>
              </div>
            </div>
            <p className="pr-2 text-xs text-twx-muted/90 dark:text-twx-dark-muted/90">
              &copy; {new Date().getFullYear()} Relay MVP
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DemoActorProvider>
      <Shell />
    </DemoActorProvider>
  );
}
