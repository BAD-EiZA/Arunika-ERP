import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { buildSimplePdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const tenant = await requireTenant();
    const { type, id } = await ctx.params;
    const company = await prisma.company.findUnique({
      where: { id: tenant.companyId },
    });
    if (!company) {
      return new Response("Company not found", { status: 404 });
    }

    let pdfInput: Parameters<typeof buildSimplePdf>[0] | null = null;

    if (type === "invoice") {
      const inv = await prisma.salesInvoice.findFirst({
        where: { id, companyId: tenant.companyId },
        include: { customer: true, items: true },
      });
      if (!inv) return new Response("Not found", { status: 404 });
      pdfInput = {
        title: "INVOICE PENJUALAN",
        number: inv.number,
        companyName: company.name,
        partnerLabel: "Pelanggan",
        partnerName: inv.customer.name,
        dateValue: formatDateId(inv.invoiceDate),
        notes: inv.notes || undefined,
        lines: inv.items.map((i) => ({
          description: i.description,
          qty: i.quantity.toString(),
          price: formatIdr(i.unitPrice),
          total: formatIdr(i.total),
        })),
        totals: [
          { label: "Subtotal", value: formatIdr(inv.subtotal) },
          { label: "Pajak", value: formatIdr(inv.taxAmount) },
          { label: "Total", value: formatIdr(inv.total) },
          { label: "Saldo", value: formatIdr(inv.balance) },
        ],
      };
    } else if (type === "po") {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id, companyId: tenant.companyId },
        include: { supplier: true, items: { include: { product: true } } },
      });
      if (!po) return new Response("Not found", { status: 404 });
      pdfInput = {
        title: "PURCHASE ORDER",
        number: po.number,
        companyName: company.name,
        partnerLabel: "Pemasok",
        partnerName: po.supplier.name,
        dateValue: formatDateId(po.orderDate),
        notes: po.notes || undefined,
        lines: po.items.map((i) => ({
          description: i.product.sku + " " + (i.description || i.product.name),
          qty: i.quantity.toString(),
          price: formatIdr(i.unitPrice),
          total: formatIdr(i.total),
        })),
        totals: [
          { label: "Subtotal", value: formatIdr(po.subtotal) },
          { label: "Total", value: formatIdr(po.total) },
        ],
      };
    } else if (type === "so") {
      const so = await prisma.salesOrder.findFirst({
        where: { id, companyId: tenant.companyId },
        include: { customer: true, items: { include: { product: true } } },
      });
      if (!so) return new Response("Not found", { status: 404 });
      pdfInput = {
        title: "SALES ORDER",
        number: so.number,
        companyName: company.name,
        partnerLabel: "Pelanggan",
        partnerName: so.customer.name,
        dateValue: formatDateId(so.orderDate),
        notes: so.notes || undefined,
        lines: so.items.map((i) => ({
          description: i.product.sku + " " + (i.description || i.product.name),
          qty: i.quantity.toString(),
          price: formatIdr(i.unitPrice),
          total: formatIdr(i.total),
        })),
        totals: [{ label: "Total", value: formatIdr(so.total) }],
      };
    } else if (type === "do") {
      const d = await prisma.deliveryOrder.findFirst({
        where: { id, companyId: tenant.companyId },
        include: { customer: true, items: { include: { product: true } } },
      });
      if (!d) return new Response("Not found", { status: 404 });
      pdfInput = {
        title: "SURAT JALAN / DELIVERY",
        number: d.number,
        companyName: company.name,
        partnerLabel: "Pelanggan",
        partnerName: d.customer.name,
        dateValue: formatDateId(d.deliveryDate),
        notes: d.notes || undefined,
        lines: d.items.map((i) => ({
          description: i.product.sku + " " + i.product.name,
          qty: i.quantityDelivered.toString(),
          price: "-",
          total: "-",
        })),
      };
    } else {
      return new Response("Unknown type", { status: 400 });
    }

    const bytes = await buildSimplePdf(pdfInput);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${type}-${pdfInput.number.replaceAll("/", "-")}.pdf"`,
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "PDF error",
      { status: 400 },
    );
  }
}
