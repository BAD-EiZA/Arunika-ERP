import { Decimal } from "decimal.js";
import { conflict, notFound, validationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { postJournal } from "./accounting";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

type PayrollRun = { id: string; number: string; status: string; totalNet: { toString(): string } };
// PP 58/2023 Lampiran A-C, upper inclusive IDR; percentages represented in quarter-percent units.
// https://peraturan.bpk.go.id/Download/332609/PP%20Nomor%2058%20Tahun%202023.pdf
const brackets: Record<string, [number[], number[]]> = {
  A: [[5400000,5650000,5950000,6300000,6750000,7500000,8550000,9650000,10050000,10350000,10700000,11050000,11600000,12500000,13750000,15100000,16950000,19750000,24150000,26450000,28000000,30050000,32400000,35400000,39100000,43850000,47800000,51400000,56300000,62200000,68600000,77500000,89000000,103000000,125000000,157000000,206000000,337000000,454000000,550000000,695000000,910000000,1400000000], [0,.25,.5,.75,1,1.25,1.5,1.75,2,2.25,2.5,3,3.5,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34]],
  B: [[6200000,6500000,6850000,7300000,9200000,10750000,11250000,11600000,12600000,13600000,14950000,16400000,18450000,21850000,26000000,27700000,29350000,31450000,33950000,37100000,41100000,45800000,49500000,53800000,58500000,64000000,71000000,80000000,93000000,109000000,129000000,163000000,211000000,374000000,459000000,555000000,704000000,957000000,1405000000], [0,.25,.5,.75,1,1.5,2,2.5,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34]],
  C: [[6600000,6950000,7350000,7800000,8850000,9800000,10950000,11200000,12050000,12950000,14150000,15550000,17050000,19500000,22700000,26600000,28100000,30100000,32600000,35400000,38900000,43000000,47400000,51200000,55800000,60400000,66700000,74500000,83200000,95600000,110000000,134000000,169000000,221000000,390000000,463000000,561000000,709000000,965000000,1419000000], [0,.25,.5,.75,1,1.25,1.5,1.75,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34]],
};
const ptkp: Record<string, [string, number]> = {
  "TK/0": ["A",54000000], "TK/1": ["A",58500000], "K/0": ["A",58500000],
  "TK/2": ["B",63000000], "TK/3": ["B",67500000], "K/1": ["B",63000000],
  "K/2": ["B",67500000], "K/3": ["C",72000000],
};
const validIsoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(new Date(s).getTime()) && new Date(s).toISOString().slice(0, 10) === s;
const D = (v: string) => new Decimal(v);
const rupiah = (v: Decimal) => v.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
const fixed = (v: Decimal) => v.toFixed(2);

// Structural validation only; factual correctness of ceilings/rates is confirmed by a human approver per policy.
const rate = z.string().refine(s => { const d = D(s); return d.isFinite() && d.gte(0) && d.lte(1) && d.decimalPlaces() <= 6; }, "rate 0..1");
const amount = z.string().refine(s => { const d = D(s); return d.isFinite() && d.gte(0) && d.decimalPlaces() <= 2; }, "amount >= 0");
const bpjsRule = z.object({
  employer: rate.optional(),
  employee: rate,
  cap: amount.nullable().optional(),
  floor: amount.optional(),
  ceilings: z.array(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cap: amount })).optional(),
  classes: z.record(z.string(), rate).optional(),
}).refine(r => !r.cap || !r.floor || D(r.cap).gte(D(r.floor)), "cap >= floor");
function validateTaxConfig(policy: unknown) {
  const parsed = taxConfig.parse(policy);
  if (parsed.validThrough && !validIsoDay(parsed.validThrough)) throw validationError("Tanggal akhir kebijakan tidak valid");
  for (const rule of Object.values(parsed.bpjs)) {
    const dates = rule.ceilings?.map(c => c.from) ?? [];
    if (dates.some(d => !validIsoDay(d)) || new Set(dates).size !== dates.length) throw validationError("Tanggal ceiling tidak valid atau duplikat");
  }
  for (const [table, [limits, rates]] of Object.entries(parsed.pph21.terTables)) {
    if (!Array.isArray(limits) || !Array.isArray(rates) || limits.length + 1 !== rates.length || limits.length === 0) throw validationError(`Tabel TER ${table} tidak valid`);
    for (let i = 0; i < limits.length; i++) {
      const limit = limits[i], r = rates[i];
      if (!Number.isFinite(limit) || limit < 0 || !Number.isFinite(r) || r < 0 || r > 100) throw validationError(`Tabel TER ${table} tidak valid`);
      if (i > 0 && limit <= limits[i - 1]) throw validationError(`Tabel TER ${table} harus menaik`);
      if (i > 0 && r < rates[i - 1]) throw validationError(`Tarif TER ${table} harus menaik`);
    }
  }
  for (const [status, [table, annual]] of Object.entries(parsed.pph21.ptkp)) {
    if (!(table in parsed.pph21.terTables) || !Number.isFinite(annual) || annual <= 0) throw validationError(`PTKP ${status} tidak valid`);
  }
  let prevCap = 0;
  for (let i = 0; i < parsed.pph21.pasal17.length; i++) {
    const [cap, r] = parsed.pph21.pasal17[i];
    const last = i === parsed.pph21.pasal17.length - 1;
    if (last ? cap === null : cap !== null && Number.isFinite(cap) && cap > prevCap) {
      if (r <= 0 || r > 1) throw validationError("Tarif Pasal 17 tidak valid");
      if (cap !== null) prevCap = cap;
      continue;
    }
    throw validationError("Braket Pasal 17 tidak valid: menaik, berakhir tanpa batas");
  }
  const bj = parsed.pph21.biayaJabatan;
  if (!D(bj.pct).isFinite() || D(bj.pct).lte(0) || D(bj.pct).gt(1) || !D(bj.monthlyMax).isFinite() || D(bj.monthlyMax).lt(0)) throw validationError("Biaya jabatan tidak valid");
  for (const rule of Object.values(parsed.bpjs)) bpjsRule.parse(rule);
  return parsed;
}
const taxConfig = z.object({
  validThrough: z.string().optional(),
  sources: z.array(z.object({ url: z.url(), checkedAt: z.string() })).optional(),
  employmentTypes: z.array(z.enum(["PERMANENT", "CONTRACT", "DAILY"])).optional(),
  proration: z.enum(["CALENDAR_DAYS"]).optional(),
  residentPartialYear: z.boolean().optional(),
  pph21: z.object({
    terTables: z.record(z.string(), z.tuple([z.array(z.number()), z.array(z.number())])),
    ptkp: z.record(z.string(), z.tuple([z.string(), z.number()])),
    pasal17: z.array(z.tuple([z.number().nullable(), z.number()])).min(5),
    biayaJabatan: z.object({ pct: z.string(), monthlyMax: z.string() }),
  }),
  bpjs: z.record(z.string(), bpjsRule),
}).passthrough();

