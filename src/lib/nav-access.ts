import { hasAnyPermission, type PermissionCode } from "@/lib/permissions";

/** Route → any of these permissions grants access (OR). Empty = all authenticated. */
export const ROUTE_PERMISSIONS: Record<string, PermissionCode[]> = {
  "/dashboard": [],
  "/notifications": [],

  "/master-data/products": ["product:view"],
  "/master-data/customers": ["customer:view"],
  "/master-data/suppliers": ["supplier:view"],

  "/inventory/stock": ["stock:view"],
  "/wms": ["stock:view", "warehouse:view"],

  "/procurement/purchase-orders": ["purchase_order:view"],
  "/procurement/goods-receipts": ["goods_receipt:view"],
  "/procurement/bills": ["supplier_bill:view"],
  "/procurement/payments": ["supplier_payment:view"],
  "/procurement/requests": ["purchase_request:view"],
  "/procurement/rfq": ["rfq:view"],
  "/procurement/matching": ["three_way_match:review"],

  "/sales/orders": ["sales_order:view"],
  "/sales/deliveries": ["delivery_order:view"],
  "/sales/invoices": ["invoice:view"],
  "/sales/payments": ["payment:view"],
  "/pos": ["sales_order:view", "invoice:view"],
  "/crm": ["customer:view"],

  "/finance/accounts": ["account:view"],
  "/finance/journals": ["journal:view"],
  "/finance/recurring": ["journal:view", "invoice:view"],
  "/finance/periods": ["period:view"],
  "/finance/bank": ["bank_account:view"],
  "/finance/budget": ["budget:view"],
  "/finance/assets": ["fixed_asset:view"],
  "/finance/expenses": ["journal:view", "account:view"],
  "/finance/approvals": ["account:manage", "settings:manage"],
  "/reports": ["financial_statement:view", "report:view"],

  "/tax/codes": ["tax:view"],
  "/tax/documents": ["tax:view"],

  "/manufacturing": ["production_order:view", "bom:view"],
  "/mrp": ["mrp:view"],
  "/hr": ["employee:view"],
  "/payroll": ["payroll:view"],
  "/returns": ["return:view", "claim:view"],
  "/projects": ["project:view"],

  "/ai": ["report:view"],
  "/import": ["product:create", "customer:create", "settings:manage"],

  "/settings/portal": ["settings:manage", "user:view"],
  "/settings/users": ["user:view", "user:invite"],
  "/settings/audit": ["audit:view"],
  "/settings/readiness": ["settings:manage", "company:view"],
};

export type PermissionGrant = ReadonlySet<string> | string[] | "*";

function normalizePath(pathname: string) {
  if (!pathname || pathname === "/") return "/dashboard";
  return pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;
}

/** Longest matching route prefix wins. */
export function resolveRoutePermissions(pathname: string): PermissionCode[] | null {
  const path = normalizePath(pathname);
  if (path in ROUTE_PERMISSIONS) return ROUTE_PERMISSIONS[path];

  const keys = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (path === key || path.startsWith(`${key}/`)) {
      return ROUTE_PERMISSIONS[key];
    }
  }
  return null;
}

/** True if user may open this path. Unknown paths: allow (page/API still enforce). */
export function canAccessPath(
  pathname: string,
  granted: PermissionGrant,
): boolean {
  if (granted === "*") return true;
  const required = resolveRoutePermissions(pathname);
  if (required === null) return true;
  if (required.length === 0) return true;
  return hasAnyPermission(granted, required);
}

export function canAccessHref(
  href: string,
  granted: PermissionGrant,
): boolean {
  return canAccessPath(href, granted);
}

export function filterNavByPermissions<
  G extends { items: Array<{ href: string }> },
>(groups: G[], granted: PermissionGrant): G[] {
  if (granted === "*") return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => canAccessHref(item.href, granted)),
    }))
    .filter((g) => g.items.length > 0) as G[];
}

export function firstAllowedPath(granted: PermissionGrant): string {
  const order = [
    "/dashboard",
    "/finance/journals",
    "/sales/orders",
    "/procurement/purchase-orders",
    "/inventory/stock",
    "/tax/documents",
    "/hr",
    "/projects",
    "/reports",
  ];
  for (const p of order) {
    if (canAccessPath(p, granted)) return p;
  }
  return "/dashboard";
}
