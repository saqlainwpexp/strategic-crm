# Strategic CRM

A white-label cold-calling CRM for agencies: a call **Loadboard** with a smart queue, Zoom Phone click-to-call, call scripts, a 10-stage pipeline, follow-up reminders, CSV lead imports, sales & payments, and team reporting — with role-based access for Sales, Business Development, Managers and a Super Admin.

> **Setup and go-live:** see [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md) — create the database, then `npm run db:push`, `npm run db:seed` and `npm run create-admin`.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **MySQL** via **Prisma** (schema in `prisma/schema.prisma`)
- **NextAuth** email + password logins (bcrypt, account lockout, per-request permission checks)
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
| `NEXTAUTH_URL` | The app's public URL, e.g. `https://crm.example.com` |

## White-label

Everything brand-related is set by the Super Admin in **Admin → Branding**: app & agency name, logo, colour scheme (presets or custom), header style, font, display currency and timezone (default US Eastern, DST-aware). Branding is stored in the database.

## Project layout

```
src/app/(app)/        Pages: loadboard, dashboard, leads, pipeline, schedule, team, scripts, admin
src/components/       UI, grouped by feature (leads, loadboard, reports, admin, …)
src/lib/              Domain logic: access rules, queue, branding/theme, dates, currency
src/server/           Database access, logins, permission-checked server actions
prisma/seed.ts        Starter content for a fresh database
scripts/create-admin.ts  Creates the Super Admin account
prisma/schema.prisma  Database schema
```
