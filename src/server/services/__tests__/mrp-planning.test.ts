import { runMrp } from "@/server/services/mrp";
import { GET } from "@/app/api/erp/mrp/route";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MrpClient } from "@/app/(erp)/mrp/mrp-client";
import { useMrpQuery } from "@/hooks/use-erp-queries";

// UI package is unavailable in Jest; retain real MRP/API rendering with inert layout wrappers.
jest.mock("@/components/ui", () => {
  const React = jest.requireActual("react");
  const wrapper = ({ children }: { children?: unknown }) => React.createElement("div", null, children);
  return Object.fromEntries(["Badge", "Button", "Card", "EmptyState", "Field", "FormGrid", "Input", "ListPageShell", "PageHeader", "StatCard", "Table"].map((name) => [name, wrapper]));
});
jest.mock("@/components/query-state", () => ({
  QueryBoundary: ({ children }: { children: unknown }) => children,
  MutationError: () => null,
}));
jest.mock("@/hooks/use-erp-queries", () => ({
  useMrpQuery: jest.fn(), useMrpMutation: jest.fn(() => ({})),
}));

jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(async () => ({ companyId: "c" })) }));

const db = {
  mrpRun: { findMany: jest.fn() },
  product: { findMany: jest.fn() },
  stockBalance: { findMany: jest.fn() },
  salesOrderItem: { findMany: jest.fn() },
  purchaseOrderItem: { findMany: jest.fn() },
  productionOrder: { findMany: jest.fn() },
  billOfMaterials: { findMany: jest.fn() },
  stockReservation: { findMany: jest.fn(async () => []) },
  $queryRaw: jest.fn(async () => [{locked:true}]),
  $transaction: jest.fn(),
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "MRP/001") }));

const planning = {calendar:{workingDays:[0,1,2,3,4,5,6],holidays:[]},products:["a","fg","rm"].map(productId => ({productId,leadTimeDays:0,lotSize:"1",safetyStock:"0"}))};
const day = (n: number) => new Date(`2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`);
const lines = jest.fn(async (args: { data: { lines: { create: unknown[] } } }) => args.data.lines.create);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(day(1));
  db.stockBalance.findMany.mockResolvedValue([]);
  db.salesOrderItem.findMany.mockResolvedValue([]);
  db.purchaseOrderItem.findMany.mockResolvedValue([]);
  db.productionOrder.findMany.mockResolvedValue([]);
  db.billOfMaterials.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({ ...db, mrpRun: { create: lines } }));
  lines.mockClear();
});
afterEach(() => jest.useRealTimers());

it.each([NaN, Infinity, 1.5, "30", null, 2147483647])("rejects invalid horizon %s before database access", async (horizonDays) => {
  await expect(runMrp({ companyId: "c", userId: "u", planning, horizonDays: horizonDays as number }))
    .rejects.toThrow("Horizon harus bilangan bulat positif");
  expect(db.stockBalance.findMany).not.toHaveBeenCalled();
});

it("exposes persisted due date and late-supply exception through GET", async () => {
  db.product.findMany.mockResolvedValue([]);
  db.mrpRun.findMany.mockResolvedValue([{ id: "r", ranAt: day(1), lines: [{
    id: "l", productId: "a", suggestionType: "PURCHASE", quantity: "4", onHand: "0",
    demand: "4", supply: "0", dueDate: day(5), sourceRef: "NET_REQUIREMENT;LATE_SUPPLY",
  }] }]);
  const response = await GET();
  const body = await response.json();
  expect(body.runs[0].lines[0]).toEqual(expect.objectContaining({
    dueDate: day(5).toISOString(),
    exceptionMessage: "Pasokan terjadwal setelah kebutuhan; tinjau percepatan sebelum membuat order baru.",
  }));
});

it("renders API due dates and exception messages", async () => {
  db.product.findMany.mockResolvedValue([]);
  db.mrpRun.findMany.mockResolvedValue([{ id: "r", number: "MRP/1", ranAt: day(1), lines: [{
    id: "l", productId: "a", suggestionType: "PURCHASE", quantity: "4", onHand: "0",
    demand: "4", supply: "0", dueDate: day(5), sourceRef: "NET_REQUIREMENT;LATE_SUPPLY",
  }] }]);
  const body = await (await GET()).json();
  (useMrpQuery as jest.Mock).mockReturnValue({ data: body });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(MrpClient)));
  expect(html).toContain("2026-01-05");
  expect(html).toContain("tinjau percepatan sebelum membuat order baru");
});

