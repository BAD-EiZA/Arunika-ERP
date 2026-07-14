import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { reviewThreeWayMatch } from "@/server/services/procurement";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [matches, receipts, bills] = await Promise.all([
      prisma.threeWayMatch.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.goodsReceipt.findMany({
        where: { companyId: ctx.companyId, status: "POSTED" },
        include: { supplier: true },
      }),
      prisma.supplierBill.findMany({
        where: { companyId: ctx.companyId },
        include: { supplier: true },
      }),
    ]);
    return {
      matches: matches.map((m) => ({
        id: m.id,
        status: m.status,
        isMatched: m.isMatched,
        qtyVariance: m.qtyVariance.toString(),
        priceVariance: m.priceVariance.toString(),
      })),
      receipts: receipts.map((gr) => ({
        id: gr.id,
        number: gr.number,
        supplierName: gr.supplier.name,
      })),
      bills: bills.map((b) => ({
        id: b.id,
        number: b.number,
        total: b.total.toString(),
        supplierName: b.supplier.name,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("three_way_match:review");
    const body = (await req.json()) as {
      goodsReceiptId?: string;
      supplierBillId?: string;
    };
    const match = await reviewThreeWayMatch({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      goodsReceiptId: String(body.goodsReceiptId ?? ""),
      supplierBillId: String(body.supplierBillId ?? ""),
    });
    return {
      match: {
        id: match.id,
        isMatched: match.isMatched,
        status: match.status,
        qtyVariance: match.qtyVariance.toString(),
        priceVariance: match.priceVariance.toString(),
      },
    };
  });
}
