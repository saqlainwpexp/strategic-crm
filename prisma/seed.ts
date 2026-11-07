import { tenantClient } from "../src/server/tenant-client";
// `npm run db:seed` — prepares a fresh database with starter content.
// Safe to run more than once: each step only runs if that table is still empty.
// Creates NO users and NO leads — use `npm run create-admin`, then add your team in the app.

import { PrismaClient, type Prisma } from "@prisma/client";
import { STARTER_FIELDS, starterScripts } from "./seed-data";

const prisma = tenantClient(new PrismaClient(), process.env.AGENCY_ID || "default");

async function main() {
  if (!(await prisma.setting.findUnique({ where: { agencyId_key: { agencyId: process.env.AGENCY_ID || "default", key: "settings" } } }))) {
    await prisma.setting.create({
      data: { key: "settings", value: { hotThreshold: 75, warmThreshold: 40, dialerScheme: "zoomphonecall://", reminderMinutes: 30 } },
    });
    console.log("✓ Default CRM settings");
  }

  if ((await prisma.script.count()) === 0) {
    const scripts = starterScripts(new Date().toISOString()).filter((s) => s.active);
    for (const s of scripts) {
      await prisma.script.create({ data: { title: s.title, category: s.category, body: s.body, active: true } });
    }
    console.log(`✓ ${scripts.length} starter call scripts`);
  }

  if ((await prisma.customFieldDef.count()) === 0) {
    for (const [i, f] of STARTER_FIELDS.entries()) {
      await prisma.customFieldDef.create({
        data: { key: f.key, name: f.name, type: f.type, options: f.options as Prisma.InputJsonValue, required: f.required, active: f.active, order: i },
      });
    }
    console.log(`✓ ${STARTER_FIELDS.length} custom lead fields`);
  }

  if ((await prisma.pool.count()) === 0) {
    await prisma.pool.create({ data: { name: "General", description: "Default lead pool" } });
    console.log("✓ Default lead pool");
  }

  console.log("Database ready. Next: npm run create-admin");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
