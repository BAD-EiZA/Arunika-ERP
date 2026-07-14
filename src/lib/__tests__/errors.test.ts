import {
  AppError,
  conflict,
  forbidden,
  notFound,
  toErrorMessage,
  unauthorized,
  validationError,
} from "@/lib/errors";

describe("errors", () => {
  it("creates AppError with defaults", () => {
    const e = new AppError("X", "msg");
    expect(e.name).toBe("AppError");
    expect(e.code).toBe("X");
    expect(e.message).toBe("msg");
    expect(e.status).toBe(400);
  });

  it("helpers set correct status codes", () => {
    expect(unauthorized().status).toBe(401);
    expect(unauthorized("x").message).toBe("x");
    expect(forbidden().status).toBe(403);
    expect(forbidden("f").message).toBe("f");
    expect(notFound().status).toBe(404);
    expect(notFound("n").message).toBe("n");
    expect(conflict("c").status).toBe(409);
    expect(validationError("v", { a: 1 }).status).toBe(422);
    expect(validationError("v", { a: 1 }).details).toEqual({ a: 1 });
  });

  it("toErrorMessage handles variants", () => {
    expect(toErrorMessage(unauthorized("u"))).toBe("u");
    expect(toErrorMessage(new Error("e"))).toBe("e");
    expect(toErrorMessage("x")).toBe("Terjadi kesalahan");
    expect(toErrorMessage(null)).toBe("Terjadi kesalahan");
  });
});
