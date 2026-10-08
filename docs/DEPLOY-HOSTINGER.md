# Going live on Hostinger

This guide takes Strategic CRM from your PC to a live URL on Hostinger, with a MySQL database.
Hostinger's hPanel changes its labels from time to time — if a menu name below doesn't match exactly, look for the closest equivalent.

**Order of work**

1. Create the MySQL database (you)
2. Allow your PC to reach it, and add the connection to `.env` (you)
3. Create the tables and starter content (`npm run db:push`, `npm run db:seed`)
4. Create your Super Admin login (`npm run create-admin` — you type the password)
5. Deploy the Node.js app from GitHub (you, in hPanel)
6. Point your domain at it and switch on SSL, then add your team in the app

---

## 1. Check your plan supports Node.js

In hPanel, look for **Node.js** (often under *Websites → Add website*, or a "Node.js Apps"/"Web apps" section).
Node.js hosting is available on Hostinger's **Business** and **Cloud** plans; it isn't available on every shared plan.
If you don't see it, upgrade the plan or use a Hostinger VPS.

## 2. Create the MySQL database

1. hPanel → **Websites** → your site → **Manage** → **Databases** → **Management** (MySQL Databases).
2. Enter a database name (e.g. `crm`), a username (e.g. `crm_app`) and a **strong password**. Click **Create**.
3. Write down the **full** names — Hostinger adds a prefix, e.g. `u123456789_crm` and `u123456789_crm_app`.

Keep the password somewhere safe (a password manager). Don't paste it into chats, emails or the GitHub repo.

## 3. Let your PC connect (for creating tables)

Your PC needs to reach the database once, to create the tables.

1. hPanel → **Databases** → **Remote MySQL**.
2. Add your current public IP address (search "what is my IP"), select the database, and save.
3. Note the **hostname** shown on that page (something like `srvXXXX.hstgr.io` or an IP) — that's the *remote* host.

When you're done with setup you can remove your IP again.

## 4. Create your local `.env`

In the project folder (next to `package.json`), create a file named `.env`:

```env
DATABASE_URL="mysql://u123456789_crm_app:YOUR_PASSWORD@REMOTE_HOST:3306/u123456789_crm"
NEXTAUTH_SECRET="paste-a-long-random-string-here"
NEXTAUTH_URL="http://localhost:3000"
```

- Replace the user, password, host and database with yours.
- If the password contains `@ : / # ? &` or spaces, either choose a password without them, or URL-encode them (`@` → `%40`, `#` → `%23`, `:` → `%3A`, `/` → `%2F`).
- For `NEXTAUTH_SECRET`, generate a long random string (don't make one up). In a terminal in the project folder run:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  or, in PowerShell without Node:

  ```powershell
  [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
  ```

  Copy the output (about 44 characters) into `NEXTAUTH_SECRET`. Use **one secret for your PC and a different one for Hostinger**. Changing the secret later just signs everyone out.

`.env` is git-ignored, so it never goes to GitHub.

## 5. Create the tables and starter content

With `.env` pointing at your Hostinger database (the **Remote MySQL** host), run these in a terminal in the project folder:

```bash
npm run db:push     # creates all tables in the Hostinger database
npm run db:seed     # adds starter call scripts, custom lead fields, a default lead pool and default settings
```

`db:seed` creates **no** users and **no** leads, and it's safe to run again (it only fills empty tables).
Branding you saved on your PC before the database existed (logo, colours, font) is copied into the database automatically the first time the app starts.

## 6. Create your Super Admin login

```bash
npm run create-admin
```

It asks for your name, email and a password (typed hidden, at least 10 characters). Running it again with the same email resets that account's password — useful if you ever lock yourself out.

Then run `npm run dev`, open http://localhost:3000, sign in, and add your team under **Team → Add member** (each person gets a temporary password you share with them privately; they can change it from their avatar menu).

## 7. Deploy the app on Hostinger

1. hPanel → **Websites** → **Add website** → **Node.js app** (or the Node.js section of your plan).
2. Choose **Import from GitHub**, authorise Hostinger, and select **`saqlainwpexp/strategic-crm`**, branch **`main`**.
   (Alternative: upload a ZIP of the project without `node_modules`, `.next` and `.env`.)
3. Settings:
   - **Node.js version:** 20 (or 18.18+)
   - **Install command:** `npm install` (runs `prisma generate` automatically)
   - **Build command:** `npm run build`
   - **Start command:** `npm start`
4. **Environment variables** (in the app's settings — not in GitHub):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Same as your `.env`, but the host is usually **`localhost`** when the app runs on Hostinger's own server. If that fails, use the host hPanel shows for the database. |
   | `NEXTAUTH_SECRET` | The same long random string |
   | `NEXTAUTH_URL` | Your live address, e.g. `https://crm.strategiccoresolutions.com` |

5. Deploy. New pushes to `main` can redeploy automatically if you enable it.

## 8. Domain and SSL

1. Use a subdomain such as `crm.strategiccoresolutions.com` (or a separate domain) for the app in hPanel.
2. If the domain's DNS isn't managed by Hostinger, add the record hPanel asks for at your DNS provider.
3. Turn on the free **SSL** certificate, then open `https://crm.strategiccoresolutions.com`.

## 9. After the first deploy

The tables, your admin account and your team already live in the database, so the live site uses them straight away — there's nothing to run on the server.

- Sign in at https://crm.strategiccoresolutions.com and check **Admin → Branding** (logo, colours, currency, timezone — default **US Eastern**).
- Check **Admin → Settings**: dialer (Zoom Phone), lead temperature thresholds and reminder timing.
- Ask each rep to open the Loadboard and **turn on desktop alerts** for reminders.

## Troubleshooting

| Problem | Likely cause |
| --- | --- |
| `P1001: Can't reach database server` | Your IP isn't in Remote MySQL, or the host/port is wrong. On Hostinger itself, try `localhost`. |
| `Access denied for user` | Wrong username/password, or the user isn't attached to the database. Check for the `u123…_` prefix. |
| Password with special characters breaks the URL | URL-encode them (see step 4) or change the password. |
| Build runs out of memory | Hostinger plans have limited RAM; retry, or build locally and upload. |
| App starts but pages error | Missing environment variables in the Hostinger app settings. |

## Security notes

- Every page and every save checks the signed-in user on the server; sales reps only ever receive their own leads, BD their team's.
- Passwords are stored as bcrypt hashes. 5 wrong passwords lock an account for 15 minutes; sign-in is also throttled per IP.
- Changing or resetting a password, or deactivating a user, signs them out everywhere immediately.
- Sign-ins, lockouts, role changes, password resets, imports and settings changes are written to the `AuditLog` table.
- Keep `NEXTAUTH_SECRET` and the database password only in `.env` (your PC) and the Hostinger environment variables — never in GitHub or chat.
- Remove your IP from **Remote MySQL** once setup is done, and re-add it only when you need to run the commands above again.
