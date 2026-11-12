# omega-harbor-notes

A small full-stack Next.js app for the Omega console integration tests. It needs a **Harbor backend** (database + email/password auth) on the Omega app, and it ships a SQL migration so a deployment exercises the whole flow:

    CreateApp / add backend (BackendConfig)  -> Harbor CreateBackend
    CreateDeployment                         -> Harbor CreateBranch (branch DB, endpoint, publishable key)
    migrations/ in the source                -> applied to the branch database (public.* schema)

Based on Sanay Shah's Omega + Harbor notes sample.

## What's in it

- `migrations/20260925120000_init.sql` creates two tables in the `public` schema:
  - `public.announcements`: readable by anyone, seeded with one row: "Hello from Harbor, provisioned entirely through Omega."
  - `public.notes`: owner-scoped row-level security on `auth.uid()`, so each signed-in user only sees their own notes.
- `app/` and `lib/harbor.ts`: the Next.js server calls Harbor `/health`, `/rest` (PostgREST) and `/auth` (BetterAuth) with plain `fetch`. The browser never calls Harbor directly.

After a successful deploy, the home page shows the backend health, the seeded announcement (`data-testid="announcement"`), and the sign-in / sign-up form. A test can check the seeded announcement to confirm the migration was applied.

## Environment variables

Omega doesn't inject the Harbor connection details yet, so set these on the environment before deploying:

- `HARBOR_API_URL`: the branch API URL (from Harbor `GetBranch`)
- `HARBOR_PUBLISHABLE_KEY`: the branch publishable key (`hpk_v1.*`)

Without them the page still renders and reports "not set".

## Build settings (as used by the integ tests)

- Install: `npm ci`
- Build: `npx @omega/opennext-adapter`
- Output directory: `.amplify`

## Migration rules

- File names must match `^\d{14}_.+\.sql$` (14-digit UTC timestamp).
- Migrations are append-only. Never edit a file that has already been applied; add a new one instead.
- Use the `public` schema. The `harbor` schema is internal.

## Run locally

```bash
npm ci
HARBOR_API_URL=... HARBOR_PUBLISHABLE_KEY=... npm run dev
```
