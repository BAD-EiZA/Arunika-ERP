import { createHash } from "node:crypto";
import { postJournal } from "./accounting";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { conflict } from "@/lib/errors";
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
  if (!money(input.dpp).isFinite() || !money(input.taxAmount).isFinite() || money(input.dpp).lt(0) || money(input.taxAmount).lt(0)) throw validationError("DPP/pajak tidak valid");
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

  const current = latestDocuments(docs);
  return {
    taxPeriod,
    label: "OFFLINE INTERNAL REVIEW ONLY; not a validated DJP upload format",
    generatedAt: new Date().toISOString(),
    count: current.length,
    rows: current.map((d) => ({
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
    label: "LEGACY OFFLINE PREPARATION ONLY — NOT A VALIDATED CURRENT DJP UPLOAD FORMAT",
    submitted: false,
    filename: `legacy-offline-efaktur-${taxPeriod}.csv`,
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

export async function createTaxRuleVersion(input: { companyId: string; code: string; name: string; taxType: "PPN" | "PPH21" | "PPH22" | "PPH23" | "PPH4_2" | "PPH26" | "OTHER"; direction: "INPUT" | "OUTPUT" | "WITHHOLDING"; rate: string; effectiveFrom: Date; effectiveTo?: Date; legalReference: string; glAccountCode?: string; category?: string; baseMultiplier?: string; inclusive?: boolean; recoverablePercent?: string; rounding?: string }) {
  if (!input.legalReference?.trim()) throw validationError("Legal reference required");
  if (!input.code.trim() || !input.name.trim() || !Number.isFinite(input.effectiveFrom.getTime()) || (input.effectiveTo && (!Number.isFinite(input.effectiveTo.getTime()) || input.effectiveTo < input.effectiveFrom))) throw validationError("Invalid tax rule dates/code");
  calculateTaxRule("100", { rate: input.rate, baseMultiplier: input.baseMultiplier ?? "1", inclusive: input.inclusive ?? false, recoverablePercent: input.recoverablePercent ?? "100", rounding: input.rounding ?? "HALF_UP" });
  return prisma.$transaction(async tx => {
    const overlap = await tx.taxCode.findFirst({ where: { companyId: input.companyId, code: input.code, isActive: true, effectiveFrom: { lte: input.effectiveTo ?? new Date("9999-12-31") }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveFrom } }] } });
    if (overlap) throw conflict("Tax rule effective date overlaps an existing version");
    return tx.taxCode.create({ data: { ...input, rate: input.rate, baseMultiplier: input.baseMultiplier ?? "1", recoverablePercent: input.recoverablePercent ?? "100", inclusive: input.inclusive ?? false, rounding: input.rounding ?? "HALF_UP", legalReference: input.legalReference.trim() } });
  }, { isolationLevel: "Serializable" });
}

export async function saveTaxProfile(input: { companyId: string; actorId: string; npwp: string; effectiveFrom: Date; nik?: string; isPkp?: boolean; taxOffice?: string; taxAddress?: string; taxContact?: string; signingAuthority?: string; authorizationMetadata?: Prisma.InputJsonObject; taxCalendar?: string }) {
  if (!Number.isFinite(input.effectiveFrom.getTime())) throw validationError("Invalid profile effective date");
  if (!input.npwp?.trim()) throw validationError("Tax identifier required");
  return prisma.$transaction(async tx => {
    const previous = await tx.taxRegistration.findFirst({ where: { companyId: input.companyId, effectiveFrom: { lte: input.effectiveFrom }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveFrom } }] }, orderBy: { effectiveFrom: "desc" } });
    if (previous && input.effectiveFrom <= previous.effectiveFrom) throw conflict("Profile effective date must follow prior version");
    if (previous) await tx.taxRegistration.update({ where: { id: previous.id }, data: { effectiveTo: new Date(input.effectiveFrom.getTime() - 1) } });
    return tx.taxRegistration.create({ data: { companyId: input.companyId, npwp: input.npwp.trim(), effectiveFrom: input.effectiveFrom, nik: input.nik, isPkp: input.isPkp ?? false, taxOffice: input.taxOffice, taxAddress: input.taxAddress, taxContact: input.taxContact, signingAuthority: input.signingAuthority, authorizationMetadata: input.authorizationMetadata, taxCalendar: input.taxCalendar, changedById: input.actorId } });
  }, { isolationLevel: "Serializable" });
}

