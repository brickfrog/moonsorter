# Deployment to GitHub Pages

## Setup

1. **Enable GitHub Pages:**
   - In the repository, go to Settings → Pages.
   - Select "GitHub Actions" as the source.

2. **Update the AniList OAuth options:**
   - Go to <https://anilist.co/settings/developer>.
   - Add the redirect URI `https://brickfrog.github.io/moonsorter/callback`.
   - Copy the Client ID.

3. **Configure the OAuth client:**
   - NOTE: The site uses the OAuth implicit flow. The site does not need server secrets.
   - Copy `site/.env.example` to `site/.env`.
   - Set `PUBLIC_ANILIST_CLIENT_ID` to your Client ID.
   - For a static deployment, keep `PUBLIC_ANILIST_RESPONSE_TYPE=token`.

4. **Push to master:**
   - Push your commits to the `master` branch.
   - NOTE: The workflow builds the site and deploys it. The site is then live at <https://brickfrog.github.io/moonsorter/>.

## Local Development

Run the development server with these commands:

```bash
cd site
bun run dev
```

The `astro.config.mjs` file sets `base` to `/moonsorter` only when `GITHUB_PAGES=true`.

CAUTION: Do not use a plain local build to make sure that the base paths are correct. A local build uses an empty base path. A base-path error cannot appear in a local build. To reproduce the deployed layout, run the build with `GITHUB_PAGES=true`. Then serve `site/dist` under a `/moonsorter/` path prefix.

### Reproduce the deployed layout

Run these commands:

```bash
cd site
GITHUB_PAGES=true bun run build
mkdir -p /tmp/ghpages && ln -sfn "$PWD/dist" /tmp/ghpages/moonsorter
cd /tmp/ghpages && python3 -m http.server 4400
```

Then open http://localhost:4400/moonsorter/ in your browser.

## Custom Domain (Optional)

If you want to use a custom domain instead, do these steps:

1. Set `base` to an empty string in `astro.config.mjs`.
2. Set `site` in the same file to your domain.
3. Add a `CNAME` file to `site/public/`. Write your domain in this file.
4. Configure the DNS records of your domain to send traffic to GitHub Pages.
