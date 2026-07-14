export const queryKeys = {
  dashboard: ["dashboard"] as const,
  products: {
    all: ["products"] as const,
    list: () => [...queryKeys.products.all, "list"] as const,
    meta: () => [...queryKeys.products.all, "meta"] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: () => [...queryKeys.customers.all, "list"] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    list: () => [...queryKeys.suppliers.all, "list"] as const,
  },
  stock: {
    all: ["stock"] as const,
    balances: () => [...queryKeys.stock.all, "balances"] as const,
    movements: () => [...queryKeys.stock.all, "movements"] as const,
    meta: () => [...queryKeys.stock.all, "meta"] as const,
  },
  purchaseOrders: {
    all: ["purchase-orders"] as const,
    list: () => [...queryKeys.purchaseOrders.all, "list"] as const,
  },
  salesOrders: {
    all: ["sales-orders"] as const,
    list: () => [...queryKeys.salesOrders.all, "list"] as const,
  },
  goodsReceipts: {
    all: ["goods-receipts"] as const,
    list: () => [...queryKeys.goodsReceipts.all, "list"] as const,
  },
  deliveries: {
    all: ["deliveries"] as const,
    list: () => [...queryKeys.deliveries.all, "list"] as const,
  },
  invoices: {
    all: ["invoices"] as const,
    list: () => [...queryKeys.invoices.all, "list"] as const,
  },
  customerPayments: {
    all: ["customer-payments"] as const,
    list: () => [...queryKeys.customerPayments.all, "list"] as const,
  },
  supplierBills: {
    all: ["supplier-bills"] as const,
    list: () => [...queryKeys.supplierBills.all, "list"] as const,
  },
  supplierPayments: {
    all: ["supplier-payments"] as const,
    list: () => [...queryKeys.supplierPayments.all, "list"] as const,
  },
  purchaseRequests: {
    all: ["purchase-requests"] as const,
    list: () => [...queryKeys.purchaseRequests.all, "list"] as const,
  },
  rfq: {
    all: ["rfq"] as const,
    list: () => [...queryKeys.rfq.all, "list"] as const,
  },
  matching: {
    all: ["matching"] as const,
    list: () => [...queryKeys.matching.all, "list"] as const,
  },
  finance: {
    accounts: ["finance", "accounts"] as const,
    journals: ["finance", "journals"] as const,
    periods: ["finance", "periods"] as const,
    bank: ["finance", "bank"] as const,
    budget: ["finance", "budget"] as const,
    assets: ["finance", "assets"] as const,
  },
  tax: {
    codes: ["tax", "codes"] as const,
    documents: ["tax", "documents"] as const,
  },
  manufacturing: {
    all: ["manufacturing"] as const,
    list: () => [...queryKeys.manufacturing.all, "list"] as const,
  },
};
