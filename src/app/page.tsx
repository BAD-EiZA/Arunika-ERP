import Link from "next/link";
import {
  LoginLink,
  RegisterLink,
} from "@kinde-oss/kinde-auth-nextjs/components";
import { Button as HeroButton, Card as HeroCard, Chip } from "@heroui/react";
import { getSessionUser, listUserCompanies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let user = null as Awaited<ReturnType<typeof getSessionUser>>;
  let memberships: Awaited<ReturnType<typeof listUserCompanies>> = [];
  try {
    user = await getSessionUser();
    memberships = user ? await listUserCompanies(user.id) : [];
  } catch {
    // DB may be offline during first setup
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/80 via-background to-background">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <div className="mb-10">
          <Chip color="accent" size="sm" variant="soft" className="mb-3">
            <Chip.Label>Arunika ERP</Chip.Label>
          </Chip>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            ERP modular untuk operasional, stok, keuangan, dan pajak Indonesia.
          </h1>
          <p className="mt-4 max-w-2xl text-muted">
            Fase 0–7 aktif: fondasi multi-tenant, inventory, procurement, sales,
            accounting, treasury, tax, dan advanced procurement.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <HeroCard>
            <HeroCard.Header>
              <HeroCard.Title>Status sesi</HeroCard.Title>
            </HeroCard.Header>
            <HeroCard.Content>
              {user ? (
                <div className="space-y-2 text-sm">
                  <p>
                    Login sebagai <strong>{user.name || user.email}</strong>
                  </p>
                  <p className="text-muted">
                    {memberships.length
                      ? `${memberships.length} perusahaan terhubung`
                      : "Belum punya perusahaan"}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {memberships.length ? (
                      <Link href="/dashboard">
                        <HeroButton variant="primary">Buka dashboard</HeroButton>
                      </Link>
                    ) : (
                      <Link href="/onboarding">
                        <HeroButton variant="primary">
                          Onboarding perusahaan
                        </HeroButton>
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <p>Masuk dengan Kinde Auth untuk mulai.</p>
                  <div className="flex flex-wrap gap-2">
                    <LoginLink>
                      <HeroButton variant="primary">Masuk</HeroButton>
                    </LoginLink>
                    <RegisterLink>
                      <HeroButton variant="secondary">Daftar</HeroButton>
                    </RegisterLink>
                  </div>
                </div>
              )}
            </HeroCard.Content>
          </HeroCard>

          <HeroCard>
            <HeroCard.Header>
              <HeroCard.Title>Stack</HeroCard.Title>
            </HeroCard.Header>
            <HeroCard.Content>
              <ul className="space-y-1 text-sm text-muted">
                <li>Next.js App Router</li>
                <li>Prisma + PostgreSQL</li>
                <li>Kinde Auth</li>
                <li>Cloudinary</li>
                <li>HeroUI + Tailwind v4</li>
              </ul>
            </HeroCard.Content>
          </HeroCard>

          <HeroCard>
            <HeroCard.Header>
              <HeroCard.Title>Modul siap</HeroCard.Title>
            </HeroCard.Header>
            <HeroCard.Content>
              <ul className="space-y-1 text-sm text-muted">
                <li>Tenant & role</li>
                <li>Master + inventory</li>
                <li>PO / SO / invoice</li>
                <li>GL + posting rule</li>
                <li>Tax + RFQ/3WM</li>
              </ul>
            </HeroCard.Content>
          </HeroCard>
        </div>
      </div>
    </div>
  );
}
