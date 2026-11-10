import { disposeSalesReturn, releaseSalesReturn, refundSalesReturn, approveReturnSettlement, replaceSalesReturn, createClaim, advanceClaim } from "../returns";
import { postStockMovement } from "../inventory";
import { postJournal } from "../accounting";
import { assertApprovalRole } from "../approvals";
const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "DO-2") }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(), assertWarehouseOwnership: jest.fn(async (_tx, i) => ({ id: i.warehouseId, type: i.warehouseId === "q" ? "RETURN" : "MAIN", branchId: "b" })) }));
jest.mock("../approvals", () => ({ assertApprovalRole: jest.fn() }));
jest.mock("../accounting", () => ({ postJournal: jest.fn() }));
const doc = { id: "r", number: "R1", companyId: "c", customerId: "cu", warehouseId: "q", status: "POSTED", approvedById: "manager", inspectedAt: new Date(), disposition: "QUARANTINE", salesInvoiceId: "inv", settlementStatus: "APPROVED", settlementApprovedById: "manager", settlementApprovedAt: new Date(), refundAmount: "100", items: [{ id: "i", productId: "p", quantity: "2", historicalUnitCost: "10" }] };
const args = { companyId: "c", userId: "u", id: "r" };
function mockTx(overrides: Record<string, unknown> = {}) {
 const tx = { $executeRaw: jest.fn(), salesReturn: { findFirst: jest.fn(async () => ({ ...doc })), update: jest.fn(async ({ data }: { data: unknown }) => ({ ...doc, ...data })) }, warehouse: { findFirst: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, type: where.id === "q" ? "RETURN" : "MAIN", branchId: "b", companyId: "c" })) }, stockBalance: { updateMany: jest.fn(async () => ({ count: 1 })) }, account: { findFirst: jest.fn(async () => ({ code: "5201" })) }, creditNote: { findFirst: jest.fn(async () => ({ id: "cn", total: "100", status: "ISSUED" })) }, bankAccount: { findFirst: jest.fn(async () => ({ glAccountId: "bank-gl" })) }, accountLookup: {}, ...overrides };
 db.$transaction.mockImplementationOnce((fn: (tx: unknown) => unknown) => fn(tx));
 return tx;
}
beforeEach(() => { jest.clearAllMocks(); });
it.each([
 ["release", { releasedAt: new Date(), disposition: "RELEASE_TO_STOCK" }],
 ["disposal", { disposedAt: new Date() }],
])("%s retry never creates a second movement or journal", async (action, data) => {
 mockTx({ salesReturn: { findFirst: jest.fn(async () => ({ ...doc, ...data })) } });
 if (action === "release") await releaseSalesReturn({ ...args, targetWarehouseId: "main", inspectionNotes: "OK" });
 if (action === "disposal") await disposeSalesReturn(args);
 expect(postStockMovement).not.toHaveBeenCalled(); expect(postJournal).not.toHaveBeenCalled();
});
it("refund rejects a settlement that has not been approved", async () => {
 mockTx({ salesReturn: { findFirst: jest.fn(async () => ({ ...doc, settlementStatus: "DRAFT" })) } });
 await expect(refundSalesReturn({ ...args, bankAccountId: "bank", amount: "100" })).rejects.toThrow("settlement APPROVED");
});
it("settlement approval stores the approved amount without paying", async () => {
 const tx = mockTx({ salesReturn: { findFirst: jest.fn(async () => ({ ...doc, settlementStatus: "DRAFT" })), update: jest.fn(async () => ({})) } });
 await approveReturnSettlement({ ...args, amount: "80" });
 expect(tx.salesReturn.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ settlementStatus: "APPROVED", refundAmount: "80.00" }) }));
 expect(postJournal).not.toHaveBeenCalled();
});
it("claim creation persists owner SLA evidence and starts DRAFT", async () => {
 const tx = mockTx({ fileAsset: { findFirst: jest.fn(async () => ({ id: "f" })) }, membership: { findFirst: jest.fn(async () => ({ id: "m" })) }, claim: { create: jest.fn(async () => ({})) } });
 await createClaim({ companyId: "c", claimType: "CUSTOMER", amount: 10, ownerId: "u", dueAt: new Date(), evidenceFileId: "f" });
 expect(tx.claim.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT", ownerId: "u", evidenceFileId: "f" }) }));
});
it("claim cannot skip DRAFT directly to RESOLVED", async () => {
 mockTx({ claim: { findFirst: jest.fn(async () => ({ id: "cl", status: "DRAFT" })) } });
 await expect(advanceClaim({ companyId: "c", userId: "u", id: "cl", status: "RESOLVED", resolution: "ok" })).rejects.toThrow("Transisi");
});
it("release requires inspection decision and refuses duplicate movements", async () => {
 mockTx({ salesReturn: { findFirst: jest.fn(async () => ({ ...doc, disposition: "DISPOSED" })) } });
 await expect(releaseSalesReturn({ ...args, targetWarehouseId: "main", inspectionNotes: "Layak jual" })).rejects.toThrow();
 expect(postStockMovement).not.toHaveBeenCalled();
});
it("release transfers quarantine stock as an outbound/inbound pair once", async () => {
 const tx = mockTx();
 await releaseSalesReturn({ ...args, targetWarehouseId: "main", inspectionNotes: "Layak jual" });
 expect(postStockMovement).toHaveBeenCalledTimes(2);
 expect((postStockMovement as jest.Mock).mock.calls.map(c => c[1].type)).toEqual(["TRANSFER_OUT", "TRANSFER_IN"]);
 expect(tx.stockBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { quantityReserved: { decrement: doc.items[0].quantity } } }));
});
it("disposal fails closed without configured loss account", async () => {
 mockTx({ account: { findFirst: jest.fn(async () => null) } });
 await expect(disposeSalesReturn({ ...args, approvedById: "manager" })).rejects.toThrow();
 expect(postStockMovement).not.toHaveBeenCalled();
});
it("disposal cannot bypass threshold approval", async () => {
 mockTx(); (assertApprovalRole as jest.Mock).mockRejectedValueOnce(new Error("Butuh approval role"));
 await expect(disposeSalesReturn(args)).rejects.toThrow("Butuh approval role");
 expect(postStockMovement).not.toHaveBeenCalled(); expect(postJournal).not.toHaveBeenCalled();
});
it("disposal posts balanced loss exactly once", async () => {
 mockTx(); await disposeSalesReturn({ ...args, approvedById: "manager" });
 expect(postStockMovement).toHaveBeenCalledTimes(1);
 expect((postJournal as jest.Mock).mock.calls[0][1].lines).toEqual([{ accountCode: "5201", debit: "20" }, { accountCode: "1130", credit: "20" }]);
});
it("refund rejects an existing replacement before posting", async () => {
 mockTx({ salesReturn: { findFirst: jest.fn(async () => ({ ...doc, replacementDeliveryId: "do" })) } });
 await expect(refundSalesReturn({ ...args, bankAccountId: "bank", amount: "100" })).rejects.toThrow("Replacement");
 expect(postJournal).not.toHaveBeenCalled();
});
it("refund rejects already issued refund", async () => {
 mockTx({ salesReturn: { findFirst: jest.fn(async () => ({ ...doc, refundedAt: new Date() })) } });
 await expect(refundSalesReturn({ ...args, bankAccountId: "bank", amount: "100" })).rejects.toThrow("Refund sudah");
 expect(postJournal).not.toHaveBeenCalled();
});
it("refund cannot exceed linked credit note", async () => {
 mockTx(); await expect(refundSalesReturn({ ...args, bankAccountId: "bank", amount: "101" })).rejects.toThrow();
 expect(postJournal).not.toHaveBeenCalled();
});
it("refund posts bank and customer credit once", async () => {
 const tx = mockTx({ salesInvoice: { findFirst: jest.fn(async () => ({ id: "inv", balance: "-100" })), update: jest.fn() } });
 await refundSalesReturn({ ...args, bankAccountId: "bank", amount: "100" });
 expect((postJournal as jest.Mock).mock.calls[0][1].lines).toEqual([{ accountCode: "1120", debit: "100" }, { accountCode: "5201", credit: "100" }]);
 expect(tx.salesInvoice.update).toHaveBeenCalled();
});
it("refund cannot pay credit already consumed by source AR", async () => {
 mockTx({ salesInvoice: { findFirst: jest.fn(async () => ({ id: "inv", balance: "0" })) } });
 await expect(refundSalesReturn({ ...args, bankAccountId: "bank", amount: "100" })).rejects.toThrow("Kredit pelanggan");
 expect(postJournal).not.toHaveBeenCalled();
});
it.each([{}, { refundedAt: new Date() }, { replacementDeliveryId: "do" }])("replacement fails closed without creating an unpostable draft (%p)", async data => {
 const tx = mockTx({ salesReturn: { findFirst: jest.fn(async () => ({ ...doc, ...data })) }, salesInvoice: { findFirst: jest.fn(async () => ({ deliveryOrder: { salesOrderId: "so" } })) }, deliveryOrder: { create: jest.fn(async () => ({ id: "do" })) } });
 await expect(replaceSalesReturn({ ...args, targetWarehouseId: "main" })).rejects.toThrow();
 expect(tx.deliveryOrder.create).not.toHaveBeenCalled();
 expect(tx.$executeRaw).toHaveBeenCalled();
});
it("claim validates evidence ownership and advances only through approval", async () => {
 mockTx({ fileAsset: { findFirst: jest.fn(async () => null) } });
 await expect(createClaim({ companyId: "c", claimType: "CUSTOMER", amount: 10, ownerId: "u", dueAt: new Date(), evidenceFileId: "foreign" })).rejects.toThrow();
 const tx = mockTx({ claim: { findFirst: jest.fn(async () => ({ id: "cl", status: "IN_PROGRESS", ownerId: "u" })), update: jest.fn(async () => ({})) } });
 await advanceClaim({ companyId: "c", userId: "manager", id: "cl", status: "RESOLVED", resolution: "Refund" });
 expect(tx.claim.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED", approvedById: "manager" }) }));
});
