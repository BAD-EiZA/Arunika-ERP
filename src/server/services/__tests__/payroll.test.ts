const db = {
  payrollPolicy: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  payrollRun: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  employee: { findMany: jest.fn(), findFirst: jest.fn() },
  account: { findMany: jest.fn() },
  payrollLine: { findMany: jest.fn(), findFirst: jest.fn() },
  bankAccount: { findFirst: jest.fn() },
  payrollDisbursement: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  employeePayrollProfile: { findMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
};
jest.mock("@/lib/db", () => ({ prisma: db }));
jest.mock("@/server/services/accounting", () => ({ postJournal: jest.fn() }));
import { Decimal } from "decimal.js";
import { postJournal } from "@/server/services/accounting";
import * as payroll from "../payroll";

type Tax = (input: { gross: string; pension: string; status: string; month: number; prior: { gross: string; pension: string; tax: string; month: number }[] }) => { tax: string; annualTax?: string; pkp?: string };
const tax = (input: Parameters<Tax>[0]) => (payroll as unknown as { calculatePph21: Tax }).calculatePph21(input);
type Bpjs = (input: { wage: string; program: string; riskClass?: string; effective: string }) => { employer: string; employee: string };
// Synthetic, explicitly supplied fixture; not a verified regulatory ceiling.
const confirmedPolicy = () => {
  const config = payroll.defaultPolicyConfig();
  return { ...config, bpjs: { ...config.bpjs, JP: { ...config.bpjs.JP, ceilings: [{ from: "2025-01-01", cap: "11086300" }] } } };
};
const bpjs = (input: Parameters<Bpjs>[0]) => payroll.calculateBpjs({ ...input, policy: confirmedPolicy() });

it("requires explicit BPJS policy; never silently assumes an unverified JP ceiling", () => {
  expect(() => payroll.calculateBpjs({ wage: "20000000", program: "JP", effective: "2026-05-01" })).toThrow(/kebijakan|policy/i);
  expect(() => payroll.calculateBpjs({ wage: "20000000", program: "JP", effective: "2026-05-01", policy: payroll.defaultPolicyConfig() })).toThrow(/ceiling|batas|konfigurasi/i);
});

it("rejects malformed pasal17 bracket structure", () => {
  const config = confirmedPolicy();
  const cap = (overrides: unknown) => payroll.calculatePph21({ gross: "15000000", pension: "0", status: "K/0", month: 1, prior: [], policy: { ...config, pph21: { ...config.pph21, pasal17: overrides } } });
  expect(() => cap([[190000000, 0.05], [60000000, 0.15], [250000000, 0.25], [4500000000, 0.3], [null, 0.35]])).toThrow(/Pasal 17/);
  expect(() => cap([[60000000, 0.05], [190000000, 0.15], [250000000, 0.25], [4500000000, 0.3], [5000000000, 0.35]])).toThrow(/Pasal 17/);
  expect(() => cap([[60000000, 0.05], [190000000, 1.5], [250000000, 0.25], [4500000000, 0.3], [null, 0.35]])).toThrow(/Pasal 17|Tarif/);
});
it("rejects unsafe numeric rates and malformed tax brackets", () => {
  for (const rate of ["NaN", "-0.1", "Infinity", "1.1"]) {
    const config = confirmedPolicy();
    const unsafe = { ...config, bpjs: { ...config.bpjs, JHT: { ...config.bpjs.JHT, employer: rate } } };
    expect(() => payroll.calculateBpjs({ wage: "10000000", program: "JHT", effective: "2026-01-01", policy: unsafe })).toThrow();
  }
  const config = confirmedPolicy();
  expect(() => payroll.calculatePph21({ gross: "15000000", pension: "0", status: "K/0", month: 1, prior: [], policy: { ...config, pph21: { ...config.pph21, terTables: { A: [[2, 1], [0]] } } } })).toThrow();
});

it("requires a dated JP ceiling covering the calculation date", () => {
  const config = confirmedPolicy();
  config.bpjs.JP.ceilings = [{ from: "2026-03-01", cap: "11086300" }];
  expect(() => payroll.calculateBpjs({ wage: "20000000", program: "JP", effective: "2026-01-01", policy: config })).toThrow(/ceiling|batas/i);
});

// PP 58/2023 explanation Pasal 2: Tuan R; DJP TER leaflet.
it("reproduces official Tuan R Jan-Nov TER and December Pasal 17 reconciliation", () => {
  const prior: Parameters<Tax>[0]["prior"] = [];
  for (let month = 1; month <= 11; month++) {
    const result = tax({ gross: "15000000", pension: "150000", status: "K/0", month, prior });
    expect(result.tax).toBe("900000.00");
    prior.push({ month, gross: "15000000", pension: "150000", tax: result.tax });
  }
  expect(tax({ gross: "15000000", pension: "150000", status: "K/0", month: 12, prior })).toEqual(expect.objectContaining({ tax: "1155000.00", annualTax: "11055000.00", pkp: "113700000.00" }));
});
it("uses Pasal 17 30% bracket through 5 billion, then 35%, floors PKP to thousands", () => {
  const prior = Array.from({ length: 11 }, (_, i) => ({ month: i + 1, gross: "100000000", pension: "0", tax: "24000000" }));
  expect(tax({ gross: "100000000", pension: "0", status: "TK/0", month: 12, prior }).annualTax).toBe("286000000.00");
});
// SE BPJS Ketenagakerjaan B/1226/022026; PP 6/2025; Perpres 64/2020 & 59/2024; BPJS TK artikel iuran PU.
it("applies dated JP ceilings and current BPJS rates with caps", () => {
  expect(bpjs({ wage: "20000000", program: "JP", effective: "2026-05-01" })).toEqual({ employer: "221726.00", employee: "110863.00" });
  expect(bpjs({ wage: "9000000", program: "JP", effective: "2026-02-01" })).toEqual({ employer: "180000.00", employee: "90000.00" });
  expect(bpjs({ wage: "15000000", program: "JHT", effective: "2026-05-01" })).toEqual({ employer: "555000.00", employee: "300000.00" });
  expect(bpjs({ wage: "20000000", program: "KESEHATAN", effective: "2026-05-01" })).toEqual({ employer: "480000.00", employee: "120000.00" });
  expect(bpjs({ wage: "10000000", program: "JKK", riskClass: "SEDANG", effective: "2026-05-01" })).toEqual({ employer: "89000.00", employee: "0.00" });
  expect(bpjs({ wage: "10000000", program: "JKM", effective: "2026-05-01" })).toEqual({ employer: "30000.00", employee: "0.00" });
});
it("fails closed on unsupported dates, programs, and risk classes", () => {
  expect(() => bpjs({ wage: "10000000", program: "JP", effective: "2024-06-01" })).toThrow(/konfigurasi|config/i);
  expect(() => bpjs({ wage: "10000000", program: "JKP", effective: "2026-05-01" })).toThrow(/tidak didukung|unsupported|tidak ada/i);
  expect(() => bpjs({ wage: "10000000", program: "JKK", riskClass: "NUKLIR", effective: "2026-05-01" })).toThrow();
});

const iso = (d: string) => new Date(d);
const policyRow = { id: "pol", effectiveFrom: iso("2025-03-01"), config: confirmedPolicy() };
const emp = (id: string, name: string, salary: string) => ({ id, name, isActive: true, joinDate: iso("2020-01-01"), endDate: null, baseSalary: salary, code: id.toUpperCase() });
const profile = (status: string, risk = "SANGAT_RENDAH") => ({ employmentType: "PERMANENT", taxStatus: status, jkkRiskClass: risk, bpjsPrograms: null, effectiveFrom: iso("2025-01-01") });

describe("payroll run lifecycle (May 2026, Tuan R profile)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(async fn => fn(db));
    db.account.findMany.mockResolvedValue(["5200", "5300", "2105", "2106", "2101", "2107"].map(code => ({ code, type: code.startsWith("5") ? "EXPENSE" : "LIABILITY" })));
    db.employeePayrollProfile.findMany.mockResolvedValue([profile("K/0")]);
    db.payrollLine.findMany.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ taxAmount: "1089270", detail: { taxableGross: "15561000", pension: "410863" }, payrollRun: { periodStart: iso(`2026-0${i+1}-01`) } })));
    db.payrollRun.create.mockImplementation(({ data }) => ({ ...data, id: "run" }));
  });
  it("prepares a run from policy snapshot with BPJS detail, net pay, and maker recorded", async () => {
    db.payrollPolicy.findFirst.mockResolvedValueOnce(policyRow).mockResolvedValueOnce(null).mockResolvedValueOnce(null); // policy, mid-month policy change, duplicate period
    db.payrollRun.findFirst.mockResolvedValue(null);
    db.payrollRun.create.mockImplementation(({ data }) => ({ ...data, id: "run", number: "PR/1", lines: [] }));
    db.employee.findMany.mockResolvedValue([emp("e1", "Tuan R", "15000000")]);
    const run = await payroll.preparePayrollRun({ companyId: "c", userId: "maker", periodStart: iso("2026-05-01"), periodEnd: iso("2026-05-31") });
    expect(db.payrollRun.create).toHaveBeenCalled();
    const data = db.payrollRun.create.mock.calls[0][0].data;
    const line = data.lines.create[0];
    expect(line.taxAmount.toString()).toBe("1089270"); // gross includes employer JKK/JKM/Kesehatan
    expect(line.bpjsAmount.toString()).toBe("530863");
    expect(line.employerBpjs.toString()).toBe("1337726");
    expect(line.netPay.toString()).toBe(String(15000000 - 1089270 - 530863));
    expect(data.createdById).toBe("maker");
    expect(data.status).toBe("DRAFT");
    expect(run.id).toBe("run");
  });
  it("includes fixed allowance, regular/irregular THR bonus and profile-rated overtime in TER gross", async () => {
    db.payrollPolicy.findFirst.mockResolvedValue(policyRow);
    db.payrollRun.findFirst.mockResolvedValue(null);
    db.employee.findMany.mockResolvedValue([emp("e1", "Tuan R", "15000000")]);
    db.employeePayrollProfile.findMany.mockResolvedValue([{ ...profile("K/0"), fixedAllowance: "1000000", overtimeRate: "100000" }]);
    await payroll.preparePayrollRun({ companyId: "c", userId: "maker", periodStart: iso("2026-05-01"), periodEnd: iso("2026-05-31"), components: [{ employeeId: "e1", thr: "15000000", bonusRegular: "1000000", bonusIrregular: "2000000", overtimeHours: "2", voluntaryDeduction: "100000" }] });
    const line = db.payrollRun.create.mock.calls[0][0].data.lines.create[0];
    expect(line.grossPay.toString()).toBe("34200000");
    expect(line.allowances.toString()).toBe("1000000");
    expect(line.overtime.toString()).toBe("200000");
    expect(line.detail.components.thr).toBe("15000000.00");
    // PTKP K/0 remains category A; the combined monthly gross selects its TER band.
    expect(line.taxAmount.toString()).toBe("4867296");
    expect(line.deductions.toString()).toBe(String(Number(line.bpjsAmount) + 4867296 + 100000));
  });
  it("carries THR into December annual Pasal17 reconciliation and saved payslip detail", async () => {
    db.payrollPolicy.findFirst.mockResolvedValue(policyRow);
    db.payrollRun.findFirst.mockResolvedValue(null);
    db.employee.findMany.mockResolvedValue([emp("e1", "Tuan R", "15000000")]);
    db.payrollLine.findMany.mockResolvedValue(Array.from({ length: 11 }, (_, i) => ({ taxAmount: "1089270", detail: { taxableGross: "15561000", pension: "410863" }, payrollRun: { periodStart: new Date(Date.UTC(2026, i, 1)) } })));
    await payroll.preparePayrollRun({ companyId: "c", userId: "maker", periodStart: iso("2026-12-01"), periodEnd: iso("2026-12-31"), components: [{ employeeId: "e1", thr: "15000000" }] });
    const line = db.payrollRun.create.mock.calls[0][0].data.lines.create[0];
    expect(line.detail.components.thr).toBe("15000000.00");
    expect(line.detail.tax.annualTax).toBe("13845150.00");
    expect(line.taxAmount.toString()).toBe("1863180");
  });
  it("rejects duplicate overlapping period and missing policy, before creating anything", async () => {
    db.payrollRun.findFirst.mockResolvedValue({ id: "old" });
    await expect(payroll.preparePayrollRun({ companyId: "c", userId: "u", periodStart: iso("2026-05-01"), periodEnd: iso("2026-05-31") })).rejects.toThrow(/periode/i);
    db.payrollRun.findFirst.mockResolvedValue(null);
    db.payrollPolicy.findFirst.mockResolvedValue(null);
    await expect(payroll.preparePayrollRun({ companyId: "c", userId: "u", periodStart: iso("2026-05-01"), periodEnd: iso("2026-05-31") })).rejects.toThrow(/kebijakan|policy|konfigurasi/i);
    expect(db.payrollRun.create).not.toHaveBeenCalled();
  });
  it("blocks self-approval, approves different checker, rejects wrong tenant", async () => {
    db.payrollRun.findFirst.mockResolvedValueOnce({ id: "run", createdById: "maker", status: "DRAFT" }).mockResolvedValueOnce({ id: "run", createdById: "maker", status: "DRAFT" }).mockResolvedValueOnce(null);
    await expect(payroll.approvePayrollRun("c", "run", "maker")).rejects.toThrow(/Maker-checker/i);
    db.payrollRun.update = jest.fn().mockResolvedValue({ id: "run", status: "APPROVED" });
    await expect(payroll.approvePayrollRun("c", "run", "checker")).resolves.toEqual(expect.objectContaining({ status: "APPROVED" }));
    expect(db.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ approvedById: "checker" }) }));
    await expect(payroll.approvePayrollRun("foreign", "run", "checker")).rejects.toThrow();
  });
  it("posts balanced journal atomically, excludes duplicate post", async () => {
    const run = { id: "run", companyId: "c", status: "APPROVED", number: "PAY/2026-05", periodEnd: iso("2026-05-31"), totalGross: new Decimal("15000000"), totalNet: new Decimal("13379867"), totalEmployerBpjs: new Decimal("1337726"), lines: [{ bpjsAmount: new Decimal("530863"), taxAmount: new Decimal("1089270") }] };
    db.payrollRun.findFirst.mockResolvedValueOnce(run).mockResolvedValueOnce(null);
    db.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    postJournal.mockResolvedValue({ id: "journal" });
    await expect(payroll.postPayrollRun({ companyId: "c", userId: "u", id: "run" })).resolves.toEqual(expect.objectContaining({ status: "POSTED" }));
    const journal = postJournal.mock.calls[0][1];
    expect(journal.lines.reduce((n: number, l: { debit?: string; credit?: string }) => n + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0)).toBe(0);
    expect(journal.idempotencyKey).toBe("payroll_run:run");
    await expect(payroll.postPayrollRun({ companyId: "c", userId: "u", id: "run" })).rejects.toThrow();
    expect(postJournal).toHaveBeenCalledTimes(1);
  });
  it("retains voluntary deductions as a separate payable so accrual journal balances", async () => {
    db.payrollRun.findFirst.mockResolvedValue({ id: "run", status: "APPROVED", number: "PAY/1", periodEnd: iso("2026-05-31"), totalGross: new Decimal(1000), totalNet: new Decimal(850), totalEmployerBpjs: new Decimal(0), lines: [{ bpjsAmount: new Decimal(0), taxAmount: new Decimal(100), detail: { components: { voluntaryDeduction: "50" } } }] });
    db.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    await payroll.postPayrollRun({ companyId: "c", userId: "checker", id: "run" });
    expect(postJournal.mock.calls[0][1].lines.reduce((n: number, l: { debit?: string; credit?: string }) => n + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0)).toBe(0);
  });
  it("posts December refund as debit to PPh liability without clamping employee net", async () => {
    const run = { id: "refund", companyId: "c", status: "APPROVED", number: "PAY/2026-12", periodEnd: iso("2026-12-31"), totalGross: new Decimal("10000000"), totalNet: new Decimal("10500000"), totalEmployerBpjs: new Decimal("0"), lines: [{ bpjsAmount: new Decimal("0"), taxAmount: new Decimal("-500000") }] };
    db.payrollRun.findFirst.mockResolvedValue(run);
    db.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    await payroll.postPayrollRun({ companyId: "c", userId: "u", id: "refund" });
    const lines = postJournal.mock.calls[0][1].lines;
    expect(lines.find((l: { accountCode: string }) => l.accountCode === "2106")).toEqual(expect.objectContaining({ debit: "500000" }));
    expect(lines.some((l: { credit?: string }) => l.credit && Number(l.credit) < 0)).toBe(false);
    expect(lines.reduce((n: number, l: { debit?: string; credit?: string }) => n + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0)).toBe(0);
  });
  it("rejects wrong account types before posting", async () => {
    db.payrollRun.findFirst.mockResolvedValue({ id: "run", companyId: "c", status: "APPROVED", lines: [] });
    db.account.findMany.mockResolvedValue(["5200", "5300", "2105", "2106", "2101", "2107"].map(code => ({ code, type: "ASSET" })));
    await expect(payroll.postPayrollRun({ companyId: "c", userId: "u", id: "run" })).rejects.toThrow(/EXPENSE|LIABILITY/i);
    expect(db.payrollRun.updateMany).not.toHaveBeenCalled();
  });
  it("fails closed with actionable missing account codes before posting", async () => {
    db.payrollRun.findFirst.mockResolvedValue({ id: "run", companyId: "c", status: "APPROVED", lines: [] });
    db.account.findMany.mockResolvedValue([]);
    await expect(payroll.postPayrollRun({ companyId: "c", userId: "u", id: "run" })).rejects.toThrow(/5200.*5300.*2105.*2106.*2101.*manajemen akun/i);
    expect(db.payrollRun.updateMany).not.toHaveBeenCalled();
  });
  it("fails closed when an active permanent employee lacks a payroll profile or is non-permanent", async () => {
    db.payrollPolicy.findFirst.mockResolvedValue(policyRow);
    db.payrollRun.findFirst.mockResolvedValue(null);
    db.employee.findMany.mockResolvedValue([emp("e1", "Tanpa Profil", "10000000")]);
    db.employeePayrollProfile.findMany.mockResolvedValueOnce([]);
    await expect(payroll.preparePayrollRun({ companyId: "c", userId: "u", periodStart: iso("2026-05-01"), periodEnd: iso("2026-05-31") })).rejects.toThrow(/profil/i);
    db.account.findMany.mockResolvedValue(["5200", "5300", "2105", "2106", "2101", "2107"].map(code => ({ code, type: code.startsWith("5") ? "EXPENSE" : "LIABILITY" })));
    db.employeePayrollProfile.findMany.mockResolvedValue([profile("K/0")]);
    await expect(payroll.preparePayrollRun({ companyId: "c", userId: "u", periodStart: iso("2026-05-01"), periodEnd: iso("2026-05-31") })).resolves.toBeDefined();
  });
  it("rejects prior history gaps, duplicates, and out-of-range months", () => {
    const base = { gross: "15000000", pension: "150000", status: "K/0" };
    expect(() => tax({ ...base, month: 5, prior: [] })).toThrow(/lengkap/i); // fresh company cannot start mid-year
    expect(() => tax({ ...base, month: 3, prior: [{ month: 1, ...base, tax: "900000.00" }, { month: 1, ...base, tax: "900000.00" }] })).toThrow(/unik|valid/i);
    expect(() => tax({ ...base, month: 2, prior: [{ month: 5, ...base, tax: "900000.00" }] })).toThrow(/valid|unik/i);
  });
});

