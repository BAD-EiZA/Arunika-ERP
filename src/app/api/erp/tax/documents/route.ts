import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  correctTaxDocument,
  createTaxDocument,
  exportEfakturCsv,
  exportTaxPeriod,
} from "@/server/services/tax";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const docs = await prisma.taxDocument.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { createdAt: "desc" },
    });
    return {
      documents: docs.map((d) => ({
        id: d.id,
        number: d.number,
        version: d.version,
        docType: d.docType,
        taxType: d.taxType,
        status: d.status,
        partnerName: d.partnerName,
        dpp: d.dpp.toString(),
        taxAmount: d.taxAmount.toString(),
        documentDate: d.documentDate.toISOString(),
        taxPeriod: d.taxPeriod,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "create" | "correct" | "export" | "efaktur";
      id?: string;
      docType?: string;
      taxType?: "PPN" | "PPH21" | "PPH22" | "PPH23" | "PPH4_2" | "PPH26" | "OTHER";
      partnerName?: string;
      partnerNpwp?: string;
      dpp?: string | number;
      taxAmount?: string | number;
      taxPeriod?: string;
      notes?: string;
    };

    if (body.action === "export") {
      const ctx = await requirePermission("tax_export:generate");
      return exportTaxPeriod(ctx.companyId, String(body.taxPeriod ?? ""));
    }
    if (body.action === "efaktur") {
      const ctx = await requirePermission("tax_export:generate");
      return exportEfakturCsv(ctx.companyId, String(body.taxPeriod ?? ""));
    }

    if (body.action === "correct") {
      const ctx = await requirePermission("tax_document:correct");
      const doc = await correctTaxDocument({
        companyId: ctx.companyId,
        taxDocumentId: String(body.id ?? ""),
        dpp: body.dpp ?? 0,
        taxAmount: body.taxAmount ?? 0,
        notes: body.notes || undefined,
      });
      return { document: { id: doc.id, version: doc.version } };
    }

    const ctx = await requirePermission("tax_document:create");
    const doc = await createTaxDocument({
      companyId: ctx.companyId,
      docType: body.docType || "FAKTUR_KELUARAN",
      taxType: body.taxType || "PPN",
      partnerName: body.partnerName || undefined,
      partnerNpwp: body.partnerNpwp || undefined,
      dpp: body.dpp ?? 0,
      taxAmount: body.taxAmount ?? 0,
      taxPeriod: body.taxPeriod || undefined,
      notes: body.notes || undefined,
    });
    return {
      document: {
        id: doc.id,
        number: doc.number,
        version: doc.version,
      },
    };
  });
}
