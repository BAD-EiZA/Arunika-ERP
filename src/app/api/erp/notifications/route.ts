import { requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import {
  flushEmailOutbox,
  listNotifications,
  markNotificationRead,
  notifyUser,
} from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const items = await listNotifications(ctx.companyId, ctx.user.id);
    return {
      notifications: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        entityType: n.entityType,
        entityId: n.entityId,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const body = (await req.json()) as {
      action?: "read" | "test" | "flush_email";
      id?: string;
    };

    if (body.action === "read") {
      await markNotificationRead(String(body.id ?? ""), ctx.user.id);
      return { ok: true };
    }
    if (body.action === "flush_email") {
      return flushEmailOutbox();
    }

    const n = await notifyUser({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      type: "SYSTEM",
      title: "Notifikasi uji",
      message: "Ini notifikasi in-app + email outbox (jika email user ada).",
      email: ctx.user.email,
    });
    return { notification: { id: n.id } };
  });
}
