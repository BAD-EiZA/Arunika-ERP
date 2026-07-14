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

/** Dev/simple sender: marks pending emails as SENT (log body). Hook real SMTP later. */
export async function flushEmailOutbox(limit = 20) {
  const pending = await prisma.emailOutbox.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const mail of pending) {
    try {
      console.info("[email]", mail.toEmail, mail.subject);
      await prisma.emailOutbox.update({
        where: { id: mail.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    } catch (error) {
      await prisma.emailOutbox.update({
        where: { id: mail.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "send failed",
        },
      });
    }
  }

  return { processed: pending.length };
}
