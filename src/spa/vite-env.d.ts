/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** git sha (or VITE_BUILD env) baked at build time; compared with /web/version.json */
  readonly VITE_BUILD: string;
}
