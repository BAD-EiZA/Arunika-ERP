import { redirect } from "next/navigation";
import { actionOnboardCompany } from "@/app/actions";
import { Button, Card, Field, FormGrid, Input, PageHeader } from "@/components/ui";
import { getSessionUser, listUserCompanies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const memberships = await listUserCompanies(user.id);
  if (memberships.length > 0) redirect("/dashboard");

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(50,130,184,0.16),_transparent_55%),linear-gradient(180deg,#f5fafd_0%,#e8f4fc_50%,#f5fafd_100%)]">
      <div className="pointer-events-none absolute inset-0 mkt-grain opacity-50" />
      <div className="relative mx-auto max-w-2xl px-4 py-12 md:py-16">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4C75] to-[#3282B8] text-sm font-bold text-white shadow-sm">
            A
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-[#0F4C75]">
              Arunika ERP
            </div>
            <div className="text-xs text-muted">Langkah pertama perusahaan Anda</div>
          </div>
        </div>
        <PageHeader
          title="Onboarding perusahaan"
          description="Buat perusahaan pertama, cabang, gudang, COA, tax code, dan role bawaan."
        />
        <Card className="border-border/70 bg-white/90 shadow-[0_16px_48px_rgba(15,76,117,0.08)] backdrop-blur">
          <form action={actionOnboardCompany} className="space-y-4">
            <FormGrid>
              <Field label="Nama perusahaan">
                <Input name="name" required placeholder="PT Contoh Dagang" />
              </Field>
              <Field label="Nama legal">
                <Input name="legalName" placeholder="PT Contoh Dagang Indonesia" />
              </Field>
              <Field label="Kode">
                <Input name="code" placeholder="CONTOH" />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" placeholder="ops@contoh.id" />
              </Field>
              <Field label="Telepon">
                <Input name="phone" placeholder="021..." />
              </Field>
              <Field label="Kota">
                <Input name="city" placeholder="Jakarta" />
              </Field>
              <Field label="Provinsi">
                <Input name="province" placeholder="DKI Jakarta" />
              </Field>
              <Field label="Nama cabang pertama">
                <Input name="branchName" placeholder="Kantor Pusat" />
              </Field>
              <Field label="Nama gudang pertama">
                <Input name="warehouseName" placeholder="Gudang Utama" />
              </Field>
            </FormGrid>
            <Button type="submit" className="mt-2">
              Buat perusahaan
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