describe("payroll settlement", () => {
  beforeEach(() => { jest.resetAllMocks(); db.$transaction.mockImplementation(async fn => fn(db)); });
  it("limits requested payment to posted payroll liabilities and idempotent key", async () => {
    db.payrollRun.findFirst.mockResolvedValue({ id: "run", totalNet: new Decimal(1000), totalEmployerBpjs: new Decimal(200), lines: [{ bpjsAmount: new Decimal(50), taxAmount: new Decimal(100) }] });
    db.payrollDisbursement.findFirst.mockResolvedValue(null);
    db.payrollDisbursement.findMany.mockResolvedValue([]);
    db.payrollDisbursement.create.mockImplementation(({ data }) => data);
    await expect(payroll.createPayrollDisbursement({ companyId: "c", userId: "maker", payrollRunId: "run", accountCode: "2101", bankAccountCode: "1102", amount: "1001", paymentDate: iso("2026-05-31"), idempotencyKey: "payment1" })).rejects.toThrow(/utang|melebihi/i);
    const input = { companyId: "c", userId: "maker", payrollRunId: "run", accountCode: "2101", bankAccountCode: "1102", amount: "1000", paymentDate: iso("2026-05-31"), idempotencyKey: "payment1" };
    await payroll.createPayrollDisbursement(input);
    expect(db.payrollDisbursement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_APPROVAL", amount: "1000" }) }));
  });
  it("posts each payable once with a balanced bank journal; retry returns existing", async () => {
    const row = { id: "d", companyId: "c", payrollRunId: "run", accountCode: "2105", amount: new Decimal("150"), bankAccountCode: "1102", paymentDate: iso("2026-05-31"), status: "PENDING_APPROVAL", createdById: "maker" };
    db.payrollDisbursement.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, status: "POSTED" });
    db.payrollDisbursement.updateMany.mockResolvedValue({ count: 1 });
    db.account.findMany.mockResolvedValue([{ id: "payable", code: "2105", type: "LIABILITY" }, { id: "asset", code: "1102", type: "ASSET" }]);
    db.bankAccount.findFirst.mockResolvedValue({ id: "bank", glAccountId: "asset" });
    await expect(payroll.settlePayrollDisbursement({ companyId: "c", userId: "maker", id: "d" })).rejects.toThrow(/Maker-checker/);
    await payroll.settlePayrollDisbursement({ companyId: "c", userId: "checker", id: "d" });
    expect(postJournal.mock.calls[0][1].lines).toEqual([{ accountCode: "2105", debit: "150" }, { accountCode: "1102", credit: "150" }]);
    await payroll.settlePayrollDisbursement({ companyId: "c", userId: "checker", id: "d" });
    expect(postJournal).toHaveBeenCalledTimes(1);
  });
});
describe("private payslips", () => {
  beforeEach(() => jest.resetAllMocks());
  it("scopes self-service to explicit linked user; foreign employee is indistinguishable from missing", async () => {
    db.payrollLine.findMany.mockResolvedValue([]);
    await payroll.getPayslips({ companyId: "c", userId: "self", sensitive: false, employeeId: "other" });
    expect(db.payrollLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeId: "other", employee: { payrollUserId: "self", companyId: "c" }, payrollRun: { companyId: "c", status: "POSTED" } }) }));
    await payroll.getPayslips({ companyId: "c", userId: "hr", sensitive: true, employeeId: "e1" });
    expect(db.payrollLine.findMany.mock.calls[1][0].where.employee).toBeUndefined();
  });
});
describe("payroll policy maker-checker and immutability", () => {
  beforeEach(() => { jest.resetAllMocks(); db.$transaction.mockImplementation(async fn => fn(db)); });
  it("creates PENDING policy requiring human JP ceiling, never auto-APPROVED", async () => {
    await expect(payroll.createPayrollPolicy({ companyId: "c", userId: "maker", effectiveFrom: iso("2026-01-01"), config: payroll.defaultPolicyConfig() })).rejects.toThrow(/ceiling|JP/i);
    const withCeiling = confirmedPolicy();
    await payroll.createPayrollPolicy({ companyId: "c", userId: "maker", effectiveFrom: iso("2026-01-01"), config: withCeiling });
    expect(db.payrollPolicy.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_APPROVAL", createdById: "maker" }) }));
  });
  it("policy maker cannot approve own policy; checker can", async () => {
    db.payrollPolicy.findFirst.mockResolvedValueOnce({ id: "p1", createdById: "maker", config: confirmedPolicy() });
    await expect(payroll.approvePayrollPolicy("c", "p1", "maker")).rejects.toThrow(/Maker-checker/i);
    db.payrollPolicy.findFirst.mockResolvedValue({ id: "p1", createdById: "maker", config: confirmedPolicy() });
    db.payrollPolicy.update.mockResolvedValue({ id: "p1", status: "APPROVED" });
    await expect(payroll.approvePayrollPolicy("c", "p1", "checker")).resolves.toEqual(expect.objectContaining({ status: "APPROVED" }));
    db.payrollPolicy.findFirst.mockResolvedValue(null);
    await expect(payroll.approvePayrollPolicy("c", "missing", "checker")).rejects.toThrow();
  });
  it("profile creation rejects non-permanent, bad tax status, bad risk class, foreign employee", async () => {
    const ok = { companyId: "c", userId: "u", employeeId: "e1", effectiveFrom: iso("2026-01-01"), employmentType: "PERMANENT", taxStatus: "K/0", jkkRiskClass: "SEDANG" };
    await expect(payroll.createPayrollProfile({ ...ok, employmentType: "CONTRACT" })).rejects.toThrow(/PERMANENT/i);
    await expect(payroll.createPayrollProfile({ ...ok, taxStatus: "XX/9" })).rejects.toThrow(/PTKP/i);
    await expect(payroll.createPayrollProfile({ ...ok, jkkRiskClass: "NUKLIR" })).rejects.toThrow(/JKK/i);
    db.employee.findFirst.mockResolvedValue(null);
    await expect(payroll.createPayrollProfile(ok)).rejects.toThrow();
    db.employee.findFirst.mockResolvedValue(emp("e1", "Tuan R", "15000000"));
    await payroll.createPayrollProfile(ok);
    expect(db.employeePayrollProfile.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ employmentType: "PERMANENT", taxStatus: "K/0" }) }));
  });
});

