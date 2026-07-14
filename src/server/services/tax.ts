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

/** MVP e-Faktur style CSV (FK/FM) for offline upload preparation. */
export async function exportEfakturCsv(companyId: string, taxPeriod: string) {
  const docs = await prisma.taxDocument.findMany({
    where: {
      companyId,
      taxPeriod,
      taxType: "PPN",
      status: { not: "VOID" },
    },
    orderBy: [{ documentDate: "asc" }, { number: "asc" }],
  });

  const reg = await prisma.taxRegistration.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  const header = [
    "FK",
    "KD_JENIS_TRANSAKSI",
    "FG_PENGGANTI",
    "NOMOR_FAKTUR",
    "MASA_PAJAK",
    "TAHUN_PAJAK",
    "TANGGAL_FAKTUR",
    "NPWP",
    "NAMA",
    "ALAMAT_LENGKAP",
    "JUMLAH_DPP",
    "JUMLAH_PPN",
    "JUMLAH_PPNBM",
    "ID_KETERANGAN_TAMBAHAN",
    "FG_UANG_MUKA",
    "UANG_MUKA_DPP",
    "UANG_MUKA_PPN",
    "UANG_MUKA_PPNBM",
    "REFERENSI",
  ];

  const [year, month] = taxPeriod.split("-");
  const rows = docs.map((d) => {
    const isOutput = d.docType.includes("KELUAR") || d.docType.includes("OUT");
    return [
      isOutput ? "FK" : "FM",
      "01",
      "0",
      d.number.replaceAll("/", ""),
      month || "",
      year || "",
      d.documentDate.toISOString().slice(0, 10),
      (d.partnerNpwp || reg?.npwp || "").replaceAll(/[^0-9]/g, ""),
      d.partnerName || "",
      "",
      Number(d.dpp).toFixed(0),
      Number(d.taxAmount).toFixed(0),
      "0",
      "",
      "0",
      "0",
      "0",
      "0",
      d.notes || "",
    ];
  });

  const esc = (v: string | number) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  return {
    taxPeriod,
    filename: `efaktur-${taxPeriod}.csv`,
    csv,
    count: docs.length,
    npwpPk: reg?.npwp ?? null,
  };
}

export async function upsertTaxRegistration(input: {
  companyId: string;
  npwp?: string;
  isPkp?: boolean;
  pkpDate?: Date;
  taxOffice?: string;
}) {
  const existing = await prisma.taxRegistration.findFirst({
    where: { companyId: input.companyId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return prisma.taxRegistration.update({
      where: { id: existing.id },
      data: {
        npwp: input.npwp ?? existing.npwp,
        isPkp: input.isPkp ?? existing.isPkp,
        pkpDate: input.pkpDate ?? existing.pkpDate,
        taxOffice: input.taxOffice ?? existing.taxOffice,
      },
    });
  }
  return prisma.taxRegistration.create({
    data: {
      companyId: input.companyId,
      npwp: input.npwp,
      isPkp: input.isPkp ?? false,
      pkpDate: input.pkpDate,
      taxOffice: input.taxOffice,
    },
  });
}

export async function createTaxCode(input: {
  companyId: string;
  code: string;
  name: string;
  taxType: "PPN" | "PPH21" | "PPH22" | "PPH23" | "PPH4_2" | "PPH26" | "OTHER";
  direction: "INPUT" | "OUTPUT" | "WITHHOLDING";
  rate: number | string;
  glAccountCode?: string;
  effectiveFrom?: Date;
}) {
  if (!input.code.trim() || !input.name.trim()) {
    throw validationError("Kode dan nama tax code wajib");
  }
  return prisma.taxCode.create({
    data: {
      companyId: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      taxType: input.taxType,
      direction: input.direction,
      rate: toPrismaMoney(money(input.rate)),
      glAccountCode: input.glAccountCode,
      effectiveFrom: input.effectiveFrom ?? new Date(),
      isActive: true,
    },
  });
}
