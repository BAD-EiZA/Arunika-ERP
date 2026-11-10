const db = { salesReturn: { findFirst: jest.fn() }, $transaction: jest.fn(), emailOutbox: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() } };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn().mockResolvedValue("CN-1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
import { createCreditNoteFromReturn } from "../credit-notes";
import { flushEmailOutbox } from "../notifications";

beforeEach(() => { jest.resetAllMocks(); db.salesReturn.findFirst.mockResolvedValue({ id: "r", companyId: "c", status: "POSTED", items: [] }); });

test.each([["REPLACED", null], ["DRAFT", { id: "replacement" }]])("creation/issuance rejects replacement with settlement %s", async (settlementStatus, replacement) => {
  const tx = {
    $executeRaw: jest.fn(),
    salesReturn: { findFirst: jest.fn().mockResolvedValue({ id: "r", status: "POSTED", settlementStatus }) },
    returnReplacement: { findUnique: jest.fn().mockResolvedValue(replacement) },
    creditNote: { findUnique: jest.fn(), create: jest.fn() },
  };
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
  await expect(createCreditNoteFromReturn({ companyId: "c", userId: "u", salesReturnId: "r" })).rejects.toThrow();
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  expect(tx.$executeRaw.mock.calls[0][1]).toBe("return:sales:r");
  expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.returnReplacement.findUnique.mock.invocationCallOrder[0]);
  expect(tx.returnReplacement.findUnique).toHaveBeenCalledWith({ where: { salesReturnId: "r" } });
  expect(tx.creditNote.create).not.toHaveBeenCalled();
});

test("missing provider retains pending mail without logging bearer token", async () => {
  const env = { ...process.env };
  delete process.env.EMAIL_PROVIDER_URL;
  delete process.env.EMAIL_PROVIDER_TOKEN;
  db.emailOutbox.findMany.mockResolvedValue([{ id: "mail", toEmail: "user@example.test", subject: "Invite", body: "secret-invite-token" }]);
  const log = jest.spyOn(console, "info").mockImplementation(() => {});
  try {
    await flushEmailOutbox();
    expect(db.emailOutbox.update).not.toHaveBeenCalled();
    expect(db.emailOutbox.updateMany).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  } finally { log.mockRestore(); process.env = env; }
});

test("unrecognized provider environment cannot enable fake delivery", async () => {
  const env = { ...process.env };
  process.env.EMAIL_PROVIDER_URL = "https://provider.example.test/send";
  process.env.EMAIL_PROVIDER_TOKEN = "provider-secret";
  process.env.EMAIL_FROM = "sender@example.test";
  db.emailOutbox.findMany.mockResolvedValue([{ id: "mail", toEmail: "user@example.test", subject: "Invite", body: "secret-invite-token" }]);
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
  try {
    await flushEmailOutbox();
    expect(db.emailOutbox.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
    expect(JSON.stringify(db.emailOutbox.update.mock.calls)).not.toContain("secret");
  } finally { global.fetch = originalFetch; process.env = env; }
});

test("no documented transport reports blocked even if fetch would accept", async () => {
  const env = { ...process.env };
  process.env.EMAIL_PROVIDER_URL = "https://provider.example.test/send";
  process.env.EMAIL_PROVIDER_TOKEN = "provider-secret";
  process.env.EMAIL_FROM = "sender@example.test";
  db.emailOutbox.findMany.mockResolvedValue([{ id: "mail", toEmail: "user@example.test", subject: "Invite", body: "invite-token" }]);
  db.emailOutbox.updateMany.mockResolvedValue({ count: 1 });
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  try {
    expect(await flushEmailOutbox()).toEqual({ processed: 0, blocked: true, reason: "EMAIL_TRANSPORT_NOT_CONFIGURED" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(db.emailOutbox.update).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; process.env = env; }
});
