import { Prisma, PrismaClient } from "@prisma/client";
const models = new Map(Prisma.dmmf.datamodel.models.map(m => [m.name, m]));
const reads = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "update", "updateMany", "delete", "deleteMany", "upsert"]);
// All application access uses this client. Tenant IDs and primary IDs are immutable;
// nested writes are rejected so related records cannot bypass these checks.
export function tenantClient(root: PrismaClient, agencyId: string): PrismaClient {
  if (!agencyId) throw new Error("Agency required");
  return root.$extends({ name: "agency-isolation", query: {
    async $queryRaw() { throw new Error("Use explicitly scoped reporting queries"); },
    async $queryRawUnsafe() { throw new Error("Raw SQL is disabled"); },
    async $executeRaw() { throw new Error("Raw SQL is disabled"); },
    async $executeRawUnsafe() { throw new Error("Raw SQL is disabled"); },
    $allModels: { async $allOperations({ model, operation, args, query }) {
      const meta = models.get(model)!;
      if (!meta.fields.some(f => f.name === "agencyId")) throw new Error("System model access denied");
      const a = args as Record<string, any>;
      if (reads.has(operation)) a.where = { ...a.where, agencyId };
      if (![...reads, "create", "createMany"].includes(operation)) throw new Error("Unsupported agency operation");
      const checkData = async (data: Record<string, any>, creating: boolean) => {
        if (data.agencyId !== undefined && data.agencyId !== agencyId) throw new Error("Agency cannot be changed");
        if (!creating && data.id !== undefined) throw new Error("Record ID cannot be changed");
        for (const field of meta.fields.filter(f => f.kind === "object")) {
          if (data[field.name] !== undefined) throw new Error("Nested writes are not allowed");
        }
        const refs = meta.fields.filter(f => f.relationFromFields?.length).map(f => ({ field: f.relationFromFields![0], target: f.type }));
        if (model === "CsvImport") refs.push({ field: "poolId", target: "Pool" });
        if (model === "InboxMessage") refs.push({ field: "accountId", target: "EmailAccount" });
        for (const ref of refs) {
          const value = data[ref.field];
          if (value === undefined || value === null) continue;
          if (typeof value !== "string") throw new Error("Invalid related record");
          const delegate = (root as any)[ref.target[0].toLowerCase() + ref.target.slice(1)];
          if (!await delegate.findFirst({ where: { id: value, agencyId }, select: { id: true } })) throw new Error("Related record is outside your agency");
        }
        if (creating) data.agencyId = agencyId;
      };
      if (operation === "upsert") { await checkData(a.create, true); await checkData(a.update, false); }
      else if (a.data) for (const row of Array.isArray(a.data) ? a.data : [a.data]) await checkData(row, operation === "create" || operation === "createMany");
      return query(args);
    } },
  } }) as unknown as PrismaClient;
}
