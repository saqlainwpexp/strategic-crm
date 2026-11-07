import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { systemDb } from "../src/server/system-db";
import { tenantClient } from "../src/server/tenant-client";
import { registerAgency } from "../src/server/signup";
import { withAgency } from "../src/server/db";
import { loadOverview } from "../src/server/email/load";
import { unsubscribeToken, readUnsubscribeToken } from "../src/server/email/tokens";
const ids: string[] = [];
async function main() {
 const unique=randomUUID();
 const email="qa-"+unique+"@example.invalid";
 const first=await registerAgency({agencyName:"Isolation test A",name:"Test Owner",email,password:randomUUID()});ids.push(first.agencyId);
 const second=await registerAgency({agencyName:"Isolation test B",name:"Test Owner",email:"b-"+email,password:randomUUID()});ids.push(second.agencyId);
 const [a,b]=ids.map(id=>tenantClient(systemDb,id));
 const countBefore=await systemDb.agency.count();
 await assert.rejects(()=>registerAgency({agencyName:"Must roll back",name:"Test Owner",email,password:randomUUID()}));
 assert.equal(await systemDb.agency.count(),countBefore);
 assert.equal(await a.user.count(),1);assert.equal(await b.user.count(),1);
 const owner=await a.user.findFirstOrThrow();assert.equal(owner.role,"SUPER_ADMIN");
 const lead=await a.lead.create({data:{businessName:"Only A",assignedToId:owner.id}});
 assert.equal(await b.lead.findUnique({where:{id:lead.id}}),null);
 assert.equal(await b.lead.count(),0);
 assert.equal((await b.lead.updateMany({where:{id:lead.id},data:{businessName:"bad"}})).count,0);
 await assert.rejects(()=>b.lead.update({where:{id:lead.id},data:{businessName:"bad"}}));
 await assert.rejects(()=>b.lead.create({data:{businessName:"bad",assignedToId:owner.id}}));
 await assert.rejects(()=>b.lead.create({data:{businessName:"bad",agencyId:first.agencyId}}));
 await assert.rejects(()=>b.lead.create({data:{businessName:"bad",assignedTo:{connect:{id:owner.id}}}}));
 await assert.rejects(()=>a.lead.update({where:{id:lead.id},data:{agencyId:second.agencyId}}));
 await assert.rejects(()=>a.agency.findMany());await assert.rejects(()=>a.$queryRawUnsafe("SELECT * FROM User"));
 const [la,lb]=await Promise.all([a.lead.findMany(),b.lead.findMany()]);assert.equal(la.length,1);assert.equal(lb.length,0);
 await a.$transaction([a.lead.update({where:{id:lead.id},data:{notes:"transaction"}}),a.lead.count()]);
 const aSettings=await a.setting.findMany(),bSettings=await b.setting.findMany();assert.equal(aSettings.length,1);assert.equal(bSettings.length,1);assert.notEqual(aSettings[0].agencyId,bSettings[0].agencyId);
 await a.emailSend.create({data:{leadId:lead.id,email:"nobody@example.invalid",status:"SENT",sentAt:new Date()}});
 const overviewA=await withAgency(ids[0],()=>loadOverview());const overviewB=await withAgency(ids[1],()=>loadOverview());
 assert.equal(overviewA.stats.sent,1);assert.equal(overviewB.stats.sent,0);assert.equal(overviewB.funnel.emailed,0);
 const token=await withAgency(ids[0],()=>unsubscribeToken(lead.id));assert.equal(await withAgency(ids[0],()=>readUnsubscribeToken(token)),lead.id);assert.equal(await withAgency(ids[1],()=>readUnsubscribeToken(token)),null);
 console.log("PASS: signup, duplicate rollback, role ownership, tenant reads/writes/relations, transactions, settings, reports and signed links");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 for(const agencyId of ids){for(const model of ["emailSend","lead","auditLog","pool","setting","user"] as const)await (systemDb[model] as any).deleteMany({where:{agencyId}});await systemDb.agency.delete({where:{id:agencyId}});}
 await systemDb.$disconnect();
});
