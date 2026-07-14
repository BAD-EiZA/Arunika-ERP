import {
  hasPermission,
  PERMISSIONS,
  PERMISSION_META,
  ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} from "@/lib/permissions";

describe("permissions", () => {
  it("hasPermission wildcard", () => {
    expect(hasPermission("*", "product:view")).toBe(true);
    expect(hasPermission("*", ["product:view", "stock:view"])).toBe(true);
  });

  it("hasPermission set and array", () => {
    const set = new Set(["product:view", "stock:view"]);
    expect(hasPermission(set, "product:view")).toBe(true);
    expect(hasPermission(set, "invoice:create")).toBe(false);
    expect(hasPermission(["product:view"], "product:view")).toBe(true);
    expect(hasPermission(["product:view"], ["product:view", "stock:view"])).toBe(
      false,
    );
  });

  it("every permission has meta", () => {
    for (const code of PERMISSIONS) {
      expect(PERMISSION_META[code]).toBeDefined();
      expect(PERMISSION_META[code].name).toBeTruthy();
      expect(PERMISSION_META[code].module).toBeTruthy();
    }
  });

  it("system roles map to grants", () => {
    for (const role of SYSTEM_ROLES) {
      expect(ROLE_PERMISSIONS[role.code]).toBeDefined();
    }
    expect(ROLE_PERMISSIONS.OWNER).toBe("*");
    expect(ROLE_PERMISSIONS.ADMIN).toBe("*");
    expect(Array.isArray(ROLE_PERMISSIONS.BUYER)).toBe(true);
  });
});
