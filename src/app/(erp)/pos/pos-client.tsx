"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  ListPageShell,
  PageHeader,
  PaginationBar,
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useClientPage } from "@/hooks/use-client-page";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  Banknote,
  CreditCard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Wallet,
} from "lucide-react";

type PosData = {
  sessions: Array<{
    id: string;
    status: string;
    cashierName: string | null;
    orderCount: number;
    orders: Array<{
      id: string;
      number: string;
      total: string;
      paymentMethod: string;
    }>;
  }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    salePrice: string;
  }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
};

type CartLine = {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

const PAY_METHODS = [
  { id: "CASH", label: "Tunai", icon: Banknote },
  { id: "TRANSFER", label: "Transfer", icon: Wallet },
  { id: "CARD", label: "Kartu", icon: CreditCard },
] as const;

export function PosClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["pos"],
    queryFn: () => apiGet<PosData>("/api/erp/pos"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/pos", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pos"] });
    },
  });
  const data = query.data;
  const openSession = useMemo(
    () => data?.sessions.find((s) => s.status === "OPEN"),
    [data?.sessions],
  );

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payMethod, setPayMethod] =
    useState<(typeof PAY_METHODS)[number]["id"]>("CASH");
  const [warehouseId, setWarehouseId] = useState("");

  const ordersPage = useClientPage(openSession?.orders ?? [], 10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.products ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [data?.products, search]);

  const cartTotal = useMemo(
    () => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [cart],
  );
  const cartCount = useMemo(
    () => cart.reduce((s, l) => s + l.quantity, 0),
    [cart],
  );

  const activeWarehouse =
    warehouseId || data?.warehouses[0]?.id || "";

  function addProduct(p: PosData["products"][number]) {
    const price = Number(p.salePrice) || 0;
    setCart((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          unitPrice: price,
          quantity: 1,
        },
      ];
    });
  }

  function setQty(productId: string, quantity: number) {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.productId !== productId);
      return prev.map((l) =>
        l.productId === productId ? { ...l, quantity } : l,
      );
    });
  }

  function checkout() {
    if (!openSession || cart.length === 0 || !activeWarehouse) return;
    mutation.mutate(
      {
        action: "order",
        sessionId: openSession.id,
        warehouseId: activeWarehouse,
        paymentMethod: payMethod,
        paidAmount: cartTotal,
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      },
      {
        onSuccess: () => setCart([]),
      },
    );
  }

  return (
    <ListPageShell>
      <PageHeader
        title="POS"
        description="Kasir retail — pilih produk, keranjang, bayar & post stok"
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat POS..."
      >
        {data ? (
          <>
            {/* Session bar */}
            <Card className="border-border/70">
              {openSession ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-[#E8F4FC] text-[#0F4C75]">
                      <Store className="size-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone="success">OPEN</Badge>
                        <span className="text-sm font-semibold text-[#0F4C75]">
                          {openSession.cashierName || "Kasir"}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {openSession.orderCount} order · gudang{" "}
                        <select
                          className="ml-1 rounded-md border border-border bg-white px-1.5 py-0.5 text-xs"
                          value={activeWarehouse}
                          onChange={(e) => setWarehouseId(e.target.value)}
                        >
                          {data.warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.code}
                            </option>
                          ))}
                        </select>
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      mutation.mutate({
                        action: "close",
                        sessionId: openSession.id,
                        closingCash: 0,
                      })
                    }
                    disabled={mutation.isPending}
                  >
                    Tutup sesi
                  </Button>
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    mutation.mutate({
                      action: "open",
                      warehouseId: String(fd.get("warehouseId") ?? ""),
                      cashierName: String(fd.get("cashierName") ?? ""),
                      openingCash: String(fd.get("openingCash") ?? "0"),
                    });
                  }}
                >
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#0F4C75]">
                    <Store className="size-4" />
                    Buka sesi kasir
                  </div>
                  <FormGrid>
                    <Field label="Gudang">
                      <Select
                        name="warehouseId"
                        required
                        defaultValue={data.warehouses[0]?.id}
                      >
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} — {w.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Kasir">
                      <Input name="cashierName" placeholder="Nama kasir" />
                    </Field>
                    <Field label="Kas awal">
                      <Input
                        name="openingCash"
                        type="number"
                        defaultValue="0"
                      />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Buka sesi
                  </Button>
                </form>
              )}
            </Card>

            {/* Cashier grid */}
            {!openSession ? (
              <EmptyState
                icon={ShoppingCart}
                title="Sesi belum dibuka"
                message="Buka sesi kasir di atas untuk mulai menjual."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)] lg:items-start">
                {/* Catalog */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                    <Input
                      className="pl-9"
                      placeholder="Cari SKU atau nama produk..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {filtered.length === 0 ? (
                    <EmptyState
                      compact
                      icon={Package}
                      title="Produk tidak ditemukan"
                      message="Coba kata kunci lain atau pastikan ada produk STOCK."
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {filtered.map((p) => {
                        const inCart = cart.find((l) => l.productId === p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addProduct(p)}
                            className={cn(
                              "group flex flex-col rounded-2xl border bg-white p-3 text-left shadow-[0_2px_8px_rgba(15,76,117,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-[#0F4C75]/30 hover:shadow-md",
                              inCart
                                ? "border-[#0F4C75] ring-1 ring-[#0F4C75]/20"
                                : "border-border/70",
                            )}
                          >
                            <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-[#E8F4FC] text-[#0F4C75] transition group-hover:bg-[#0F4C75] group-hover:text-white">
                              <Package className="size-4" />
                            </div>
                            <div className="line-clamp-2 text-xs font-semibold leading-snug text-[#0F4C75]">
                              {p.name}
                            </div>
                            <div className="mt-0.5 text-[10px] text-muted">
                              {p.sku}
                            </div>
                            <div className="mt-auto pt-2 text-sm font-bold tabular-nums text-[#0F4C75]">
                              {formatIdr(p.salePrice)}
                            </div>
                            {inCart ? (
                              <span className="mt-1 text-[10px] font-semibold text-[#3282B8]">
                                ×{inCart.quantity} di keranjang
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Cart */}
                <div className="sticky top-20 space-y-3">
                  <div className="overflow-hidden rounded-3xl border border-[#0F4C75]/15 bg-white shadow-[0_12px_40px_rgba(15,76,117,0.1)]">
                    <div className="flex items-center justify-between border-b border-border/60 bg-[#0F4C75] px-4 py-3 text-white">
                      <div className="flex items-center gap-2 font-semibold">
                        <ShoppingCart className="size-4" />
                        Keranjang
                      </div>
                      <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs">
                        {cartCount} item
                      </span>
                    </div>

                    <div className="max-h-[min(42vh,360px)] space-y-2 overflow-y-auto p-3">
                      {cart.length === 0 ? (
                        <EmptyState
                          compact
                          icon={ShoppingCart}
                          title="Keranjang kosong"
                          message="Ketuk produk di kiri untuk menambah."
                        />
                      ) : (
                        cart.map((l) => (
                          <div
                            key={l.productId}
                            className="rounded-2xl border border-border/60 bg-[#f7fafc] p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-[#0F4C75]">
                                  {l.name}
                                </div>
                                <div className="text-[11px] text-muted">
                                  {l.sku} · {formatIdr(l.unitPrice)}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="rounded-lg p-1 text-muted hover:bg-white hover:text-[#0F4C75]"
                                aria-label="Hapus"
                                onClick={() => setQty(l.productId, 0)}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-1 rounded-full border border-border/70 bg-white p-0.5">
                                <button
                                  type="button"
                                  className="flex size-7 items-center justify-center rounded-full hover:bg-[#E8F4FC]"
                                  onClick={() =>
                                    setQty(l.productId, l.quantity - 1)
                                  }
                                >
                                  <Minus className="size-3.5" />
                                </button>
                                <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
                                  {l.quantity}
                                </span>
                                <button
                                  type="button"
                                  className="flex size-7 items-center justify-center rounded-full hover:bg-[#E8F4FC]"
                                  onClick={() =>
                                    setQty(l.productId, l.quantity + 1)
                                  }
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              </div>
                              <span className="text-sm font-bold tabular-nums text-[#0F4C75]">
                                {formatIdr(l.unitPrice * l.quantity)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-3 border-t border-border/60 p-4">
                      <div className="flex gap-2">
                        {PAY_METHODS.map((m) => {
                          const Icon = m.icon;
                          const active = payMethod === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setPayMethod(m.id)}
                              className={cn(
                                "flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold transition",
                                active
                                  ? "border-[#0F4C75] bg-[#0F4C75] text-white"
                                  : "border-border/70 bg-white text-muted hover:border-[#0F4C75]/30",
                              )}
                            >
                              <Icon className="size-4" />
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-end justify-between">
                        <span className="text-xs text-muted">Total bayar</span>
                        <span className="text-2xl font-bold tabular-nums tracking-tight text-[#0F4C75]">
                          {formatIdr(cartTotal)}
                        </span>
                      </div>

                      <MutationError error={mutation.error} />
                      <Button
                        type="button"
                        className="w-full"
                        disabled={
                          cart.length === 0 ||
                          mutation.isPending ||
                          !activeWarehouse
                        }
                        onClick={checkout}
                      >
                        Bayar & post stok
                      </Button>
                      {cart.length > 0 ? (
                        <button
                          type="button"
                          className="w-full text-center text-xs font-medium text-muted hover:text-[#0F4C75]"
                          onClick={() => setCart([])}
                        >
                          Kosongkan keranjang
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Session orders */}
            {openSession ? (
              <Card title={`Order sesi ini (${ordersPage.total})`}>
                {ordersPage.total === 0 ? (
                  <EmptyState
                    compact
                    title="Belum ada order"
                    message="Transaksi yang sudah dibayar muncul di sini."
                  />
                ) : (
                  <>
                    <Table headers={["Nomor", "Total", "Metode"]}>
                      {ordersPage.items.map((o) => (
                        <tr key={o.id}>
                          <td className="px-3 py-2 font-medium text-[#0F4C75]">
                            {o.number}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(o.total)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge>{o.paymentMethod}</Badge>
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <PaginationBar
                      page={ordersPage.page}
                      totalPages={ordersPage.totalPages}
                      total={ordersPage.total}
                      limit={ordersPage.limit}
                      onPageChange={ordersPage.setPage}
                    />
                  </>
                )}
              </Card>
            ) : null}
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