export async function correctManagedTaxDocument(input: { companyId: string; actorId: string; taxDocumentId: string; dpp: string; taxAmount: string; reason: string }) {
  if (!input.reason?.trim()) throw validationError("Correction reason required");
  const dpp = money(input.dpp), tax = money(input.taxAmount);
  if (![dpp, tax].every(v => v.isFinite() && v.gte(0) && v.decimalPlaces() <= 2)) throw validationError("Invalid correction amounts");
  return prisma.$transaction(async tx => {
    const old = await tx.taxDocument.findFirst({ where: { id: input.taxDocumentId, companyId: input.companyId } });
    if (!old) throw notFound("Tax document not found");
    if (!old.taxPeriod) throw validationError("Original has no tax period");
    const period = normalizeTaxPeriod(old.taxPeriod);
    const state = await tx.taxPeriod.findUnique({ where: { companyId_period: { companyId: input.companyId, period } } });
    if (state?.status === "CLOSED") throw conflict("Tax period closed");
    if (await tx.taxDocument.findFirst({ where: { companyId: input.companyId, replacesId: old.id } })) throw conflict("Document already corrected");
    return tx.taxDocument.create({ data: { companyId: input.companyId, number: old.number, version: old.version + 1, replacesId: old.id, docType: old.docType, taxType: old.taxType, status: "ISSUED", partnerName: old.partnerName, partnerNpwp: old.partnerNpwp, dpp: dpp.toFixed(2), taxAmount: tax.toFixed(2), documentDate: new Date(), taxPeriod: period, sourceDocType: old.sourceDocType, sourceDocId: old.sourceDocId, taxCodeId: old.taxCodeId, glAccountCode: old.glAccountCode, direction: old.direction, ruleSnapshot: old.ruleSnapshot ?? undefined, createdById: input.actorId, notes: input.reason.trim() } });
  }, { isolationLevel: "Serializable" });
}

export async function recordTaxPayment(input: { companyId: string; actorId: string; period: string; amount: string; billingReference: string; bankReference: string; paymentDate: Date; bankAccountCode: string; allocations: Array<{ documentId: string; amount: string }> }) {
  const period = normalizeTaxPeriod(input.period), amount = money(input.amount);
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2 || !input.billingReference?.trim() || !input.bankReference?.trim() || !input.bankAccountCode?.trim() || !Number.isFinite(input.paymentDate.getTime())) throw validationError("Invalid payment references/amount/date");
  if (!input.allocations.length || input.allocations.some(a => !a.documentId || !money(a.amount).isFinite() || money(a.amount).lte(0) || money(a.amount).decimalPlaces() > 2) || !input.allocations.reduce((sum, a) => sum.plus(a.amount), money(0)).eq(amount)) throw validationError("Payment allocation must equal amount");
  return prisma.$transaction(async tx => {
    const ids = input.allocations.map(a => a.documentId);
    if (new Set(ids).size !== ids.length) throw validationError("Duplicate allocation document");
    const docs = await tx.taxDocument.findMany({ where: { companyId: input.companyId, id: { in: ids }, taxPeriod: { in: [period, `${period.slice(0,4)}-${period.slice(4)}`] }, status: { not: "VOID" } } });
    if (docs.length !== ids.length || docs.some(d => !d.glAccountCode) || new Set(docs.map(d => d.glAccountCode)).size !== 1) throw validationError("Unknown/unmapped tax document");
    const previous = await tx.taxPayment.findMany({ where: { companyId: input.companyId, period }, select: { allocations: true } });
    for (const doc of docs) {
      const used = previous.reduce((sum, payment) => sum.plus((Array.isArray(payment.allocations) ? payment.allocations : []).reduce((total, allocation) => {
        if (!allocation || typeof allocation !== "object" || !("documentId" in allocation) || allocation.documentId !== doc.id || !("amount" in allocation)) return total;
        return total.plus(String(allocation.amount));
      }, money(0))), money(0));
      if (used.plus(input.allocations.find(a => a.documentId === doc.id)!.amount).gt(doc.taxAmount.toString())) throw validationError("Tax liability overallocated");
    }
    const journal = await postJournal(tx, { companyId: input.companyId, postingDate: input.paymentDate, sourceModule: "TAX", sourceDocType: "TAX_PAYMENT", sourceDocId: input.bankReference, description: `Tax settlement ${input.billingReference}`, idempotencyKey: `tax-payment:${input.bankReference}`, postedById: input.actorId, lines: [{ accountCode: docs[0].glAccountCode!, debit: amount.toFixed(2) }, { accountCode: input.bankAccountCode, credit: amount.toFixed(2) }] });
    return tx.taxPayment.create({ data: { companyId: input.companyId, period, amount: amount.toFixed(2), billingReference: input.billingReference.trim(), bankReference: input.bankReference.trim(), paymentDate: input.paymentDate, allocations: input.allocations, journalId: journal.id, createdById: input.actorId } });
  }, { isolationLevel: "Serializable" });
}

