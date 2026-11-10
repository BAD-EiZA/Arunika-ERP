import { z } from "zod";
import { validationError } from "@/lib/errors";
import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  correctManagedTaxDocument,
  createManagedTaxDocument,
  exportEfakturCsv,
  exportTaxPeriod,
} from "@/server/services/tax";

export const dynamic = "force-dynamic";
const monetary = z.union([z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().finite().nonnegative()]);
const documentInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), docType: z.string().min(1).max(100), taxType: z.enum(["PPN", "PPH21", "PPH22", "PPH23", "PPH4_2", "PPH26", "OTHER"]), taxCode: z.string().min(1).max(100), documentDate: z.string().min(1), sourceDocType: z.string().min(1), sourceDocId: z.string().min(1), taxPeriod: z.string().min(6), dpp: monetary, partnerName: z.string().max(200).optional(), partnerNpwp: z.string().max(100).optional() }),
  z.object({ action: z.literal("correct"), id: z.string().min(1), dpp: monetary, taxAmount: monetary, notes: z.string().min(1).max(4000) }),
  z.object({ action: z.enum(["export", "efaktur"]), taxPeriod: z.string().min(6) }),
]);

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("tax:view");
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
    await requirePermission("tax:view");
    const parsed = documentInput.safeParse(await req.json());
    if (!parsed.success) throw validationError("Invalid tax document input", parsed.error.flatten());
    const body = parsed.data as {
      action?: "create" | "correct" | "export" | "efaktur";
      id?: string;
      docType?: string;
      taxType?: "PPN" | "PPH21" | "PPH22" | "PPH23" | "PPH4_2" | "PPH26" | "OTHER";
      partnerName?: string;
      partnerNpwp?: string;
      dpp?: string | number;
      taxAmount?: string | number;
      taxPeriod?: string;
      taxCode?: string;
      documentDate?: string;
      sourceDocType?: string;
      sourceDocId?: string;
      notes?: string;
    };

    if (body.action === "export") {
      const ctx = await requirePermission("tax_export:generate");
    await assertRequestAccess(ctx, body);
      return exportTaxPeriod(ctx.companyId, String(body.taxPeriod ?? ""));
    }
    if (body.action === "efaktur") {
      const ctx = await requirePermission("tax_export:generate");
    await assertRequestAccess(ctx, body);
      return exportEfakturCsv(ctx.companyId, String(body.taxPeriod ?? ""));
    }

    if (body.action === "correct") {
      const ctx = await requirePermission("tax_document:correct");
    await assertRequestAccess(ctx, body);
      const doc = await correctManagedTaxDocument({
        companyId: ctx.companyId, actorId: ctx.user.id,
        taxDocumentId: String(body.id ?? ""),
        dpp: String(body.dpp ?? ""),
        taxAmount: String(body.taxAmount ?? ""),
        reason: body.notes ?? "",
      });
      return { document: { id: doc.id, version: doc.version } };
    }

    const ctx = await requirePermission("tax_document:create");
    await assertRequestAccess(ctx, body);
    const doc = await createManagedTaxDocument({
      companyId: ctx.companyId, actorId: ctx.user.id,
      taxCode: String(body.taxCode ?? ""), documentDate: body.documentDate ? new Date(body.documentDate) : new Date(),
      sourceDocType: String(body.sourceDocType ?? ""), sourceDocId: String(body.sourceDocId ?? ""),
      docType: body.docType || "FAKTUR_KELUARAN",
      taxType: body.taxType || "PPN",
      partnerName: body.partnerName || undefined,
      partnerNpwp: body.partnerNpwp || undefined,
      dpp: String(body.dpp ?? ""),
      taxPeriod: String(body.taxPeriod ?? ""),
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
