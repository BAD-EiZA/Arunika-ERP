import { Decimal } from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

type Numeric = string | number | Decimal | { toString(): string };

function toDecimal(value: Numeric): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "object" && value !== null) {
    return new Decimal(value.toString());
  }
  return new Decimal((value as string | number) || 0);
}

export function money(value: Numeric = 0): Decimal {
  return toDecimal(value);
}

export function qty(value: Numeric = 0): Decimal {
  return toDecimal(value);
}

export function lineTotal(
  quantity: Numeric,
  unitPrice: Numeric,
  discount: Numeric = 0,
  tax: Numeric = 0,
): Decimal {
  return qty(quantity).mul(money(unitPrice)).minus(money(discount)).plus(money(tax));
}

export function sumMoney(values: Numeric[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), money(0));
}

export function formatIdr(value: Numeric): string {
  const n = money(value).toNumber();
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function toPrismaDecimal(value: Decimal): string {
  return value.toFixed(4);
}

export function toPrismaMoney(value: Decimal): string {
  return value.toFixed(2);
}
