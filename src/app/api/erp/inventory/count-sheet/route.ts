import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, notFound, toErrorMessage } from "@/lib/errors";
import { assertWarehouseOwnership } from "@/server/services/inventory";
import { renderCountSheet } from "./render";
export async function GET(req: Request) {
 try {
  const ctx = await requirePermission("stock:opname");
  const id = new URL(req.url).searchParams.get("id");
  if (!id || id.length > 200) throw notFound();
  const doc = await prisma.stockOpname.findFirst({ where: { id, companyId: ctx.companyId }, include: { items: { include: { product: { select: { sku: true, name: true } } }, orderBy: { id: "asc" } } } });
  if (!doc) throw notFound();
  await assertWarehouseOwnership(prisma, { companyId: ctx.companyId, warehouseId: doc.warehouseId, access: ctx });
  return new Response(renderCountSheet(doc), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'" } });
 } catch (e) { return Response.json({ error: toErrorMessage(e) }, { status: e instanceof AppError ? e.status : 500 }); }
}