export function calculateTaxRule(base: string | number, rule: { rate: string | number | { toString(): string }; baseMultiplier: string | number | { toString(): string }; inclusive: boolean; recoverablePercent: string | number | { toString(): string }; rounding: string }) {
  const value = money(base), rate = money(rule.rate.toString()), multiplier = money(rule.baseMultiplier.toString()), percent = money(rule.recoverablePercent.toString());
  if (![value, rate, multiplier, percent].every(v => v.isFinite()) || value.lt(0) || rate.lt(0) || multiplier.lt(0) || percent.lt(0) || percent.gt(100)) throw validationError("Invalid tax rule values");
  if (rule.rounding !== "HALF_UP") throw validationError("Unsupported rounding rule");
  const basis = rule.inclusive ? value.div(money(1).plus(rate.mul(multiplier).div(100))) : value;
  const amount = basis.mul(multiplier).mul(rate).div(100).toDecimalPlaces(2);
  return { dpp: basis.toFixed(2), taxAmount: amount.toFixed(2), recoverable: amount.mul(percent).div(100).toFixed(2) };
}

export async function createManagedTaxDocument(input: { companyId: string; actorId: string; docType: string; taxType: "PPN" | "PPH21" | "PPH22" | "PPH23" | "PPH4_2" | "PPH26" | "OTHER"; dpp: string; taxPeriod: string; taxCode: string; documentDate: Date; sourceDocType: string; sourceDocId: string; partnerName?: string; partnerNpwp?: string }) {
  const period = normalizeTaxPeriod(input.taxPeriod);
  if (!Number.isFinite(input.documentDate.getTime()) || !input.sourceDocType.trim() || !input.sourceDocId.trim()) throw validationError("Document date/source required");
  const row = await prisma.taxPeriod.findUnique({ where: { companyId_period: { companyId: input.companyId, period } } });
  if (row?.status === "CLOSED") throw conflict("Tax period closed");
  const rule = await getEffectiveTaxCode(input.companyId, input.taxCode, input.documentDate);
  if (!rule || rule.taxType !== input.taxType || !rule.glAccountCode) throw validationError("Effective mapped tax rule required");
  const result = calculateTaxRule(input.dpp, rule);
  return prisma.$transaction(async tx => {
    const current = await tx.taxPeriod.findUnique({ where: { companyId_period: { companyId: input.companyId, period } } });
    if (current?.status === "CLOSED") throw conflict("Tax period closed");
    const number = await nextDocumentNumber(tx, input.companyId, "TAX");
    return tx.taxDocument.create({ data: { companyId: input.companyId, number, docType: input.docType, taxType: input.taxType, status: "ISSUED", partnerName: input.partnerName, partnerNpwp: input.partnerNpwp, documentDate: input.documentDate, taxPeriod: period, sourceDocType: input.sourceDocType, sourceDocId: input.sourceDocId, dpp: result.dpp, taxAmount: result.taxAmount, taxCodeId: rule.id, glAccountCode: rule.glAccountCode, direction: rule.direction, ruleSnapshot: { code: rule.code, effectiveFrom: rule.effectiveFrom.toISOString(), rate: rule.rate.toString(), baseMultiplier: rule.baseMultiplier.toString(), recoverablePercent: rule.recoverablePercent.toString(), inclusive: rule.inclusive, rounding: rule.rounding, result }, createdById: input.actorId } });
  }, { isolationLevel: "Serializable" });
}

