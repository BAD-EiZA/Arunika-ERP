import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type AuditInput = {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityNumber?: string | null;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  requestId?: string | null;
};

export async function writeAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityNumber: input.entityNumber ?? null,
      beforeData: input.beforeData,
      afterData: input.afterData,
      metadata: input.metadata,
      requestId: input.requestId ?? null,
    },
  });
}
