import {
  createCategory,
  createCustomer,
  createProduct,
  createSupplier,
  getProductOrThrow,
} from "@/server/services/master-data";

const prismaMock = {
  product: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  customer: { create: jest.fn() },
  supplier: { create: jest.fn() },
  productCategory: { create: jest.fn() },
};

jest.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findUnique: (...a: unknown[]) => prismaMock.product.findUnique(...a),
      create: (...a: unknown[]) => prismaMock.product.create(...a),
      findFirst: (...a: unknown[]) => prismaMock.product.findFirst(...a),
    },
    customer: {
      create: (...a: unknown[]) => prismaMock.customer.create(...a),
    },
    supplier: {
      create: (...a: unknown[]) => prismaMock.supplier.create(...a),
    },
    productCategory: {
      create: (...a: unknown[]) => prismaMock.productCategory.create(...a),
    },
  },
}));

describe("master-data", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createProduct validates and creates", async () => {
    await expect(
      createProduct({ companyId: "c", sku: " ", name: "x", unitId: "u" }),
    ).rejects.toThrow("SKU dan nama wajib");
    await expect(
      createProduct({ companyId: "c", sku: "A", name: " ", unitId: "u" }),
    ).rejects.toThrow("SKU dan nama wajib");

    prismaMock.product.findUnique.mockResolvedValue({ id: "1" });
    await expect(
      createProduct({ companyId: "c", sku: "A", name: "N", unitId: "u" }),
    ).rejects.toThrow("SKU sudah digunakan");

    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: "p1" });
    const p = await createProduct({
      companyId: "c",
      sku: " A ",
      name: " Name ",
      unitId: "u",
      purchasePrice: 1,
      salePrice: 2,
      minStock: 3,
      barcode: "b",
      description: "d",
      type: "SERVICE",
      categoryId: "cat",
    });
    expect(p.id).toBe("p1");
    expect(prismaMock.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sku: "A",
          name: "Name",
          type: "SERVICE",
        }),
      }),
    );

    prismaMock.product.create.mockResolvedValue({ id: "p2" });
    await createProduct({ companyId: "c", sku: "B", name: "N2", unitId: "u" });
    expect(prismaMock.product.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "STOCK" }),
      }),
    );
  });

  it("createCustomer validates and creates", async () => {
    await expect(
      createCustomer({ companyId: "c", code: " ", name: "n" }),
    ).rejects.toThrow("Kode dan nama pelanggan wajib");
    await expect(
      createCustomer({ companyId: "c", code: "C", name: " " }),
    ).rejects.toThrow("Kode dan nama pelanggan wajib");

    prismaMock.customer.create.mockResolvedValue({ id: "cu1" });
    await createCustomer({
      companyId: "c",
      code: " C1 ",
      name: " Cust ",
      email: "e",
      phone: "p",
      paymentTermDays: 14,
      creditLimit: 1000,
    });
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: "C1",
          creditLimit: "1000",
          paymentTermDays: 14,
        }),
      }),
    );

    await createCustomer({ companyId: "c", code: "C2", name: "X" });
    expect(prismaMock.customer.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentTermDays: 30,
          creditLimit: null,
        }),
      }),
    );
  });

  it("createSupplier validates and creates", async () => {
    await expect(
      createSupplier({ companyId: "c", code: " ", name: "n" }),
    ).rejects.toThrow("Kode dan nama pemasok wajib");
    await expect(
      createSupplier({ companyId: "c", code: "S", name: " " }),
    ).rejects.toThrow("Kode dan nama pemasok wajib");

    prismaMock.supplier.create.mockResolvedValue({ id: "s1" });
    await createSupplier({
      companyId: "c",
      code: " S1 ",
      name: " Sup ",
      email: "e",
      phone: "p",
    });
    expect(prismaMock.supplier.create).toHaveBeenCalled();

    await createSupplier({ companyId: "c", code: "S2", name: "Y" });
    expect(prismaMock.supplier.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentTermDays: 30 }),
      }),
    );

    await createSupplier({
      companyId: "c",
      code: "S3",
      name: "Z",
      paymentTermDays: 7,
    });
    expect(prismaMock.supplier.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentTermDays: 7 }),
      }),
    );
  });

  it("createCategory", async () => {
    prismaMock.productCategory.create.mockResolvedValue({ id: "cat" });
    await createCategory({
      companyId: "c",
      code: " K ",
      name: " Kat ",
      parentId: "p",
    });
    expect(prismaMock.productCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: "K", name: "Kat", parentId: "p" }),
      }),
    );
  });

  it("getProductOrThrow", async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    await expect(getProductOrThrow("c", "x")).rejects.toThrow(
      "Produk tidak ditemukan",
    );
    prismaMock.product.findFirst.mockResolvedValue({ id: "p1" });
    await expect(getProductOrThrow("c", "p1")).resolves.toEqual({ id: "p1" });
  });
});
