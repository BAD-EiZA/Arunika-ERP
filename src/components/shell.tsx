"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { Button as HeroButton, ScrollShadow, Separator } from "@heroui/react";
import { cn } from "@/lib/cn";
import { actionSwitchCompany } from "@/app/actions";
import { Button, Select } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/master-data/products", label: "Produk" },
  { href: "/master-data/customers", label: "Pelanggan" },
  { href: "/master-data/suppliers", label: "Pemasok" },
  { href: "/inventory/stock", label: "Stok" },
  { href: "/procurement/purchase-orders", label: "Purchase Order" },
  { href: "/procurement/goods-receipts", label: "Penerimaan" },
  { href: "/procurement/bills", label: "Tagihan Pemasok" },
  { href: "/procurement/payments", label: "Bayar Pemasok" },
  { href: "/procurement/requests", label: "Purchase Request" },
  { href: "/procurement/rfq", label: "RFQ" },
  { href: "/procurement/matching", label: "3-Way Match" },
  { href: "/sales/orders", label: "Sales Order" },
  { href: "/sales/deliveries", label: "Pengiriman" },
  { href: "/sales/invoices", label: "Invoice" },
  { href: "/sales/payments", label: "Bayar Pelanggan" },
  { href: "/finance/accounts", label: "COA" },
  { href: "/finance/journals", label: "Jurnal" },
  { href: "/finance/periods", label: "Periode" },
  { href: "/finance/bank", label: "Bank" },
  { href: "/finance/budget", label: "Budget" },
  { href: "/finance/assets", label: "Aset Tetap" },
  { href: "/tax/codes", label: "Tax Code" },
  { href: "/tax/documents", label: "Dokumen Pajak" },
  { href: "/manufacturing", label: "Manufaktur" },
  { href: "/mrp", label: "MRP" },
  { href: "/hr", label: "HR" },
  { href: "/payroll", label: "Payroll" },
  { href: "/returns", label: "Return & Claim" },
  { href: "/projects", label: "Projects" },
  { href: "/crm", label: "CRM" },
  { href: "/pos", label: "POS" },
  { href: "/wms", label: "WMS" },
  { href: "/reports", label: "Laporan FS" },
  { href: "/import", label: "Import CSV" },
  { href: "/ai", label: "AI Insight" },
  { href: "/notifications", label: "Notifikasi" },
  { href: "/settings/portal", label: "Portal Token" },
  { href: "/settings/users", label: "Pengguna" },
  { href: "/settings/audit", label: "Audit Log" },
  { href: "/settings/readiness", label: "Readiness" },
];

export function AppShell({
  children,
  companyName,
  userName,
  companies,
  activeCompanyId,
}: {
  children: React.ReactNode;
  companyName: string;
  userName: string;
  companies: Array<{ id: string; name: string }>;
  activeCompanyId: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
          <div className="border-b border-border px-4 py-5">
            <div className="text-lg font-bold tracking-tight text-accent">
              Arunika ERP
            </div>
            <div className="mt-1 truncate text-xs text-muted">{companyName}</div>
          </div>
          <ScrollShadow className="flex-1 p-3">
            <nav className="space-y-0.5">
              {NAV.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent/10 font-medium text-accent"
                        : "text-foreground/80 hover:bg-accent/5 hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </ScrollShadow>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{userName}</div>
              <div className="text-xs text-muted">Kinde Auth · HeroUI</div>
            </div>
            <div className="flex items-center gap-2">
              {companies.length > 1 ? (
                <form action={actionSwitchCompany} className="flex items-center gap-2">
                  <Select name="companyId" defaultValue={activeCompanyId}>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="secondary">
                    Ganti
                  </Button>
                </form>
              ) : null}
              <Separator orientation="vertical" className="hidden h-6 sm:block" />
              <LogoutLink>
                <HeroButton variant="secondary" size="sm">
                  Keluar
                </HeroButton>
              </LogoutLink>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
