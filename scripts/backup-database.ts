import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
const db = new PrismaClient();
async function main() {
 const backup = await db.$transaction(async tx => {
  const tables = await tx.$queryRaw<{TABLE_NAME:string}[]>`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`;
  const data: Record<string,unknown> = {};
  for(const {TABLE_NAME:name} of tables){if(!/^[A-Za-z0-9_]+$/.test(name))throw new Error("Invalid table");data[name]={schema:await tx.$queryRawUnsafe("SHOW CREATE TABLE "+name),rows:await tx.$queryRawUnsafe("SELECT * FROM "+name)};}
  return data;
 }, {timeout:120000,isolationLevel:"RepeatableRead"});
 mkdirSync(".backups",{recursive:true});
 const file=".backups/pre-agency-signup-"+Date.now()+".json";
 writeFileSync(file,JSON.stringify(backup,(_,v)=>typeof v==="bigint"?v.toString():v));
 console.log("Saved private database backup:",file,"tables:",Object.keys(backup).length);
}
main().catch(()=>{console.error("Backup failed");process.exitCode=1}).finally(()=>db.$disconnect());
