"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import { withPageQuery } from "@/lib/pagination";
import { queryKeys } from "@/lib/query-keys";

export type DashboardData = {
  roleCode: string;
  productCount: number;
  customerCount: number;
  supplierCount: number;
  openPo: number;
  openSo: number;
  arTotal: string;
  apTotal: string;
  charts: {
    months: string[];
    salesByMonth: Array<{ month: string; value: number }>;
    purchaseByMonth: Array<{ month: string; value: number }>;
    soStatus: Array<{ label: string; value: number }>;
    poStatus: Array<{ label: string; value: number }>;
    stockValue: Array<{ label: string; name: string; value: number; qty: number }>;
    mix: Array<{ label: string; value: number }>;
  };
  stockRows: Array<{
    id: string;
    quantityOnHand: string;
    quantityReserved: string;
    averageCost: string;
    product: { sku: string; name: string };
    warehouse: { code: string };
  }>;
  salesInvoices: Array<{
    id: string;
    number: string;
    status: string;
    balance: string;
    dueDate: string | null;
  }>;
  supplierBills: Array<{
    id: string;
    number: string;
    status: string;
    balance: string;
    dueDate: string | null;
  }>;
};

export type PageMetaFields = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ProductsData = {
  products: Array<{
    id: string;
    sku: string;
    name: string;
    type: string;
    isArchived: boolean;
    purchasePrice: string;
    salePrice: string;
    unit: { symbol: string };
    category: { name: string } | null;
  }>;
  units: Array<{ id: string; name: string; symbol: string }>;
  categories: Array<{ id: string; name: string; code: string }>;
} & PageMetaFields;

export type CustomersData = {
  customers: Array<{
    id: string;
    code: string;
    name: string;
    email: string | null;
    phone: string | null;
    paymentTermDays: number;
  }>;
} & PageMetaFields;

export type SuppliersData = {
  suppliers: Array<{
    id: string;
    code: string;
    name: string;
    email: string | null;
    phone: string | null;
  }>;
} & PageMetaFields;

export type StockData = {
  balances: Array<{
    id: string;
    quantityOnHand: string;
    quantityReserved: string;
    averageCost: string;
    product: { sku: string; name: string };
    warehouse: { code: string };
  }>;
  products: Array<{ id: string; sku: string; name: string }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
  movements: Array<{
    id: string;
    type: string;
    quantity: string;
    referenceNumber: string | null;
    postedAt: string;
    product: { sku: string };
    warehouse: { code: string };
  }>;
};

export function useDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiGet<DashboardData>("/api/erp/dashboard"),
  });
}

export function useProductsQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: queryKeys.products.list(page, limit),
    queryFn: () =>
      apiGet<ProductsData>(withPageQuery("/api/erp/products", page, limit)),
    placeholderData: keepPreviousData,
  });
}

export function useCreateProductMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiPost("/api/erp/products", { action: "product", ...body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.products.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useCreateCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiPost("/api/erp/products", { action: "category", ...body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useCustomersQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: queryKeys.customers.list(page, limit),
    queryFn: () =>
      apiGet<CustomersData>(withPageQuery("/api/erp/customers", page, limit)),
    placeholderData: keepPreviousData,
  });
}

export function useCreateCustomerMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiPost("/api/erp/customers", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.customers.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useSuppliersQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: queryKeys.suppliers.list(page, limit),
    queryFn: () =>
      apiGet<SuppliersData>(withPageQuery("/api/erp/suppliers", page, limit)),
    placeholderData: keepPreviousData,
  });
}

export function useCreateSupplierMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiPost("/api/erp/suppliers", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useStockQuery() {
  return useQuery({
    queryKey: queryKeys.stock.balances(),
    queryFn: () => apiGet<StockData>("/api/erp/stock"),
  });
}

export function useOpeningStockMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiPost("/api/erp/stock", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.stock.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

type LinePayload = {
  productId: string;
  quantity: string | number;
  unitPrice: string | number;
  taxAmount?: string | number;
  description?: string;
};

export type PurchaseOrdersData = {
  orders: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
    orderDate: string;
    warehouseId: string | null;
    supplier: { id: string; name: string };
    items: Array<{
      id: string;
      productId: string;
      sku: string;
      quantity: string;
      quantityReceived: string;
      unitPrice: string;
      total: string;
    }>;
  }>;
  suppliers: Array<{ id: string; code: string; name: string }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    purchasePrice: string;
    salePrice: string;
  }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string }>;
};

