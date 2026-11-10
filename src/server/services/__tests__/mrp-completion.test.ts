import { runMrp } from "@/server/services/mrp";
import { convertMrpSuggestion, reviewMrpSuggestion } from "@/server/services/mrp-convert";
const db = {
  stockBalance: { findMany: jest.fn() }, salesOrderItem: { findMany: jest.fn() },
  purchaseOrderItem: { findMany: jest.fn() }, productionOrder: { findMany: jest.fn() },
  billOfMaterials: { findMany: jest.fn() }, stockReservation: { findMany: jest.fn() },
  mrpRun: { create: jest.fn() }, mrpSuggestion: { findFirst: jest.fn(), updateMany: jest.fn() }, $queryRaw: jest.fn(), $transaction: jest.fn(),
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "MRP/1") }));
const day = (n: number) => new Date(`2026-01-${String(n).padStart(2,"0")}T00:00:00Z`);
const planning = { calendar: { workingDays: [1,2,3,4,5], holidays: ["2026-01-09"] }, products: [{ productId: "a", leadTimeDays: 2, lotSize: "4", safetyStock: "2" }] };
const run = (config: unknown = planning) => runMrp({ companyId: "c", userId: "u", planning: config } as Parameters<typeof runMrp>[0]);
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(day(1));
  for (const table of [db.stockBalance,db.salesOrderItem,db.purchaseOrderItem,db.productionOrder,db.billOfMaterials,db.stockReservation]) table.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([{ locked: true }]);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.mrpRun.create.mockImplementation(async ({data}) => ({id:"r", ...data, lines:data.lines.create}));
});
afterEach(() => jest.useRealTimers());
it("blocks company overlap before planning reads", async () => {
  db.$queryRaw.mockResolvedValue([{locked:false}]);
  await expect(run()).rejects.toMatchObject({status:409});
  expect(db.stockBalance.findMany).not.toHaveBeenCalled();
});
it("net reservations exclude represented SO demand only once", async () => {
  const config = {...planning,products:[{productId:"a",leadTimeDays:0,lotSize:"1",safetyStock:"0"}]};
  db.stockBalance.findMany.mockResolvedValue([{productId:"a",quantityOnHand:10}]);
  db.salesOrderItem.findMany.mockResolvedValue([{productId:"a",salesOrderId:"so",quantity:5,quantityDelivered:0,salesOrder:{deliveryDate:day(5)}}]);
  db.stockReservation.findMany.mockResolvedValue([{productId:"a",salesOrderId:"so",quantity:7},{productId:"a",salesOrderId:null,quantity:6}]);
  expect((await run(config)).lines).toEqual([expect.objectContaining({quantity:"3.0000"})]);
});
it("reschedules identified full receipt instead of duplicate purchase", async () => {
  db.salesOrderItem.findMany.mockResolvedValue([{productId:"a",quantity:5,quantityDelivered:0,salesOrder:{deliveryDate:day(5)}}]);
  db.purchaseOrderItem.findMany.mockResolvedValue([{id:"pi",productId:"a",quantity:10,quantityReceived:0,purchaseOrder:{expectedDate:day(12)}}]);
  expect((await run()).lines).toEqual([expect.objectContaining({suggestionType:"RESCHEDULE",sourceRef:"PO:pi",quantity:"10.0000",dueDate:day(5)})]);
});
it("cancels only whole unused receipt; retains partial excess", async () => {
  db.salesOrderItem.findMany.mockResolvedValue([{productId:"a",quantity:5,quantityDelivered:0,salesOrder:{deliveryDate:day(12)}}]);
  db.purchaseOrderItem.findMany.mockResolvedValue([{id:"pi",productId:"a",quantity:10,quantityReceived:0,purchaseOrder:{expectedDate:day(5)}},{id:"unused",productId:"a",quantity:8,quantityReceived:0,purchaseOrder:{expectedDate:day(12)}}]);
  expect((await run()).lines).toEqual([expect.objectContaining({suggestionType:"CANCEL",sourceRef:"PO:unused",quantity:"8.0000"})]);
});
it("requires accepted review before conversion", async () => {
  db.mrpSuggestion.findFirst.mockResolvedValue({id:"s",decision:"PENDING",isConverted:false,suggestionType:"PURCHASE"});
  await expect(convertMrpSuggestion({companyId:"c",userId:"u",suggestionId:"s"})).rejects.toMatchObject({status:409});
});
it("requires explicit planning before storage access", async () => {
  await expect(run(null)).rejects.toThrow();
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("snapshots explicit lot/safety/calendar and offsets working-day release", async () => {
  db.salesOrderItem.findMany.mockResolvedValue([{productId:"a",quantity:5,quantityDelivered:0,salesOrderId:"so",salesOrder:{deliveryDate:day(12)}}]);
  const result = await run();
  expect(result).toEqual(expect.objectContaining({parameters: expect.objectContaining({planning}), lines: expect.arrayContaining([expect.objectContaining({quantity:"8.0000", dueDate:day(12), releaseDate:day(7)})])}));
});
it("reviews pending suggestion with conditional decision and audit", async () => {
  db.mrpSuggestion.findFirst.mockResolvedValue({id:"s",suggestionType:"PURCHASE",decision:"PENDING",isConverted:false});
  db.mrpSuggestion.updateMany.mockResolvedValue({count:1});
  await reviewMrpSuggestion({companyId:"c",userId:"u",suggestionId:"s",action:"modify",quantity:"3",dueDate:"2026-01-08"});
  expect(db.mrpSuggestion.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({decision:"PENDING",isConverted:false}),data:expect.objectContaining({decision:"MODIFIED",reviewedById:"u",quantity:"3.0000",dueDate:day(8)})}));
});
it("rejects concurrent review claim", async () => {
  db.mrpSuggestion.findFirst.mockResolvedValue({id:"s",suggestionType:"PURCHASE",decision:"PENDING",isConverted:false});
  db.mrpSuggestion.updateMany.mockResolvedValue({count:0});
  await expect(reviewMrpSuggestion({companyId:"c",userId:"u",suggestionId:"s",action:"accept"})).rejects.toMatchObject({status:409});
});
