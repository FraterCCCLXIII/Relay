import { OriginClient } from "@relay-mvp/sdk";

const origin = import.meta.env.VITE_ORIGIN_URL?.trim() || "/api";
const list = document.querySelector("#list")!;
const errEl = document.querySelector("#err")!;

const client = new OriginClient({ baseUrl: origin, demoActorSlug: "bob", authMode: "header" });

void (async () => {
  try {
    const actors = await client.listActors();
    for (const a of actors) {
      const li = document.createElement("li");
      li.textContent = `${a.slug}  ${a.actor_id}`;
      list.appendChild(li);
    }
  } catch (e) {
    errEl.textContent = e instanceof Error ? e.message : String(e);
  }
})();
