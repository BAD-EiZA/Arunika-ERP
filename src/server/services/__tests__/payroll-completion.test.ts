const db = {
  payrollPolicy: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  payrollRun: { findFirst: jest.fn(), create: jest.fn() },
  employee: { findMany: jest.fn(), findFirst: jest.fn() },
  employeePayrollProfile: { findMany: jest.fn(), create: jest.fn() },
  payrollLine: { findMany: jest.fn(), findFirst: jest.fn() },
  hrPayrollSource: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  leaveLedger: { findMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
};
jest.mock("@/lib/db", () => ({ prisma: db }));
jest.mock("@/server/services/accounting", () => ({ postJournal: jest.fn() }));
jest.mock("@/lib/auth",()=>({requirePermission:jest.fn(),assertRequestAccess:jest.fn()}));
import { calculateBpjs, calculatePph21, createPayrollPolicy, defaultPolicyConfig, preparePayrollRun } from "../payroll";

import { createHrPayrollSource, approveHrPayrollSource, getLeaveBalance } from "../hr";

it("creates reasoned sources and prohibits self approval", async () => {
  db.employee.findFirst.mockResolvedValue({id:"e"});
  await createHrPayrollSource({companyId:"c",userId:"maker",employeeId:"e",kind:"OVERTIME",workDate:new Date("2027-01-04"),payload:{hours:"2",attendanceId:"a",category:"WORKDAY",reason:"Shift extension"}});
  expect(db.hrPayrollSource.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"PENDING_APPROVAL",createdById:"maker"})}));
  db.hrPayrollSource.findFirst.mockResolvedValue({id:"s",createdById:"maker",status:"PENDING_APPROVAL"});
  await expect(approveHrPayrollSource({companyId:"c",userId:"maker",id:"s"})).rejects.toThrow(/Maker-checker/);
});
it("computes leave balance from dated ledger entries", async () => {
  db.leaveLedger.findMany.mockResolvedValue([{days:"12"},{days:"-0.5"}]);
  expect(await getLeaveBalance({companyId:"c",employeeId:"e",leaveType:"ANNUAL",asOf:new Date("2027-01-31")})).toBe("11.50");
});
it("prorates resident contract join month with explicit calendar days policy", async () => {
  jest.resetAllMocks(); db.$transaction.mockImplementation(async fn => fn(db));
  db.payrollRun.findFirst.mockResolvedValue(null);
  db.payrollPolicy.findFirst.mockResolvedValue({id:"p",config:{...config(),employmentTypes:["PERMANENT","CONTRACT"],proration:"CALENDAR_DAYS",residentPartialYear:true}});
  db.employee.findMany.mockResolvedValue([{id:"e",isActive:true,joinDate:new Date("2027-01-16"),endDate:null,baseSalary:"3100000"}]);
  db.employeePayrollProfile.findMany.mockResolvedValue([{id:"profile",employmentType:"CONTRACT",taxStatus:"TK/0",jkkRiskClass:"SEDANG",fixedAllowance:"0",overtimeRate:"0"}]);
  db.hrPayrollSource.findMany.mockResolvedValue([]); db.payrollLine.findMany.mockResolvedValue([]);
  db.payrollRun.create.mockImplementation(({data})=>({...data,id:"run"}));
  await preparePayrollRun({companyId:"c",userId:"maker",periodStart:new Date("2027-01-01"),periodEnd:new Date("2027-01-31")});
  const line=db.payrollRun.create.mock.calls[0][0].data.lines.create[0];
  expect(line.baseSalary.toString()).toBe("1600000");
  expect(line.detail.proration.days).toBe(16);
});
it("consumes approved overtime source with attendance reference and pins source snapshot", async () => {
  jest.resetAllMocks(); db.$transaction.mockImplementation(async fn=>fn(db));
  db.payrollRun.findFirst.mockResolvedValue(null); db.payrollPolicy.findFirst.mockResolvedValue({id:"p",config:config()});
  db.employee.findMany.mockResolvedValue([{id:"e",isActive:true,joinDate:new Date("2020-01-01"),endDate:null,baseSalary:"10000000"}]);
  db.employeePayrollProfile.findMany.mockResolvedValue([{id:"pr",employmentType:"PERMANENT",taxStatus:"TK/0",jkkRiskClass:"SEDANG",fixedAllowance:"0",overtimeRate:"50000"}]);
  db.hrPayrollSource.findMany.mockResolvedValue([{id:"ot",kind:"OVERTIME",status:"APPROVED",workDate:new Date("2027-01-04"),payload:{hours:"2",attendanceId:"a",category:"WORKDAY",reason:"Extension"}}, {id:"a",kind:"ATTENDANCE",status:"APPROVED",workDate:new Date("2027-01-04"),payload:{hours:"10",source:"clock",reason:"Import"}}]);
  db.payrollLine.findMany.mockResolvedValue([]); db.payrollRun.create.mockImplementation(({data})=>({...data,id:"run"}));
  await preparePayrollRun({companyId:"c",userId:"maker",periodStart:new Date("2027-01-01"),periodEnd:new Date("2027-01-31")});
  const line=db.payrollRun.create.mock.calls[0][0].data.lines.create[0];
  expect(line.overtime.toString()).toBe("100000"); expect(line.detail.sources.map((s:{id:string})=>s.id)).toContain("ot");
});
it("debits approved leave from ledger atomically and rejects insufficient balance", async () => {
  const { approveLeaveRequest } = await import("../hr");
  const leaveDb = db as typeof db & {leaveRequest:{findFirst:jest.Mock;updateMany:jest.Mock}};
  leaveDb.leaveRequest={findFirst:jest.fn().mockResolvedValue({id:"l",employeeId:"e",leaveType:"ANNUAL",days:"0.5",startDate:new Date("2027-01-04"),status:"PENDING_APPROVAL"}),updateMany:jest.fn().mockResolvedValue({count:1})};
  db.$transaction.mockImplementation(async fn=>fn(db));
  db.payrollPolicy.findFirst.mockResolvedValue({config:{leave:{ANNUAL:{allowNegative:false}}}});
  db.leaveLedger.findMany.mockResolvedValue([{days:"0.25"}]);
  await expect(approveLeaveRequest("c","l","checker")).rejects.toThrow(/saldo/i);
  db.leaveLedger.findMany.mockResolvedValue([{days:"1"}]);
  await approveLeaveRequest("c","l","checker");
  expect(db.leaveLedger.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({days:"-0.5",sourceKey:"leave:l"})}));
});
it("permits resident CONTRACT profile only with effective approved employment policy", async () => {
  const {createPayrollProfile}=await import("../payroll");
  db.employee.findFirst.mockResolvedValue({id:"e"});
  db.payrollPolicy.findFirst.mockResolvedValue({config:{...config(),employmentTypes:["PERMANENT","CONTRACT"]}});
  await createPayrollProfile({companyId:"c",userId:"maker",employeeId:"e",effectiveFrom:new Date("2027-01-01"),employmentType:"CONTRACT",taxStatus:"TK/0",jkkRiskClass:"SEDANG"});
  expect(db.employeePayrollProfile.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({employmentType:"CONTRACT"})}));
});
it("accrues configured monthly entitlement with stable ledger key", async () => {
  const {accrueLeave}=await import("../hr");
  db.payrollPolicy.findFirst.mockResolvedValue({id:"p",config:{validThrough:"2027-12-31",leave:{ANNUAL:{monthlyAccrual:"1",allowNegative:false}}}});
  db.employee.findFirst.mockResolvedValue({id:"e",joinDate:new Date("2026-01-01"),endDate:null});
  db.leaveLedger.findMany.mockResolvedValue([]);
  await accrueLeave({companyId:"c",userId:"checker",employeeId:"e",leaveType:"ANNUAL",month:new Date("2027-01-01")});
  expect(db.leaveLedger.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({days:"1",sourceKey:"accrual:e:ANNUAL:2027-01"})}));
});
it("rejects source approval when overtime exceeds approved attendance", async()=>{
  db.$transaction.mockImplementation(async fn=>fn(db));
  db.hrPayrollSource.findFirst.mockResolvedValueOnce({id:"ot",employeeId:"e",kind:"OVERTIME",createdById:"maker",status:"PENDING_APPROVAL",workDate:new Date("2027-01-04"),payload:{hours:"3",attendanceId:"a",category:"WORKDAY",reason:"Extension"}}).mockResolvedValueOnce({id:"a",kind:"ATTENDANCE",payload:{hours:"2",source:"clock",reason:"Actual"}});
  db.hrPayrollSource.findMany.mockResolvedValue([]);
  await expect(approveHrPayrollSource({companyId:"c",userId:"checker",id:"ot"})).rejects.toThrow(/melebihi/i);
});
it("rejects leave dates and non half-day quantities before persistence", async()=>{
  const {createLeaveRequest}=await import("../hr");
  await expect(createLeaveRequest({companyId:"c",employeeId:"e",leaveType:"ANNUAL",startDate:new Date("bad"),endDate:new Date("2027-01-04"),days:"0.25"})).rejects.toThrow(/cuti|hari|tanggal/i);
});
it("offboards employee with reason and preserves final payroll eligibility", async()=>{
  const {endEmployment}=await import("../hr");
  const employeeDb=db.employee as typeof db.employee & {update:jest.Mock}; employeeDb.update=jest.fn();
  db.employee.findFirst.mockResolvedValue({id:"e",joinDate:new Date("2020-01-01")});
  await endEmployment({companyId:"c",employeeId:"e",endDate:new Date("2027-01-15"),reason:"Resignation"});
  expect(employeeDb.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:"e"},data:expect.objectContaining({endDate:new Date("2027-01-15"),isActive:false})}));
});
it("HR source API denies unauthorized requests before persistence",async()=>{
  const {POST}=await import("@/app/api/erp/hr/route");
  const {requirePermission}=await import("@/lib/auth"); const {forbidden}=await import("@/lib/errors");
  jest.mocked(requirePermission).mockRejectedValueOnce(forbidden());
  const before=db.hrPayrollSource.create.mock.calls.length;
  const response=await POST(new Request("http://localhost/api/erp/hr",{method:"POST",body:JSON.stringify({action:"source",kind:"ATTENDANCE",employeeId:"other"})}));
  expect(response.status).toBe(403); expect(db.hrPayrollSource.create).toHaveBeenCalledTimes(before);
});
it("blocks a mid-month policy change instead of silently using stale rules",async()=>{
  jest.resetAllMocks();db.$transaction.mockImplementation(async fn=>fn(db));db.payrollRun.findFirst.mockResolvedValue(null);
  db.payrollPolicy.findFirst.mockResolvedValueOnce({id:"p",config:config(),effectiveFrom:new Date("2027-01-01")}).mockResolvedValueOnce({id:"p2",effectiveFrom:new Date("2027-01-15"),config:config()});
  await expect(preparePayrollRun({companyId:"c",userId:"maker",periodStart:new Date("2027-01-01"),periodEnd:new Date("2027-01-31")})).rejects.toThrow(/milieu|tengah|efektif/i);
  expect(db.payrollRun.create).not.toHaveBeenCalled();
});
const date = (s: string) => new Date(s);
const config = () => ({ ...defaultPolicyConfig(), validThrough: "2028-12-31", sources: [{ url: "https://www.bpjsketenagakerjaan.go.id/penerima-upah.html", checkedAt: "2026-11-10" }], bpjs: { ...defaultPolicyConfig().bpjs, JP: { ...defaultPolicyConfig().bpjs.JP, ceilings: [{ from: "2027-01-01", cap: "10000000" }] } } });