it("excludes demand beyond horizon", async () => {
  db.salesOrderItem.findMany.mockResolvedValue([
    { productId: "a", quantity: 8, quantityDelivered: 0, salesOrder: { deliveryDate: day(20) } },
  ]);
  expect(await runMrp({ companyId: "c", userId: "u", planning, horizonDays: 10 })).toEqual([]);
});

it("undated supply does not erase a dated shortage", async () => {
  db.salesOrderItem.findMany.mockResolvedValue([
    { productId: "a", quantity: 3, quantityDelivered: 0, salesOrder: { deliveryDate: day(5) } },
  ]);
  db.purchaseOrderItem.findMany.mockResolvedValue([
    { productId: "a", quantity: 20, quantityReceived: 0, purchaseOrder: { expectedDate: null } },
  ]);
  expect(await runMrp({ companyId: "c", userId: "u", planning })).toEqual([
    expect.objectContaining({ productId: "a", quantity: "3.0000", dueDate: day(5), sourceRef: "NET_REQUIREMENT;UNCONFIRMED_SUPPLY" }),
  ]);
});

it("uses MO start for materials, end for receipts; keeps horizon boundary inclusive", async () => {
  db.salesOrderItem.findMany.mockResolvedValue([
    { productId: "fg", quantity: 4, quantityDelivered: 1, salesOrder: { deliveryDate: day(11) } },
  ]);
  db.productionOrder.findMany.mockResolvedValue([
    { finishedProductId: "fg", plannedQty: 5, completedQty: 2, plannedStart: day(3), plannedEnd: day(11), materials: [
      { productId: "rm", plannedQty: 8, issuedQty: 2 },
    ] },
  ]);
  expect(await runMrp({ companyId: "c", userId: "u", planning, horizonDays: 10 })).toEqual([
    expect.objectContaining({ productId: "rm", quantity: "6.0000", dueDate: day(3) }),
  ]);
});

it("rejects BOM cycles without persisting a run", async () => {
  db.billOfMaterials.findMany.mockResolvedValue([
    { finishedProductId: "fg", version: 1, quantity: 1, items: [{ productId: "fg" }] },
  ]);
  await expect(runMrp({ companyId: "c", userId: "u", planning })).rejects.toThrow("Siklus BOM");
  expect(lines).not.toHaveBeenCalled();
});

it("explodes only net finished shortage into component due on the same day", async () => {
  db.salesOrderItem.findMany.mockResolvedValue([
    { productId: "fg", quantity: 5, quantityDelivered: 0, salesOrder: { deliveryDate: day(5) } },
  ]);
  db.stockBalance.findMany.mockResolvedValue([{ productId: "fg", quantityOnHand: 2 }]);
  db.billOfMaterials.findMany.mockResolvedValue([
    { finishedProductId: "fg", version: 1, quantity: 1, items: [
      { productId: "rm", quantity: 2, scrapPct: 0 },
    ] },
  ]);
  expect(await runMrp({ companyId: "c", userId: "u", planning })).toEqual([
    expect.objectContaining({ productId: "fg", quantity: "3.0000", dueDate: day(5) }),
    expect.objectContaining({ productId: "rm", quantity: "6.0000", dueDate: day(5) }),
  ]);
});

it("reschedules identified dated supply without double counting its original receipt", async () => {
  db.salesOrderItem.findMany.mockResolvedValue([
    { productId: "a", quantity: 6, quantityDelivered: 0, salesOrder: { deliveryDate: day(5) } },
    { productId: "a", quantity: 4, quantityDelivered: 0, salesOrder: { deliveryDate: day(12) } },
  ]);
  db.purchaseOrderItem.findMany.mockResolvedValue([
    { id: "dated", productId: "a", quantity: 3, quantityReceived: 0, purchaseOrder: { expectedDate: day(10) } },
  ]);
  db.stockBalance.findMany.mockResolvedValue([{ productId: "a", quantityOnHand: 2 }]);
  const result = await runMrp({ companyId: "c", userId: "u", planning, horizonDays: 15 });
  expect(result).toEqual([
    expect.objectContaining({ productId: "a", suggestionType: "RESCHEDULE", quantity: "3.0000", dueDate: day(5), sourceRef: "PO:dated" }),
    expect.objectContaining({ productId: "a", suggestionType: "PURCHASE", quantity: "1.0000", dueDate: day(5) }),
    expect.objectContaining({ productId: "a", suggestionType: "PURCHASE", quantity: "4.0000", dueDate: day(12) }),
  ]);
});