export type SalesOrdersData = {
  orders: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
    orderDate: string;
    warehouseId: string | null;
    customer: { id: string; name: string };
    items: Array<{
      id: string;
      productId: string;
      sku: string;
      quantity: string;
      quantityDelivered: string;
      unitPrice: string;
      total: string;
    }>;
  }>;
  customers: Array<{ id: string; code: string; name: string }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    purchasePrice: string;
    salePrice: string;
  }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string }>;
};

export function usePurchaseOrdersQuery() {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.list(),
    queryFn: () => apiGet<PurchaseOrdersData>("/api/erp/purchase-orders"),
  });
}

export function usePurchaseOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      action?: "create" | "submit" | "approve";
      id?: string;
      supplierId?: string;
      branchId?: string;
      warehouseId?: string;
      notes?: string;
      items?: LinePayload[];
    }) => apiPost("/api/erp/purchase-orders", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      await qc.invalidateQueries({ queryKey: queryKeys.goodsReceipts.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useSalesOrdersQuery() {
  return useQuery({
    queryKey: queryKeys.salesOrders.list(),
    queryFn: () => apiGet<SalesOrdersData>("/api/erp/sales-orders"),
  });
}

export function useSalesOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      action?: "create" | "approve";
      id?: string;
      customerId?: string;
      branchId?: string;
      warehouseId?: string;
      notes?: string;
      items?: LinePayload[];
    }) => apiPost("/api/erp/sales-orders", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.salesOrders.all });
      await qc.invalidateQueries({ queryKey: queryKeys.deliveries.all });
      await qc.invalidateQueries({ queryKey: queryKeys.stock.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useGoodsReceiptsQuery() {
  return useQuery({
    queryKey: queryKeys.goodsReceipts.list(),
    queryFn: () =>
      apiGet<{
        receipts: Array<{
          id: string;
          number: string;
          status: string;
          receiptDate: string;
          supplier: { name: string };
          items: Array<{ sku: string; quantityReceived: string }>;
        }>;
        openPos: Array<{
          id: string;
          number: string;
          supplierId: string;
          supplierName: string;
          warehouseId: string | null;
          items: Array<{
            productId: string;
            sku: string;
            name: string;
            quantity: string;
            quantityReceived: string;
            unitPrice: string;
          }>;
        }>;
        warehouses: Array<{ id: string; code: string; name: string }>;
      }>("/api/erp/goods-receipts"),
  });
}

export function usePostGoodsReceiptMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      purchaseOrderId: string;
      warehouseId: string;
      supplierDeliveryNote?: string;
      notes?: string;
      items: Array<{
        productId: string;
        quantityReceived: string | number;
        unitCost?: string | number;
      }>;
    }) => apiPost("/api/erp/goods-receipts", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.goodsReceipts.all });
      await qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      await qc.invalidateQueries({ queryKey: queryKeys.stock.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useDeliveriesQuery() {
  return useQuery({
    queryKey: queryKeys.deliveries.list(),
    queryFn: () =>
      apiGet<{
        deliveries: Array<{
          id: string;
          number: string;
          status: string;
          deliveryDate: string;
          invoiced: boolean;
          customer: { name: string };
          items: Array<{ sku: string; quantityDelivered: string }>;
        }>;
        openSos: Array<{
          id: string;
          number: string;
          customerId: string;
          customerName: string;
          warehouseId: string | null;
          items: Array<{
            productId: string;
            sku: string;
            name: string;
            quantity: string;
            quantityDelivered: string;
          }>;
        }>;
        warehouses: Array<{ id: string; code: string; name: string }>;
      }>("/api/erp/deliveries"),
  });
}

export function usePostDeliveryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      salesOrderId: string;
      warehouseId: string;
      notes?: string;
      items: Array<{ productId: string; quantityDelivered: string | number }>;
    }) => apiPost("/api/erp/deliveries", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.deliveries.all });
      await qc.invalidateQueries({ queryKey: queryKeys.salesOrders.all });
      await qc.invalidateQueries({ queryKey: queryKeys.invoices.all });
      await qc.invalidateQueries({ queryKey: queryKeys.stock.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useInvoicesQuery() {
  return useQuery({
    queryKey: queryKeys.invoices.list(),
    queryFn: () =>
      apiGet<{
        invoices: Array<{
          id: string;
          number: string;
          status: string;
          total: string;
          balance: string;
          dueDate: string | null;
          customer: { id: string; name: string };
        }>;
        openDeliveries: Array<{
          id: string;
          number: string;
          customerName: string;
        }>;
      }>("/api/erp/invoices"),
  });
}

export function useIssueInvoiceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { deliveryOrderId: string; taxRate?: string | number }) =>
      apiPost("/api/erp/invoices", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.invoices.all });
      await qc.invalidateQueries({ queryKey: queryKeys.deliveries.all });
      await qc.invalidateQueries({ queryKey: queryKeys.customerPayments.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useCustomerPaymentsQuery() {
  return useQuery({
    queryKey: queryKeys.customerPayments.list(),
    queryFn: () =>
      apiGet<{
        payments: Array<{
          id: string;
          number: string;
          status: string;
          amount: string;
          paymentDate: string;
          customer: { name: string };
        }>;
        openInvoices: Array<{
          id: string;
          number: string;
          customerId: string;
          customerName: string;
          balance: string;
        }>;
      }>("/api/erp/customer-payments"),
  });
}

export function useCustomerPaymentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      customerId: string;
      invoiceId: string;
      amount: string | number;
      reference?: string;
    }) => apiPost("/api/erp/customer-payments", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.customerPayments.all });
      await qc.invalidateQueries({ queryKey: queryKeys.invoices.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useSupplierBillsQuery() {
  return useQuery({
    queryKey: queryKeys.supplierBills.list(),
    queryFn: () =>
      apiGet<{
        bills: Array<{
          id: string;
          number: string;
          status: string;
          total: string;
          balance: string;
          invoiceDate: string;
          supplier: { id: string; name: string };
        }>;
        suppliers: Array<{ id: string; name: string }>;
        products: Array<{
          id: string;
          sku: string;
          name: string;
          purchasePrice: string;
        }>;
        purchaseOrders: Array<{ id: string; number: string }>;
      }>("/api/erp/supplier-bills"),
  });
}

export function useCreateSupplierBillMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      supplierId: string;
      purchaseOrderId?: string;
      supplierInvoiceNo?: string;
      items: Array<{
        productId?: string;
        description: string;
        quantity: string | number;
        unitPrice: string | number;
        taxAmount?: string | number;
      }>;
    }) => apiPost("/api/erp/supplier-bills", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.supplierBills.all });
      await qc.invalidateQueries({ queryKey: queryKeys.supplierPayments.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useSupplierPaymentsQuery() {
  return useQuery({
    queryKey: queryKeys.supplierPayments.list(),
    queryFn: () =>
      apiGet<{
        payments: Array<{
          id: string;
          number: string;
          status: string;
          amount: string;
          paymentDate: string;
          supplier: { name: string };
        }>;
        openBills: Array<{
          id: string;
          number: string;
          supplierId: string;
          supplierName: string;
          balance: string;
        }>;
      }>("/api/erp/supplier-payments"),
  });
}

export function useSupplierPaymentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      supplierId: string;
      billId: string;
      amount: string | number;
      reference?: string;
    }) => apiPost("/api/erp/supplier-payments", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.supplierPayments.all });
      await qc.invalidateQueries({ queryKey: queryKeys.supplierBills.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function usePurchaseRequestsQuery() {
  return useQuery({
    queryKey: queryKeys.purchaseRequests.list(),
    queryFn: () => apiGet<{
      requests: Array<{ id: string; number: string; status: string; notes: string | null; items: Array<{ productId: string; sku: string; quantity: string }> }>;
      products: Array<{ id: string; sku: string; name: string }>;
      branches: Array<{ id: string; code: string; name: string }>;
    }>("/api/erp/purchase-requests"),
  });
}

export function usePurchaseRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/purchase-requests", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.purchaseRequests.all });
      await qc.invalidateQueries({ queryKey: queryKeys.rfq.all });
    },
  });
}

