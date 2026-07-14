import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/db";
import { validationError } from "@/lib/errors";
import { qty } from "@/lib/money";

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw validationError("GEMINI_API_KEY belum diset di env");
  const genAI = new GoogleGenerativeAI(key);
  // Gemini 2.0/2.5 flash-lite family; override via env if needed
  const modelName =
    process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
  return genAI.getGenerativeModel({ model: modelName });
}

export async function runForecastAndAnomaly(companyId: string) {
  const [products, movements, invoices, openSo] = await Promise.all([
    prisma.product.findMany({
      where: { companyId, isArchived: false },
      take: 50,
    }),
    prisma.stockMovement.findMany({
      where: { companyId },
      orderBy: { postedAt: "desc" },
      take: 200,
      include: { product: true },
    }),
    prisma.salesInvoice.findMany({
      where: { companyId, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PAID"] } },
      orderBy: { invoiceDate: "desc" },
      take: 100,
    }),
    prisma.salesOrderItem.findMany({
      where: {
        salesOrder: {
          companyId,
          status: { in: ["APPROVED", "CONFIRMED", "PARTIALLY_DELIVERED"] },
        },
      },
      include: { product: true },
    }),
  ]);

  const demandBySku = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== "SALES_DELIVERY") continue;
    demandBySku.set(
      m.product.sku,
      (demandBySku.get(m.product.sku) ?? 0) + Number(m.quantity),
    );
  }
  for (const i of openSo) {
    const rem = qty(i.quantity).minus(qty(i.quantityDelivered));
    demandBySku.set(
      i.product.sku,
      (demandBySku.get(i.product.sku) ?? 0) + Number(rem),
    );
  }

  const salesTotal = invoices.reduce((a, i) => a + Number(i.total), 0);
  const avgInvoice =
    invoices.length > 0 ? salesTotal / invoices.length : 0;
  const anomalies = invoices
    .filter((i) => Number(i.total) > avgInvoice * 3 && avgInvoice > 0)
    .slice(0, 5)
    .map((i) => ({
      number: i.number,
      total: i.total.toString(),
      status: i.status,
    }));

  const topDemand = [...demandBySku.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([sku, qtyVal]) => ({ sku, qty: qtyVal }));

  const context = {
    productCount: products.length,
    movementSample: movements.length,
    invoiceCount: invoices.length,
    salesTotal,
    avgInvoice,
    topDemand,
    anomalies,
  };

  let summary =
    "AI tidak dijalankan (fallback lokal). Set GEMINI_API_KEY untuk analisis model.";
  let modelUsed = "local-fallback";
  let payload: unknown = context;

  try {
    const model = getModel();
    modelUsed = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
    const prompt = `You are an ERP analyst for an Indonesian trading company.
Given this JSON metrics, produce:
1) 3-5 short demand forecast bullets (next 30 days)
2) anomaly findings
3) recommended actions
Respond in Bahasa Indonesia, concise markdown.

DATA:
${JSON.stringify(context)}`;

    const result = await model.generateContent(prompt);
    summary = result.response.text();
    payload = { context, raw: summary };
  } catch (error) {
    summary = `Fallback lokal: top demand ${topDemand
      .slice(0, 3)
      .map((t) => `${t.sku}:${t.qty}`)
      .join(", ") || "n/a"}. Anomali invoice: ${
      anomalies.length
    }. Error AI: ${error instanceof Error ? error.message : "unknown"}`;
    payload = { context, error: String(error) };
  }

  const insight = await prisma.aiInsight.create({
    data: {
      companyId,
      insightType: "FORECAST_ANOMALY",
      title: "Forecast & anomaly check",
      summary: summary.slice(0, 8000),
      severity: anomalies.length ? "warning" : "info",
      payload: payload as object,
      model: modelUsed,
    },
  });

  return insight;
}
