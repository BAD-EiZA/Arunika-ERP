import { closeTaxPeriod, reopenTaxPeriod, reconcileTaxPeriod, createOfflineTaxExport, importTaxExportResponse, createManagedTaxDocument, correctTaxDocument, calculateTaxRule, recordTaxPayment, saveTaxProfile, createTaxRuleVersion, correctManagedTaxDocument, exportTaxPeriod } from "@/server/services/tax";

const db = {
  taxPeriod: { findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
  taxCode: { findFirst: jest.fn(), create: jest.fn() },
  taxRegistration: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  taxPayment: { findMany: jest.fn(), create: jest.fn() },
  taxDocument: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
  journal: { findMany: jest.fn() },
  salesInvoice: { findMany: jest.fn() },
  supplierBill: { findMany: jest.fn() },
  taxExportBatch: { findUnique: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("@/lib/db", () => ({ prisma: {
  taxPeriod: { findUnique: (...a: unknown[]) => db.taxPeriod.findUnique(...a), upsert: (...a: unknown[]) => db.taxPeriod.upsert(...a), updateMany: (...a: unknown[]) => db.taxPeriod.updateMany(...a) },
  taxCode: { findFirst: (...a: unknown[]) => db.taxCode.findFirst(...a) },
  taxDocument: { findMany: (...a: unknown[]) => db.taxDocument.findMany(...a), findFirst: (...a: unknown[]) => db.taxDocument.findFirst(...a), create: (...a: unknown[]) => db.taxDocument.create(...a) },
  journal: { findMany: (...a: unknown[]) => db.journal.findMany(...a) },
  salesInvoice: { findMany: (...a: unknown[]) => db.salesInvoice.findMany(...a) },
  supplierBill: { findMany: (...a: unknown[]) => db.supplierBill.findMany(...a) },
  taxExportBatch: { findUnique: (...a: unknown[]) => db.taxExportBatch.findUnique(...a), create: (...a: unknown[]) => db.taxExportBatch.create(...a) },
  $transaction: (...a: unknown[]) => db.$transaction(...a),
} }));

const doc = (id: string, amount: string, overrides = {}) => ({ id, number: id, version: 1, replacesId: null, docType: "FAKTUR_KELUARAN", taxType: "PPN", taxAmount: amount, dpp: "100", documentDate: new Date("2026-07-02"), status: "ISSUED", glAccountCode: "2100", sourceDocType: "INVOICE", sourceDocId: "s1", ...overrides });
const journal = (amount: string) => ({ id: "j1", sourceDocId: "s1", sourceDocType: "INVOICE", lines: [{ account: { code: "2100" }, debit: "0", credit: amount }] });

beforeEach(() => {
  jest.clearAllMocks();
  db.taxDocument.findMany.mockResolvedValue([doc("d1", "11")]);
  db.journal.findMany.mockResolvedValue([journal("11")]);
  db.taxPeriod.findUnique.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
  db.taxPeriod.upsert.mockImplementation(async ({ create }: { create: object }) => ({ id: "p1", ...create }));
  db.taxPeriod.updateMany.mockResolvedValue({ count: 1 });
  db.taxPayment.findMany.mockResolvedValue([]);
  db.salesInvoice.findMany.mockResolvedValue([]);
  db.supplierBill.findMany.mockResolvedValue([]);
});

it("exposes commercial sales tax absent from tax subledger", async () => {
  db.salesInvoice.findMany.mockResolvedValue([{ id: "unrecorded", taxAmount: "11" }]);
  const result = await reconcileTaxPeriod("c", "202607");
  expect(result.exceptions).toContainEqual(expect.objectContaining({ documentId: "unrecorded", code: "SALES_VAT_DIFFERENCE" }));
});
it("legacy export excludes superseded tax documents", async () => {
  db.taxDocument.findMany.mockResolvedValue([doc("old", "9"), doc("new", "11", { version: 2, replacesId: "old" })]);
  const batch = await exportTaxPeriod("c", "202607");
  expect(batch.count).toBe(1);
  expect(batch.rows[0].number).toBe("new");
});
it("reconciles only latest document against posted, source-linked GL", async () => {
  db.taxDocument.findMany.mockResolvedValue([doc("old", "9"), doc("new", "11", { version: 2, replacesId: "old" })]);
  const result = await reconcileTaxPeriod("c", "202607");
  expect(result.documents).toBe(1);
  expect(result.exceptions).toEqual([]);
  expect(result.taxTotal).toBe("11.00");
  expect(db.journal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "c", status: "POSTED" }) }));
});

