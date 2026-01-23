/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_ANILIST_CLIENT_ID?: string;
  readonly PUBLIC_ANILIST_RESPONSE_TYPE?: string;
  readonly PUBLIC_ANILIST_REDIRECT_URI?: string;
  readonly ANILIST_CLIENT_ID?: string;
  readonly ANILIST_CLIENT_SECRET?: string;
  readonly ANILIST_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