function unsupportedPayrollConfiguration(): never {
  throw validationError("Unsupported payroll configuration: konfigurasi BPJS dan PPh 21 dengan tanggal efektif dan validasi profesional belum tersedia");
}

// ─── Persisted policy snapshot (validated defaults + source URLs) ──
// ponytail: ceilings/TER date windows encoded in this snapshot; replace with
// DB-driven versioning when regulatory updates ship. Supported window: 2025-03-01..2026-12-31.
const RULE_SOURCES = [
  "https://peraturan.bpk.go.id/Download/332609/PP%20Nomor%2058%20Tahun%202023.pdf",
  "https://peraturan.bpk.go.id/Download/346093/2023pmkeuangan168.pdf",
  "https://www.pajak.go.id/sites/default/files/2024-02/Leaflet%20PPh%2021%20TER.pdf",
  "https://peraturan.bpk.go.id/Read/344279/Perpres%20Nomor%2059%20Tahun%202024.pdf",
  "https://bpjsketenagakerjaan.go.id/artikel/18913/artikel-berapa-besaran-iuran-jht,-jkk,-jkm,-jp-dan-jkp",
  "https://www.bpjsketenagakerjaan.go.id/assets/uploads/peraturan/PP_Nomor_6_Tahun_2025.pdf",
];
// ponytail: one full calendar year, Jan→Dec 2026; extend per-year when a human-approved policy covers more years.
export const SUPPORTED_WINDOW = { from: "2026-01-01", to: "2026-12-31" } as const;

export function defaultPolicyConfig() {
  return {
    pph21: { method: "TER_PPK168_2023", terTables: brackets, ptkp, pasal17: [[60000000, .05], [190000000, .15], [250000000, .25], [4500000000, .30], [null, .35]], biayaJabatan: { pct: "0.05", monthlyMax: "500000" } },
    bpjs: {
      JHT: { employer: ".037", employee: ".02", cap: null, floor: "0", source: RULE_SOURCES[4] },
      JP: { employer: ".02", employee: ".01", ceilings: [] as { from: string; cap: string }[], source: "Human-confirmed effective-dated JP ceiling required" },
      KESEHATAN: { employer: ".04", employee: ".01", cap: "12000000", floor: "0", source: RULE_SOURCES[3] },
      JKK: { employee: "0", classes: { SANGAT_RENDAH: ".0024", RENDAH: ".0054", SEDANG: ".0089", TINGGI: ".0127", SANGAT_TINGGI: ".0174" }, source: RULE_SOURCES[5] },
      JKM: { employer: ".003", employee: "0", cap: null, floor: "0", source: RULE_SOURCES[4] },
    },
  } as const;
}



