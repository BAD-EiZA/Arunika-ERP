import { runAction, runFormAction } from "@/lib/action";
import { AppError, validationError } from "@/lib/errors";

describe("action", () => {
  it("runAction success", async () => {
    const r = await runAction(async () => 42);
    expect(r).toEqual({ ok: true, data: 42 });
  });

  it("runAction AppError", async () => {
    const r = await runAction(async () => {
      throw validationError("bad");
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("bad");
      expect(r.code).toBe("VALIDATION");
    }
  });

  it("runAction generic error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await runAction(async () => {
      throw new Error("boom");
    });
    expect(r).toEqual({ ok: false, error: "boom" });
    spy.mockRestore();
  });

  it("runAction unknown error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await runAction(async () => {
      throw "x";
    });
    expect(r).toEqual({ ok: false, error: "Terjadi kesalahan" });
    spy.mockRestore();
  });

  it("runFormAction success", async () => {
    await expect(runFormAction(async () => 1)).resolves.toBeUndefined();
  });

  it("runFormAction rethrows Error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runFormAction(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    spy.mockRestore();
  });

  it("runFormAction wraps non-Error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runFormAction(async () => {
        throw "x";
      }),
    ).rejects.toThrow("Terjadi kesalahan");
    spy.mockRestore();
  });

  it("runFormAction AppError", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runFormAction(async () => {
        throw new AppError("E", "msg", 400);
      }),
    ).rejects.toThrow("msg");
    spy.mockRestore();
  });
});
