"use client";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useManufacturingMutation,
  useManufacturingQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";

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

export function ManufacturingClient() {
  const query = useManufacturingQuery();
  const mutation = useManufacturingMutation();
  const data = query.data as MfgData | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manufaktur"
        description="Fase 8 · BOM, routing, production order"
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Work center">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "work_center",
                      ...formToObject(e.currentTarget),
                    });
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
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan WC
                  </Button>
                </form>
                {data.workCenters.length > 0 ? (
                  <Table headers={["Kode", "Nama"]}>
                    {data.workCenters.map((w) => (
                      <tr key={w.id}>
                        <td className="px-3 py-2">{w.code}</td>
                        <td className="px-3 py-2">{w.name}</td>
                      </tr>
                    ))}
                  </Table>
                ) : null}
              </Card>

              <Card title="Bill of Materials">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate({
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
                    });
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
                      <Input name="quantity" type="number" step="0.0001" defaultValue="1" />
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
                      <Input name="componentQty" type="number" step="0.0001" required />
                    </Field>
                    <Field label="Scrap %">
                      <Input name="scrapPct" type="number" step="0.01" defaultValue="0" />
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan BOM
                  </Button>
                </form>
              </Card>

              <Card title="Routing">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate({
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
                    });
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
                      <Input name="setupMinutes" type="number" defaultValue="0" />
                    </Field>
                    <Field label="Run/unit (menit)">
                      <Input name="runMinutes" type="number" defaultValue="1" />
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan routing
                  </Button>
                </form>
              </Card>

              <Card title="Production order">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "create_order",
                      ...formToObject(e.currentTarget),
                    });
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
                      <Select name="warehouseId" defaultValue={data.warehouses[0]?.id}>
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty rencana">
                      <Input name="plannedQty" type="number" step="0.0001" required />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Buat MO
                  </Button>
                </form>
              </Card>
            </div>

            <Card title="Daftar BOM">
              {data.boms.length === 0 ? (
                <EmptyState message="Belum ada BOM" />
              ) : (
                <Table headers={["Kode", "FG", "Komponen", "Ver"]}>
                  {data.boms.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2">{b.code}</td>
                      <td className="px-3 py-2">
                        {b.finishedProduct.sku} — {b.finishedProduct.name}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {b.items.map((i) => `${i.sku}×${i.quantity}`).join(", ")}
                      </td>
                      <td className="px-3 py-2">v{b.version}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card title="Production orders">
              {data.orders.length === 0 ? (
                <EmptyState message="Belum ada production order" />
              ) : (
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
                  {data.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 font-medium">{o.number}</td>
                      <td className="px-3 py-2">{o.finishedProduct.sku}</td>
                      <td className="px-3 py-2 text-xs">
                        {o.completedQty}/{o.plannedQty}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        M {o.materialCost} · L {o.laborCost} · O {o.overheadCost}
                        <br />
                        Total {o.totalCost} · Unit {o.unitCost}
                      </td>
                      <td className="px-3 py-2">
                        <Badge>{o.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {o.status === "DRAFT" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({ action: "release", id: o.id })
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
                                      o.warehouseId || data.warehouses[0]?.id,
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
                                      o.warehouseId || data.warehouses[0]?.id,
                                    quantity: o.plannedQty,
                                  })
                                }
                              >
                                Complete
                              </Button>
                            </>
                          ) : null}
                          {["COMPLETED", "IN_PROGRESS"].includes(o.status) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({ action: "close", id: o.id })
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
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
