jest.mock("next/headers", () => ({ cookies: jest.fn() }));
test("explicit unknown company never falls back to first membership", async () => {
  const db = prisma as unknown as { membership: { findMany: jest.Mock } };
  db.membership.findMany.mockResolvedValue([{ companyId: "first", company: { isActive: true }, role: { code: "OWNER", permissions: [] }, branchAccess: [], warehouseAccess: [] }]);
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "u", email: "a", name: "a", kindeUserId: "k" });
  const old = { ...process.env };
  process.env.MOCK_AUTH = "true";
  process.env.NODE_ENV = "test";
  try { expect(await auth.getTenantContext("other")).toBeNull(); }
  finally { process.env = old; }
});
jest.mock("@/lib/db", () => ({ prisma: { membership: { findMany: jest.fn() }, user: { findUnique: jest.fn() }, warehouse: { findFirst: jest.fn() }, product: { findFirst: jest.fn() }, goodsReceipt: { findFirst: jest.fn() }, supplierBill: { findFirst: jest.fn() }, purchaseRequest: { findFirst: jest.fn() }, fiscalPeriod: { findFirst: jest.fn() } } }));
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
const boundary = auth as typeof auth & {
  assertResourceAccess: (ctx: auth.TenantContext, model: "warehouse" | "product", id: unknown) => Promise<void>;
  requireIdempotencyKey: (req: Request) => string;
};
const ctx = { companyId: "c", branchIds: ["b"], warehouseIds: ["w"], permissions: new Set() } as auth.TenantContext;

test("production mock auth fails closed before database access", async () => {
  const old = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.MOCK_AUTH = "true";
  try { expect(await auth.getSessionUser()).toBeNull(); expect(prisma.user.findUnique).not.toHaveBeenCalled(); }
  finally { process.env = old; }
});
test("idempotency header required, bounded and returned unchanged", () => {
  expect(() => boundary.requireIdempotencyKey(new Request("http://localhost"))).toThrow();
  expect(boundary.requireIdempotencyKey(new Request("http://localhost", { headers: { "Idempotency-Key": "attempt-123" } }))).toBe("attempt-123");
  expect(() => boundary.requireIdempotencyKey(new Request("http://localhost", { headers: { "Idempotency-Key": "x".repeat(201) } }))).toThrow();
});
test("foreign product denied before mutation", async () => {
  (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
  await expect(boundary.assertResourceAccess(ctx, "product", "foreign")).rejects.toThrow();
  expect(prisma.product.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", companyId: "c" } });
});
test("warehouse scope denial does not query foreign resource", async () => {
  await expect(boundary.assertResourceAccess(ctx, "warehouse", "other")).rejects.toThrow();
  expect(prisma.warehouse.findFirst).not.toHaveBeenCalled();
});

test("body references reject cross-tenant nested product", async () => {
 (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
 await expect(auth.assertRequestAccess(ctx, { items: [{ productId: "foreign" }] })).rejects.toThrow();
});

test.each([
  ["goodsReceiptId", "goodsReceipt"], ["billId", "supplierBill"],
  ["purchaseRequestId", "purchaseRequest"], ["periodId", "fiscalPeriod"],
])("body reference %s resolves through %s", async (key, model) => {
  ((prisma as unknown as Record<string, { findFirst: jest.Mock }>)[model].findFirst).mockResolvedValue(null);
  await expect(auth.assertRequestAccess(ctx, { [key]: "x" })).rejects.toThrow();
});
