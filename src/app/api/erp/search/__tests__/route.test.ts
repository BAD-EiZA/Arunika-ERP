jest.mock("@/lib/db", () => ({
  prisma: {
    product: { findMany: jest.fn() },
    customer: { findMany: jest.fn() },
    supplier: { findMany: jest.fn() },
    purchaseOrder: { findMany: jest.fn() },
    salesOrder: { findMany: jest.fn() },
    salesInvoice: { findMany: jest.fn() },
    supplierBill: { findMany: jest.fn() },
    goodsReceipt: { findMany: jest.fn() },
    deliveryOrder: { findMany: jest.fn() },
    salesReturn: { findMany: jest.fn() },
    purchaseReturn: { findMany: jest.fn() },
    warehouse: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn() }));
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "../route";

const fullCtx = () => ({
  user: { id: "u", email: "e", name: null, kindeUserId: null },
  companyId: "co1",
  membershipId: "m",
  roleCode: "OWNER",
  permissions: "*" as const,
  branchIds: [],
  warehouseIds: [],
});

beforeEach(() => {
  jest.resetAllMocks();
  (requirePermission as jest.Mock).mockResolvedValue(fullCtx());
});

test("query shorter than 3 chars is rejected without touching the DB", async () => {
  const res = await GET(new Request("http://localhost/api/erp/search?q=ab"));
  expect(res.status).toBe(422);
  expect(prisma.product.findMany).not.toHaveBeenCalled();
});

test("filters by tenant and warehouse access; no cross-company rows leak", async () => {
  const ctx = { ...fullCtx(), warehouseIds: ["w1"], branchIds: ["b1"] };
  (requirePermission as jest.Mock).mockResolvedValue(ctx);
  (prisma.warehouse.findMany as jest.Mock).mockResolvedValue([{ id: "w1" }]);
  (prisma.product.findMany as jest.Mock).mockImplementation(({ where }) =>
    [{ id: "p1", sku: "SKU-1", name: "Kursi OTHERCO", companyId: where.companyId }].filter(
      (r) => r.companyId === "co1",
    ),
  );
  for (const m of [
    prisma.customer.findMany,
    prisma.supplier.findMany,
    prisma.salesInvoice.findMany,
    prisma.supplierBill.findMany,
    prisma.salesReturn.findMany,
    prisma.purchaseReturn.findMany,
  ] as jest.Mock[])
    m.mockResolvedValue([]);
  for (const m of [
    prisma.purchaseOrder.findMany,
    prisma.salesOrder.findMany,
    prisma.goodsReceipt.findMany,
    prisma.deliveryOrder.findMany,
  ] as jest.Mock[]) {
    m.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      expect(where.companyId).toBe("co1");
      expect(where).toMatchObject({ warehouseId: { in: ["w1"] }, number: { startsWith: "abc" } });
      expect(JSON.stringify(where)).toContain("b1");
      return [];
    });
  }

  const res = await GET(new Request("http://localhost/api/erp/search?q=abc"));
  const body = (await res.json()) as { results: { products: unknown[] } };
  expect(res.status).toBe(200);
  expect(body.results.products).toHaveLength(1);
  for (const m of [
    prisma.purchaseOrder.findMany,
    prisma.salesOrder.findMany,
    prisma.goodsReceipt.findMany,
    prisma.deliveryOrder.findMany,
  ] as jest.Mock[]) {
    expect(m).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "co1" }),
        take: expect.any(Number),
      }),
    );
  }
});

test("only searches categories the user can view", async () => {
  (requirePermission as jest.Mock).mockResolvedValue({
    ...fullCtx(),
    permissions: new Set(["product:view"]),
  });
  (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

  const res = await GET(new Request("http://localhost/api/erp/search?q=abc"));
  expect(res.status).toBe(200);
  expect(prisma.product.findMany).toHaveBeenCalled();
  for (const m of [
    prisma.customer.findMany,
    prisma.supplier.findMany,
    prisma.purchaseOrder.findMany,
    prisma.salesOrder.findMany,
    prisma.salesInvoice.findMany,
    prisma.supplierBill.findMany,
    prisma.goodsReceipt.findMany,
    prisma.deliveryOrder.findMany,
    prisma.salesReturn.findMany,
    prisma.purchaseReturn.findMany,
  ] as jest.Mock[])
    expect(m).not.toHaveBeenCalled();
});
