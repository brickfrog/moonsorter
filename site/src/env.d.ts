/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_ANILIST_CLIENT_ID?: string;
  readonly PUBLIC_ANILIST_RESPONSE_TYPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
