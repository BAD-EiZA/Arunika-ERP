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
  AppCheckbox,
  AppDatePicker,
  AppFieldset,
  AppInputGroup,
  toast,
} from "@/components/heroui-kit";
import { useHrMutation, useHrQuery } from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import {
  CalendarDays,
  ClipboardList,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";

type HrData = {
  employees: Array<{
    id: string;
    code: string;
    name: string;
    email: string | null;
    position: string | null;
    baseSalary: string;
    isActive: boolean;
  }>;
  attendance: Array<{
    id: string;
    employeeName: string;
    workDate: string;
    status: string;
  }>;
  leaves: Array<{
    id: string;
    employeeName: string;
    leaveType: string;
    days: string;
    status: string;
    startDate: string;
    endDate: string;
  }>;
};

type FormMode = "none" | "employee" | "attendance" | "leave";

export function HrClient() {
  const query = useHrQuery();
  const mutation = useHrMutation();
  const data = query.data as HrData | undefined;
  const [formMode, setFormMode] = useState<FormMode>("none");
  const employeesPage = useClientPage(data?.employees ?? [], 20);
  const leavesPage = useClientPage(data?.leaves ?? [], 20);
  const attendancePage = useClientPage(data?.attendance ?? [], 20);

  const stats = useMemo(() => {
    const employees = data?.employees ?? [];
    const active = employees.filter((e) => e.isActive).length;
    return {
      employees: employees.length,
      active,
      leaves: data?.leaves.length ?? 0,
      attendance: data?.attendance.length ?? 0,
    };
  }, [data]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Human Resources"
        description="Karyawan · absensi · cuti"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "leave" ? "primary" : "secondary"}
              onClick={() => toggle("leave")}
            >
              <CalendarDays className="mr-1.5 size-4" />
              Cuti
            </Button>
            <Button
              type="button"
              variant={formMode === "attendance" ? "primary" : "secondary"}
              onClick={() => toggle("attendance")}
            >
              <ClipboardList className="mr-1.5 size-4" />
              Absensi
            </Button>
            <Button
              type="button"
              variant={formMode === "employee" ? "secondary" : "primary"}
              onClick={() => toggle("employee")}
            >
              <UserPlus className="mr-1.5 size-4" />
              {formMode === "employee" ? "Tutup" : "Karyawan"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat HR..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Karyawan"
                value={stats.employees}
                icon={Users}
              />
              <StatCard label="Aktif" value={stats.active} />
              <StatCard
                label="Cuti"
                value={stats.leaves}
                icon={CalendarDays}
              />
              <StatCard
                label="Absensi"
                value={stats.attendance}
                icon={ClipboardList}
              />
            </div>

            <MutationError error={mutation.error} />

            {formMode === "employee" ? (
              <Card title="Tambah karyawan">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "employee",
                        ...formToObject(e.currentTarget),
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                          toast.success("Karyawan disimpan");
                        },
                      },
                    );
                  }}
                >
                  <AppFieldset legend="Identitas">
                    <FormGrid>
                      <Field label="Kode">
                        <Input name="code" required />
                      </Field>
                      <Field label="Nama">
                        <Input name="name" required />
                      </Field>
                      <Field label="Email">
                        <Input name="email" type="email" />
                      </Field>
                      <Field label="Posisi">
                        <Input name="position" />
                      </Field>
                    </FormGrid>
                  </AppFieldset>
                  <AppInputGroup
                    label="Gaji pokok"
                    name="baseSalary"
                    prefix="Rp"
                    type="number"
                    defaultValue="0"
                  />
                  <AppCheckbox name="isActive" defaultSelected>
                    Aktif
                  </AppCheckbox>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan
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

            {formMode === "attendance" ? (
              <Card title="Absensi">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "attendance",
                        ...formToObject(e.currentTarget),
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                          toast.success("Absensi dicatat");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Karyawan">
                      <Select name="employeeId" required>
                        <option value="">Pilih</option>
                        {data.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.code} — {e.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <AppDatePicker label="Tanggal" name="workDate" />
                    <Field label="Status">
                      <Select name="status" defaultValue="PRESENT">
                        <option value="PRESENT">Present</option>
                        <option value="ABSENT">Absent</option>
                        <option value="LEAVE">Leave</option>
                      </Select>
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={mutation.isPending}
                    >
                      Catat absensi
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

            {formMode === "leave" ? (
              <Card title="Ajukan cuti">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "leave",
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
                    <Field label="Karyawan">
                      <Select name="employeeId" required>
                        {data.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Tipe">
                      <Select name="leaveType" defaultValue="ANNUAL">
                        <option value="ANNUAL">Annual</option>
                        <option value="SICK">Sick</option>
                        <option value="UNPAID">Unpaid</option>
                      </Select>
                    </Field>
                    <Field label="Mulai">
                      <Input name="startDate" type="date" required />
                    </Field>
                    <Field label="Selesai">
                      <Input name="endDate" type="date" required />
                    </Field>
                    <Field label="Hari">
                      <Input
                        name="days"
                        type="number"
                        step="0.5"
                        defaultValue="1"
                      />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Ajukan cuti
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

            <Card title={`Karyawan (${employeesPage.total})`}>
              {employeesPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Users}
                  title="Belum ada karyawan"
                  message="Tambah karyawan untuk absensi dan cuti."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFormMode("employee")}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Karyawan
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table
                    headers={["Kode", "Nama", "Posisi", "Gaji", "Status"]}
                  >
                    {employeesPage.items.map((e) => (
                      <tr key={e.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {e.code}
                        </td>
                        <td className="px-3 py-2">{e.name}</td>
                        <td className="px-3 py-2">{e.position || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatIdr(e.baseSalary)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={e.isActive ? "success" : "danger"}>
                            {e.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={employeesPage.page}
                    totalPages={employeesPage.totalPages}
                    total={employeesPage.total}
                    limit={employeesPage.limit}
                    onPageChange={employeesPage.setPage}
                  />
                </>
              )}
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card title={`Cuti (${leavesPage.total})`}>
                {leavesPage.total === 0 ? (
                  <EmptyState
                    compact
                    icon={CalendarDays}
                    title="Belum ada cuti"
                    message="Ajukan cuti untuk karyawan."
                    action={
                      data.employees.length > 0 ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setFormMode("leave")}
                        >
                          Cuti
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    <Table
                      headers={[
                        "Karyawan",
                        "Tipe",
                        "Hari",
                        "Status",
                        "Aksi",
                      ]}
                    >
                      {leavesPage.items.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2">{l.employeeName}</td>
                          <td className="px-3 py-2">{l.leaveType}</td>
                          <td className="px-3 py-2 tabular-nums">{l.days}</td>
                          <td className="px-3 py-2">
                            <Badge
                              tone={
                                l.status === "APPROVED"
                                  ? "success"
                                  : l.status === "PENDING_APPROVAL"
                                    ? "warning"
                                    : "default"
                              }
                            >
                              {l.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {l.status === "PENDING_APPROVAL" ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  mutation.mutate({
                                    action: "approve_leave",
                                    id: l.id,
                                  })
                                }
                              >
                                Approve
                              </Button>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <PaginationBar
                      page={leavesPage.page}
                      totalPages={leavesPage.totalPages}
                      total={leavesPage.total}
                      limit={leavesPage.limit}
                      onPageChange={leavesPage.setPage}
                    />
                  </>
                )}
              </Card>

              <Card title={`Absensi terbaru (${attendancePage.total})`}>
                {attendancePage.total === 0 ? (
                  <EmptyState
                    compact
                    icon={ClipboardList}
                    title="Belum ada absensi"
                    message="Catat kehadiran harian."
                    action={
                      data.employees.length > 0 ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setFormMode("attendance")}
                        >
                          Absensi
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    <Table headers={["Tanggal", "Karyawan", "Status"]}>
                      {attendancePage.items.map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2">
                            {formatDateId(a.workDate)}
                          </td>
                          <td className="px-3 py-2">{a.employeeName}</td>
                          <td className="px-3 py-2">
                            <Badge>{a.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <PaginationBar
                      page={attendancePage.page}
                      totalPages={attendancePage.totalPages}
                      total={attendancePage.total}
                      limit={attendancePage.limit}
                      onPageChange={attendancePage.setPage}
                    />
                  </>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
