# Strategic CRM

A white-label CRM for agencies with two apps behind one login — switch between them from the logo menu:

- **Cold Calling CRM** — a call **Loadboard** with a smart queue, Zoom Phone click-to-call, call scripts, a 10-stage pipeline, follow-up reminders, CSV lead imports, sales & payments, and team reporting.
- **Email Marketing** (managers & super admin) — campaigns, follow-up automations, a shared reply inbox, templates, and sending mailboxes with SPF/DKIM/DMARC checks. CRM leads are the email contacts.

Role-based access for Sales, Business Development, Managers and a Super Admin.

> **Setup and go-live:** see [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md) — create the database, then `npm run db:push`, `npm run db:seed` and `npm run create-admin`.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript + Tailwind CSS
- **MySQL** via **Prisma** (schema in `prisma/schema.prisma`)
- **NextAuth** email + password logins (bcrypt, account lockout, per-request permission checks)
- **Email:** nodemailer (SMTP), imapflow + mailparser (IMAP replies), Tiptap editor
- Recharts, dnd-kit, Papaparse, lucide-react

## Run it locally

Requires Node.js 18.18 or newer.

```bash
npm install
npm run dev
```

Requires a MySQL database in `.env` (see the deploy guide). First time only:

```bash
npm run db:push        # create tables
npm run db:seed        # starter scripts, custom fields, default pool & settings
npm run create-admin   # your Super Admin login (password typed hidden)
```

Open http://localhost:3000, sign in, and add your team under **Team → Add member**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Generate the Prisma client and build for production |
| `npm start` | Run the production build (uses `$PORT` if set) |
| `npm run db:push` | Create/update the database tables from the Prisma schema |
| `npm run db:seed` | Add starter content to an empty database |
| `npm run create-admin` | Create or reset the Super Admin login |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Configuration

Copy `.env.example` to `.env` and fill it in. **Never commit `.env`** — it's git-ignored.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string |
| `NEXTAUTH_SECRET` | Long random string used to sign sessions |
| `NEXTAUTH_URL` | The app's public URL, e.g. `https://crm.example.com` (also used for links inside emails) |
| `EMAIL_ENCRYPTION_KEY` | Encrypts mailbox passwords. Use the **same** value on every copy that shares the database |
| `CRON_SECRET` | Optional. Enables `/api/e/cron?key=…` so a cron job can wake the email engine |
| `EMAIL_WORKER` | Optional. `off` stops this copy of the app sending email |

## White-label

Everything brand-related is set by the Super Admin in **Admin → Branding**: app & agency name, logo, colour scheme (presets or custom), header style, font, display currency and timezone (default US Eastern, DST-aware). Branding is stored in the database.

## Email marketing

Open it from the logo menu (top left). Managers and the super admin only.

The setup follows a standard cold-email structure: **many domains × 2–3 inboxes each → one rotating sending engine ← lead lists (e.g. ListKit) → replies go to sales calls → paying clients.**

1. **Sending** — your domains, each with its inboxes. Add inboxes one at a time or **Bulk add** (paste `email, password, From Name` per line). Each inbox has a daily limit and a gap between emails; the domain card shows SPF/DKIM/DMARC.
2. **Contacts → Import CSV** — import ListKit (or any lead-list) exports. Columns like First/Last Name, Company, Title, LinkedIn and Email Status are recognised; addresses marked invalid are skipped. Tag the import (e.g. “ListKit — Dentists”).
3. **Automations** — visual workflows on a canvas: trigger → send email → wait → condition (opened / clicked / replied / tag / stage / temperature / has phone) with Yes/No branches → actions (send to sales calls, tag, move stage, assign rep, unsubscribe). Triggers: by hand, new lead, stage change, tag added, or **contact replies**. Starters include a cold outreach sequence and “Replies → sales calls”.
4. **Campaigns** — one-off sends to a filtered audience, rotating across all inboxes by default.
5. **Inbox** — replies from every inbox; reply in-thread or **Send to sales calls** (lead becomes Interested, gets a rep, and appears at the top of their Loadboard queue).
6. **Dashboard** — outreach pipeline from emailed → opened → replied → sent to calls → meetings → paying clients.

A background engine inside the app sends queued emails at each mailbox's pace, tracks opens/clicks (signed links), handles one-click unsubscribe, and marks bounces. Unsubscribed and bounced contacts are never emailed again.

## Project layout

```
src/app/(app)/        Pages: loadboard, dashboard, leads, pipeline, schedule, team, scripts, admin
src/app/(app)/email/  Email marketing: dashboard, campaigns, automations, inbox, contacts, templates, sending
src/server/email/     Email engine: sending worker, IMAP sync, tracking tokens, DNS checks, actions
src/components/       UI, grouped by feature (leads, loadboard, reports, admin, …)
src/lib/              Domain logic: access rules, queue, branding/theme, dates, currency
src/server/           Database access, logins, permission-checked server actions
prisma/seed.ts        Starter content for a fresh database
scripts/create-admin.ts  Creates the Super Admin account
prisma/schema.prisma  Database schema
```

## Public agency signup

Anyone can create an agency at /signup. Registration creates a private workspace and its SUPER_ADMIN owner atomically, then signs the owner in. Team members are added from Team. Each email address belongs to one account. All agencies use the same CRM address.

Every CRM table has an agencyId. The server derives it from the signed session, scopes reads/writes and validates related records; owners cannot access other agencies. Settings and reports are scoped too. Background email jobs run separately per agency, and signed public links include the agency identity.

Existing records belong to the default agency, Strategic Core Solutions. Before upgrading an existing deployment, back up the database and apply prisma/migrations/20261104_agency_signup/migration.sql once. Do not run the migration twice. New installs can use db:push and create the default Agency record before creating an admin; public signup creates agencies automatically.

Use Node.js 22, the existing DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL and EMAIL_ENCRYPTION_KEY. NEXTAUTH_URL must equal the public HTTPS address. No AGENCIES_JSON or per-agency database/domain setup is needed.

Checks: npm run test:agencies, npx tsc --noEmit, npm run build. The opt-in tests/agency-integration.ts creates temporary workspaces to check signup rollback, ownership, related-record isolation, reports, transactions and signed links, then removes its test records.

Local LinkedIn workers and admin maintenance must select an agency: npm run agency -- <agency-id> li:worker (or li:login / create-admin).