it("allows only an explicitly bounded, sourced post-2026 policy", async () => {
  db.payrollPolicy.create.mockResolvedValue({ id: "p" });
  await expect(createPayrollPolicy({ companyId: "c", userId: "maker", effectiveFrom: date("2027-01-01"), config: config() })).resolves.toBeDefined();
  await expect(createPayrollPolicy({ companyId: "c", userId: "maker", effectiveFrom: date("2027-01-01"), config: { ...config(), validThrough: undefined } })).rejects.toThrow(/akhir|valid|tanggal/i);
  expect(() => calculateBpjs({ wage: "20000000", program: "JP", effective: "2028-01-01", policy: config() })).toThrow(/ceiling|konfirmasi|tanggal/i);
});

it("reconciles partial-year tax at explicit final month, without requiring January history", () => {
  const result = calculatePph21({ gross: "10000000", pension: "0", status: "TK/0", month: 7, firstMonth: 5, finalMonth: 7, prior: [{ month: 5, gross: "10000000", pension: "0", tax: "200000" }, { month: 6, gross: "10000000", pension: "0", tax: "200000" }] });
  expect(result.annualTax).toBeDefined();
  expect(() => calculatePph21({ gross: "10000000", pension: "0", status: "TK/0", month: 7, firstMonth: 5, finalMonth: 7, prior: [] })).toThrow(/lengkap/i);
});

it("rejects manual overtime without approved attendance-backed source", async () => {
  jest.resetAllMocks(); db.$transaction.mockImplementation(async fn => fn(db));
  db.hrPayrollSource.findMany.mockResolvedValue([]);
  db.payrollRun.findFirst.mockResolvedValue(null);
  db.payrollPolicy.findFirst.mockResolvedValue({ id: "p", config: config() });
  db.employee.findMany.mockResolvedValue([{ id: "e", isActive: true, joinDate: date("2020-01-01"), endDate: null, baseSalary: "10000000" }]);
  db.employeePayrollProfile.findMany.mockResolvedValue([{ id: "profile", employmentType: "PERMANENT", taxStatus: "TK/0", jkkRiskClass: "SEDANG", fixedAllowance: "0", overtimeRate: "50000" }]);
  await expect(preparePayrollRun({ companyId: "c", userId: "maker", periodStart: date("2027-01-01"), periodEnd: date("2027-01-31"), components: [{ employeeId: "e", overtimeHours: "2" }] })).rejects.toThrow(/lembur|sumber|approved/i);
  expect(db.payrollRun.create).not.toHaveBeenCalled();
});
