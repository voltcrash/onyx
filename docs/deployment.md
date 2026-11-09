# Cloudflare Workers deployment

Onyx deploys with Wrangler and `@sveltejs/adapter-cloudflare`. The Worker handles SvelteKit
SSR and Better Auth; Workers Static Assets serves the browser code, fonts, icons, discovery
files, and service worker. No Cloudflare database or object storage is required. Notes and
attachments remain in browser storage, and GitHub backup traffic goes directly to GitHub.

## Local development and validation

Use Node.js 26 LTS and Vite+:

```sh
vp install --frozen-lockfile
cp .env.example .env
vp dev
```

GitHub sign-in is optional. To enable it locally, fill in the three credentials in `.env`
and register `http://localhost:5173/api/auth/callback/github` with a separate development
GitHub OAuth App. Keep `BETTER_AUTH_URL` aligned with the dev server's origin.

To run the production output in the local Workers runtime:

```sh
vp run build
vp run preview
```

Wrangler reads local secrets from `.dev.vars` (gitignored). Its HTTP origin is
`http://localhost:8787`; use that value for `BETTER_AUTH_URL` in `.dev.vars` if testing auth.
The production configuration's public origin remains `https://onyx.voltcrash.com`.

```sh
vp check
vp run check
vp test
vp run test:e2e
vp run deploy:check
```

Playwright builds the application and runs Wrangler locally. Fixed placeholder credentials
exercise anonymous sessions, OAuth initiation, state cookies, and origin rejection without
contacting GitHub's login service. The other GitHub workflow tests mock GitHub API calls.
A real OAuth round trip must also be verified after deployment.

## Account and production secrets

Authenticate Wrangler with `vp exec wrangler login`, or provide `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the command environment. The token needs Workers Scripts Edit
and Account Settings Read for the account, plus Zone Read and Workers Routes Edit for
`voltcrash.com`. Initial DNS cutover also needs DNS Edit. Verify access with:

```sh
vp exec wrangler whoami
```

Production uses the `onyx` Worker and its custom domain `onyx.voltcrash.com`. The zone must
be active in the same Cloudflare account. Set these Worker secrets:

```sh
vp exec wrangler secret put BETTER_AUTH_SECRET
vp exec wrangler secret put GITHUB_CLIENT_ID
vp exec wrangler secret put GITHUB_CLIENT_SECRET
```

`BETTER_AUTH_SECRET` must contain at least 32 random characters. When migrating an existing
installation, transfer the original secret and GitHub OAuth credentials so existing session
cookies remain readable. The GitHub OAuth App's callback remains
`https://onyx.voltcrash.com/api/auth/callback/github`.

For the initial deployment, code and secrets can be uploaded together. Put the three secrets
in a private JSON file outside the checkout, restrict its permissions, and run:

```sh
vp run build
vp exec wrangler deploy --secrets-file /secure/path/onyx-worker-secrets.json
```

The JSON object must have `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`
keys. Delete the temporary file after verifying the migration. Subsequent deployments preserve
Worker secrets; public variables are managed by `wrangler.jsonc`.

## Moving the existing domain

Keep the existing HTTPS hostname. IndexedDB, OPFS, preferences, and service worker caches belong
to the browser origin. A different hostname has a separate local vault; a redirect cannot
transfer those browser files. Do not clear browser site data during the migration.

1. Verify the local checks and deploy the separate preview Worker with `vp run deploy:preview`.
2. Export the existing hosting configuration and secrets securely. Record the current DNS
   record and the last Vercel deployment before changing routing.
3. Remove the Vercel CNAME for **only** `onyx.voltcrash.com` if one exists. Cloudflare cannot
   attach a Worker custom domain while that hostname has a CNAME. Leave other DNS records alone.
4. Deploy production with Wrangler. The custom-domain declaration creates the Worker DNS record
   and certificate. If cutover fails, restore the recorded DNS record immediately.
5. Verify HTTPS, initial HTML, security headers, `/api/auth/get-session`, GitHub sign-in and
   sign-out, backup/restore, and a previously populated local vault. Check offline reload after
   the new service worker finishes installing. Confirm production is indexable and previews
   return `X-Robots-Tag: noindex, nofollow` on dynamic pages.
6. Disconnect the Vercel Git integration and remove its project-domain association once Workers
   is verified. Keep the old deployment available for rollback until the cutover is stable.
   `vercel.json` disables Git deployments; remove it or enable `git.deploymentEnabled` if
   restoring Vercel Git deployments.

Avoid adding a Cloudflare cache rule that caches HTML or `/api/auth/*` responses. Hashed assets
receive immutable caching from the adapter. `_headers` applies security headers to static assets
and makes the service worker and manifest revalidate. Dynamic responses keep their security
headers and CSP through SvelteKit.

## Continuous deployment

GitHub Actions runs checks and browser tests on pull requests and pushes to `main`. The browser
job also validates the deployment bundle with Wrangler's dry-run. Successful pushes to the
current `main` commit then run `vp run deploy`; pull requests never deploy production or receive
Cloudflare deployment credentials.

Configure the repository secret and variable using the GitHub CLI:

```sh
gh secret set CLOUDFLARE_API_TOKEN
gh variable set CLOUDFLARE_ACCOUNT_ID
```

The token used by CI needs Workers Scripts Edit, Account Settings Read, Zone Read, and Workers
Routes Edit. OAuth credentials stay in Worker secrets, not GitHub Actions. Vite+ setup selects
Node and pnpm from `package.json`; Cloudflare's default build image is not used.

Production has `workers.dev` and version preview URLs disabled. The separately named
`onyx-preview` Worker has no production domain and uses `DEPLOYMENT_ENV=preview`. Wrangler
does not inherit production secrets into this environment. Optional preview auth requires a
separate OAuth App and preview secrets, plus the preview URL as `BETTER_AUTH_URL`.

## Operations

```sh
vp exec wrangler deployments list
vp exec wrangler versions list
vp exec wrangler tail
```

To roll back Worker code, select a previously verified version from `versions list` and run
`vp exec wrangler rollback <version-id>`. Keep the same auth secret. A code rollback does not
restore DNS or the previous hosting provider; those require the saved domain configuration.
Measure deployed SSR and auth CPU usage before relying on the Workers free plan.
