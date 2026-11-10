import { apiPost } from "@/lib/api-client";

afterEach(() => jest.restoreAllMocks());

test.each(["network", "HTTP"])("separate attempts rotate auto keys after %s failure", async failure => {
  const send = jest.spyOn(globalThis, "fetch");
  if (failure === "network") send.mockRejectedValueOnce(new Error("failed"));
  else send.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "failed" }) } as Response);
  send.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  await expect(apiPost("/retry", { amount: 10 })).rejects.toThrow("failed");
  await apiPost("/retry", { amount: 10 });
  const keys = send.mock.calls.map(c => (c[1]?.headers as Record<string, string>)["Idempotency-Key"]);
  expect(keys[0]).not.toBe(keys[1]);
});

test("overlapping identical attempts share a key until all settle", async () => {
  const resolve: Array<(response: Response) => void> = [];
  const send = jest.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(done => resolve.push(done)));
  const response = { ok: true, json: async () => ({}) } as Response;
  const first = apiPost("/overlap", {});
  const second = apiPost("/overlap", {});
  resolve[0](response);
  await first;
  const third = apiPost("/overlap", {});
  resolve[1](response);
  resolve[2](response);
  await Promise.all([second, third]);
  const fourth = apiPost("/overlap", {});
  resolve[3](response);
  await fourth;
  const keys = send.mock.calls.map(c => (c[1]?.headers as Record<string, string>)["Idempotency-Key"]);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[1]).toBe(keys[2]);
  expect(keys[2]).not.toBe(keys[3]);
});

test("POST sends caller's stable attempt key", async () => {
  const send = jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  await apiPost("/api/erp/stock", { warehouseId: "w" }, "attempt-42");
  expect(send).toHaveBeenCalledWith("/api/erp/stock", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "attempt-42" }) }));
});