export function calculatePph21(input: {
  gross: string; pension: string; status: string; month: number;
  prior: { gross: string; pension: string; tax: string; month: number }[];
  policy?: unknown; firstMonth?: number; finalMonth?: number;
}) {
  const policy = validateTaxConfig(input.policy ?? defaultPolicyConfig()).pph21;
  const profile = policy.ptkp[input.status];
  if (!profile || !Number.isInteger(input.month) || input.month < 1 || input.month > 12) throw validationError("Profil pajak atau riwayat PPh 21 tidak lengkap");
  const gross = D(input.gross), pension = D(input.pension);
  if (![gross,pension].every(v => v.isFinite() && v.gte(0) && v.decimalPlaces() <= 2) || pension.gt(gross)) throw validationError("Basis PPh 21 tidak valid");
  const first = input.firstMonth ?? 1, final = input.finalMonth ?? 12;
  if (!Number.isInteger(first) || !Number.isInteger(final) || first < 1 || final > 12 || first > input.month || final < input.month) throw validationError("Bulan awal/akhir pajak tidak valid");
  if (input.prior.length !== input.month - first) throw validationError("Riwayat Januari sampai bulan sebelumnya wajib lengkap");
  // Full-year scope: exactly one posted entry per preceding calendar month.
  const seen = new Set<number>();
  for (const p of input.prior) {
    if (!Number.isInteger(p.month) || p.month < first || p.month >= input.month || seen.has(p.month)) throw validationError("Riwayat PPh 21 tidak valid: bulan prior wajib unik dan sebelum bulan berjalan");
    seen.add(p.month);
    if (![p.gross,p.pension,p.tax].every(s => D(s).isFinite() && D(s).gte(0))) throw validationError("Riwayat PPh 21 tidak valid");
  }
  if (Array.from({length:input.month-first},(_,i)=>first+i).some(month=>!seen.has(month))) throw validationError("Riwayat PPh 21 tidak lengkap");
  if (input.month !== final) {
    const [limits, rates] = policy.terTables[profile[0]];
    const idx = limits.findIndex(limit => gross.lte(limit));
    return { tax: fixed(rupiah(gross.mul(rates[idx < 0 ? rates.length - 1 : idx]).div(100))) };
  }
  const all = [...input.prior, { gross: input.gross, pension: input.pension, tax: "0" }];
  const annualGross = all.reduce((n,p) => n.plus(p.gross),D("0"));
  const annualPension = all.reduce((n,p) => n.plus(p.pension),D("0"));
  const fee = Decimal.min(annualGross.mul(policy.biayaJabatan.pct), D(policy.biayaJabatan.monthlyMax).mul(all.length));
  const pkp = Decimal.max(0, annualGross.minus(fee).minus(annualPension).minus(profile[1])).div(1000).floor().mul(1000);
  let remaining = pkp, annual = D("0");
  for (const [cap, rate] of policy.pasal17) {
    const part = Decimal.min(remaining, cap === null ? Infinity : cap);
    annual = annual.plus(part.mul(rate)); remaining = remaining.minus(part);
  }
  const priorTax = input.prior.reduce((n,p) => n.plus(p.tax), D("0"));
  return { tax: fixed(annual.minus(priorTax)), annualTax: fixed(annual), pkp: fixed(pkp) };
}

