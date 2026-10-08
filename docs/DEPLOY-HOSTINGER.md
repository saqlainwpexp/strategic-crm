# Going live on Hostinger

This guide takes Strategic CRM from your PC to a live URL on Hostinger, with a MySQL database.
Hostinger's hPanel changes its labels from time to time — if a menu name below doesn't match exactly, look for the closest equivalent.

**Order of work**

1. Create the MySQL database (you)
2. Allow your PC to reach it, and add the connection to `.env` (you)
3. Connect the app to the database + real logins (developer step — code changes)
4. Create the tables and the first users
5. Deploy the Node.js app from GitHub (you, in hPanel)
6. Point your domain at it and switch on SSL

> ⚠️ Until step 3 is done the app runs on demo data with a "Preview as" role switcher instead of logins. Don't publish the URL before then.

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
APP_TIMEZONE="Asia/Karachi"
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

## 5. Connect the app to the database (code step)

This is the developer step: replace the demo data with Prisma queries, add login (NextAuth with email + password), and move branding into the database. Once `.env` is in place, this can be built and tested against your real database.

## 6. Create the tables and first users

With `.env` pointing at the remote host:

```bash
npm run db:push     # creates all tables in your Hostinger database
npm run db:seed     # creates your team's accounts (and optional demo leads) — available after step 5
```

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
   | `APP_TIMEZONE` | `Asia/Karachi` |

5. Deploy. New pushes to `main` can redeploy automatically if you enable it.

## 8. Domain and SSL

1. Use a subdomain such as `crm.strategiccoresolutions.com` (or a separate domain) for the app in hPanel.
2. If the domain's DNS isn't managed by Hostinger, add the record hPanel asks for at your DNS provider.
3. Turn on the free **SSL** certificate, then open `https://crm.strategiccoresolutions.com`.

## 9. After the first deploy

- Sign in as the Super Admin and open **Admin → Branding**: upload the logo again and choose colours and currency (branding saved on your PC doesn't travel with the code).
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
