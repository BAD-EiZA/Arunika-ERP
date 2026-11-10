import {createCreditNoteFromReturn,createDebitNoteFromPurchaseReturn} from "../credit-notes";
const db = {$transaction:jest.fn(),salesReturn:{findFirst:jest.fn(async()=>({id:"r",status:"POSTED",items:[]}))},purchaseReturn:{findFirst:jest.fn(async()=>({id:"r",status:"POSTED",items:[]}))}};
jest.mock("@/lib/db",()=>({get prisma(){return db;}}));
jest.mock("@/lib/document-number",()=>({nextDocumentNumber:jest.fn(async()=>"N")}));
jest.mock("../accounting",()=>({postFromRule:jest.fn()}));
it.each([["creditNote",createCreditNoteFromReturn,"salesReturnId"],["debitNote",createDebitNoteFromPurchaseReturn,"purchaseReturnId"]] as const)("%s reuses existing source note",async(model,create)=>{
 const existing={id:"existing"};
 db.$transaction.mockImplementationOnce((fn: (tx: Record<string, unknown>) => Promise<unknown>)=>fn({$executeRaw:jest.fn(),[model]:{findFirst:jest.fn(),findUnique:jest.fn(async()=>existing),create:jest.fn(async()=>({id:"new",subtotal:"0",taxAmount:"0"}))},salesReturn:db.salesReturn,purchaseReturn:db.purchaseReturn}));
 const result=await create({companyId:"c",userId:"u",salesReturnId:"r",purchaseReturnId:"r"});
 expect(result).toEqual(existing);
});
beforeEach(() => jest.clearAllMocks());
it.each([
 ["replacement", {replacementDeliveryId:"do"}, "Replacement"],
 ["refund", {refundedAt:new Date()}, "Refund sudah"],
])("credit note creation fails closed when return already settled via %s", async(_,patched,message)=>{
 db.salesReturn.findFirst.mockResolvedValueOnce({id:"r",status:"POSTED",items:[],...patched} as never);
 await expect(createCreditNoteFromReturn({companyId:"c",userId:"u",salesReturnId:"r"})).rejects.toThrow(message);
 expect(db.$transaction).not.toHaveBeenCalled();
});
