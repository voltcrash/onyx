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

GitHub sign-in is optional. To enable it locally, fill in the four configuration values in `.env`
and register `http://localhost:5173/api/auth/callback/github` with a separate development
GitHub App. Keep `BETTER_AUTH_URL` aligned with the dev server's origin.

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

`BETTER_AUTH_SECRET` must contain at least 32 random characters. Set `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` to the GitHub App's client credentials (not its numeric App ID or private
key), and set `GITHUB_APP_SLUG` to the name in `github.com/apps/<slug>`.
The callback remains `https://onyx.voltcrash.com/api/auth/callback/github`.

## GitHub App setup and migration

The owner must register the GitHub App and configure each environment:

1. Set Homepage URL to the Onyx origin and Callback URL to
   `<origin>/api/auth/callback/github`. Use a separate App for local development and preview.
2. Grant repository **Contents: read and write** and mandatory **Metadata: read-only**.
   Grant account **Email addresses: read-only** for Better Auth's verified-email sign-in.
   Request no administration, workflows, organization, or other account permissions.
3. Keep **Expire user authorization tokens** enabled. Disable webhooks; Onyx has no webhook
   endpoint. No App private key or installation-token signing is needed.
4. Put the App client ID, client secret, and slug in Worker configuration using
   `vp exec wrangler secret put GITHUB_CLIENT_ID`,
   `vp exec wrangler secret put GITHUB_CLIENT_SECRET`, and
   `vp exec wrangler secret put GITHUB_APP_SLUG`. Keep `BETTER_AUTH_URL` at the deployed origin.
5. Install the App with **Only select repositories**, selecting the existing private backup repo.
   For a new backup, create a private repo on GitHub first (initializing a README is recommended),
   then select it in the installation. Sign in, reload repositories in Settings, and select it.

Upgrading intentionally uses a new `onyx-app` cookie namespace: old OAuth App sessions are not
reused. Users sign in again and grant the App access to their existing backup repository.
IndexedDB backup configuration, branch/directory, encryption settings, and commit history remain
unchanged. If a saved repository is unavailable, check the installation and the signed-in account
before changing the saved target. Revoke the old OAuth App authorization in GitHub settings once
migration is verified; changing credentials does not revoke old tokens.

GitHub App user tokens expire after eight hours; Better Auth 1.7.18 refreshes them from its encrypted
account cookie (configured to last seven days alongside the session). No auth database is added.
Requests rejected with 401 refresh once and retry. Concurrent requests in a tab share the refresh.
If credentials are revoked, refresh fails, or the session expires, sign in again. Vault contents
still travel directly between the browser and GitHub, never through the Onyx server.

Validation includes a real Better Auth handler test with mocked GitHub upstream responses, a
server-instance restart, and a clock advanced nine hours. Playwright uses placeholder credentials.
After configuring the real App, the owner must verify sign-in, selected-repository visibility,
backup/restore (including encrypted backups), and a session spanning token expiry. Those live
GitHub permission and production-secret checks cannot be proved with placeholders.

References: [GitHub user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
[token refresh](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens),
[installation repositories](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token),
[Better Auth sessions](https://www.better-auth.com/docs/concepts/session-management).

For the initial deployment, code and secrets can be uploaded together. Put the four secrets
in a private JSON file outside the checkout, restrict its permissions, and run:

```sh
vp run build
vp exec wrangler deploy --secrets-file /secure/path/onyx-worker-secrets.json
```

The JSON object must have `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_APP_SLUG`
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

Avoid adding a Cloudflare cache rule that caches HTML or `/api/auth/*` responses. Hashed assets
receive immutable caching from the adapter. `_headers` applies security headers to static assets
and makes the service worker and manifest revalidate. Dynamic responses keep their security
headers and CSP through SvelteKit.

## Continuous deployment

The [CI workflow](../.github/workflows/ci.yml) runs checks and browser tests on pull requests
and pushes to `main`. The browser job also validates the deployment bundle with Wrangler's
dry-run. CI has no Cloudflare deployment credentials.

The separate [Production deployment workflow](../.github/workflows/production-release.yml)
runs after successful main-push CI or a manual retry. It checks out the exact CI commit and
requires that commit's latest main-push CI run to have completed successfully before building.
Pull request, fork, failed, and cancelled CI runs cannot deploy. Deployment uses the existing
`Production` GitHub environment and serializes releases without cancelling an active upload.

The workflow builds once, validates the bundle with Wrangler's dry-run, then deploys that
bundle. Just before deployment, it skips snapshots that are no longer the latest `main`
commit so a delayed CI completion cannot roll production back. It does not create numbered
GitHub releases or change the application version.

### Cloudflare account API token

In Cloudflare, open **Manage account → Account API tokens → Create Token** and create a custom
token named `onyx-github-production-release`. Grant only:

| Scope   | Permission       | Access       |
| ------- | ---------------- | ------------ |
| Account | Workers Scripts  | Write / Edit |
| Account | Account Settings | Read         |
| Zone    | Zone             | Read         |
| Zone    | Workers Routes   | Write / Edit |

Restrict account resources to the account hosting Onyx and zone resources to `voltcrash.com`.
Onyx needs no D1, Queues, KV, or R2 permissions. DNS Edit is only needed for a manual DNS cutover,
not normal Worker releases. Avoid a client IP filter for GitHub-hosted runners. If you set an
expiration, rotate the GitHub secret before it expires. See Cloudflare's
[account API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)
and [permission reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).

Copy the token when Cloudflare displays it; its value is shown only once. Store it in the
`Production` GitHub environment, and keep the account ID as a repository variable:

```sh
gh secret set CLOUDFLARE_API_TOKEN --env Production
gh variable set CLOUDFLARE_ACCOUNT_ID
```

These commands prompt for their values. A repository-level token secret is also supported;
an environment secret takes precedence. Missing inputs fail before dependency installation.
GitHub App credentials and `BETTER_AUTH_SECRET` stay in Worker secrets, not GitHub Actions.
Subsequent Wrangler deployments preserve them. Vite+ setup selects Node and pnpm from
`package.json`; Cloudflare's default build image is not used.

### Retry a production release

After fixing credentials or a transient deployment failure, use **Actions → Production deployment
→ Run workflow** on `main`, or run:

```sh
gh workflow run production-release.yml --ref main
```

A manual retry still requires successful **push** CI for that exact commit. Manually dispatching
CI or passing pull request checks does not satisfy this gate. If main-push CI failed, rerun that
CI run first. A failed production release leaves the successful CI run intact; no empty commit
is needed to retry deployment. Check the production workflow's summary for its validated CI link
or a superseded-snapshot notice, and the `Production` environment for deployment history.

Production has `workers.dev` and version preview URLs disabled. The separately named
`onyx-preview` Worker has no production domain and uses `DEPLOYMENT_ENV=preview`. Wrangler
does not inherit production secrets into this environment. Optional preview auth requires a
separate GitHub App and preview secrets, plus the preview URL as `BETTER_AUTH_URL`.

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
