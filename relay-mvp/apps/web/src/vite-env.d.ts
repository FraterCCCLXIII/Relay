/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by unified dev server so the UI uses same-origin /api/relay/ws */
  readonly VITE_RELAY_SAME_ORIGIN?: string;
  readonly VITE_ORIGIN_URL?: string;
  readonly VITE_RELAY_WS?: string;
  readonly VITE_INDEXER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
