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

1. **Sending → Add mailbox** — connect a mailbox (Hostinger, Gmail, Outlook, Zoho or any SMTP/IMAP). Set a daily limit and the gap between emails; the password is stored encrypted.
2. **Sending → Domains** — check SPF, DKIM and DMARC for your sending domain.
3. **Campaigns → New campaign** — pick mailboxes, filter the audience (tags, stage, temperature, service, city, source, pool, rep), write the email with personalisation like `{{first_name}}`, send a test, then send now or schedule.
4. **Automations** — multi-step follow-up sequences (email → wait → email) started by hand, by a new lead, a pipeline stage change, or a tag. They stop when the contact replies.
5. **Inbox** — replies from every mailbox (synced over IMAP every 2 minutes); reply in the same thread.

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
