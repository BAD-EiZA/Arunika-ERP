import { createPurchaseOrder, postSupplierPayment, reviewThreeWayMatch, awardRfq } from "../procurement";
const db = { $transaction: jest.fn(), goodsReceipt: { findFirst: jest.fn() }, supplierBill: { findFirst: jest.fn() }, threeWayMatch: { create: jest.fn(async ({data}: { data: { isMatched: boolean } }) => data) } };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "DOC/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
jest.mock("../notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
it("rejects offsetting product variances despite equal invoice totals", async () => {
 const items = [{productId:"a",quantityReceived:"1",unitCost:"10"},{productId:"b",quantityReceived:"2",unitCost:"10"}];
 db.goodsReceipt.findFirst.mockResolvedValue({id:"gr",purchaseOrderId:"po",supplierId:"s",status:"POSTED",items,purchaseOrder:{id:"po",supplierId:"s",status:"RECEIVED",items:[{productId:"a",quantity:"1",unitPrice:"10"},{productId:"b",quantity:"2",unitPrice:"10"}]}});
 db.supplierBill.findFirst.mockResolvedValue({id:"bill",purchaseOrderId:"po",supplierId:"s",status:"OPEN",subtotal:"30",items:[{productId:"a",quantity:"2",unitPrice:"10"},{productId:"b",quantity:"1",unitPrice:"10"}]});
 const result = await reviewThreeWayMatch({companyId:"c",userId:"u",goodsReceiptId:"gr",supplierBillId:"bill"});
 expect(result.isMatched).toBe(false);
});
it("blocks supplier payment without approved three-way match", async () => {
 db.$transaction.mockImplementationOnce((fn: (tx: Record<string, unknown>) => Promise<unknown>)=>fn({supplierPayment:{create:jest.fn(async()=>({id:"sp",number:"SP"}))},supplierBill:{findFirst:jest.fn(async()=>({id:"bill",supplierId:"s",status:"OPEN",purchaseOrderId:"po",balance:"100",total:"100",amountPaid:"0",matches:[]})),update:jest.fn()},threeWayMatch:{findFirst:jest.fn(async()=>null)}}));
 await expect(postSupplierPayment({companyId:"c",userId:"u",supplierId:"s",amount:10,allocations:[{billId:"bill",amount:10}]})).rejects.toThrow("Three-way match belum disetujui");
});
it("blocks re-awarding a closed RFQ", async()=>{
 db.$transaction.mockImplementationOnce((fn: (tx: Record<string, unknown>) => Promise<unknown>)=>fn({requestForQuotation:{findFirst:jest.fn(async()=>({id:"r",status:"CLOSED"}))}}));
 await expect(awardRfq({companyId:"c",userId:"u",rfqId:"r",quotationId:"q"})).rejects.toThrow("RFQ sudah ditutup");
});
it("rejects duplicate PO products", async () => {
 await expect(createPurchaseOrder({companyId:"c",userId:"u",supplierId:"s",items:[{productId:"p",quantity:1,unitPrice:1},{productId:"p",quantity:1,unitPrice:1}]})).rejects.toThrow("Produk duplikat");
});