export function calculateBpjs(input: { wage: string; program: string; riskClass?: string; effective: string; policy?: unknown }) {
  if (!input.policy) throw validationError("Kebijakan payroll berlaku wajib disediakan; tidak ada tarif implisit");
  const config = validateTaxConfig(input.policy);
  if (!validIsoDay(input.effective) || input.effective < SUPPORTED_WINDOW.from || input.effective > (config.validThrough ?? SUPPORTED_WINDOW.to)) throw validationError("Konfigurasi BPJS untuk tanggal ini belum tervalidasi");
  const wage = D(input.wage);
  if (!wage.isFinite() || wage.lt(0) || wage.decimalPlaces() > 2) throw validationError("Upah BPJS tidak valid");
  const rules = validateTaxConfig(input.policy).bpjs;
  const rule = rules[input.program];
  if (!rule) throw validationError(`Program BPJS ${input.program} tidak ada dalam kebijakan berlaku`);
  let cap = rule.cap ?? null;
  if (rule.ceilings?.length) {
    const applicable = [...rule.ceilings].sort((a,b) => a.from.localeCompare(b.from)).filter(c => c.from <= input.effective);
    if (!applicable.length) throw validationError(`Ceiling ${input.program} belum dikonfirmasi untuk tanggal berlaku`);
    const latest = applicable[applicable.length - 1];
    if (input.effective > SUPPORTED_WINDOW.to && latest.from.slice(0, 4) !== input.effective.slice(0, 4)) throw validationError("Ceiling tahun berlaku wajib dikonfirmasi");
    cap = latest.cap;
  } else if (rule.cap == null && input.program === "JP") {
    throw validationError("Ceiling JP wajib dikonfirmasi manusia dalam kebijakan berlaku");
  }
  const employerRate = rule.classes ? rule.classes[input.riskClass ?? ""] : rule.employer;
  if (!employerRate) throw validationError("Kelas risiko BPJS tidak valid");
  const base = Decimal.min(Decimal.max(wage, rule.floor ?? "0"), cap ?? Infinity);
  return { employer: fixed(rupiah(base.mul(employerRate))), employee: fixed(rupiah(base.mul(rule.employee))) };
}
// ponytail: policy config immutable by construction — create + approve only, no update path; runs pin policyId.
const TAX_STATUSES = Object.keys(ptkp);
const JKK_CLASSES = ["SANGAT_RENDAH","RENDAH","SEDANG","TINGGI","SANGAT_TINGGI"];
export async function createPayrollPolicy(input: { companyId: string; userId: string; effectiveFrom: Date; config: unknown; notes?: string }) {
  if (!Number.isFinite(input.effectiveFrom.getTime())) throw validationError("Tanggal efektif kebijakan tidak valid");
  const parsed = validateTaxConfig(input.config);
  if ((input.effectiveFrom.toISOString().slice(0,10) > SUPPORTED_WINDOW.to || (parsed.validThrough ?? "") > SUPPORTED_WINDOW.to) && (!parsed.validThrough || parsed.validThrough < input.effectiveFrom.toISOString().slice(0,10) || !parsed.sources?.length || parsed.sources.some(s => !validIsoDay(s.checkedAt)))) throw validationError("Tanggal akhir dan sumber kebijakan wajib untuk tahun tambahan");
  const jp = parsed.bpjs.JP;
  if (!jp?.ceilings?.length) throw validationError("Ceiling JP wajib diisi manual dengan sumber terverifikasi manusia (default tidak memuat angka yang belum dikonfirmasi)");
  return prisma.payrollPolicy.create({ data: { companyId: input.companyId, effectiveFrom: input.effectiveFrom, config: parsed as Prisma.InputJsonValue, sourceUrls: (parsed.sources ?? RULE_SOURCES) as unknown as Prisma.InputJsonValue, notes: input.notes, createdById: input.userId, status: "PENDING_APPROVAL" } });
}
export async function approvePayrollPolicy(companyId: string, id: string, approverUserId: string) {
  const policy = await prisma.payrollPolicy.findFirst({ where: { companyId, id, status: "PENDING_APPROVAL" } });
  if (!policy) throw notFound("Kebijakan payroll PENDING_APPROVAL tidak ditemukan");
  if (policy.createdById === approverUserId) throw conflict("Maker-checker: pembuat kebijakan tidak dapat menyetujui kebijakan sendiri");
  validateTaxConfig(policy.config);
  return prisma.payrollPolicy.update({ where: { id }, data: { status: "APPROVED" } });
}
export async function createPayrollProfile(input: { companyId: string; userId: string; employeeId: string; effectiveFrom: Date; employmentType: string; taxStatus: string; jkkRiskClass: string; fixedAllowance?: string; overtimeRate?: string; payrollUserId?: string }) {
  if (input.employmentType !== "PERMANENT") {
    const policy = await prisma.payrollPolicy.findFirst({where:{companyId:input.companyId,effectiveFrom:{lte:input.effectiveFrom},status:"APPROVED"},orderBy:{effectiveFrom:"desc"}});
    const config = policy && validateTaxConfig(policy.config);
    if (input.employmentType !== "CONTRACT" || !config?.employmentTypes?.includes("CONTRACT")) throw validationError("Hanya pegawai PERMANENT atau CONTRACT dengan kebijakan disetujui yang didukung");
  }
  if (!TAX_STATUSES.includes(input.taxStatus)) throw validationError("Status PTKP tidak valid (TK/0..K/3)");
  if (!JKK_CLASSES.includes(input.jkkRiskClass)) throw validationError("Kelas risiko JKK tidak valid");
  if (!Number.isFinite(input.effectiveFrom.getTime())) throw validationError("Tanggal efektif profil tidak valid");
  const employee = await prisma.employee.findFirst({ where: { companyId: input.companyId, id: input.employeeId } });
  if (!employee) throw notFound("Karyawan tidak ditemukan");
  const fixedAllowance = amount.parse(input.fixedAllowance ?? "0"), overtimeRate = amount.parse(input.overtimeRate ?? "0");
  if (input.payrollUserId) {
    const member = await prisma.membership.findFirst({ where: { companyId: input.companyId, userId: input.payrollUserId, status: "ACTIVE" } });
    if (!member) throw validationError("User ESS wajib anggota aktif perusahaan");
    await prisma.employee.update({ where: { id: employee.id }, data: { payrollUserId: input.payrollUserId } });
  }
  return prisma.employeePayrollProfile.create({ data: { companyId: input.companyId, employeeId: input.employeeId, effectiveFrom: input.effectiveFrom, employmentType: input.employmentType, taxStatus: input.taxStatus, jkkRiskClass: input.jkkRiskClass, fixedAllowance, overtimeRate } });
}
const componentSchema = z.object({ employeeId: z.string().min(1), thr: amount.default("0"), bonusRegular: amount.default("0"), bonusIrregular: amount.default("0"), overtimeHours: amount.default("0"), voluntaryDeduction: amount.default("0") }).strict();
export type PayrollComponents = z.input<typeof componentSchema>;
export async function preparePayrollRun(input: { companyId: string; userId: string; periodStart: Date; periodEnd: Date; components?: PayrollComponents[] }): Promise<PayrollRun> {
  const start = input.periodStart, end = input.periodEnd;
  const validDate = [start,end].every(d => Number.isFinite(d.getTime()));
  if (!validDate || start.getUTCDate() !== 1 || start.getUTCHours() !== 0 || start.getUTCMinutes() !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0 || end.getTime() !== Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)) throw validationError("Konfigurasi periode: hanya satu bulan kalender penuh UTC");
  const date = start.toISOString().slice(0,10);
  if (date < SUPPORTED_WINDOW.from) unsupportedPayrollConfiguration();
  return prisma.$transaction(async tx => {
    const existing = await tx.payrollRun.findFirst({ where: { companyId: input.companyId, periodStart: { lte: end }, periodEnd: { gte: start }, status: { notIn: ["CANCELLED", "VOID"] } } });
    if (existing) throw conflict("Periode payroll sudah ada");
    const policy = await tx.payrollPolicy.findFirst({ where: { companyId: input.companyId, effectiveFrom: { lte: start }, status: "APPROVED" }, orderBy: { effectiveFrom: "desc" } });
    if (!policy) unsupportedPayrollConfiguration();
    const runConfig = validateTaxConfig(policy.config);
    const midMonthPolicy = await tx.payrollPolicy.findFirst({where:{companyId:input.companyId,status:"APPROVED",effectiveFrom:{gt:start,lte:end}}});
    if (midMonthPolicy && midMonthPolicy.effectiveFrom > start && midMonthPolicy.effectiveFrom <= end) throw validationError("Kebijakan efektif tengah bulan belum didukung");
    if (end.toISOString().slice(0,10) > (runConfig.validThrough ?? SUPPORTED_WINDOW.to) || (date > SUPPORTED_WINDOW.to && (!runConfig.sources?.length || !runConfig.bpjs.JP?.ceilings?.some(c=>c.from.slice(0,4)===date.slice(0,4))))) unsupportedPayrollConfiguration();
    const employees = await tx.employee.findMany({ where: { companyId: input.companyId, OR: [{ isActive: true }, { endDate: { gte: start } }], joinDate: { lte: end } }, orderBy: { id: "asc" } });
    if (!employees.length) throw validationError("Tidak ada karyawan aktif");
    const components = z.array(componentSchema).parse(input.components ?? []);
    if (new Set(components.map(c => c.employeeId)).size !== components.length || components.some(c => !employees.some(e => e.id === c.employeeId))) throw validationError("Komponen payroll duplikat atau karyawan tidak aktif/tenant berbeda");
    const lines = [];
    for (const employee of employees) {
      const profiles = await tx.employeePayrollProfile.findMany({ where: { companyId: input.companyId, employeeId: employee.id, effectiveFrom: { lte: start } }, orderBy: { effectiveFrom: "desc" }, take: 1 });
      const profile = profiles[0];
      if (!profile || !(runConfig.employmentTypes ?? ["PERMANENT"]).includes(profile.employmentType as "PERMANENT") || !employee.joinDate) throw validationError("Profil payroll tidak didukung");
      const partial = employee.joinDate > new Date(Date.UTC(start.getUTCFullYear(),0,1)) || !!employee.endDate;
      if (partial && (!runConfig.residentPartialYear || runConfig.proration !== "CALENDAR_DAYS")) throw validationError("Profil partial-year memerlukan kebijakan resident dan proration terverifikasi");
      if (profile.employmentType === "DAILY") throw validationError("Pegawai harian memerlukan metode PPh21 harian terverifikasi; belum didukung");
      const daysInMonth = end.getUTCDate();
      const activeFrom = new Date(Math.max(start.getTime(), employee.joinDate.getTime()));
      const activeTo = new Date(Math.min(end.getTime(), employee.endDate?.getTime() ?? end.getTime()));
      const activeDays = Math.max(0, Math.round((activeTo.getTime()-activeFrom.getTime())/86400000)+1);
      if (!activeDays) continue;
      const ratio = D(String(activeDays)).div(daysInMonth);
      const salary = rupiah(D(employee.baseSalary.toString()).mul(ratio));
      if (!salary.isFinite() || salary.lte(0)) throw validationError("Gaji pokok wajib positif");
      const component = components.find(c => c.employeeId === employee.id) ?? componentSchema.parse({ employeeId: employee.id });
      const allowance = rupiah(D(amount.parse(profile.fixedAllowance?.toString() ?? "0")).mul(ratio));
      const overtimeRate = D(amount.parse(profile.overtimeRate?.toString() ?? "0"));
      const sources = date > SUPPORTED_WINDOW.to ? await tx.hrPayrollSource.findMany({where:{companyId:input.companyId,employeeId:employee.id,status:"APPROVED",workDate:{gte:activeFrom,lte:activeTo}}}) : [];
      let sourceHours = D("0"), adjustment = D("0");
      const usedAttendance = new Map<string, Decimal>();
      for (const source of sources) {
        if (source.kind === "OVERTIME") {
          const payload = z.object({hours:amount,attendanceId:z.string(),category:z.enum(["WORKDAY","HOLIDAY"])}).parse(source.payload);
          const attendance = sources.find(s=>s.id===payload.attendanceId && s.kind==="ATTENDANCE" && s.workDate.getTime()===source.workDate.getTime());
          const actual = z.object({hours:amount}).safeParse(attendance?.payload);
          const used = (usedAttendance.get(payload.attendanceId) ?? D("0")).plus(payload.hours);
          if (!actual.success || used.gt(actual.data.hours)) throw validationError("Rekonsiliasi sumber lembur/absensi gagal");
          if (payload.category === "HOLIDAY") throw validationError("Lembur hari libur memerlukan formula terverifikasi; belum didukung");
          usedAttendance.set(payload.attendanceId,used); sourceHours=sourceHours.plus(payload.hours);
        }
        if (source.kind === "ADJUSTMENT") {
          const payload=z.object({amount:z.string(),reason:z.string().min(1),sourceRunId:z.string().min(1)}).parse(source.payload);
          const value=D(payload.amount);
          if (!value.isFinite() || value.decimalPlaces()>2) throw validationError("Adjustment tidak valid");
          adjustment=adjustment.plus(value);
        }
      }
      if (date > SUPPORTED_WINDOW.to && D(component.overtimeHours).gt(0) && !D(component.overtimeHours).eq(sourceHours)) throw validationError("Lembur memerlukan sumber approved dan rekonsiliasi absensi");
      const hours = date > SUPPORTED_WINDOW.to ? sourceHours : D(component.overtimeHours);
      if (hours.gt(0) && overtimeRate.lte(0)) throw validationError("Tarif lembur profil wajib positif");
      const overtime = rupiah(hours.mul(overtimeRate));
      const gross = salary.plus(allowance).plus(overtime).plus(component.thr).plus(component.bonusRegular).plus(component.bonusIrregular).plus(adjustment);
      const detail: Record<string, { employer: string; employee: string }> = {};
      for (const program of ["JHT","JP","KESEHATAN","JKK","JKM"]) detail[program] = calculateBpjs({ wage: salary.plus(allowance).toString(), program, riskClass: profile.jkkRiskClass, effective: date, policy: policy.config });
      const employeeBpjs = Object.values(detail).reduce((n,p) => n.plus(p.employee),D("0"));
      const employerBpjs = Object.values(detail).reduce((n,p) => n.plus(p.employer),D("0"));
      const taxableGross = gross.plus(detail.KESEHATAN.employer).plus(detail.JKK.employer).plus(detail.JKM.employer);
      const pension = D(detail.JHT.employee).plus(detail.JP.employee);
      const previous = await tx.payrollLine.findMany({ where: { employeeId: employee.id, payrollRun: { companyId: input.companyId, status: "POSTED", periodStart: { gte: new Date(Date.UTC(start.getUTCFullYear(),0,1)), lt: start } } }, include: { payrollRun: true }, orderBy: { payrollRun: { periodStart: "asc" } } });
      const prior = previous.map(p => {
        const saved = z.object({ taxableGross: z.string(), pension: z.string() }).safeParse(p.detail);
        if (!saved.success) throw validationError("Riwayat payroll tidak lengkap");
        return { month: p.payrollRun.periodStart.getUTCMonth() + 1, gross: saved.data.taxableGross, pension: saved.data.pension, tax: p.taxAmount.toString() };
      });
      const tax = calculatePph21({ gross: taxableGross.toString(), pension: pension.toString(), status: profile.taxStatus, month: start.getUTCMonth()+1, firstMonth: employee.joinDate.getUTCFullYear() === start.getUTCFullYear() ? employee.joinDate.getUTCMonth()+1 : 1, finalMonth: employee.endDate?.getUTCFullYear() === start.getUTCFullYear() ? employee.endDate.getUTCMonth()+1 : 12, prior, policy: policy.config });
      const deductions = employeeBpjs.plus(tax.tax).plus(component.voluntaryDeduction);
      const net = gross.minus(deductions);
      if (net.lt(0)) throw validationError("Net payroll negatif tidak didukung");
      lines.push({ employeeId: employee.id, baseSalary: salary, allowances: allowance, overtime, grossPay: gross, netPay: net, taxAmount: D(tax.tax), bpjsAmount: employeeBpjs, employerBpjs, deductions, taxStatus: profile.taxStatus, detail: { sources: sources.map(s=>({id:s.id,kind:s.kind,workDate:s.workDate.toISOString(),payload:s.payload})), adjustment: fixed(adjustment), proration: { days: activeDays, denominator: daysInMonth, method: "CALENDAR_DAYS" }, components: { ...component, thr: fixed(D(component.thr)), fixedAllowance: fixed(allowance), overtimeRate: fixed(overtimeRate), overtime: fixed(overtime) }, taxableGross: taxableGross.toString(), pension: pension.toString(), bpjs: detail, tax, policyId: policy.id, profileId: profile.id } });
    }
    const totalGross = lines.reduce((n,l) => n.plus(l.grossPay),D("0"));
    const totalDeduction = lines.reduce((n,l) => n.plus(l.deductions),D("0"));
    return tx.payrollRun.create({ data: { companyId: input.companyId, number: `PAY/${date.slice(0,7)}`, periodStart: start, periodEnd: end, status: "DRAFT", createdById: input.userId, policyId: policy.id, totalGross, totalDeduction, totalNet: totalGross.minus(totalDeduction), totalEmployerBpjs: lines.reduce((n,l) => n.plus(l.employerBpjs),D("0")), lines: { create: lines.map(l => ({ ...l, detail: l.detail as Prisma.InputJsonValue })) } } });
  }, { isolationLevel: "Serializable" });
}
export async function getPayslips(input: { companyId: string; userId: string; sensitive: boolean; employeeId?: string }) {
  if (input.sensitive && !input.employeeId) throw validationError("Pilih karyawan untuk slip gaji");
  return prisma.payrollLine.findMany({
    where: { employeeId: input.employeeId, employee: input.sensitive ? undefined : { payrollUserId: input.userId, companyId: input.companyId }, payrollRun: { companyId: input.companyId, status: "POSTED" } },
    select: { id: true, employeeId: true, baseSalary: true, allowances: true, overtime: true, grossPay: true, deductions: true, taxAmount: true, bpjsAmount: true, netPay: true, detail: true, payrollRun: { select: { number: true, periodStart: true, periodEnd: true } } },
    orderBy: { payrollRun: { periodStart: "desc" } }, take: 24,
  });
}
export async function approvePayrollRun(companyId: string, id: string, approverUserId?: string): Promise<PayrollRun> {
  if (!approverUserId) throw validationError("Approver wajib diisi");
  const run = await prisma.payrollRun.findFirst({ where: { companyId, id, status: "DRAFT" } });
  if (!run) throw notFound("Payroll run DRAFT tidak ditemukan");
  if (run.createdById === approverUserId) throw conflict("Maker-checker: pembuat payroll tidak dapat menyetujui payroll sendiri");
  return prisma.payrollRun.update({ where: { id }, data: { status: "APPROVED", approvedById: approverUserId, approvedAt: new Date() } });
}

