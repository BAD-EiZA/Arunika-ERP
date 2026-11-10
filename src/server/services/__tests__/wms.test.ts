const db = {
  warehouse: { findFirst: jest.fn(async () => ({ id: "w1", companyId: "c1", branchId: "br1" })) },
  product: { findFirst: jest.fn(async () => ({ id: "p1", companyId: "c1", type: "STOCK" })) },
  warehouseBin: {
    findFirst: jest.fn(),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "bin1", ...data })),
  },
  stockBalance: {
    findUnique: jest.fn(async () => ({ id: "b1", quantityOnHand: "10", quantityReserved: "0", averageCost: "0" })),
  },
  stockBinBalance: {
    aggregate: jest.fn(async () => ({ _sum: { quantity: "0" } })),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "sbb1", ...data })),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_, key) => db[key as keyof typeof db] }),
}));

import { createWarehouseBin, pickFromBin, putawayToBin } from "@/server/services/wms";

describe("wms tenant guards", () => {
  it("serializes putaway capacity checks within a transaction", async () => {
    const tx = { ...db, $executeRaw: jest.fn(async () => 1) };
    db.$transaction.mockImplementation(async (run) => run(tx));
    db.warehouseBin.findFirst.mockResolvedValueOnce({ id: "bin1", companyId: "c1", warehouseId: "w1" });
    await putawayToBin({ companyId: "c1", warehouseId: "w1", binId: "bin1", productId: "p1", quantity: 3 });
    expect(db.$transaction).toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(db.stockBinBalance.aggregate.mock.invocationCallOrder[0]);
    expect(db.stockBinBalance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: "3.0000" }) }));
  });
  it("serializes bin picks before reading quantity", async () => {
    const tx = { ...db, $executeRaw: jest.fn(async () => 1) };
    db.$transaction.mockImplementation(async (run) => run(tx));
    db.warehouseBin.findFirst.mockResolvedValueOnce({ id: "bin1", companyId: "c1", warehouseId: "w1" });
    db.stockBinBalance.findUnique.mockResolvedValueOnce({ id: "sbb1", companyId: "c1", warehouseId: "w1", quantity: "4" });
    await pickFromBin({ companyId: "c1", binId: "bin1", productId: "p1", quantity: 3 });
    expect(db.$transaction).toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(db.stockBinBalance.findUnique.mock.invocationCallOrder[0]);
    expect(db.stockBinBalance.update).toHaveBeenCalledWith({ where: { id: "sbb1" }, data: { quantity: "1.0000" } });
  });
  beforeEach(() => jest.clearAllMocks());

  it("createWarehouseBin rejects warehouse from another company", async () => {
    db.warehouse.findFirst.mockResolvedValueOnce(null);
    await expect(createWarehouseBin({
      companyId: "c1", warehouseId: "foreign", code: "A1", name: "Aisle 1",
    })).rejects.toThrow("Gudang tidak ditemukan");
    expect(db.warehouseBin.create).not.toHaveBeenCalled();
  });

  it("createWarehouseBin rejects warehouse outside user access", async () => {
    await expect(createWarehouseBin({
      companyId: "c1", warehouseId: "w1", code: "A1", name: "A1",
      access: { branchIds: ["br1"], warehouseIds: ["other"] },
    })).rejects.toThrow();
    expect(db.warehouseBin.create).not.toHaveBeenCalled();
  });

  it("putaway rejects a product outside the company", async () => {
    db.product.findFirst.mockResolvedValueOnce(null);
    db.warehouseBin.findFirst.mockResolvedValueOnce({ id: "bin1", companyId: "c1", warehouseId: "w1" });
    await expect(putawayToBin({
      companyId: "c1", warehouseId: "w1", binId: "bin1", productId: "foreign", quantity: 1,
    })).rejects.toThrow("Produk tidak ditemukan");
    expect(db.stockBinBalance.create).not.toHaveBeenCalled();
  });

  it("putawayToBin rejects when warehouse not owned by company", async () => {
    db.warehouse.findFirst.mockResolvedValueOnce(null);
    await expect(putawayToBin({
      companyId: "c1", warehouseId: "foreign", binId: "bin1", productId: "p1", quantity: 1,
    })).rejects.toThrow("Gudang tidak ditemukan");
    expect(db.stockBinBalance.create).not.toHaveBeenCalled();
  });

  it("pickFromBin rejects when bin warehouse not owned by company", async () => {
    db.warehouseBin.findFirst.mockResolvedValueOnce(null);
    await expect(pickFromBin({
      companyId: "c1", binId: "foreignBin", productId: "p1", quantity: 1,
    })).rejects.toThrow("Bin tidak ditemukan");
    expect(db.stockBinBalance.update).not.toHaveBeenCalled();
  });
});
