import { AsyncLocalStorage } from "node:async_hooks";
export type Agency = { id: string; name: string; url: string };
export const agencyContext = new AsyncLocalStorage<Agency>();
export function publicUrl() { return (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, ""); }
