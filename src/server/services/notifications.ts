import { prisma } from "@/lib/db";

export async function notifyUser(input: {
  companyId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  email?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
    },
  });

  if (input.email) {
    await prisma.emailOutbox.create({
      data: {
        companyId: input.companyId,
        toEmail: input.email,
        subject: input.title,
        body: input.message,
        status: "PENDING",
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  }

  return notification;
}

export async function listNotifications(companyId: string, userId: string) {
  return prisma.notification.findMany({
    where: { companyId, userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationRead(id: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** No documented provider configuration exists; retain queued mail until a real transport is configured. */
export async function flushEmailOutbox(limit = 20) {
  void limit; // Preserve existing callers while delivery is blocked.
  // ponytail: Add provider delivery only with a documented contract and verified acceptance response.
  return { processed: 0, blocked: true, reason: "EMAIL_TRANSPORT_NOT_CONFIGURED" };
}