export function useRfqQuery() {
  return useQuery({
    queryKey: queryKeys.rfq.list(),
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/rfq"),
  });
}

export function useRfqMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/rfq", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.rfq.all });
      await qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
  });
}

export function useMatchingQuery() {
  return useQuery({
    queryKey: queryKeys.matching.list(),
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/matching"),
  });
}

export function useMatchingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { goodsReceiptId: string; supplierBillId: string }) =>
      apiPost("/api/erp/matching", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.matching.all });
    },
  });
}

export function useFinanceAccountsQuery() {
  return useQuery({
    queryKey: queryKeys.finance.accounts,
    queryFn: () =>
      apiGet<{
        accounts: Array<{
          id: string;
          code: string;
          name: string;
          type: string;
          normalBalance: string;
          isActive: boolean;
        }>;
      }>("/api/erp/finance/accounts"),
  });
}

export function useFinanceAccountMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/finance/accounts", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.finance.accounts });
    },
  });
}

export function useFinanceJournalsQuery() {
  return useQuery({
    queryKey: queryKeys.finance.journals,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/finance/journals"),
  });
}

export function useFinanceJournalMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/finance/journals", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.finance.journals });
    },
  });
}

export function useFinancePeriodsQuery() {
  return useQuery({
    queryKey: queryKeys.finance.periods,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/finance/periods"),
  });
}

