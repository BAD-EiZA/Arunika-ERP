import { describe, expect, it } from "@jest/globals";
import {
  canAccessPath,
  filterNavByPermissions,
  firstAllowedPath,
  resolveRoutePermissions,
} from "@/lib/nav-access";

describe("nav-access", () => {
  it("resolveRoutePermissions longest match", () => {
    expect(resolveRoutePermissions("/finance/journals/abc")).toEqual([
      "journal:view",
    ]);
    expect(resolveRoutePermissions("/dashboard")).toEqual([]);
  });

  it("OWNER * sees all", () => {
    expect(canAccessPath("/finance/journals", "*")).toBe(true);
    expect(canAccessPath("/sales/orders", "*")).toBe(true);
  });

  it("ACCOUNTANT finance only paths", () => {
    const perms = [
      "journal:view",
      "account:view",
      "report:view",
      "financial_statement:view",
      "tax:view",
      "company:view",
    ];
    expect(canAccessPath("/finance/journals", perms)).toBe(true);
    expect(canAccessPath("/tax/codes", perms)).toBe(true);
    expect(canAccessPath("/reports", perms)).toBe(true);
    expect(canAccessPath("/sales/orders", perms)).toBe(false);
    expect(canAccessPath("/procurement/purchase-orders", perms)).toBe(false);
  });

  it("filterNavByPermissions drops empty groups", () => {
    const groups = [
      {
        id: "home",
        items: [{ href: "/dashboard" }],
      },
      {
        id: "sales",
        items: [{ href: "/sales/orders" }],
      },
      {
        id: "finance",
        items: [{ href: "/finance/journals" }, { href: "/sales/orders" }],
      },
    ];
    const filtered = filterNavByPermissions(groups, [
      "journal:view",
      "company:view",
    ]);
    expect(filtered.map((g) => g.id)).toEqual(["home", "finance"]);
    expect(filtered.find((g) => g.id === "finance")?.items).toHaveLength(1);
  });

  it("firstAllowedPath prefers dashboard then domain", () => {
    // /dashboard always open for authenticated users
    expect(firstAllowedPath(["sales_order:view"])).toBe("/dashboard");
    expect(firstAllowedPath(["journal:view"])).toBe("/dashboard");
    expect(firstAllowedPath("*")).toBe("/dashboard");
    expect(canAccessPath("/sales/orders", ["sales_order:view"])).toBe(true);
    expect(canAccessPath("/finance/journals", ["journal:view"])).toBe(true);
  });
});
