jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn() }));
jest.mock("@/server/services/reports", () => ({ getStockMovementReport: jest.fn(), getInventoryValuation: jest.fn(), getOpenOrders: jest.fn(), getUnbilledDocuments: jest.fn(), toCsv: jest.fn() }));
import { requirePermission } from "@/lib/auth";
import { getStockMovementReport, toCsv } from "@/server/services/reports";
import { GET } from "../route";
beforeEach(() => { jest.resetAllMocks(); (requirePermission as jest.Mock).mockResolvedValue({ companyId: "co", branchIds: [], warehouseIds: [] }); });
test("CSV export requires report:view and report:export before database access", async () => {
  (requirePermission as jest.Mock).mockRejectedValueOnce(new Error("denied"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const res = await GET(new Request("http://localhost/api/erp/reports/operational?format=csv"));
    expect(res.ok).toBe(false);
    expect(requirePermission).toHaveBeenCalledWith(["report:view", "report:export"]);
    expect(getStockMovementReport).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});
test("validated stock report CSV includes row values", async () => {
  (getStockMovementReport as jest.Mock).mockResolvedValue({ rows: [{ id: "1", sku: "A" }] });
  (toCsv as jest.Mock).mockReturnValue("id,sku\n1,A");
  const res = await GET(new Request("http://localhost/api/erp/reports/operational?format=csv&page=1"));
  expect((await res.json()).csv).toBe("id,sku\n1,A");
  expect(toCsv).toHaveBeenCalledWith(["id", "sku"], [["1", "A"]]);
});
