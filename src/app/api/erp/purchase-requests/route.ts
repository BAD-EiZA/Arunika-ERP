import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  approvePurchaseRequest,
  createPurchaseRequest,
} from "@/server/services/procurement";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [requests, products, branches] = await Promise.all([
      prisma.purchaseRequest.findMany({
        where: { companyId: ctx.companyId },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.findMany({
        where: { companyId: ctx.companyId, isArchived: false },
      }),
      prisma.branch.findMany({
        where: { companyId: ctx.companyId, isActive: true },
      }),
    ]);
    return {
      requests: requests.map((pr) => ({
        id: pr.id,
        number: pr.number,
        status: pr.status,
        notes: pr.notes,
        items: pr.items.map((i) => ({
          productId: i.productId,
          sku: i.product.sku,
          quantity: i.quantity.toString(),
        })),
      })),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
      })),
      branches: branches.map((b) => ({ id: b.id, code: b.code, name: b.name })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "create" | "approve";
      id?: string;
      branchId?: string;
      notes?: string;
      items?: Array<{ productId: string; quantity: string | number; notes?: string }>;
    };
    if (body.action === "approve") {
      const ctx = await requirePermission("purchase_request:approve");
      const pr = await approvePurchaseRequest(
        ctx.companyId,
        ctx.user.id,
        String(body.id),
      );
      return { purchaseRequest: { id: pr.id, status: pr.status } };
    }
    const ctx = await requirePermission("purchase_request:create");
    const pr = await createPurchaseRequest({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      branchId: body.branchId || undefined,
      notes: body.notes || undefined,
      items: body.items ?? [],
    });
    return {
      purchaseRequest: {
        id: pr.id,
        number: pr.number,
        status: pr.status,
      },
    };
  });
}
