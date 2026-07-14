import {
  approvePurchaseOrder,
  approvePurchaseRequest,
  awardRfq,
  createPurchaseOrder,
  createPurchaseRequest,
  createRfq,
  createSupplierBill,
  postGoodsReceipt,
  postSupplierPayment,
  reviewThreeWayMatch,
  submitPurchaseOrder,
  submitVendorQuotation,
} from "@/server/services/procurement";

const prismaMock: Record<string, jest.Mock> = {
  $transaction: jest.fn(),
  purchaseOrder: Object.assign(jest.fn(), {
    findFirst: jest.fn(),
    update: jest.fn(),
  }),
  purchaseRequest: Object.assign(jest.fn(), {
    findFirst: jest.fn(),
    update: jest.fn(),
  }),
  vendorQuotation: Object.assign(jest.fn(), {
    create: jest.fn(),
  }),
  goodsReceipt: Object.assign(jest.fn(), {
    findFirst: jest.fn(),
  }),
  supplierBill: Object.assign(jest.fn(), {
    findFirst: jest.fn(),
  }),
  threeWayMatch: Object.assign(jest.fn(), {
    create: jest.fn(),
  }),
};

// rebuild with nested methods
Object.assign(prismaMock, {
  purchaseOrder: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  purchaseRequest: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  vendorQuotation: {
    create: jest.fn(),
  },
  goodsReceipt: {
    findFirst: jest.fn(),
  },
  supplierBill: {
    findFirst: jest.fn(),
  },
  threeWayMatch: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
});

jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

jest.mock("@/lib/audit", () => ({
  writeAudit: jest.fn(async () => undefined),
}));

jest.mock("@/lib/document-number", () => ({
  nextDocumentNumber: jest.fn(async (_tx: unknown, _c: string, type: string) =>
    `${type}/001`,
  ),
}));

jest.mock("@/lib/idempotency", () => ({
  newIdempotencyKey: jest.fn(() => "idem-1"),
}));

jest.mock("@/server/services/accounting", () => ({
  postFromRule: jest.fn(async () => null),
}));

jest.mock("@/server/services/inventory", () => ({
  postStockMovement: jest.fn(async () => ({ id: "m1" })),
}));

jest.mock("@/server/services/notifications", () => ({
  notifyUser: jest.fn(async () => ({ id: "n1" })),
}));

