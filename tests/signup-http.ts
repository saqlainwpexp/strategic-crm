import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { systemDb } from "../src/server/system-db";
const base=process.env.TEST_BASE_URL || "http://localhost:3100";
const email="http-qa-"+randomUUID()+"@example.invalid", password=randomUUID();
const jar=new Map<string,string>();
async function request(path:string,init:RequestInit={}){
 const response=await fetch(base+path,{...init,headers:{...init.headers,Cookie:[...jar].map(([k,v])=>k+"="+v).join("; ")},redirect:"manual"});
 for(const cookie of response.headers.getSetCookie()){const first=cookie.split(";")[0];const at=first.indexOf("=");jar.set(first.slice(0,at),first.slice(at+1));}return response;
}
async function main(){
 assert.equal((await request("/signup")).status,200);
 assert.equal((await request("/dashboard")).status,307);
 const forbidden=await request("/api/signup",{method:"POST",headers:{Origin:"https://attacker.invalid","Content-Type":"application/json"},body:"{}"});assert.equal(forbidden.status,403);
 const result=await request("/api/signup",{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({agencyName:"HTTP Signup Test",name:"Test Owner",email,password})});assert.equal(result.status,201,await result.text());
 const csrf=await (await request("/api/auth/csrf")).json();
 const login=await request("/api/auth/callback/credentials",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,json:"true",callbackUrl:base+"/dashboard"})});assert.equal(login.status,200,await login.text());
 const session=await (await request("/api/auth/session")).json();assert.ok(session.user.agencyId);assert.notEqual(session.user.agencyId,"default");
 const dashboard=await request("/dashboard");const html=await dashboard.text();assert.equal(dashboard.status,200);assert.ok(html.includes("HTTP Signup Test"));assert.ok(html.includes("Test Owner"));
 console.log("PASS: public signup page, access redirect, origin protection, registration, login, tenant session and dashboard");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{const user=await systemDb.user.findUnique({where:{email}});if(user){const agencyId=user.agencyId;for(const model of ["auditLog","pool","setting","user"] as const)await (systemDb[model] as any).deleteMany({where:{agencyId}});await systemDb.agency.delete({where:{id:agencyId}});}await systemDb.$disconnect()});