export async function importTaxExportResponse(companyId: string, batchId: string, actorId: string, response: { status: string; reference: string; evidence: string }) {
  if (!["REPORTED_ACCEPTED", "REPORTED_REJECTED"].includes(response.status)) throw validationError("Unsupported manual status; use REPORTED_ACCEPTED/REPORTED_REJECTED");
  if (!response.reference?.trim() || !response.evidence?.trim()) throw validationError("Reference and evidence required");
  return prisma.$transaction(async tx => {
    const batch = await tx.taxExportBatch.findFirst({ where: { id: batchId, companyId } });
    if (!batch) throw notFound("Export batch not found");
    const responses = [...(Array.isArray(batch.responses) ? batch.responses : []), { status: response.status, reference: response.reference.trim(), evidence: response.evidence.trim(), actorId, recordedAt: new Date().toISOString(), source: "USER_PROVIDED_UNVERIFIED" }];
    return tx.taxExportBatch.update({ where: { id: batchId }, data: { status: response.status, submissionReference: response.reference.trim(), responses } });
  });
}

export function normalizeTaxPeriod(period: string) {
  const value = period.replace("-", "");
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(value)) throw validationError("Invalid tax period (YYYYMM)");
  return value;
}

function latestDocuments<T extends { id: string; replacesId?: string | null }>(docs: T[]) {
  const replaced = new Set(docs.map(d => d.replacesId).filter(Boolean));
  return docs.filter(d => !replaced.has(d.id));
}

