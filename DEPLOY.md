# Deployment to GitHub Pages

## Setup

1. **Enable GitHub Pages:**
   - Go to repo Settings → Pages
   - Source: "GitHub Actions"

2. **Update AniList OAuth:**
   - Go to https://anilist.co/settings/developer
   - Add redirect URI: `https://brickfrog.github.io/moonsorter/callback`
   - Copy the Client ID

3. **Configure OAuth Client:**
   - The site uses OAuth implicit flow (no server secrets needed)
   - Copy `site/.env.example` to `site/.env`
   - Set `PUBLIC_ANILIST_CLIENT_ID` to your client ID
   - Keep `PUBLIC_ANILIST_RESPONSE_TYPE=token` for static deployment

4. **Push to master:**
   - The workflow will auto-deploy on push to master
   - Site will be live at: https://brickfrog.github.io/moonsorter/

## Local Development

Local dev works without changes - the base path is only applied in CI.

```bash
cd site
npm run dev
```

## Custom Domain (Optional)

If you want to use a custom domain instead:

1. Remove the `base` config from `astro.config.mjs` (set to empty string always)
2. Update `site` in config to your domain
3. Add a `CNAME` file to `site/public/` with your domain
4. Configure DNS to point to GitHub Pages

