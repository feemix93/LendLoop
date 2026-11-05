# LendLoop

A neighborhood tool-lending board with automated workflows.
**Stack:** Next.js (App Router), TypeScript, Clerk (auth), Convex (data + backend logic), n8n (automation, self-hosted with Docker).

> Borrow what you need. Lend what you don't.

## Architecture

```
Browser ──Clerk JWT──> Convex queries/mutations  (all authorization lives here)
                          │ mutation schedules
                          ▼
                 notify.send (action) ──HMAC-signed POST──> n8n Webhook ──> notify user
                          ▲ retries w/ backoff, final failure logged in automationEvents

n8n daily schedule ──HMAC-signed GET /overdue──> Convex HTTP endpoint ──> overdue loans
                   ──HMAC-signed POST /reminder-result──> idempotent write-back (key = loanId:date)
Any n8n failure ──> Error workflow (alert)
```

- **Public page** (`/`): tool name, category and availability only, from `tools.listPublic` (no owner fields are returned by the query).
- **Dashboard** (`/dashboard`, Clerk-protected): browse + category filter, my listings, my requests, incoming requests, admin view.

## Setup

1. `npm install`
2. **Clerk:** create an app. In *JWT Templates* add a template named **`convex`** (use the Convex preset). Copy the publishable key, secret key and the *Issuer* URL.
3. **Convex:** `npx convex dev` (creates a deployment and `.env.local` with `NEXT_PUBLIC_CONVEX_URL`). Then set backend env vars:
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
   npx convex env set WEBHOOK_SECRET <long random string>
   npx convex env set ADMIN_EMAILS you@example.com
   npx convex env set N8N_WEBHOOK_URL https://<public-n8n-url>/webhook/lendloop-request-event
   ```
4. Add the Clerk keys to `.env.local` (see `.env.example`), then `npm run dev`.
5. **n8n:** copy `.env.example` values into `.env`, then `docker compose up -d` and open http://localhost:5678.
   - Convex runs in the cloud, so it cannot reach `localhost`. Expose n8n with a tunnel (`ngrok http 5678`) and use that URL for `N8N_PUBLIC_URL` and `N8N_WEBHOOK_URL`, or use n8n Cloud.
   - `CONVEX_SITE_URL` is your deployment's `.convex.site` URL (HTTP actions live there).
   - Import the three files in `n8n/`. In the two main workflows, open *Settings → Error Workflow* and select **LendLoop - Error handler**. Activate the workflows.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Convex client URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `.env.local` | Clerk |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env | Lets Convex verify Clerk tokens |
| `WEBHOOK_SECRET` | Convex env | HMAC secret (same value as n8n's) |
| `N8N_WEBHOOK_URL` | Convex env | Where Convex posts events |
| `ADMIN_EMAILS` | Convex env | Comma-separated emails that get the `admin` role |
| `LENDLOOP_WEBHOOK_SECRET`, `CONVEX_SITE_URL`, `N8N_ENCRYPTION_KEY`, `N8N_PUBLIC_URL` | `.env` (compose) | n8n config |

No secret is stored in code or in the exported workflow JSON; workflows read them from environment variables.

## Roles and access control (enforced in Convex)

| Action | user | admin |
|---|---|---|
| View public list (name, category) | anyone | anyone |
| List / edit own tools | yes | yes |
| Delete a tool | own only | any listing |
| Request to borrow | not own tools | not own tools |
| Approve / decline | owner of the tool only | owner only |
| Mark returned | owner | owner or admin |
| View all loans, mark Trusted Lender | no | yes |

Every mutation and query calls `requireUser` / `requireAdmin` (`convex/lib/auth.ts`) and re-checks ownership on the record. The role is stored server-side and set only from `ADMIN_EMAILS`; no client-callable function changes it. The UI hides actions as a convenience, but is not what protects them.

## Security and data-minimization decisions

- **Signed webhooks both ways:** `HMAC_SHA256(secret, "<unix-ts>.<raw body>")` in `x-lendloop-signature`, with a 5-minute timestamp window against replay and constant-time comparison.
- **Minimal payloads:** n8n receives one recipient's name/email, tool name and dates. It never receives other users, roles, descriptions or IDs beyond an event ID.
- **Public data:** the public query returns only name, category and status.
- **Internal functions:** notification payload, overdue lookup and reminder write-back are `internal*` and unreachable from clients; only the signed HTTP routes expose them.
- **Input validation:** length limits, category allow-list and date checks on the server.
- **Idempotency:** reminder write-back uses key `loanId:date`; retries return `duplicate: true` instead of creating a second row. Outgoing events carry `eventId = loanId:event` so n8n can deduplicate.

## Failure handling

- Convex → n8n: up to 5 attempts with exponential backoff (30s, 60s, 2m, 4m); the final failure is stored in `automationEvents` and logged.
- n8n → Convex: HTTP nodes retry 3 times; every workflow points to the Error handler workflow, so failed runs raise an alert and stay visible in n8n's execution list.

## What I would change for production

- Replace the mock notification nodes with Email/Slack/SES nodes, and send real templates.
- Run n8n in queue mode behind HTTPS with a managed Postgres, backups, and secrets from a secret manager; rotate `WEBHOOK_SECRET`.
- Add rate limiting, pagination on lists, and an admin audit log.
- Add Sentry/Datadog, alerting on `automationEvents` failures, and automated tests for the access rules.
- Move from `ADMIN_EMAILS` to managed roles (e.g. Clerk organizations or a role table with audit trail).

## Known gaps in this version

Edit-listing UI (backend `tools.update` exists), the recent-automation-activity UI on each loan (data is stored in `reminders` and `automationEvents`), and automated tests are not included yet. The code has not been run end to end; expect to fix small issues on first run.
# LendLoop
