/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_ANILIST_CLIENT_ID?: string;
  readonly PUBLIC_ANILIST_RESPONSE_TYPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type Html2CanvasOptions = {
  useCORS?: boolean;
  allowTaint?: boolean;
  backgroundColor?: string;
  scale?: number;
  logging?: boolean;
};

/** Loaded from a CDN <script> tag in components/TierList.astro. */
declare const html2canvas:
  | ((element: HTMLElement, options?: Html2CanvasOptions) => Promise<HTMLCanvasElement>)
  | undefined;

interface Window {
  html2canvas?: typeof html2canvas;
}
