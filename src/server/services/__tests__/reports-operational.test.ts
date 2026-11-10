jest.mock("@/lib/db", () => ({ prisma: {} }));
import { toCsv } from "@/server/services/reports";

test("CSV neutralizes formulas while preserving neutral cells and escaping separators", () => {
  expect(toCsv(["name"], [["=1+1"], ["+cmd"], ["Neutral"], ['a,"b\nc'], ["\r=cmd"], ["@cmd"], [-2]])).toBe("name\n'=1+1\n'+cmd\nNeutral\n\"a,\"\"b\nc\"\n\"'\r=cmd\"\n'@cmd\n-2");
});
