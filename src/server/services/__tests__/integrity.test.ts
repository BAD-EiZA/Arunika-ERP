import { recordAttendance, createLeaveRequest } from "../hr";
import { preparePayrollRun, approvePayrollRun, postPayrollRun } from "../payroll";
import { addProjectExpense, submitTimesheet, approveTimesheet, createProject } from "../projects";
import { createBom, createRouting, createProductionOrder, completeProductionOrder, reportProductionLabor, closeProductionOrder } from "../manufacturing";

const db = {
  employee: { findFirst: jest.fn(), findMany: jest.fn() }, attendanceRecord: { upsert: jest.fn() }, leaveRequest: { create: jest.fn() },
  billOfMaterials: { findFirst: jest.fn() }, warehouse: { findFirst: jest.fn() }, product: { findMany: jest.fn(), findFirst: jest.fn() }, workCenter: { findMany: jest.fn() },
  projectExpense: { create: jest.fn() }, customer: { findFirst: jest.fn() }, project: { update: jest.fn(), create: jest.fn(), findFirst: jest.fn() }, projectTask: { findFirst: jest.fn(), update: jest.fn() },
  timesheet: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  payrollRun: { findFirst: jest.fn(), update: jest.fn() }, productionOrder: { findFirst: jest.fn(), update: jest.fn() },
  productionCostEntry: { aggregate: jest.fn(), create: jest.fn() }, productionStep: { update: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/server/services/inventory", () => ({ postStockMovement: jest.fn() }));
jest.mock("@/server/services/accounting", () => ({ postFromRule: jest.fn() }));

beforeEach(() => jest.clearAllMocks());
it("partial completion allocates only proportional WIP, requires materials", async () => {
  db.productionOrder.findFirst.mockResolvedValue({id:"o",status:"IN_PROGRESS",plannedQty:"10",completedQty:"0",laborCost:"0",overheadCost:"0",materials:[{plannedQty:"20",issuedQty:"0",totalCost:"100"}],company:{allowNegativeStock:false}});
  db.productionCostEntry.aggregate.mockResolvedValue({_sum:{amount:null}});
  await expect(completeProductionOrder({companyId:"c",userId:"u",productionOrderId:"o",warehouseId:"w",quantity:5})).rejects.toThrow(/material/i);
});
it("attendance rejects another tenant's employee before upsert", async () => {
  db.employee.findFirst.mockResolvedValue(null);
  await expect(recordAttendance({companyId:"c",employeeId:"foreign",workDate:new Date()})).rejects.toThrow();
  expect(db.attendanceRecord.upsert).not.toHaveBeenCalled();
});
it("leave rejects foreign employee", async () => {
  db.employee.findFirst.mockResolvedValue(null);
  await expect(createLeaveRequest({companyId:"c",employeeId:"foreign",leaveType:"X",startDate:new Date(),endDate:new Date(),days:1})).rejects.toThrow();
  expect(db.leaveRequest.create).not.toHaveBeenCalled();
});
it("payroll preparation fails closed without effective tax and BPJS policy", async () => {
  await expect(preparePayrollRun({companyId:"c",userId:"u",periodStart:new Date(),periodEnd:new Date()})).rejects.toThrow(/konfigurasi|configuration/i);
  expect(db.employee.findMany).not.toHaveBeenCalled();
});
it("payroll rejects self-approval and missing approved run", async () => {
  db.payrollRun.findFirst.mockResolvedValue({id:"p",status:"DRAFT",createdById:"u"});
  await expect(approvePayrollRun("c","p","u")).rejects.toThrow(/maker-checker/i);
  db.payrollRun.findFirst.mockResolvedValue(null);
  await expect(postPayrollRun({companyId:"c",userId:"u",id:"p"})).rejects.toThrow(/APPROVED/i);
  expect(db.payrollRun.update).not.toHaveBeenCalled();
});
it("timesheet requires tenant project before insert", async () => {
  db.project.findFirst.mockResolvedValue(null);
  await expect(submitTimesheet({companyId:"c",projectId:"foreign",hours:2,workDate:new Date()})).rejects.toThrow();
  expect(db.timesheet.create).not.toHaveBeenCalled();
});
it("project customer must belong to tenant", async () => {
  db.customer.findFirst.mockResolvedValue(null);
  await expect(createProject({companyId:"c",code:"P",name:"P",customerId:"foreign"})).rejects.toThrow();
  expect(db.project.create).not.toHaveBeenCalled();
});
it("pending timesheet does not increase task hours; approval increments atomically", async () => {
  db.project.findFirst.mockResolvedValue({id:"p",status:"OPEN"});
  db.projectTask.findFirst.mockResolvedValue({id:"t"});
  db.timesheet.create.mockResolvedValue({id:"ts"});
  await submitTimesheet({companyId:"c",projectId:"p",taskId:"t",hours:2,workDate:new Date()});
  expect(db.projectTask.update).not.toHaveBeenCalled();
  db.timesheet.findFirst.mockResolvedValue({id:"ts",taskId:"t",hours:"2",status:"PENDING_APPROVAL"});
  db.timesheet.updateMany.mockResolvedValue({count:1});
  await approveTimesheet("ts","c");
  expect(db.projectTask.update).toHaveBeenCalledWith(expect.objectContaining({data:{actualHours:{increment:expect.anything()}}}));
});
it("approval rejects a historical timesheet linked to another project's task", async () => {
  db.timesheet.findFirst.mockResolvedValue({id:"ts",projectId:"p",taskId:"foreign",hours:"2",status:"PENDING_APPROVAL"});
  db.projectTask.findFirst.mockResolvedValue(null);
  await expect(approveTimesheet("ts","c")).rejects.toThrow(/Task/);
});
it("closed production rejects labor", async () => {
  db.productionOrder.findFirst.mockResolvedValue({id:"o",status:"CLOSED",steps:[{id:"s"}]});
  await expect(reportProductionLabor({companyId:"c",productionOrderId:"o",stepId:"s",minutes:5})).rejects.toThrow();
  expect(db.productionStep.update).not.toHaveBeenCalled();
});
it("in-progress production cannot close with unfinished quantity", async () => {
  db.productionOrder.findFirst.mockResolvedValue({id:"o",status:"IN_PROGRESS",plannedQty:"10",completedQty:"2"});
  await expect(closeProductionOrder("c","u","o")).rejects.toThrow();
  expect(db.productionOrder.update).not.toHaveBeenCalled();
});
it("completed status cannot hide unfinished materials or quantity", async () => {
  db.productionOrder.findFirst.mockResolvedValue({id:"o",status:"COMPLETED",plannedQty:"10",completedQty:"9",totalCost:"0",materials:[{plannedQty:"20",issuedQty:"10"}]});
  db.productionCostEntry.aggregate.mockResolvedValue({_sum:{amount:"0"}});
  await expect(closeProductionOrder("c","u","o")).rejects.toThrow(/material|kuantitas/i);
});
it("completed production cannot close with residual WIP", async () => {
  db.productionOrder.findFirst.mockResolvedValue({id:"o",status:"COMPLETED",plannedQty:"10",completedQty:"10",totalCost:"100",materials:[]});
  db.productionCostEntry.aggregate.mockResolvedValue({_sum:{amount:"90"}});
  await expect(closeProductionOrder("c","u","o")).rejects.toThrow(/WIP/);
});
it("partial receipts consume WIP exactly once", async () => {
  const order = {id:"o",status:"IN_PROGRESS",finishedProductId:"fg",plannedQty:"10",completedQty:"0",laborCost:"0",overheadCost:"0",materials:[{plannedQty:"20",issuedQty:"20",totalCost:"100"}],company:{allowNegativeStock:false}};
  db.productionOrder.findFirst.mockResolvedValue(order);
  db.productionCostEntry.aggregate.mockResolvedValue({_sum:{amount:null}});
  await completeProductionOrder({companyId:"c",userId:"u",productionOrderId:"o",warehouseId:"w",quantity:5});
  expect(db.productionCostEntry.create).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({amount:"50.00"})}));
  db.productionOrder.findFirst.mockResolvedValue({...order,completedQty:"5"});
  db.productionCostEntry.aggregate.mockResolvedValue({_sum:{amount:"50"}});
  await completeProductionOrder({companyId:"c",userId:"u",productionOrderId:"o",warehouseId:"w",quantity:5});
  expect(db.productionCostEntry.create).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({amount:"50.00"})}));
});
it("project expense rejects nonpositive amount and closed project", async () => {
  db.project.findFirst.mockResolvedValue({id:"p",status:"OPEN",actualCost:"0"});
  await expect(addProjectExpense({companyId:"c",projectId:"p",description:"x",amount:0})).rejects.toThrow();
  db.project.findFirst.mockResolvedValue({id:"p",status:"CLOSED",actualCost:"0"});
  await expect(addProjectExpense({companyId:"c",projectId:"p",description:"x",amount:5})).rejects.toThrow();
  expect(db.projectExpense.create).not.toHaveBeenCalled();
});
it("routing and finished product must belong to tenant", async () => {
  db.product.findMany.mockResolvedValue([]);
  db.product.findFirst.mockResolvedValue({id:"fg",companyId:"c"});
  db.billOfMaterials.findFirst.mockResolvedValue(null);
  db.workCenter.findMany.mockResolvedValue([]);
  await expect(createBom({companyId:"c",code:"B",name:"B",finishedProductId:"fg",items:[{productId:"rm",quantity:1}]})).rejects.toThrow(/produk/i);
  db.product.findFirst.mockResolvedValue(null);
  await expect(createRouting({companyId:"c",code:"R",name:"R",steps:[{workCenterId:"wc",sequence:1,name:"S"}]})).rejects.toThrow(/work center/i);
  db.workCenter.findMany.mockResolvedValue([{id:"wc"}]);
  db.billOfMaterials.findFirst.mockResolvedValue({id:"b",quantity:"1",items:[{productId:"rm",quantity:"2",scrapPct:"0",product:{purchasePrice:"5"}}]});
  await expect(createProductionOrder({companyId:"c",userId:"u",finishedProductId:"fg",bomId:"b",plannedQty:5})).rejects.toThrow(/tidak ditemukan/);
});
