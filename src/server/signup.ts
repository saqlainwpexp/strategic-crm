import { z } from "zod";
import bcrypt from "bcryptjs";
import { systemDb } from "./system-db";
import { DEFAULT_BRANDING } from "@/lib/branding";
export const signupSchema = z.object({
  agencyName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(72),
  website: z.string().max(0).optional(),
});
export async function registerAgency(input: unknown) {
  const data = signupSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);
  return systemDb.$transaction(async tx => {
    const agency = await tx.agency.create({ data: { name: data.agencyName } });
    const user = await tx.user.create({ data: { agencyId: agency.id, name: data.name, email: data.email, passwordHash, role: "SUPER_ADMIN", title: "Agency owner", passwordChangedAt: new Date() } });
    await tx.setting.create({ data: { agencyId: agency.id, key: "branding", value: { ...DEFAULT_BRANDING, agencyName: data.agencyName, appName: data.agencyName } } });
    await tx.pool.create({ data: { agencyId: agency.id, name: "General", description: "Your agency's lead pool" } });
    await tx.auditLog.create({ data: { agencyId: agency.id, userId: user.id, action: "agency.signup", entityType: "Agency", entityId: agency.id } });
    return { agencyId: agency.id };
  }, { maxWait: 10000, timeout: 30000 });
}
