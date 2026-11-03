/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_REAL_API?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_HERO_VIDEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
