jest.mock("@tanstack/react-query-devtools", () => ({ ReactQueryDevtools: () => null }));
import { createTenantQueryClient } from "@/components/providers/query-provider";

test("tenant clients never share cached data; hashes contain company; clear removes old queries", () => {
  const a = createTenantQueryClient("a"), b = createTenantQueryClient("b");
  a.setQueryData(["products"], ["old"]);
  expect(b.getQueryData(["products"])).toBeUndefined();
  expect(a.getQueryCache().getAll()[0].queryHash).toBe('["a","products"]');
  a.clear();
  expect(a.getQueryCache().getAll()).toHaveLength(0);
});
