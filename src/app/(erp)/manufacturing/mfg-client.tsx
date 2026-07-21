"use client";

import { useMemo, useState } from "react";
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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useManufacturingMutation,
  useManufacturingQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import {
  Factory,
  Layers,
  Plus,
  Route,
  Settings2,
} from "lucide-react";

type MfgData = {
  workCenters: Array<{ id: string; code: string; name: string }>;
  boms: Array<{
    id: string;
    code: string;
    name: string;
    version: number;
    finishedProduct: { sku: string; name: string };
    items: Array<{ sku: string; quantity: string }>;
  }>;
  routings: Array<{
    id: string;
    code: string;
    name: string;
    steps: Array<{ sequence: number; name: string; workCenterCode: string }>;
  }>;
  orders: Array<{
    id: string;
    number: string;
    status: string;
    plannedQty: string;
    completedQty: string;
    warehouseId: string | null;
    materialCost: string;
    laborCost: string;
    overheadCost: string;
    totalCost: string;
    unitCost: string;
    finishedProduct: { sku: string; name: string };
    materials: Array<{
      productId: string;
      plannedQty: string;
      issuedQty: string;
      totalCost: string;
    }>;
    steps: Array<{
      id: string;
      sequence: number;
      name: string;
      isDone: boolean;
      laborCost: string;
      overheadCost: string;
    }>;
  }>;
  products: Array<{ id: string; sku: string; name: string }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
};

type FormMode = "none" | "wc" | "bom" | "routing" | "order";

function mfgTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "COMPLETED" || s === "CLOSED") return "success";
  if (s === "RELEASED" || s === "IN_PROGRESS") return "warning";
  if (s === "CANCELLED") return "danger";
  return "default";
}

