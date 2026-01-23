export const prerender = false;

function getEnv(name: string): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[name];
}

export async function POST({ request }: { request: Request }) {
  let payload: { code?: string };
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const code = payload.code;
  if (!code) {
    return new Response(JSON.stringify({ error: 'missing_code' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const clientId =
    getEnv('ANILIST_CLIENT_ID') ?? getEnv('PUBLIC_ANILIST_CLIENT_ID');
  const clientSecret =
    getEnv('ANILIST_CLIENT_SECRET') ?? getEnv('PUBLIC_ANILIST_CLIENT_SECRET');
  const redirectUri =
    getEnv('ANILIST_REDIRECT_URI') ??
    getEnv('PUBLIC_ANILIST_REDIRECT_URI') ??
    `${new URL(request.url).origin}/callback`;

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'missing_client' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetch('https://anilist.co/api/v2/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
