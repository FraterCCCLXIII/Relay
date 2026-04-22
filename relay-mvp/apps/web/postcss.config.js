import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `tailwindcss: {}` lets Tailwind discover config from `process.cwd()`.
 * @relay-mvp/unified sets Vite `root` to apps/web but runs with cwd = apps/unified, so
 * config was not found, `content` was empty, and dev CSS was missing almost all utilities.
 */
export default {
  plugins: [tailwind({ config: path.join(__dirname, "tailwind.config.js") }), autoprefixer()],
};
