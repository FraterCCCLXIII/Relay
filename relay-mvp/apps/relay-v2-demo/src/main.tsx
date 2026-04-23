import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
