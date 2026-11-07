import { test } from "node:test";
import assert from "node:assert/strict";
import { agencyContext } from "../src/server/agencies";
import { signupSchema } from "../src/server/signup";
import { sign, verify } from "../src/server/email/crypto";
import { emailAgencyId, emailRecordId, emailReference } from "../src/server/email/tokens";
test("signup validates fields and cannot grant arbitrary roles or agency IDs", () => {
 const data = signupSchema.parse({agencyName:"New Agency",name:"Owner Name",email:" OWNER@example.com ",password:"long-test-password",role:"MANAGER",agencyId:"default"});
 assert.equal(data.email,"owner@example.com"); assert.equal("role" in data,false); assert.equal("agencyId" in data,false);
 for(const value of [{...data,password:"short"},{...data,email:"bad"},{...data,agencyName:""},{...data,website:"bot"}])assert.equal(signupSchema.safeParse(value).success,false);
});
test("concurrent jobs retain their agency context",async()=>{
 await Promise.all(["alpha","beta"].map(id=>agencyContext.run({id,name:id,url:"https://crm.example.com"},async()=>{
 await new Promise(r=>setTimeout(r,id==="alpha"?15:5));assert.equal(agencyContext.getStore()?.id,id);
 })));assert.equal(agencyContext.getStore(),undefined);
});
test("public email tokens cannot cross agencies and preserve old links",()=>{
 const old=process.env.EMAIL_ENCRYPTION_KEY;process.env.EMAIL_ENCRYPTION_KEY="test-secret-longer-than-thirty-two-characters";
 try {const signature=sign("u:lead",22,"alpha");assert.equal(verify("u:lead",signature,22,"alpha"),true);assert.equal(verify("u:lead",signature,22,"beta"),false);
 assert.equal(emailAgencyId("legacy.sig"),"default");assert.equal(emailRecordId("alpha~lead.sig"),"lead.sig");assert.equal(emailReference("lead","alpha"),"alpha~lead");
 }finally{if(old===undefined)delete process.env.EMAIL_ENCRYPTION_KEY;else process.env.EMAIL_ENCRYPTION_KEY=old;}
});
