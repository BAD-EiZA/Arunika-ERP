jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(), assertRequestAccess: jest.fn() }));
jest.mock("@/server/services/mrp-convert", () => ({ reviewMrpSuggestion: jest.fn() }));

import { POST } from "../review/route";
import { assertRequestAccess, requirePermission } from "@/lib/auth";
import { reviewMrpSuggestion } from "@/server/services/mrp-convert";
import { forbidden } from "@/lib/errors";

const request = (body: unknown) => new Request("http://localhost/api/erp/mrp/review", { method: "POST", body: JSON.stringify(body) });
const context = { companyId: "company", user: { id: "reviewer" } } as Awaited<ReturnType<typeof requirePermission>>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requirePermission).mockResolvedValue(context);
  jest.mocked(assertRequestAccess).mockResolvedValue(undefined);
  jest.mocked(reviewMrpSuggestion).mockResolvedValue({ id: "suggestion" });
});

it("requires MRP run permission before review", async () => {
  jest.mocked(requirePermission).mockRejectedValue(forbidden());
  const response = await POST(request({ suggestionId: "suggestion", action: "accept" }));
  expect(response.status).toBe(403);
  expect(requirePermission).toHaveBeenCalledWith("mrp:run");
  expect(reviewMrpSuggestion).not.toHaveBeenCalled();
});

it("checks request access and forwards company, reviewer and modification", async () => {
  const body = { suggestionId: "suggestion", action: "modify", quantity: "4.5", dueDate: "2026-12-25" };
  const response = await POST(request(body));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ reviewed: { id: "suggestion" } });
  expect(assertRequestAccess).toHaveBeenCalledWith(context, body);
  expect(reviewMrpSuggestion).toHaveBeenCalledWith({ companyId: "company", userId: "reviewer", ...body });
});

it("does not review if request access is denied", async () => {
  jest.mocked(assertRequestAccess).mockRejectedValue(forbidden());
  expect((await POST(request({ suggestionId: "suggestion", action: "accept" }))).status).toBe(403);
  expect(reviewMrpSuggestion).not.toHaveBeenCalled();
});

it.each([{}, { suggestionId: "suggestion", action: "invalid" }, { suggestionId: 42, action: "accept" }, { suggestionId: "suggestion", action: "modify", quantity: {}, dueDate: "2026-12-25" }])("rejects malformed review input %p", async body => {
  expect((await POST(request(body))).status).toBe(422);
  expect(reviewMrpSuggestion).not.toHaveBeenCalled();
});