describe("procurement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        purchaseOrder: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "po1",
            number: "PO/001",
            ...data,
            items: [{ id: "poi1", productId: "p1", quantity: "10", quantityReceived: "0", unitPrice: "100" }],
            supplier: { id: "s1", name: "Sup" },
          })),
          findFirst: jest.fn(),
          update: jest.fn(async ({ data }: { data: unknown }) => data),
          item: {},
        },
        purchaseOrderItem: {
          findMany: jest.fn(async () => [
            { id: "poi1", productId: "p1", quantity: "10", quantityReceived: "10" },
          ]),
          update: jest.fn(async () => ({})),
        },
        goodsReceipt: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "gr1",
            number: "GR/001",
            ...data,
            items: [
              {
                id: "gri1",
                productId: "p1",
                quantityReceived: "5",
                unitCost: "100",
              },
            ],
          })),
        },
        supplierBill: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "sb1",
            number: "SB/001",
            ...data,
            items: [],
          })),
          findFirst: jest.fn(),
          update: jest.fn(async () => ({})),
        },
        supplierPayment: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "sp1",
            number: "SP/001",
            ...data,
          })),
        },
        purchaseRequest: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "pr1",
            number: "PR/001",
            ...data,
            items: [],
          })),
        },
        requestForQuotation: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "rfq1",
            number: "RFQ/001",
            ...data,
            vendors: [],
          })),
          update: jest.fn(async () => ({})),
        },
        vendorQuotation: {
          findFirst: jest.fn(),
          updateMany: jest.fn(async () => ({})),
          update: jest.fn(async () => ({})),
          create: jest.fn(async ({ data }: { data: unknown }) => ({
            id: "vq1",
            ...(data as object),
            items: [],
          })),
        },
      };
      return fn(tx);
    });
  });

  it("createPurchaseOrder validates items", async () => {
    await expect(
      createPurchaseOrder({
        companyId: "c",
        userId: "u",
        supplierId: "s",
        items: [],
      }),
    ).rejects.toThrow("Minimal 1 item");

    await expect(
      createPurchaseOrder({
        companyId: "c",
        userId: "u",
        supplierId: "s",
        items: [{ productId: "p", quantity: 0, unitPrice: 1 }],
      }),
    ).rejects.toThrow("Kuantitas harus > 0");

    const po = await createPurchaseOrder({
      companyId: "c",
      userId: "u",
      supplierId: "s",
      branchId: "b",
      warehouseId: "w",
      notes: "n",
      items: [{ productId: "p1", quantity: 2, unitPrice: 100, discountAmount: 0, taxAmount: 0 }],
    });
    expect(po.id).toBe("po1");
  });

  it("submit and approve PO", async () => {
    prismaMock.purchaseOrder.findFirst.mockResolvedValue(null);
    await expect(submitPurchaseOrder("c", "u", "x")).rejects.toThrow("PO tidak ditemukan");

    prismaMock.purchaseOrder.findFirst.mockResolvedValue({ id: "po", status: "APPROVED" });
    await expect(submitPurchaseOrder("c", "u", "po")).rejects.toThrow(
      "PO tidak dalam status draft",
    );

    prismaMock.purchaseOrder.findFirst.mockResolvedValue({ id: "po", status: "DRAFT", number: "PO1" });
    prismaMock.purchaseOrder.update.mockResolvedValue({ id: "po", status: "PENDING_APPROVAL" });
    await submitPurchaseOrder("c", "u", "po");

    prismaMock.purchaseOrder.findFirst.mockResolvedValue(null);
    await expect(approvePurchaseOrder("c", "u", "x")).rejects.toThrow("PO tidak ditemukan");

    prismaMock.purchaseOrder.findFirst.mockResolvedValue({ id: "po", status: "RECEIVED", number: "PO1" });
    await expect(approvePurchaseOrder("c", "u", "po")).rejects.toThrow("PO tidak dapat disetujui");

    prismaMock.purchaseOrder.findFirst.mockResolvedValue({
      id: "po",
      status: "PENDING_APPROVAL",
      number: "PO1",
    });
    prismaMock.purchaseOrder.update.mockResolvedValue({ id: "po", status: "APPROVED" });
    await approvePurchaseOrder("c", "u", "po");
  });

  it("postGoodsReceipt happy and error paths", async () => {
    // existing idempotency
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: {
          findUnique: jest.fn(async () => ({ id: "exist" })),
        },
      }),
    );
    const existing = await postGoodsReceipt({
      companyId: "c",
      userId: "u",
      purchaseOrderId: "po",
      warehouseId: "w",
      items: [{ productId: "p1", quantityReceived: 1 }],
      idempotencyKey: "k",
    });
    expect(existing).toEqual({ id: "exist" });

    // empty items
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: { findUnique: jest.fn(async () => null) },
        purchaseOrder: {
          findFirst: jest.fn(async () => ({
            id: "po",
            status: "APPROVED",
            items: [],
            company: { allowNegativeStock: false },
            supplierId: "s",
          })),
        },
      }),
    );
    await expect(
      postGoodsReceipt({
        companyId: "c",
        userId: "u",
        purchaseOrderId: "po",
        warehouseId: "w",
        items: [],
      }),
    ).rejects.toThrow("Minimal 1 item diterima");

    // PO not found
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: { findUnique: jest.fn(async () => null) },
        purchaseOrder: { findFirst: jest.fn(async () => null) },
      }),
    );
    await expect(
      postGoodsReceipt({
        companyId: "c",
        userId: "u",
        purchaseOrderId: "po",
        warehouseId: "w",
        items: [{ productId: "p1", quantityReceived: 1 }],
      }),
    ).rejects.toThrow("PO tidak ditemukan");

    // bad status
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: { findUnique: jest.fn(async () => null) },
        purchaseOrder: {
          findFirst: jest.fn(async () => ({
            id: "po",
            status: "DRAFT",
            items: [],
            company: { allowNegativeStock: false },
            supplierId: "s",
          })),
        },
      }),
    );
    await expect(
      postGoodsReceipt({
        companyId: "c",
        userId: "u",
        purchaseOrderId: "po",
        warehouseId: "w",
        items: [{ productId: "p1", quantityReceived: 1 }],
      }),
    ).rejects.toThrow("PO belum siap diterima");

    // success partial
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({
            id: "gr1",
            number: "GR/1",
            items: [
              { productId: "p1", quantityReceived: "5", unitCost: "100" },
            ],
          })),
        },
        purchaseOrder: {
          findFirst: jest.fn(async () => ({
            id: "po",
            status: "APPROVED",
            supplierId: "s",
            company: { allowNegativeStock: false },
            items: [
              {
                id: "poi1",
                productId: "p1",
                quantity: "10",
                quantityReceived: "0",
                unitPrice: "100",
              },
            ],
          })),
          update: jest.fn(async () => ({})),
        },
        purchaseOrderItem: {
          update: jest.fn(async () => ({})),
          findMany: jest.fn(async () => [
            { quantity: "10", quantityReceived: "5" },
          ]),
        },
      }),
    );
    const gr = await postGoodsReceipt({
      companyId: "c",
      userId: "u",
      purchaseOrderId: "po",
      warehouseId: "w",
      supplierDeliveryNote: "SJ",
      notes: "n",
      items: [{ productId: "p1", quantityReceived: 5 }],
    });
    expect(gr.id).toBe("gr1");

    // product not on PO / qty errors
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: { findUnique: jest.fn(async () => null) },
        purchaseOrder: {
          findFirst: jest.fn(async () => ({
            id: "po",
            status: "APPROVED",
            supplierId: "s",
            company: { allowNegativeStock: false },
            items: [
              {
                id: "poi1",
                productId: "p1",
                quantity: "10",
                quantityReceived: "0",
                unitPrice: "100",
              },
            ],
          })),
        },
      }),
    );
    await expect(
      postGoodsReceipt({
        companyId: "c",
        userId: "u",
        purchaseOrderId: "po",
        warehouseId: "w",
        items: [{ productId: "other", quantityReceived: 1 }],
      }),
    ).rejects.toThrow("Produk tidak ada di PO");
  });

  it("postGoodsReceipt qty validation branches", async () => {
    const basePo = {
      id: "po",
      status: "APPROVED",
      supplierId: "s",
      company: { allowNegativeStock: false },
      items: [
        {
          id: "poi1",
          productId: "p1",
          quantity: "10",
          quantityReceived: "0",
          unitPrice: "100",
        },
      ],
    };

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: { findUnique: jest.fn(async () => null) },
        purchaseOrder: { findFirst: jest.fn(async () => basePo) },
      }),
    );
    await expect(
      postGoodsReceipt({
        companyId: "c",
        userId: "u",
        purchaseOrderId: "po",
        warehouseId: "w",
        items: [{ productId: "p1", quantityReceived: 0 }],
      }),
    ).rejects.toThrow("Qty diterima harus > 0");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: { findUnique: jest.fn(async () => null) },
        purchaseOrder: { findFirst: jest.fn(async () => basePo) },
      }),
    );
    await expect(
      postGoodsReceipt({
        companyId: "c",
        userId: "u",
        purchaseOrderId: "po",
        warehouseId: "w",
        items: [{ productId: "p1", quantityReceived: 99 }],
      }),
    ).rejects.toThrow("Penerimaan melebihi sisa PO");

    // full receive updates status RECEIVED
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({
            id: "gr1",
            number: "GR/1",
            items: [{ productId: "p1", quantityReceived: "10", unitCost: "100" }],
          })),
        },
        purchaseOrder: {
          findFirst: jest.fn(async () => basePo),
          update: jest.fn(async () => ({})),
        },
        purchaseOrderItem: {
          update: jest.fn(async () => ({})),
          findMany: jest.fn(async () => [
            { quantity: "10", quantityReceived: "10" },
          ]),
        },
      }),
    );
    await postGoodsReceipt({
      companyId: "c",
      userId: "u",
      purchaseOrderId: "po",
      warehouseId: "w",
      items: [{ productId: "p1", quantityReceived: 10, unitCost: 100 }],
    });

    // anyReceived false branch (refresh shows zero) keeps previous status
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        goodsReceipt: {
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({
            id: "gr1",
            number: "GR/1",
            items: [{ productId: "p1", quantityReceived: "1", unitCost: "100" }],
          })),
        },
        purchaseOrder: {
          findFirst: jest.fn(async () => basePo),
          update: jest.fn(async () => ({})),
        },
        purchaseOrderItem: {
          update: jest.fn(async () => ({})),
          findMany: jest.fn(async () => [
            { quantity: "10", quantityReceived: "0" },
          ]),
        },
      }),
    );
    await postGoodsReceipt({
      companyId: "c",
      userId: "u",
      purchaseOrderId: "po",
      warehouseId: "w",
      items: [{ productId: "p1", quantityReceived: 1 }],
    });
  });

  it("createSupplierBill and payment", async () => {
    await expect(
      createSupplierBill({
        companyId: "c",
        userId: "u",
        supplierId: "s",
        items: [],
      }),
    ).rejects.toThrow("Minimal 1 item");

    const bill = await createSupplierBill({
      companyId: "c",
      userId: "u",
      supplierId: "s",
      purchaseOrderId: "po",
      supplierInvoiceNo: "INV-S",
      dueDate: new Date(),
      items: [
        {
          productId: "p1",
          description: "Item",
          quantity: 1,
          unitPrice: 100,
          taxAmount: 11,
        },
      ],
    });
    expect(bill.id).toBe("sb1");

    await expect(
      postSupplierPayment({
        companyId: "c",
        userId: "u",
        supplierId: "s",
        amount: 0,
        allocations: [],
      }),
    ).rejects.toThrow("Jumlah pembayaran harus > 0");

    await expect(
      postSupplierPayment({
        companyId: "c",
        userId: "u",
        supplierId: "s",
        amount: 100,
        allocations: [{ billId: "b1", amount: 50 }],
      }),
    ).rejects.toThrow("Total alokasi harus sama");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        supplierPayment: {
          create: jest.fn(async () => ({ id: "sp1", number: "SP/1" })),
        },
        supplierBill: {
          findFirst: jest.fn(async () => null),
        },
      }),
    );
    await expect(
      postSupplierPayment({
        companyId: "c",
        userId: "u",
        supplierId: "s",
        amount: 100,
        allocations: [{ billId: "b1", amount: 100 }],
      }),
    ).rejects.toThrow("Tagihan tidak ditemukan");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        supplierPayment: {
          create: jest.fn(async () => ({ id: "sp1", number: "SP/1" })),
        },
        supplierBill: {
          findFirst: jest.fn(async () => ({
            id: "b1",
            balance: "50",
            amountPaid: "0",
            total: "50",
          })),
          update: jest.fn(async () => ({})),
        },
      }),
    );
    await expect(
      postSupplierPayment({
        companyId: "c",
        userId: "u",
        supplierId: "s",
        amount: 100,
        allocations: [{ billId: "b1", amount: 100 }],
      }),
    ).rejects.toThrow("Alokasi melebihi saldo tagihan");

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        supplierPayment: {
          create: jest.fn(async () => ({ id: "sp1", number: "SP/1" })),
        },
        supplierBill: {
          findFirst: jest.fn(async () => ({
            id: "b1",
            balance: "100",
            amountPaid: "0",
            total: "100",
          })),
          update: jest.fn(async () => ({})),
        },
      }),
    );
    const pay = await postSupplierPayment({
      companyId: "c",
      userId: "u",
      supplierId: "s",
      amount: 100,
      method: "CASH",
      reference: "r",
      allocations: [{ billId: "b1", amount: 100 }],
    });
    expect(pay.id).toBe("sp1");

    // partial payment => PARTIALLY_PAID
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        supplierPayment: {
          create: jest.fn(async () => ({ id: "sp2", number: "SP/2" })),
        },
        supplierBill: {
          findFirst: jest.fn(async () => ({
            id: "b1",
            balance: "100",
            amountPaid: "0",
            total: "100",
          })),
          update: jest.fn(async () => ({})),
        },
      }),
    );
    await postSupplierPayment({
      companyId: "c",
      userId: "u",
      supplierId: "s",
      amount: 40,
      allocations: [{ billId: "b1", amount: 40 }],
    });

    // bill without taxAmount default
    await createSupplierBill({
      companyId: "c",
      userId: "u",
      supplierId: "s",
      items: [{ description: "Item", quantity: 1, unitPrice: 10 }],
    });
  });

  it("PR RFQ award and match", async () => {
    await expect(
      createPurchaseRequest({
        companyId: "c",
        userId: "u",
        items: [],
      }),
    ).rejects.toThrow("Minimal 1 item");

    const pr = await createPurchaseRequest({
      companyId: "c",
      userId: "u",
      branchId: "b",
      notes: "n",
      items: [{ productId: "p1", quantity: 2, notes: "x" }],
    });
    expect(pr.id).toBe("pr1");

    prismaMock.purchaseRequest.findFirst.mockResolvedValue(null);
    await expect(approvePurchaseRequest("c", "u", "x")).rejects.toThrow(
      "PR tidak ditemukan",
    );
    prismaMock.purchaseRequest.findFirst.mockResolvedValue({ id: "pr1" });
    prismaMock.purchaseRequest.update.mockResolvedValue({ id: "pr1", status: "APPROVED" });
    await approvePurchaseRequest("c", "u", "pr1");

    await expect(
      createRfq({ companyId: "c", supplierIds: [] }),
    ).rejects.toThrow("Pilih minimal 1 pemasok");

    const rfq = await createRfq({
      companyId: "c",
      purchaseRequestId: "pr1",
      supplierIds: ["s1", "s2"],
      notes: "n",
      dueDate: new Date(),
    });
    expect(rfq.id).toBe("rfq1");

    prismaMock.vendorQuotation.create.mockResolvedValue({ id: "vq1", items: [] });
    // submitVendorQuotation uses prisma.vendorQuotation.create directly
    prismaMock.$transaction.mockReset();
    // re-bind vendorQuotation.create on prisma root
    (prismaMock as { vendorQuotation: { create: jest.Mock } }).vendorQuotation = {
      create: jest.fn(async ({ data }: { data: unknown }) => ({
        id: "vq1",
        ...(data as object),
        items: [],
      })),
    };

    const q = await submitVendorQuotation({
      companyId: "c",
      rfqId: "rfq1",
      supplierId: "s1",
      items: [
        {
          productId: "p1",
          description: "Item",
          quantity: 1,
          unitPrice: 50,
        },
      ],
    });
    expect(q.id).toBe("vq1");

    // award not found
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        vendorQuotation: {
          findFirst: jest.fn(async () => null),
        },
      }),
    );
    await expect(
      awardRfq({
        companyId: "c",
        userId: "u",
        rfqId: "rfq1",
        quotationId: "vq1",
      }),
    ).rejects.toThrow("Quotation tidak ditemukan");

    // award without product items
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        vendorQuotation: {
          findFirst: jest.fn(async () => ({
            id: "vq1",
            supplierId: "s1",
            subtotal: "0",
            taxAmount: "0",
            total: "0",
            items: [{ productId: null, description: "svc", quantity: "1", unitPrice: "1", total: "1" }],
          })),
          updateMany: jest.fn(async () => ({})),
          update: jest.fn(async () => ({})),
        },
        requestForQuotation: { update: jest.fn(async () => ({})) },
      }),
    );
    const awardedEmpty = await awardRfq({
      companyId: "c",
      userId: "u",
      rfqId: "rfq1",
      quotationId: "vq1",
    });
    expect(awardedEmpty.purchaseOrder).toBeNull();

    // award with products -> PO
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        vendorQuotation: {
          findFirst: jest.fn(async () => ({
            id: "vq1",
            supplierId: "s1",
            subtotal: "100",
            taxAmount: "0",
            total: "100",
            items: [
              {
                productId: "p1",
                description: "Item",
                quantity: "1",
                unitPrice: "100",
                total: "100",
              },
            ],
          })),
          updateMany: jest.fn(async () => ({})),
          update: jest.fn(async () => ({})),
        },
        requestForQuotation: { update: jest.fn(async () => ({})) },
        purchaseOrder: {
          create: jest.fn(async () => ({ id: "po2", number: "PO/2", items: [] })),
        },
      }),
    );
    const awarded = await awardRfq({
      companyId: "c",
      userId: "u",
      rfqId: "rfq1",
      quotationId: "vq1",
      warehouseId: "w",
      branchId: "b",
    });
    expect(awarded.purchaseOrder?.id).toBe("po2");

    prismaMock.goodsReceipt.findFirst.mockResolvedValue(null);
    prismaMock.supplierBill.findFirst.mockResolvedValue(null);
    await expect(
      reviewThreeWayMatch({
        companyId: "c",
        userId: "u",
        goodsReceiptId: "g",
        supplierBillId: "b",
      }),
    ).rejects.toThrow("Dokumen match tidak lengkap");

    prismaMock.goodsReceipt.findFirst.mockResolvedValue({
      id: "gr",
      purchaseOrderId: "po",
      items: [{ quantityReceived: "10", unitCost: "10" }],
    });
    prismaMock.supplierBill.findFirst.mockResolvedValue({
      id: "sb",
      subtotal: "100",
      items: [{ quantity: "10" }],
    });
    prismaMock.threeWayMatch.create.mockResolvedValue({ id: "m", isMatched: true });
    const match = await reviewThreeWayMatch({
      companyId: "c",
      userId: "u",
      goodsReceiptId: "gr",
      supplierBillId: "sb",
    });
    expect(match.id).toBe("m");

    // unmatched variance
    prismaMock.goodsReceipt.findFirst.mockResolvedValue({
      id: "gr",
      purchaseOrderId: "po",
      items: [{ quantityReceived: "5", unitCost: "10" }],
    });
    prismaMock.supplierBill.findFirst.mockResolvedValue({
      id: "sb",
      subtotal: "200",
      items: [{ quantity: "10" }],
    });
    prismaMock.threeWayMatch.create.mockResolvedValue({ id: "m2", isMatched: false });
    await reviewThreeWayMatch({
      companyId: "c",
      userId: "u",
      goodsReceiptId: "gr",
      supplierBillId: "sb",
    });
  });
});