export function ManufacturingClient() {
  const query = useManufacturingQuery();
  const mutation = useManufacturingMutation();
  const data = query.data as MfgData | undefined;
  const [formMode, setFormMode] = useState<FormMode>("none");
  const ordersPage = useClientPage(data?.orders ?? [], 20);

  const stats = useMemo(() => {
    const orders = data?.orders ?? [];
    return {
      wc: data?.workCenters.length ?? 0,
      boms: data?.boms.length ?? 0,
      routings: data?.routings.length ?? 0,
      orders: orders.length,
      open: orders.filter((o) =>
        ["DRAFT", "RELEASED", "IN_PROGRESS"].includes(o.status),
      ).length,
    };
  }, [data]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Manufaktur"
        description="BOM · routing · production order · issue · complete"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "wc" ? "primary" : "secondary"}
              onClick={() => toggle("wc")}
            >
              <Settings2 className="mr-1.5 size-4" />
              WC
            </Button>
            <Button
              type="button"
              variant={formMode === "bom" ? "primary" : "secondary"}
              onClick={() => toggle("bom")}
            >
              <Layers className="mr-1.5 size-4" />
              BOM
            </Button>
            <Button
              type="button"
              variant={formMode === "routing" ? "primary" : "secondary"}
              onClick={() => toggle("routing")}
            >
              <Route className="mr-1.5 size-4" />
              Routing
            </Button>
            <Button
              type="button"
              variant={formMode === "order" ? "secondary" : "primary"}
              onClick={() => toggle("order")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "order" ? "Tutup" : "Buat MO"}
            </Button>
          </div>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat manufaktur..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Work center" value={stats.wc} icon={Settings2} />
              <StatCard label="BOM" value={stats.boms} icon={Layers} />
              <StatCard label="Routing" value={stats.routings} icon={Route} />
              <StatCard label="MO" value={stats.orders} icon={Factory} />
              <StatCard label="MO terbuka" value={stats.open} />
            </div>

            <MutationError error={mutation.error} />

            {formMode === "wc" ? (
              <Card title="Work center">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "work_center",
                        ...formToObject(e.currentTarget),
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Kode">
                      <Input name="code" required />
                    </Field>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan WC
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
                {data.workCenters.length > 0 ? (
                  <Table headers={["Kode", "Nama"]}>
                    {data.workCenters.map((w) => (
                      <tr key={w.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {w.code}
                        </td>
                        <td className="px-3 py-2">{w.name}</td>
                      </tr>
                    ))}
                  </Table>
                ) : null}
              </Card>
            ) : null}

            {formMode === "bom" ? (
              <Card title="Bill of Materials">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate(
                      {
                        action: "bom",
                        code: body.code,
                        name: body.name,
                        finishedProductId: body.finishedProductId,
                        quantity: body.quantity || 1,
                        items: [
                          {
                            productId: body.componentId,
                            quantity: body.componentQty,
                            scrapPct: body.scrapPct || 0,
                          },
                        ],
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Kode BOM">
                      <Input name="code" required />
                    </Field>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Finished good">
                      <Select name="finishedProductId" required>
                        <option value="">Pilih</option>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty output">
                      <Input
                        name="quantity"
                        type="number"
                        step="0.0001"
                        defaultValue="1"
                      />
                    </Field>
                    <Field label="Komponen">
                      <Select name="componentId" required>
                        <option value="">Pilih</option>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty komponen">
                      <Input
                        name="componentQty"
                        type="number"
                        step="0.0001"
                        required
                      />
                    </Field>
                    <Field label="Scrap %">
                      <Input
                        name="scrapPct"
                        type="number"
                        step="0.01"
                        defaultValue="0"
                      />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan BOM
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {formMode === "routing" ? (
              <Card title="Routing">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate(
                      {
                        action: "routing",
                        code: body.code,
                        name: body.name,
                        steps: [
                          {
                            workCenterId: body.workCenterId,
                            sequence: 10,
                            name: body.stepName || "Operasi 10",
                            setupMinutes: body.setupMinutes || 0,
                            runMinutes: body.runMinutes || 0,
                          },
                        ],
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Kode routing">
                      <Input name="code" required />
                    </Field>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Work center">
                      <Select name="workCenterId" required>
                        <option value="">Pilih</option>
                        {data.workCenters.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Nama step">
                      <Input name="stepName" defaultValue="Operasi 10" />
                    </Field>
                    <Field label="Setup (menit)">
                      <Input
                        name="setupMinutes"
                        type="number"
                        defaultValue="0"
                      />
                    </Field>
                    <Field label="Run/unit (menit)">
                      <Input
                        name="runMinutes"
                        type="number"
                        defaultValue="1"
                      />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan routing
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {formMode === "order" ? (
              <Card title="Production order">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "create_order",
                        ...formToObject(e.currentTarget),
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Finished good">
                      <Select name="finishedProductId" required>
                        <option value="">Pilih</option>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="BOM">
                      <Select name="bomId" defaultValue="">
                        <option value="">—</option>
                        {data.boms.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code} v{b.version}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Routing">
                      <Select name="routingId" defaultValue="">
                        <option value="">—</option>
                        {data.routings.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Gudang">
                      <Select
                        name="warehouseId"
                        defaultValue={data.warehouses[0]?.id}
                      >
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty rencana">
                      <Input
                        name="plannedQty"
                        type="number"
                        step="0.0001"
                        required
                      />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Buat MO
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            <Card title={`Daftar BOM (${data.boms.length})`}>
              {data.boms.length === 0 ? (
                <EmptyState
                  compact
                  icon={Layers}
                  title="Belum ada BOM"
                  message="Definisikan finished good dan komponen."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFormMode("bom")}
                    >
                      BOM
                    </Button>
                  }
                />
              ) : (
                <Table headers={["Kode", "FG", "Komponen", "Ver"]}>
                  {data.boms.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 font-medium text-[#0F4C75]">
                        {b.code}
                      </td>
                      <td className="px-3 py-2">
                        {b.finishedProduct.sku} — {b.finishedProduct.name}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-muted">
                        {b.items
                          .map((i) => `${i.sku}×${i.quantity}`)
                          .join(", ")}
                      </td>
                      <td className="px-3 py-2 tabular-nums">v{b.version}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card title={`Production orders (${ordersPage.total})`}>
              {ordersPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Factory}
                  title="Belum ada production order"
                  message="Buat MO dari finished good + BOM/routing."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFormMode("order")}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Buat MO
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "Nomor",
                      "FG",
                      "Qty",
                      "Costing",
                      "Status",
                      "Aksi",
                    ]}
                  >
                    {ordersPage.items.map((o) => (
                      <tr key={o.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {o.number}
                        </td>
                        <td className="px-3 py-2">{o.finishedProduct.sku}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {o.completedQty}/{o.plannedQty}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">
                          M {o.materialCost} · L {o.laborCost} · O{" "}
                          {o.overheadCost}
                          <br />
                          Total {o.totalCost} · Unit {o.unitCost}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={mfgTone(o.status)}>{o.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {o.status === "DRAFT" ? (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "release",
                                    id: o.id,
                                  })
                                }
                              >
                                Release
                              </Button>
                            ) : null}
                            {["RELEASED", "IN_PROGRESS"].includes(o.status) ? (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={mutation.isPending}
                                  onClick={() =>
                                    mutation.mutate({
                                      action: "issue",
                                      id: o.id,
                                      warehouseId:
                                        o.warehouseId ||
                                        data.warehouses[0]?.id,
                                    })
                                  }
                                >
                                  Issue mat.
                                </Button>
                                {o.steps[0] ? (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={mutation.isPending}
                                    onClick={() =>
                                      mutation.mutate({
                                        action: "labor",
                                        id: o.id,
                                        stepId: o.steps[0].id,
                                        minutes: 60,
                                      })
                                    }
                                  >
                                    Labor 60m
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  disabled={mutation.isPending}
                                  onClick={() =>
                                    mutation.mutate({
                                      action: "complete",
                                      id: o.id,
                                      warehouseId:
                                        o.warehouseId ||
                                        data.warehouses[0]?.id,
                                      quantity: o.plannedQty,
                                    })
                                  }
                                >
                                  Complete
                                </Button>
                              </>
                            ) : null}
                            {["COMPLETED", "IN_PROGRESS"].includes(
                              o.status,
                            ) ? (
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "close",
                                    id: o.id,
                                  })
                                }
                              >
                                Close
                              </Button>
                            ) : null}
                          </div>
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
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
