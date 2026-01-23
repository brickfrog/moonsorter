const CLIENT_ID = import.meta.env.PUBLIC_ANILIST_CLIENT_ID as string | undefined;
const RESPONSE_TYPE = (import.meta.env
  .PUBLIC_ANILIST_RESPONSE_TYPE as string | undefined) ?? 'code';
const REDIRECT_URI = import.meta.env
  .PUBLIC_ANILIST_REDIRECT_URI as string | undefined;
const TOKEN_KEY = 'moonsorter.anilist_token';

function getRedirectUri(): string {
  if (REDIRECT_URI) return REDIRECT_URI;
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/callback`;
}

function storeToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function login(): void {
  if (!CLIENT_ID) {
    throw new Error('Set PUBLIC_ANILIST_CLIENT_ID in .env');
  }
  const redirectUri = getRedirectUri();
  if (!redirectUri) {
    throw new Error('Redirect URI not available.');
  }
  const responseType = RESPONSE_TYPE === 'code' ? 'code' : 'token';
  const url =
    `https://anilist.co/api/v2/oauth/authorize?` +
    `client_id=${CLIENT_ID}&response_type=${responseType}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function storeTokenFromHash(hash: string): string | null {
  if (!hash) return null;
  const match = hash.match(/access_token=([^&]+)/);
  if (!match) return null;
  const token = match[1];
  storeToken(token);
  return token;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch('/api/anilist/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('No access token returned.');
  }
  storeToken(data.access_token);
  return data.access_token;
}

export async function consumeAuthResponse(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const token = storeTokenFromHash(window.location.hash);
  if (token) {
    window.history.replaceState({}, '', window.location.pathname);
    return token;
  }
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;
  const exchanged = await exchangeCodeForToken(code);
  window.history.replaceState({}, '', window.location.pathname);
  return exchanged;
}