export function useClosePeriodMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/finance/periods", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.finance.periods });
    },
  });
}

export function useFinanceExpensesQuery() {
  return useQuery({
    queryKey: ["finance", "expenses"] as const,
    queryFn: () =>
      apiGet<Record<string, unknown>>("/api/erp/finance/expenses"),
  });
}

export function useFinanceExpenseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/finance/expenses", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance", "expenses"] });
      await qc.invalidateQueries({ queryKey: queryKeys.finance.journals });
    },
  });
}

export function useFinanceBankQuery() {
  return useQuery({
    queryKey: queryKeys.finance.bank,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/finance/bank"),
  });
}

export function useFinanceBankMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/finance/bank", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.finance.bank });
    },
  });
}

export function useFinanceBudgetQuery() {
  return useQuery({
    queryKey: queryKeys.finance.budget,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/finance/budget"),
  });
}

export function useFinanceBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/finance/budget", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.finance.budget });
    },
  });
}

export function useFinanceAssetsQuery() {
  return useQuery({
    queryKey: queryKeys.finance.assets,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/finance/assets"),
  });
}

export function useFinanceAssetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/finance/assets", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.finance.assets });
    },
  });
}

export function useTaxCodesQuery() {
  return useQuery({
    queryKey: queryKeys.tax.codes,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/tax/codes"),
  });
}

export function useTaxDocumentsQuery() {
  return useQuery({
    queryKey: queryKeys.tax.documents,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/tax/documents"),
  });
}

export function useTaxDocumentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/tax/documents", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.tax.documents });
    },
  });
}

export function useManufacturingQuery() {
  return useQuery({
    queryKey: queryKeys.manufacturing.list(),
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/manufacturing"),
  });
}

export function useManufacturingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/manufacturing", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.manufacturing.all });
      await qc.invalidateQueries({ queryKey: queryKeys.stock.all });
      await qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useMrpQuery() {
  return useQuery({
    queryKey: ["mrp", "list"] as const,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/mrp"),
  });
}

export function useMrpMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/mrp", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mrp"] });
    },
  });
}

export function useHrQuery() {
  return useQuery({
    queryKey: ["hr", "list"] as const,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/hr"),
  });
}

export function useHrMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/hr", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["hr"] });
    },
  });
}

export function usePayrollQuery() {
  return useQuery({
    queryKey: ["payroll", "list"] as const,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/payroll"),
  });
}

export function usePayrollMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/payroll", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll"] });
    },
  });
}

export function useReturnsQuery() {
  return useQuery({
    queryKey: ["returns", "list"] as const,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/returns"),
  });
}

export function useReturnsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/returns", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["returns"] });
      await qc.invalidateQueries({ queryKey: queryKeys.stock.all });
    },
  });
}

export function useProjectsQuery() {
  return useQuery({
    queryKey: ["projects", "list"] as const,
    queryFn: () => apiGet<Record<string, unknown>>("/api/erp/projects"),
  });
}

export function useProjectsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/projects", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
