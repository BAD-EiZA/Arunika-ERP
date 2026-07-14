import { newIdempotencyKey, requestId } from "@/lib/idempotency";

describe("idempotency", () => {
  it("generates uuid key", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey("gr");
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(b.startsWith("gr:")).toBe(true);
    expect(a).not.toBe(newIdempotencyKey());
  });

  it("requestId returns uuid", () => {
    expect(requestId()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