type TaxTx = Prisma.TransactionClient;
export async function reconcileTaxPeriod(companyId: string, period: string, tx: TaxTx = prisma) {
  period = normalizeTaxPeriod(period);
  const start = new Date(`${period.slice(0, 4)}-${period.slice(4)}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const [allDocs, journals, sales, purchases] = await Promise.all([
    tx.taxDocument.findMany({ where: { companyId, taxPeriod: { in: [period, `${period.slice(0,4)}-${period.slice(4)}`] }, status: { not: "VOID" } }, orderBy: [{ number: "asc" }, { version: "asc" }] }),
    tx.journal.findMany({ where: { companyId, status: "POSTED", postingDate: { gte: start, lt: end } }, include: { lines: { include: { account: true } } } }),
    tx.salesInvoice.findMany({ where: { companyId, status: { in: ["ISSUED", "POSTED", "PARTIALLY_PAID", "PAID"] }, invoiceDate: { gte: start, lt: end } }, select: { id: true, taxAmount: true } }),
    tx.supplierBill.findMany({ where: { companyId, status: { in: ["ISSUED", "POSTED", "PARTIALLY_PAID", "PAID"] }, invoiceDate: { gte: start, lt: end } }, select: { id: true, taxAmount: true } }),
  ]);
  const docs = latestDocuments(allDocs);
  const exceptions: Array<{ documentId: string; code: string; expected?: string; actual?: string }> = [];
  for (const [sources, code] of [[sales, "SALES_VAT_DIFFERENCE"], [purchases, "PURCHASE_VAT_DIFFERENCE"]] as const) {
    for (const source of sources) {
      const actual = docs.filter(d => d.sourceDocId === source.id && d.taxType === "PPN").reduce((sum, d) => sum.plus(d.taxAmount.toString()), money(0));
      if (!actual.eq(source.taxAmount.toString())) exceptions.push({ documentId: source.id, code, expected: money(source.taxAmount.toString()).toFixed(2), actual: actual.toFixed(2) });
    }
  }
  const groups = new Map<string, { ids: string[]; amount: ReturnType<typeof money>; account: string; sourceId: string; sourceType: string; input: boolean }>();
  for (const doc of docs) {
    if (!doc.glAccountCode || !doc.sourceDocId || !doc.sourceDocType) {
      exceptions.push({ documentId: doc.id, code: "MISSING_SOURCE_OR_ACCOUNT_MAPPING" }); continue;
    }
    const input = doc.direction === "INPUT" || doc.docType.includes("MASUK") || doc.docType.includes("INPUT");
    const key = JSON.stringify([doc.sourceDocType, doc.sourceDocId, doc.glAccountCode, input]);
    const group = groups.get(key) ?? { ids: [] as string[], amount: money(0), account: doc.glAccountCode, sourceId: doc.sourceDocId, sourceType: doc.sourceDocType, input };
    group.ids.push(doc.id); group.amount = group.amount.plus(doc.taxAmount.toString()); groups.set(key, group);
  }
  for (const group of groups.values()) {
    let actual = money(0);
    for (const journal of journals.filter(j => j.sourceDocId === group.sourceId && j.sourceDocType === group.sourceType)) {
      for (const line of journal.lines.filter(l => l.account.code === group.account)) {
        actual = actual.plus(group.input ? money(line.debit.toString()).minus(line.credit.toString()) : money(line.credit.toString()).minus(line.debit.toString()));
      }
    }
    if (!actual.eq(group.amount)) exceptions.push({ documentId: group.ids.join(","), code: "GL_DIFFERENCE", expected: group.amount.toFixed(2), actual: actual.toFixed(2) });
  }
  return { period, documents: docs.length, taxTotal: docs.reduce((sum, d) => sum.plus(d.taxAmount.toString()), money(0)).toFixed(2), exceptions,
    coverage: "Sales invoices, supplier bills, tax documents and source-linked posted GL; payroll completeness and unmatched GL account balances require review" };
}

export async function closeTaxPeriod(companyId: string, period: string, actorId: string, overrideReason?: string) {
  period = normalizeTaxPeriod(period);
  return prisma.$transaction(async tx => {
    const reconciliation = await reconcileTaxPeriod(companyId, period, tx);
    if (reconciliation.exceptions.length && !overrideReason?.trim()) throw validationError("Unresolved tax reconciliation exception");
    const row = await tx.taxPeriod.upsert({ where: { companyId_period: { companyId, period } }, create: { companyId, period, status: "OPEN", revision: 0 }, update: {} });
    if (row.status !== "OPEN") throw conflict("Tax period already closed");
    const at = new Date();
    const snapshot = { ...reconciliation, overrideReason: overrideReason?.trim() ?? null, approvedById: actorId, at: at.toISOString() };
    const history = [...(Array.isArray(row.history) ? row.history : []), { action: "CLOSE", actorId, snapshot }];
    const updated = await tx.taxPeriod.updateMany({ where: { id: row.id, status: "OPEN", revision: row.revision }, data: { status: "CLOSED", closedAt: at, closedById: actorId, snapshot, history } });
    if (updated.count !== 1) throw conflict("Tax period changed; retry");
    return snapshot;
  }, { isolationLevel: "Serializable" });
}

export async function reopenTaxPeriod(companyId: string, period: string, actorId: string, reason: string) {
  period = normalizeTaxPeriod(period);
  if (!reason.trim()) throw validationError("Reopen reason required");
  return prisma.$transaction(async tx => {
    const row = await tx.taxPeriod.findUnique({ where: { companyId_period: { companyId, period } } });
    if (!row || row.status !== "CLOSED") throw conflict("Tax period is not closed");
    const history = [...(Array.isArray(row.history) ? row.history : []), { action: "REOPEN", actorId, reason: reason.trim(), at: new Date().toISOString() }];
    const result = await tx.taxPeriod.updateMany({ where: { id: row.id, status: "CLOSED", revision: row.revision }, data: { status: "OPEN", revision: row.revision + 1, history } });
    if (result.count !== 1) throw conflict("Tax period changed; retry");
    return { status: "OPEN", revision: row.revision + 1 };
  }, { isolationLevel: "Serializable" });
}

/** Offline internal review adapter; no DJP endpoint/schema or submission claim. */
export async function createOfflineTaxExport(companyId: string, period: string, actorId: string) {
  period = normalizeTaxPeriod(period);
  return prisma.$transaction(async tx => {
    const row = await tx.taxPeriod.findUnique({ where: { companyId_period: { companyId, period } } });
    if (!row || row.status !== "CLOSED") throw conflict("Close tax period before export");
    const key = { companyId, period, revision: row.revision, format: "INTERNAL_JSON_V1" };
    if (await tx.taxExportBatch.findUnique({ where: { companyId_period_revision_format: key } })) throw conflict("Export already exists; reopen and amend for a new revision");
    const docs = latestDocuments(await tx.taxDocument.findMany({ where: { companyId, taxPeriod: { in: [period, `${period.slice(0,4)}-${period.slice(4)}`] }, status: { not: "VOID" } }, orderBy: [{ number: "asc" }, { version: "asc" }] }));
    const payload = JSON.stringify({ label: "OFFLINE INTERNAL REVIEW ONLY — NOT AN OFFICIAL DJP UPLOAD FORMAT", period, revision: row.revision, documents: docs });
    return tx.taxExportBatch.create({ data: { ...key, payload, checksum: createHash("sha256").update(payload).digest("hex"), status: "OFFLINE_READY", createdById: actorId } });
  }, { isolationLevel: "Serializable" });
}
