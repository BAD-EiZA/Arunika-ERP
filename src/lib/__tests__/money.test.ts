import {
  Decimal,
  formatIdr,
  lineTotal,
  money,
  qty,
  sumMoney,
  toPrismaDecimal,
  toPrismaMoney,
} from "@/lib/money";

describe("money", () => {
  it("parses number string and decimal", () => {
    expect(money().toString()).toBe("0");
    expect(money(10).toString()).toBe("10");
    expect(money("12.5").toString()).toBe("12.5");
    expect(money(new Decimal(3)).toString()).toBe("3");
    expect(money({ toString: () => "7.25" }).toString()).toBe("7.25");
    expect(money(0).toString()).toBe("0");
    expect(money("").toString()).toBe("0");
    expect(money(null as unknown as number).toString()).toBe("0");
  });

  it("qty aliases money parser", () => {
    expect(qty().toString()).toBe("0");
    expect(qty("1.5").toString()).toBe("1.5");
  });

  it("lineTotal computes qty * price - discount + tax", () => {
    expect(lineTotal(2, 1000, 100, 50).toString()).toBe("1950");
    expect(lineTotal(1, 100).toString()).toBe("100");
  });

  it("sumMoney aggregates", () => {
    expect(sumMoney([1, "2", new Decimal(3)]).toString()).toBe("6");
    expect(sumMoney([]).toString()).toBe("0");
  });

  it("formats IDR", () => {
    const s = formatIdr(1500000);
    expect(s).toContain("1");
    expect(s).toContain("500");
  });

  it("serializes prisma decimals", () => {
    expect(toPrismaDecimal(money("1.2"))).toBe("1.2000");
    expect(toPrismaMoney(money("1.2"))).toBe("1.20");
  });
});
