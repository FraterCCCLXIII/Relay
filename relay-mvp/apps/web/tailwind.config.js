import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve `content` from this file, not from `process.cwd()`.
 * `@relay-mvp/unified` runs Vite with `root` = apps/web but cwd = apps/unified, so relative
 * `./src/**` was scanning the wrong tree and the JIT build shipped almost no utilities in dev.
 */
const content = [
  path.join(__dirname, "index.html"),
  path.join(__dirname, "src/**/*.{ts,tsx}"),
  path.join(__dirname, "../../packages/ui/src/**/*.{ts,tsx}"),
];

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content,
  theme: {
    extend: {
      fontSize: {
        "feed": ["0.9375rem", { lineHeight: "1.25rem" }], // ~15px, X-like
      },
      colors: {
        // Twitter/X–inspired tokens (light + dark)
        twx: {
          bg: "#ffffff",
          raised: "#f7f9f9",
          blue: "#1d9bf0",
          "blue-hover": "#1a8cd8",
          text: "#0f1419",
          muted: "#536471",
          border: "#eff3f4",
          "like-on": "#f91880",
        },
        "twx-dark": {
          bg: "#000000",
          raised: "#16181c",
          /** inputs / nested panels */
          surface: "#202327",
          text: "#e7e9ea",
          muted: "#71767b",
          border: "#2f3336",
        },
      },
      maxWidth: {
        feed: "37.5rem", // 600px
      },
    },
  },
  plugins: [],
};
