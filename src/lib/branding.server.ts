// Server-only branding storage. Interim: a JSON file on disk (works on Hostinger's Node
// hosting). Moves to the `Setting` table (key "branding") once Prisma is connected.

import { promises as fs, readFileSync } from "fs";
import path from "path";
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from "./branding";

const FILE = path.join(process.cwd(), "data", "branding.json");

export function getBranding(): Branding {
  try {
    return normalizeBranding(JSON.parse(readFileSync(FILE, "utf8")));
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function writeBranding(b: Branding) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(b, null, 2), "utf8");
}