const SETTLEABLE: Record<string, (run: { totalNet: { toString(): string }; totalEmployerBpjs: { toString(): string }; lines: { bpjsAmount: { toString(): string }; taxAmount: { toString(): string } }[] }) => Decimal> = {
  "2101": run => D(run.totalNet.toString()),
  "2105": run => D(run.totalEmployerBpjs.toString()).plus(run.lines.reduce((n, l) => n.plus(l.bpjsAmount.toString()), D("0"))),
  "2106": run => Decimal.max(0, run.lines.reduce((n, l) => n.plus(l.taxAmount.toString()), D("0"))),
};
export async function createPayrollDisbursement(input: { companyId: string; userId: string; payrollRunId: string; accountCode: string; bankAccountCode: string; amount: string; paymentDate: Date; idempotencyKey: string }) {
  if (!SETTLEABLE[input.accountCode]) throw validationError("Hanya utang payroll 2101/2105/2106 yang dapat dibayar");
  if (!Number.isFinite(input.paymentDate.getTime()) || !input.idempotencyKey.trim()) throw validationError("Tanggal pembayaran atau idempotency key tidak valid");
  const value = D(input.amount);
  if (!value.isFinite() || value.lte(0) || value.decimalPlaces() > 2) throw validationError("Nominal pembayaran tidak valid");
  return prisma.$transaction(async tx => {
    const existing = await tx.payrollDisbursement.findFirst({ where: { companyId: input.companyId, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.payrollRunId !== input.payrollRunId || existing.accountCode !== input.accountCode || existing.bankAccountCode !== input.bankAccountCode || !D(existing.amount.toString()).eq(value) || existing.paymentDate.getTime() !== input.paymentDate.getTime()) throw conflict("Idempotency key digunakan untuk pembayaran berbeda");
      return existing;
    }
    const run = await tx.payrollRun.findFirst({ where: { companyId: input.companyId, id: input.payrollRunId, status: "POSTED" }, include: { lines: true } });
    if (!run) throw notFound("Payroll run POSTED tidak ditemukan");
    const paid = await tx.payrollDisbursement.findMany({ where: { companyId: input.companyId, payrollRunId: run.id, accountCode: input.accountCode, status: "POSTED" } });
    const outstanding = SETTLEABLE[input.accountCode](run).minus(paid.reduce((n, p) => n.plus(p.amount.toString()), D("0")));
    // ponytail: one full settlement per run/payable; add installments only with a locked allocation ledger.
    if (!value.eq(outstanding)) throw validationError(`Nominal wajib sama dengan utang belum dibayar (${fixed(outstanding)})`);
    return tx.payrollDisbursement.create({ data: { companyId: input.companyId, payrollRunId: run.id, accountCode: input.accountCode, bankAccountCode: input.bankAccountCode, amount: input.amount, paymentDate: input.paymentDate, idempotencyKey: input.idempotencyKey, status: "PENDING_APPROVAL", createdById: input.userId } });
  });
}
export async function settlePayrollDisbursement(input: { companyId: string; userId: string; id: string }) {
  return prisma.$transaction(async tx => {
    const row = await tx.payrollDisbursement.findFirst({ where: { companyId: input.companyId, id: input.id } });
    if (!row) throw notFound("Pembayaran payroll tidak ditemukan");
    if (row.status === "POSTED") return row;
    if (row.status !== "PENDING_APPROVAL") throw conflict("Pembayaran bukan PENDING_APPROVAL");
    if (row.createdById === input.userId) throw conflict("Maker-checker: pembuat pembayaran tidak dapat menyetujui sendiri");
    const accounts = await tx.account.findMany({ where: { companyId: input.companyId, code: { in: [row.accountCode, row.bankAccountCode] }, isActive: true } });
    if (!accounts.some(a => a.code === row.accountCode && a.type === "LIABILITY") || !accounts.some(a => a.code === row.bankAccountCode && a.type === "ASSET")) throw validationError("Akun utang/bank aktif dengan tipe LIABILITY/ASSET wajib tersedia");
    const bank = accounts.find(a => a.code === row.bankAccountCode);
    if (!bank || !await tx.bankAccount.findFirst({ where: { companyId: input.companyId, glAccountId: bank.id, isActive: true } })) throw validationError("Akun kredit wajib terhubung rekening bank aktif");
    const claimed = await tx.payrollDisbursement.updateMany({ where: { id: row.id, companyId: input.companyId, status: "PENDING_APPROVAL" }, data: { status: "POSTED", approvedById: input.userId, approvedAt: new Date(), postedAt: new Date() } });
    if (claimed.count !== 1) throw conflict("Pembayaran telah diproses; ulangi untuk melihat hasil");
    await postJournal(tx, { companyId: input.companyId, sourceModule: "payroll", sourceDocType: "payroll_disbursement", sourceDocId: row.id, description: `Pembayaran payroll ${row.accountCode}`, postingDate: row.paymentDate, postedById: input.userId, idempotencyKey: `payroll_disbursement:${row.id}`, lines: [{ accountCode: row.accountCode, debit: row.amount.toString() }, { accountCode: row.bankAccountCode, credit: row.amount.toString() }] });
    return { ...row, status: "POSTED" };
  }, { isolationLevel: "Serializable" });
}

// ponytail: fixed standard COA codes 5200/5300/2105/2106/2101 (validated types); per-company mapping only when a company needs custom accounts.
const PAYROLL_ACCOUNTS = { salaryExpense: "5200", bpjsExpense: "5300", bpjsPayable: "2105", pph21Payable: "2106", salaryPayable: "2101" } as const;
export async function postPayrollRun(input: { companyId: string; userId: string; id: string }): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findFirst({ where: { companyId: input.companyId, id: input.id, status: "APPROVED" }, include: { lines: true } });
  if (!run) throw notFound("Payroll run APPROVED tidak ditemukan");
  const voluntary = run.lines.reduce((n,l) => { const parsed = z.object({ components: z.object({ voluntaryDeduction: amount }).optional() }).safeParse(l.detail); return n.plus(parsed.success ? parsed.data.components?.voluntaryDeduction ?? "0" : "0"); }, D("0"));
  const codes = [...Object.values(PAYROLL_ACCOUNTS), ...(voluntary.gt(0) ? ["2107"] : [])];
  const EXPECTED_TYPES: Record<string, string> = { "5200": "EXPENSE", "5300": "EXPENSE", "2105": "LIABILITY", "2106": "LIABILITY", "2101": "LIABILITY", "2107": "LIABILITY" };
  const accounts = await prisma.account.findMany({ where: { companyId: input.companyId, code: { in: [...codes] }, isActive: true } });
  const wrongType = accounts.filter(a => a.type !== EXPECTED_TYPES[a.code]).map(a => `${a.code} (harus ${EXPECTED_TYPES[a.code]})`);
  if (wrongType.length) throw validationError(`Tipe akun payroll salah: ${wrongType.join(", ")}. Perbaiki melalui manajemen akun (Finance > Chart of Accounts).`);
  const missing = codes.filter(c => !accounts.some(a => a.code === c));
  if (missing.length) throw validationError(`Akun payroll belum ada: ${missing.join(", ")}. Buat akun ini melalui manajemen akun (Finance > Chart of Accounts) sebelum posting payroll.`);
  return prisma.$transaction(async tx => {
  const claimed = await tx.payrollRun.updateMany({ where: { id: run.id, companyId: input.companyId, status: "APPROVED" }, data: { status: "POSTED", postedAt: new Date() } });
  if (claimed.count !== 1) throw conflict("Payroll run sudah diposting");
  // December reconciliation may over-withhold: negative aggregate tax posts as a PPh 21 payable refund (debit), never a negative credit or clamp.
  const totalTax = run.lines.reduce((n,l) => n.plus(l.taxAmount), D("0"));
  await postJournal(tx, {
    companyId: input.companyId,
    sourceModule: "payroll",
    sourceDocType: "payroll_run",
    sourceDocId: run.id,
    description: `Payroll ${run.number}`,
    postingDate: run.periodEnd,
    postedById: input.userId,
    idempotencyKey: `payroll_run:${run.id}`,
    lines: [
      { accountCode: PAYROLL_ACCOUNTS.salaryExpense, debit: run.totalGross.toString(), description: `Biaya gaji ${run.number}` },
      { accountCode: PAYROLL_ACCOUNTS.bpjsExpense, debit: run.totalEmployerBpjs.toString(), description: `BPJS pemberi kerja ${run.number}` },
      { accountCode: PAYROLL_ACCOUNTS.bpjsPayable, credit: run.totalEmployerBpjs.plus(run.lines.reduce((n,l) => n.plus(l.bpjsAmount), D("0"))).toString(), description: `Utang BPJS ${run.number}` },
      ...(totalTax.gt(0) ? [{ accountCode: PAYROLL_ACCOUNTS.pph21Payable, credit: totalTax.toString(), description: `Utang PPh 21 ${run.number}` }] : totalTax.lt(0) ? [{ accountCode: PAYROLL_ACCOUNTS.pph21Payable, debit: totalTax.neg().toString(), description: `Refund PPh 21 ${run.number}` }] : []),
      ...(voluntary.gt(0) ? [{ accountCode: "2107", credit: voluntary.toString(), description: `Potongan sukarela ${run.number}` }] : []),
      { accountCode: PAYROLL_ACCOUNTS.salaryPayable, credit: run.totalNet.toString(), description: `Utang gaji ${run.number}` },
    ].filter(line => D("debit" in line ? String(line.debit ?? 0) : String(line.credit ?? 0)).gt(0)),
  });
  return { ...run, status: "POSTED" };
  });
}
