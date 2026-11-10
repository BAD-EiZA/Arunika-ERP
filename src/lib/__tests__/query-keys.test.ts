import { makeKey } from "@/lib/query-keys";

test("query key includes active company and isolates identical resources", () => {
  expect(makeKey("co1", "products", 1)).toEqual(["co1", "products", 1]);
  expect(makeKey("co1", "products", 1)).not.toEqual(makeKey("co2", "products", 1));
});
