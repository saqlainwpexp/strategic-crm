# Strategic CRM

A white-label cold-calling CRM for agencies: a call **Loadboard** with a smart queue, Zoom Phone click-to-call, call scripts, a 10-stage pipeline, follow-up reminders, CSV lead imports, sales & payments, and team reporting — with role-based access for Sales, Business Development, Managers and a Super Admin.

> **Status:** the full UI is built and runs on generated demo data. The next step is connecting the MySQL database and real logins — see [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md). Don't share a public URL until that's done.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **MySQL** via **Prisma** (schema in `prisma/schema.prisma`)
- **NextAuth** for email + password logins (to be wired with the database)
- Recharts, dnd-kit, Papaparse, lucide-react

## Run it locally

Requires Node.js 18.18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you land on the Loadboard. Use the avatar menu → **Preview as** to see the app as each role (temporary until real logins are connected).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Generate the Prisma client and build for production |
| `npm start` | Run the production build (uses `$PORT` if set) |
| `npm run db:push` | Create/update the database tables from the Prisma schema |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Configuration

Copy `.env.example` to `.env` and fill it in. **Never commit `.env`** — it's git-ignored.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string |
| `NEXTAUTH_SECRET` | Long random string used to sign sessions |
| `NEXTAUTH_URL` | The app's public URL, e.g. `https://crm.example.com` |
| `APP_TIMEZONE` | Defaults to `Asia/Karachi` |

## White-label

Everything brand-related is set by the Super Admin in **Admin → Branding**: app & agency name, logo, colour scheme (presets or custom), header style, font and display currency. Branding is currently saved to `data/branding.json` on the server (git-ignored) and will move into the database.

## Project layout

```
src/app/(app)/        Pages: loadboard, dashboard, leads, pipeline, schedule, team, scripts, admin
src/components/       UI, grouped by feature (leads, loadboard, reports, admin, …)
src/lib/              Domain logic: access rules, queue, branding/theme, dates, currency
src/lib/data/seed.ts  Demo data generator (replaced by the database)
prisma/schema.prisma  Database schema
```
