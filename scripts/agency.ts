import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
async function main() {
 const [id, task, ...args] = process.argv.slice(2);
 if (!["create-admin", "li:login", "li:worker"].includes(task)) throw new Error("Usage: npm run agency -- <agency-id> <create-admin|li:login|li:worker>");
 const db = new PrismaClient();
 const agency = await db.agency.findUnique({where:{id}}); await db.$disconnect();
 if (!agency?.active) throw new Error("Unknown or inactive agency");
 const npm = process.env.npm_execpath; if (!npm) throw new Error("Use npm run agency");
 const result = spawnSync(process.execPath, [npm, "run", task, "--", ...args], {stdio:"inherit", env:{...process.env, AGENCY_ID:id}});
 process.exit(result.status ?? 1);
}
main().catch(e=>{console.error(e.message);process.exit(1)});
