import {
  approveSalesOrder,
  createSalesOrder,
  issueInvoiceFromDelivery,
  postCustomerPayment,
  postDeliveryOrder,
} from "@/server/services/sales";

const prismaMock = {
  $transaction: jest.fn(),
  salesOrder: {
    findFirst: jest.fn(),
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
  nextDocumentNumber: jest.fn(async () => "SO/001"),
}));

jest.mock("@/lib/idempotency", () => ({
  newIdempotencyKey: jest.fn(() => "idem-do"),
}));

jest.mock("@/server/services/accounting", () => ({
  postFromRule: jest.fn(async () => null),
}));

jest.mock("@/server/services/inventory", () => ({
  postStockMovement: jest.fn(async () => ({ id: "m1" })),
  adjustReservation: jest.fn(async () => undefined),
}));

jest.mock("@/server/services/notifications", () => ({
  notifyUser: jest.fn(async () => ({ id: "n1" })),
}));

describe("sales", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        salesOrder: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "so1",
            number: "SO/001",
            ...data,
            items: [],
            customer: { id: "cu" },
          })),
          findFirst: jest.fn(),
          update: jest.fn(async ({ data }: { data: unknown }) => data),
        },
        salesOrderItem: {
          update: jest.fn(async () => ({})),
          findMany: jest.fn(async () => []),
        },
        stockReservation: {
          create: jest.fn(async () => ({})),
          update: jest.fn(async () => ({})),
        },
        deliveryOrder: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({
            id: "do1",
            number: "DO/1",
            items: [{ productId: "p1", quantityDelivered: "2" }],
          })),
          findFirst: jest.fn(),
        },
        stockBalance: {
          findUnique: jest.fn(async () => ({ averageCost: "50" })),
        },
        salesInvoice: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "inv1",
            number: "INV/1",
            ...data,
            items: [
              {
                productId: "p1",
                quantity: "2",
              },
            ],
          })),
          findFirst: jest.fn(),
          update: jest.fn(async () => ({})),
        },
        customerPayment: {
          create: jest.fn(async () => ({ id: "cp1", number: "CP/1" })),
        },
      };
      return fn(tx);
    });
  });

  it("createSalesOrder validates", async () => {
    await expect(
      createSalesOrder({
        companyId: "c",
        userId: "u",
        customerId: "cu",
        items: [],
      }),
    ).rejects.toThrow("Minimal 1 item");

    await expect(
      createSalesOrder({
        companyId: "c",
        userId: "u",
        customerId: "cu",
        items: [{ productId: "p", quantity: 0, unitPrice: 1 }],
      }),
    ).rejects.toThrow("Kuantitas harus > 0");

    const so = await createSalesOrder({
      companyId: "c",
      userId: "u",
      customerId: "cu",
      branchId: "b",
      warehouseId: "w",
      notes: "n",
      items: [
        {
          productId: "p1",
          quantity: 2,
          unitPrice: 100,
          discountAmount: 5,
          taxAmount: 11,
          description: "line",
        },
      ],
    });
    expect(so.id).toBe("so1");
  });

  it("approveSalesOrder branches", async () => {
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        salesOrder: { findFirst: jest.fn(async () => null) },
      }),
    );
    await expect(approveSalesOrder("c", "u", "x")).rejects.toThrow("SO tidak ditemukan");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        salesOrder: {
          findFirst: jest.fn(async () => ({
            id: "so",
            status: "DELIVERED",
            number: "SO1",
            items: [],
            company: { settings: null },
          })),
        },
      }),
    );
    await expect(approveSalesOrder("c", "u", "so")).rejects.toThrow(
      "SO tidak dapat disetujui",
    );

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        salesOrder: {
          findFirst: jest.fn(async () => ({
            id: "so",
            status: "DRAFT",
            number: "SO1",
            warehouseId: "w",
            items: [{ productId: "p1", quantity: "2" }],
            company: { settings: { reserveOnSoApprove: true } },
          })),
          update: jest.fn(async () => ({ id: "so", status: "APPROVED" })),
        },
        stockReservation: { create: jest.fn(async () => ({})) },
      }),
    );
    await approveSalesOrder("c", "u", "so");

    // no reserve flag
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        salesOrder: {
          findFirst: jest.fn(async () => ({
            id: "so",
            status: "PENDING_APPROVAL",
            number: "SO1",
            warehouseId: null,
            items: [],
            company: { settings: { reserveOnSoApprove: false } },
          })),
          update: jest.fn(async () => ({ id: "so", status: "APPROVED" })),
        },
      }),
    );
    await approveSalesOrder("c", "u", "so");

    // settings null => reserve default true with warehouse
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        salesOrder: {
          findFirst: jest.fn(async () => ({
            id: "so",
            status: "DRAFT",
            number: "SO1",
            warehouseId: "w",
            items: [{ productId: "p1", quantity: "1" }],
            company: { settings: null },
          })),
          update: jest.fn(async () => ({ id: "so", status: "APPROVED" })),
        },
        stockReservation: { create: jest.fn(async () => ({})) },
      }),
    );
    await approveSalesOrder("c", "u", "so");
  });

  it("postDeliveryOrder branches", async () => {
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: { findUnique: jest.fn(async () => ({ id: "exist" })) },
      }),
    );
    expect(
      await postDeliveryOrder({
        companyId: "c",
        userId: "u",
        salesOrderId: "so",
        warehouseId: "w",
        items: [{ productId: "p1", quantityDelivered: 1 }],
        idempotencyKey: "k",
      }),
    ).toEqual({ id: "exist" });

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: { findUnique: jest.fn(async () => null) },
        salesOrder: { findFirst: jest.fn(async () => null) },
      }),
    );
    await expect(
      postDeliveryOrder({
        companyId: "c",
        userId: "u",
        salesOrderId: "so",
        warehouseId: "w",
        items: [{ productId: "p1", quantityDelivered: 1 }],
      }),
    ).rejects.toThrow("SO tidak ditemukan");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: { findUnique: jest.fn(async () => null) },
        salesOrder: {
          findFirst: jest.fn(async () => ({
            id: "so",
            status: "DRAFT",
            items: [],
            company: {},
            reservations: [],
          })),
        },
      }),
    );
    await expect(
      postDeliveryOrder({
        companyId: "c",
        userId: "u",
        salesOrderId: "so",
        warehouseId: "w",
        items: [{ productId: "p1", quantityDelivered: 1 }],
      }),
    ).rejects.toThrow("SO belum siap dikirim");

    const soBase = {
      id: "so",
      status: "APPROVED",
      customerId: "cu",
      company: { allowNegativeStock: false },
      items: [
        {
          id: "soi1",
          productId: "p1",
          quantity: "5",
          quantityDelivered: "0",
          unitPrice: "100",
        },
      ],
      reservations: [
        { id: "r1", productId: "p1", quantity: "5" },
      ],
    };

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: { findUnique: jest.fn(async () => null) },
        salesOrder: { findFirst: jest.fn(async () => soBase) },
      }),
    );
    await expect(
      postDeliveryOrder({
        companyId: "c",
        userId: "u",
        salesOrderId: "so",
        warehouseId: "w",
        items: [{ productId: "other", quantityDelivered: 1 }],
      }),
    ).rejects.toThrow("Produk tidak ada di SO");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: { findUnique: jest.fn(async () => null) },
        salesOrder: { findFirst: jest.fn(async () => soBase) },
      }),
    );
    await expect(
      postDeliveryOrder({
        companyId: "c",
        userId: "u",
        salesOrderId: "so",
        warehouseId: "w",
        items: [{ productId: "p1", quantityDelivered: 0 }],
      }),
    ).rejects.toThrow("Qty kirim harus > 0");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: { findUnique: jest.fn(async () => null) },
        salesOrder: { findFirst: jest.fn(async () => soBase) },
      }),
    );
    await expect(
      postDeliveryOrder({
        companyId: "c",
        userId: "u",
        salesOrderId: "so",
        warehouseId: "w",
        items: [{ productId: "p1", quantityDelivered: 99 }],
      }),
    ).rejects.toThrow("Pengiriman melebihi sisa SO");

    // success partial delivery
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({
            id: "do1",
            number: "DO/1",
            items: [{ productId: "p1", quantityDelivered: "2" }],
          })),
        },
        salesOrder: {
          findFirst: jest.fn(async () => soBase),
          update: jest.fn(async () => ({})),
        },
        salesOrderItem: {
          update: jest.fn(async () => ({})),
          findMany: jest.fn(async () => [
            { quantity: "5", quantityDelivered: "2" },
          ]),
        },
        stockBalance: {
          findUnique: jest.fn(async () => null),
        },
        stockReservation: {
          update: jest.fn(async () => ({})),
        },
      }),
    );
    const d = await postDeliveryOrder({
      companyId: "c",
      userId: "u",
      salesOrderId: "so",
      warehouseId: "w",
      notes: "n",
      items: [{ productId: "p1", quantityDelivered: 2 }],
    });
    expect(d.id).toBe("do1");

    // full delivery releases reservation fully
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({
            id: "do2",
            number: "DO/2",
            items: [{ productId: "p1", quantityDelivered: "5" }],
          })),
        },
        salesOrder: {
          findFirst: jest.fn(async () => soBase),
          update: jest.fn(async () => ({})),
        },
        salesOrderItem: {
          update: jest.fn(async () => ({})),
          findMany: jest.fn(async () => [
            { quantity: "5", quantityDelivered: "5" },
          ]),
        },
        stockBalance: {
          findUnique: jest.fn(async () => ({ averageCost: "10" })),
        },
        stockReservation: {
          update: jest.fn(async () => ({})),
        },
      }),
    );
    await postDeliveryOrder({
      companyId: "c",
      userId: "u",
      salesOrderId: "so",
      warehouseId: "w",
      items: [{ productId: "p1", quantityDelivered: 5 }],
    });

    // reservation product mismatch continues; status stays when no qty delivered in refresh
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({
            id: "do3",
            number: "DO/3",
            items: [{ productId: "p1", quantityDelivered: "1" }],
          })),
        },
        salesOrder: {
          findFirst: jest.fn(async () => ({
            ...soBase,
            reservations: [{ id: "r2", productId: "other", quantity: "1" }],
          })),
          update: jest.fn(async () => ({})),
        },
        salesOrderItem: {
          update: jest.fn(async () => ({})),
          findMany: jest.fn(async () => [
            { quantity: "5", quantityDelivered: "0" },
          ]),
        },
        stockBalance: {
          findUnique: jest.fn(async () => ({ averageCost: "10" })),
        },
        stockReservation: {
          update: jest.fn(async () => ({})),
        },
      }),
    );
    await postDeliveryOrder({
      companyId: "c",
      userId: "u",
      salesOrderId: "so",
      warehouseId: "w",
      items: [{ productId: "p1", quantityDelivered: 1 }],
    });
  });

  it("issueInvoiceFromDelivery", async () => {
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: { findFirst: jest.fn(async () => null) },
      }),
    );
    await expect(
      issueInvoiceFromDelivery({
        companyId: "c",
        userId: "u",
        deliveryOrderId: "d",
      }),
    ).rejects.toThrow("Delivery tidak ditemukan");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: {
          findFirst: jest.fn(async () => ({ id: "d", status: "DRAFT" })),
        },
      }),
    );
    await expect(
      issueInvoiceFromDelivery({
        companyId: "c",
        userId: "u",
        deliveryOrderId: "d",
      }),
    ).rejects.toThrow("Delivery belum diposting");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: {
          findFirst: jest.fn(async () => ({
            id: "d",
            status: "POSTED",
            customerId: "cu",
            salesOrderId: "so",
            items: [{ productId: "p1", quantityDelivered: "2" }],
            salesOrder: {
              paymentTermDays: 14,
              items: [
                {
                  id: "soi1",
                  productId: "p1",
                  unitPrice: "100",
                  description: "Prod",
                  quantityInvoiced: "0",
                },
              ],
              customer: { id: "cu" },
            },
          })),
        },
        salesInvoice: {
          create: jest.fn(async () => ({
            id: "inv1",
            number: "INV/1",
            items: [{ productId: "p1", quantity: "2" }],
          })),
        },
        salesOrderItem: {
          update: jest.fn(async () => ({})),
        },
      }),
    );
    const inv = await issueInvoiceFromDelivery({
      companyId: "c",
      userId: "u",
      deliveryOrderId: "d",
      taxRate: 11,
    });
    expect(inv.id).toBe("inv1");

    // no tax, missing so item product, paymentTermDays 0
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        deliveryOrder: {
          findFirst: jest.fn(async () => ({
            id: "d",
            status: "POSTED",
            customerId: "cu",
            salesOrderId: "so",
            items: [{ productId: "p2", quantityDelivered: "1" }],
            salesOrder: {
              paymentTermDays: 0,
              items: [],
              customer: { id: "cu" },
            },
          })),
        },
        salesInvoice: {
          create: jest.fn(async () => ({
            id: "inv2",
            number: "INV/2",
            items: [
              { productId: null, quantity: "1" },
              { productId: "p2", quantity: "1" },
            ],
          })),
        },
        salesOrderItem: { update: jest.fn(async () => ({})) },
      }),
    );
    await issueInvoiceFromDelivery({
      companyId: "c",
      userId: "u",
      deliveryOrderId: "d",
    });
  });

  it("postCustomerPayment", async () => {
    await expect(
      postCustomerPayment({
        companyId: "c",
        userId: "u",
        customerId: "cu",
        amount: 0,
        allocations: [],
      }),
    ).rejects.toThrow("Jumlah pembayaran harus > 0");

    await expect(
      postCustomerPayment({
        companyId: "c",
        userId: "u",
        customerId: "cu",
        amount: 100,
        allocations: [{ invoiceId: "i", amount: 50 }],
      }),
    ).rejects.toThrow("Total alokasi harus sama");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        customerPayment: {
          create: jest.fn(async () => ({ id: "cp1", number: "CP/1" })),
        },
        salesInvoice: { findFirst: jest.fn(async () => null) },
      }),
    );
    await expect(
      postCustomerPayment({
        companyId: "c",
        userId: "u",
        customerId: "cu",
        amount: 100,
        allocations: [{ invoiceId: "i", amount: 100 }],
      }),
    ).rejects.toThrow("Invoice tidak ditemukan");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        customerPayment: {
          create: jest.fn(async () => ({ id: "cp1", number: "CP/1" })),
        },
        salesInvoice: {
          findFirst: jest.fn(async () => ({
            id: "i",
            balance: "50",
            amountPaid: "0",
            total: "50",
          })),
          update: jest.fn(async () => ({})),
        },
      }),
    );
    await expect(
      postCustomerPayment({
        companyId: "c",
        userId: "u",
        customerId: "cu",
        amount: 100,
        allocations: [{ invoiceId: "i", amount: 100 }],
      }),
    ).rejects.toThrow("Alokasi melebihi saldo invoice");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        customerPayment: {
          create: jest.fn(async () => ({ id: "cp1", number: "CP/1" })),
        },
        salesInvoice: {
          findFirst: jest.fn(async () => ({
            id: "i",
            balance: "100",
            amountPaid: "0",
            total: "100",
          })),
          update: jest.fn(async () => ({})),
        },
      }),
    );
    const p = await postCustomerPayment({
      companyId: "c",
      userId: "u",
      customerId: "cu",
      amount: 100,
      method: "CASH",
      reference: "r",
      allocations: [{ invoiceId: "i", amount: 100 }],
    });
    expect(p.id).toBe("cp1");

    // partial payment
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        customerPayment: {
          create: jest.fn(async () => ({ id: "cp2", number: "CP/2" })),
        },
        salesInvoice: {
          findFirst: jest.fn(async () => ({
            id: "i",
            balance: "100",
            amountPaid: "0",
            total: "100",
          })),
          update: jest.fn(async () => ({})),
        },
      }),
    );
    await postCustomerPayment({
      companyId: "c",
      userId: "u",
      customerId: "cu",
      amount: 40,
      allocations: [{ invoiceId: "i", amount: 40 }],
    });
  });
});
