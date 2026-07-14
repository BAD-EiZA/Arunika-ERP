import {
  closeProductionOrder,
  createBom,
  createWorkCenter,
  releaseProductionOrder,
} from "@/server/services/manufacturing";

const prismaMock = {
  workCenter: { create: jest.fn() },
  billOfMaterials: { create: jest.fn() },
  productionOrder: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

jest.mock("@/lib/audit", () => ({
  writeAudit: jest.fn(async () => undefined),
}));

jest.mock("@/lib/document-number", () => ({
  nextDocumentNumber: jest.fn(async () => "MO/001"),
}));

jest.mock("@/server/services/inventory", () => ({
  postStockMovement: jest.fn(async () => ({ id: "m1" })),
}));

jest.mock("@/server/services/accounting", () => ({
  postFromRule: jest.fn(async () => null),
}));

describe("manufacturing", () => {
  beforeEach(() => jest.clearAllMocks());

  it("createWorkCenter validates", async () => {
    await expect(
      createWorkCenter({ companyId: "c", code: " ", name: "n" }),
    ).rejects.toThrow("Kode dan nama work center wajib");
    prismaMock.workCenter.create.mockResolvedValue({ id: "wc1" });
    await createWorkCenter({ companyId: "c", code: "WC1", name: "Cutting" });
    expect(prismaMock.workCenter.create).toHaveBeenCalled();
  });

  it("createBom validates", async () => {
    await expect(
      createBom({
        companyId: "c",
        code: "B1",
        name: "BOM",
        finishedProductId: "fg",
        items: [],
      }),
    ).rejects.toThrow("BOM minimal 1 komponen");

    await expect(
      createBom({
        companyId: "c",
        code: "B1",
        name: "BOM",
        finishedProductId: "fg",
        items: [{ productId: "fg", quantity: 1 }],
      }),
    ).rejects.toThrow("Komponen tidak boleh sama");

    prismaMock.billOfMaterials.create.mockResolvedValue({ id: "bom1" });
    await createBom({
      companyId: "c",
      code: "B1",
      name: "BOM",
      finishedProductId: "fg",
      items: [{ productId: "rm", quantity: 2, scrapPct: 5 }],
    });
    expect(prismaMock.billOfMaterials.create).toHaveBeenCalled();
  });

  it("release and close production order", async () => {
    prismaMock.productionOrder.findFirst.mockResolvedValue(null);
    await expect(releaseProductionOrder("c", "u", "x")).rejects.toThrow(
      "Production order tidak ditemukan",
    );

    prismaMock.productionOrder.findFirst.mockResolvedValue({
      id: "o1",
      status: "RELEASED",
    });
    await expect(releaseProductionOrder("c", "u", "o1")).rejects.toThrow(
      "Hanya draft yang bisa di-release",
    );

    prismaMock.productionOrder.findFirst.mockResolvedValue({
      id: "o1",
      status: "DRAFT",
    });
    prismaMock.productionOrder.update.mockResolvedValue({
      id: "o1",
      status: "RELEASED",
    });
    await releaseProductionOrder("c", "u", "o1");

    prismaMock.productionOrder.findFirst.mockResolvedValue(null);
    await expect(closeProductionOrder("c", "u", "x")).rejects.toThrow(
      "Production order tidak ditemukan",
    );

    prismaMock.productionOrder.findFirst.mockResolvedValue({
      id: "o1",
      status: "DRAFT",
    });
    await expect(closeProductionOrder("c", "u", "o1")).rejects.toThrow(
      "Order belum bisa ditutup",
    );

    prismaMock.productionOrder.findFirst.mockResolvedValue({
      id: "o1",
      status: "COMPLETED",
    });
    prismaMock.productionOrder.update.mockResolvedValue({
      id: "o1",
      status: "CLOSED",
    });
    await closeProductionOrder("c", "u", "o1");
  });
});
