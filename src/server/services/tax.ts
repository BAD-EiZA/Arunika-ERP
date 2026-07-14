import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-number";
import { notFound, validationError } from "@/lib/errors";
import { money, toPrismaMoney } from "@/lib/money";

export async function getEffectiveTaxCode(
  companyId: string,
  code: string,
  onDate = new Date(),
) {
  return prisma.taxCode.findFirst({
    where: {
      companyId,
      code,
      isActive: true,
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

export async function createTaxDocument(input: {
  companyId: string;
  docType: string;
  taxType: "PPN" | "PPH21" | "PPH22" | "PPH23" | "PPH4_2" | "PPH26" | "OTHER";
  partnerName?: string;
  partnerNpwp?: string;
  dpp: number | string;
  taxAmount: number | string;
  documentDate?: Date;
  taxPeriod?: string;
  sourceDocType?: string;
  sourceDocId?: string;
  notes?: string;
}) {
  const dpp = money(input.dpp);
  const taxAmount = money(input.taxAmount);
  if (dpp.lt(0) || taxAmount.lt(0)) {
    throw validationError("DPP/pajak tidak valid");
  }

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, input.companyId, "TAX");
    return tx.taxDocument.create({
      data: {
        companyId: input.companyId,
        number,
        docType: input.docType,
        taxType: input.taxType,
        status: "ISSUED",
        partnerName: input.partnerName,
        partnerNpwp: input.partnerNpwp,
        dpp: toPrismaMoney(dpp),
        taxAmount: toPrismaMoney(taxAmount),
        documentDate: input.documentDate ?? new Date(),
        taxPeriod: input.taxPeriod,
        sourceDocType: input.sourceDocType,
        sourceDocId: input.sourceDocId,
        notes: input.notes,
      },
    });
  });
}

export async function correctTaxDocument(input: {
  companyId: string;
  taxDocumentId: string;
  dpp: number | string;
  taxAmount: number | string;
  notes?: string;
}) {
  const original = await prisma.taxDocument.findFirst({
    where: { id: input.taxDocumentId, companyId: input.companyId },
  });
  if (!original) throw notFound("Dokumen pajak tidak ditemukan");

  return prisma.taxDocument.create({
    data: {
      companyId: input.companyId,
      number: original.number,
      docType: original.docType,
      taxType: original.taxType,
      status: "ISSUED",
      partnerName: original.partnerName,
      partnerNpwp: original.partnerNpwp,
      dpp: toPrismaMoney(money(input.dpp)),
      taxAmount: toPrismaMoney(money(input.taxAmount)),
      documentDate: new Date(),
      taxPeriod: original.taxPeriod,
      sourceDocType: original.sourceDocType,
      sourceDocId: original.sourceDocId,
      version: original.version + 1,
      replacesId: original.id,
      notes: input.notes ?? `Koreksi v${original.version + 1}`,
    },
  });
}

export async function exportTaxPeriod(companyId: string, taxPeriod: string) {
  const docs = await prisma.taxDocument.findMany({
    where: { companyId, taxPeriod, status: { not: "VOID" } },
    orderBy: [{ number: "asc" }, { version: "asc" }],
  });

  return {
    taxPeriod,
    generatedAt: new Date().toISOString(),
    count: docs.length,
    rows: docs.map((d) => ({
      number: d.number,
      version: d.version,
      docType: d.docType,
      taxType: d.taxType,
      partnerName: d.partnerName,
      partnerNpwp: d.partnerNpwp,
      dpp: d.dpp.toString(),
      taxAmount: d.taxAmount.toString(),
      documentDate: d.documentDate.toISOString(),
    })),
  };
}