it("blocks close on unresolved GL differences and records approved override reason", async () => {
  db.journal.findMany.mockResolvedValue([journal("10")]);
  await expect(closeTaxPeriod("c", "202607", "closer")).rejects.toThrow("exception");
  expect(db.taxPeriod.updateMany).not.toHaveBeenCalled();
  await closeTaxPeriod("c", "202607", "closer", "Reviewed GL difference");
  expect(db.taxPeriod.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CLOSED", closedById: "closer", snapshot: expect.objectContaining({ overrideReason: "Reviewed GL difference" }) }) }));
});

it("requires reason to reopen and increments export revision", async () => {
  db.taxPeriod.findUnique.mockResolvedValue({ id: "p1", status: "CLOSED", revision: 0, history: [] });
  await expect(reopenTaxPeriod("c", "202607", "closer", "")).rejects.toThrow("reason");
  await reopenTaxPeriod("c", "202607", "closer", "Amendment");
  expect(db.taxPeriod.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "OPEN", revision: 1 }) }));
});

it("creates immutable offline export with checksum, never a submission claim", async () => {
  db.taxPeriod.findUnique.mockResolvedValue({ id: "p1", status: "CLOSED", revision: 0 });
  db.taxExportBatch.findUnique.mockResolvedValue(null);
  db.taxExportBatch.create.mockImplementation(async ({ data }: { data: object }) => data);
  const batch = await createOfflineTaxExport("c", "202607", "officer");
  expect(batch.status).toBe("OFFLINE_READY");
  expect(batch.checksum).toMatch(/^[0-9a-f]{64}$/);
  expect(batch.payload).toContain("d1");
  db.taxExportBatch.findUnique.mockResolvedValue(batch);
  await expect(createOfflineTaxExport("c", "202607", "officer")).rejects.toThrow("already exists");
});

it("rejects invalid corrections before reading or writing storage", async () => {
  await expect(correctTaxDocument({ companyId: "c", taxDocumentId: "old", dpp: -1, taxAmount: 1 })).rejects.toThrow("DPP/pajak");
  expect(db.taxDocument.create).not.toHaveBeenCalled();
});

it("closed period rejects a managed document", async () => {
  db.taxPeriod.findUnique.mockResolvedValue({ status: "CLOSED" });
  await expect(createManagedTaxDocument({ companyId: "c", actorId: "u", docType: "FAKTUR_KELUARAN", taxType: "PPN", dpp: "100", taxPeriod: "202607", taxCode: "VAT", documentDate: new Date("2026-07-01"), sourceDocType: "INVOICE", sourceDocId: "s1" })).rejects.toThrow("closed");
});

it("configured inclusive and recoverable rule uses decimal rounding, not hardcoded rates", () => {
  expect(calculateTaxRule("110", { rate: "10", baseMultiplier: "1", inclusive: true, recoverablePercent: "50", rounding: "HALF_UP" })).toEqual({ dpp: "100.00", taxAmount: "10.00", recoverable: "5.00" });
});

it("payment rejects mismatched allocation before persistence", async () => {
  await expect(recordTaxPayment({ companyId: "c", actorId: "u", period: "202607", amount: "10", billingReference: "b", bankReference: "bank", paymentDate: new Date(), bankAccountCode: "1000", allocations: [{ documentId: "d1", amount: "11" }] })).rejects.toThrow("allocation");
});
it("rejects cumulative settlement over-allocation", async () => {
  db.taxPayment.findMany.mockResolvedValue([{ allocations: [{ documentId: "d1", amount: "8" }] }]);
  await expect(recordTaxPayment({ companyId: "c", actorId: "u", period: "202607", amount: "5", billingReference: "b", bankReference: "bank", paymentDate: new Date(), bankAccountCode: "1000", allocations: [{ documentId: "d1", amount: "5" }] })).rejects.toThrow("overallocated");
});
it("profile requires effective date and rule requires legal reference", async () => {
  await expect(saveTaxProfile({ companyId: "c", actorId: "u", npwp: "1", effectiveFrom: new Date("invalid") })).rejects.toThrow("effective");
  await expect(createTaxRuleVersion({ companyId: "c", code: "VAT", name: "VAT", taxType: "PPN", direction: "OUTPUT", rate: "10", effectiveFrom: new Date(), legalReference: "" })).rejects.toThrow("reference");
});
it("managed correction rejects closed period", async () => {
  db.taxDocument.findFirst.mockResolvedValue(doc("old", "11", { taxPeriod: "202607" }));
  db.taxPeriod.findUnique.mockResolvedValue({ status: "CLOSED" });
  await expect(correctManagedTaxDocument({ companyId: "c", actorId: "u", taxDocumentId: "old", dpp: "100", taxAmount: "9", reason: "fix" })).rejects.toThrow("closed");
});

it("requires evidence for manually imported response, never accepts a submit action", async () => {
  await expect(importTaxExportResponse("c", "b1", "u", { status: "REPORTED_ACCEPTED", reference: "", evidence: "" })).rejects.toThrow("evidence");
  await expect(importTaxExportResponse("c", "b1", "u", { status: "SUBMITTED", reference: "ref", evidence: "text" })).rejects.toThrow("status");
});
