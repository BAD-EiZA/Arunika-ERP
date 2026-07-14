import {
  adjustReservation,
  getAvailableQty,
  postStockMovement,
} from "@/server/services/inventory";

const prismaMock = {
  stockBalance: {
    findFirst: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  prisma: {
    stockBalance: {
      findFirst: (...args: unknown[]) => prismaMock.stockBalance.findFirst(...args),
    },
  },
}));

function makeTx(overrides: Record<string, unknown> = {}) {
  const balanceStore: Record<string, unknown> = {};
  return {
    stockMovement: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "m1",
        ...data,
      })),
    },
    product: {
      findFirst: jest.fn(async () => ({
        id: "p1",
        sku: "SKU1",
        type: "STOCK",
        purchasePrice: "100",
        companyId: "c1",
      })),
    },
    stockBalance: {
      findUnique: jest.fn(async () => balanceStore.current ?? null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: "b1", ...data };
        balanceStore.current = row;
        return row;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        balanceStore.current = { ...(balanceStore.current as object), ...data };
        return balanceStore.current;
      }),
    },
    ...overrides,
  };
}

describe("inventory", () => {
  it("returns existing movement for idempotency key", async () => {
    const existing = { id: "exist" };
    const tx = makeTx({
      stockMovement: {
        findUnique: jest.fn(async () => existing),
        create: jest.fn(),
      },
    });
    const r = await postStockMovement(tx as never, {
      companyId: "c1",
      warehouseId: "w1",
      productId: "p1",
      type: "OPENING_BALANCE",
      quantity: 1,
      idempotencyKey: "k1",
    });
    expect(r).toBe(existing);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("continues when idempotency key misses", async () => {
    const tx = makeTx({
      stockMovement: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "m2",
          ...data,
        })),
      },
    });
    const r = await postStockMovement(tx as never, {
      companyId: "c1",
      warehouseId: "w1",
      productId: "p1",
      type: "OPENING_BALANCE",
      quantity: 1,
      idempotencyKey: "missing",
    });
    expect(r.id).toBe("m2");
  });

  it("rejects non-positive quantity", async () => {
    const tx = makeTx();
    await expect(
      postStockMovement(tx as never, {
        companyId: "c1",
        warehouseId: "w1",
        productId: "p1",
        type: "OPENING_BALANCE",
        quantity: 0,
      }),
    ).rejects.toThrow("Kuantitas mutasi harus lebih dari 0");
  });

  it("rejects missing product", async () => {
    const tx = makeTx({
      product: { findFirst: jest.fn(async () => null) },
    });
    await expect(
      postStockMovement(tx as never, {
        companyId: "c1",
        warehouseId: "w1",
        productId: "p1",
        type: "OPENING_BALANCE",
        quantity: 1,
      }),
    ).rejects.toThrow("Produk tidak ditemukan");
  });

  it("rejects non-stock product", async () => {
    const tx = makeTx({
      product: {
        findFirst: jest.fn(async () => ({
          id: "p1",
          sku: "S",
          type: "SERVICE",
          purchasePrice: "0",
        })),
      },
    });
    await expect(
      postStockMovement(tx as never, {
        companyId: "c1",
        warehouseId: "w1",
        productId: "p1",
        type: "OPENING_BALANCE",
        quantity: 1,
      }),
    ).rejects.toThrow("Hanya produk stok");
  });

  it("posts inbound opening balance and creates balance", async () => {
    const tx = makeTx();
    const r = await postStockMovement(tx as never, {
      companyId: "c1",
      warehouseId: "w1",
      productId: "p1",
      type: "OPENING_BALANCE",
      quantity: 10,
      unitCost: 50,
    });
    expect(r.id).toBe("m1");
    expect(tx.stockBalance.create).toHaveBeenCalled();
    expect(tx.stockBalance.update).toHaveBeenCalled();
    expect(tx.stockMovement.create).toHaveBeenCalled();
  });

  it("posts inbound onto existing balance and recomputes avg", async () => {
    const tx = makeTx({
      stockBalance: {
        findUnique: jest.fn(async () => ({
          id: "b1",
          quantityOnHand: "10",
          quantityReserved: "0",
          averageCost: "100",
        })),
        create: jest.fn(),
        update: jest.fn(async ({ data }: { data: unknown }) => data),
      },
    });
    await postStockMovement(tx as never, {
      companyId: "c1",
      warehouseId: "w1",
      productId: "p1",
      type: "PURCHASE_RECEIPT",
      quantity: 10,
      unitCost: 200,
    });
    expect(tx.stockBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantityOnHand: "20.0000",
          averageCost: "150.00",
        }),
      }),
    );
  });

  it("rejects outbound when insufficient stock", async () => {
    const tx = makeTx({
      stockBalance: {
        findUnique: jest.fn(async () => ({
          id: "b1",
          quantityOnHand: "1",
          quantityReserved: "0",
          averageCost: "10",
        })),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    await expect(
      postStockMovement(tx as never, {
        companyId: "c1",
        warehouseId: "w1",
        productId: "p1",
        type: "SALES_DELIVERY",
        quantity: 5,
      }),
    ).rejects.toThrow("Stok tidak mencukupi");
  });

  it("allows negative stock when flag set", async () => {
    const tx = makeTx({
      stockBalance: {
        findUnique: jest.fn(async () => ({
          id: "b1",
          quantityOnHand: "1",
          quantityReserved: "0",
          averageCost: "10",
        })),
        create: jest.fn(),
        update: jest.fn(async ({ data }: { data: unknown }) => data),
      },
    });
    await postStockMovement(tx as never, {
      companyId: "c1",
      warehouseId: "w1",
      productId: "p1",
      type: "SALES_DELIVERY",
      quantity: 5,
      allowNegative: true,
    });
    expect(tx.stockMovement.create).toHaveBeenCalled();
  });

  it("adjustReservation creates balance and updates", async () => {
    const tx = makeTx();
    await adjustReservation(tx as never, {
      companyId: "c1",
      warehouseId: "w1",
      productId: "p1",
      delta: 3,
    });
    expect(tx.stockBalance.create).toHaveBeenCalled();
    expect(tx.stockBalance.update).toHaveBeenCalled();
  });

  it("adjustReservation rejects negative result", async () => {
    const tx = makeTx({
      stockBalance: {
        findUnique: jest.fn(async () => ({
          id: "b1",
          quantityOnHand: "0",
          quantityReserved: "1",
          averageCost: "0",
        })),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    await expect(
      adjustReservation(tx as never, {
        companyId: "c1",
        warehouseId: "w1",
        productId: "p1",
        delta: -5,
      }),
    ).rejects.toThrow("Reservasi tidak valid");
  });

  it("getAvailableQty returns 0 without balance", async () => {
    prismaMock.stockBalance.findFirst.mockResolvedValue(null);
    const q = await getAvailableQty("c1", "w1", "p1");
    expect(q.toString()).toBe("0");
  });

  it("getAvailableQty subtracts reserved", async () => {
    prismaMock.stockBalance.findFirst.mockResolvedValue({
      quantityOnHand: "10",
      quantityReserved: "3",
    });
    const q = await getAvailableQty("c1", "w1", "p1");
    expect(q.toString()).toBe("7");
  });

  it("posts without idempotency key", async () => {
    const tx = makeTx();
    await postStockMovement(tx as never, {
      companyId: "c1",
      warehouseId: "w1",
      productId: "p1",
      type: "ADJUSTMENT_IN",
      quantity: 2,
    });
    expect(tx.stockMovement.findUnique).not.toHaveBeenCalled();
  });
});
