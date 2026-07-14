"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import {
  Button as HeroButton,
  Chip,
  Disclosure,
  Drawer,
  Input,
  ScrollShadow,
  Separator,
} from "@heroui/react";
import {
  Boxes,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { actionSwitchCompany } from "@/app/actions";
import { Button, Select, UserAvatar } from "@/components/ui";

type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Utama",
    icon: LayoutDashboard,
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    id: "master",
    label: "Master Data",
    icon: Package,
    items: [
      { href: "/master-data/products", label: "Produk", icon: Package },
      { href: "/master-data/customers", label: "Pelanggan", icon: Users },
      { href: "/master-data/suppliers", label: "Pemasok", icon: Building2 },
    ],
  },
  {
    id: "inventory",
    label: "Inventori",
    icon: Warehouse,
    items: [
      { href: "/inventory/stock", label: "Stok", icon: Boxes },
      { href: "/wms", label: "WMS Bin", icon: Warehouse },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    icon: Truck,
    items: [
      { href: "/procurement/purchase-orders", label: "Purchase Order" },
      { href: "/procurement/goods-receipts", label: "Penerimaan" },
      { href: "/procurement/bills", label: "Tagihan Pemasok" },
      { href: "/procurement/payments", label: "Bayar Pemasok" },
      { href: "/procurement/requests", label: "Purchase Request" },
      { href: "/procurement/rfq", label: "RFQ" },
      { href: "/procurement/matching", label: "3-Way Match" },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: ShoppingCart,
    items: [
      { href: "/sales/orders", label: "Sales Order" },
      { href: "/sales/deliveries", label: "Pengiriman" },
      { href: "/sales/invoices", label: "Invoice" },
      { href: "/sales/payments", label: "Bayar Pelanggan" },
      { href: "/pos", label: "POS", icon: Store },
      { href: "/crm", label: "CRM" },
    ],
  },
  {
    id: "finance",
    label: "Keuangan",
    icon: Wallet,
    items: [
      { href: "/finance/accounts", label: "COA" },
      { href: "/finance/journals", label: "Jurnal" },
      { href: "/finance/periods", label: "Periode" },
      { href: "/finance/bank", label: "Bank" },
      { href: "/finance/budget", label: "Budget" },
      { href: "/finance/assets", label: "Aset Tetap" },
      { href: "/reports", label: "Laporan FS", icon: FileSpreadsheet },
    ],
  },
  {
    id: "tax",
    label: "Pajak",
    icon: Receipt,
    items: [
      { href: "/tax/codes", label: "Tax Code" },
      { href: "/tax/documents", label: "Dokumen Pajak" },
    ],
  },
  {
    id: "ops",
    label: "Operasi",
    icon: Factory,
    items: [
      { href: "/manufacturing", label: "Manufaktur", icon: Factory },
      { href: "/mrp", label: "MRP", icon: Calculator },
      { href: "/hr", label: "HR", icon: Users },
      { href: "/payroll", label: "Payroll" },
      { href: "/returns", label: "Return & Claim" },
      { href: "/projects", label: "Projects", icon: ClipboardList },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    icon: Sparkles,
    items: [
      { href: "/ai", label: "AI Insight", icon: Sparkles },
      { href: "/import", label: "Import CSV" },
      { href: "/notifications", label: "Notifikasi", icon: Bell },
    ],
  },
  {
    id: "settings",
    label: "Pengaturan",
    icon: Settings,
    items: [
      { href: "/settings/portal", label: "Portal Token" },
      { href: "/settings/users", label: "Pengguna" },
      { href: "/settings/audit", label: "Audit Log" },
      { href: "/settings/readiness", label: "Readiness" },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupHasActive(pathname: string, group: NavGroup) {
  return group.items.some((item) => isActivePath(pathname, item.href));
}

function NavLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
        collapsed && "justify-center px-2",
        active
          ? "bg-accent text-accent-foreground shadow-sm"
          : "text-foreground/75 hover:bg-accent/10 hover:text-foreground",
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "size-4 shrink-0",
            active ? "opacity-100" : "opacity-70 group-hover:opacity-100",
          )}
        />
      ) : (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            active ? "bg-accent-foreground" : "bg-muted-foreground/40",
          )}
        />
      )}
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

function SidebarNav({
  pathname,
  collapsed,
  query,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  query: string;
  onNavigate?: () => void;
}) {
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.href.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  if (collapsed) {
    const flat = groups.flatMap((g) => g.items);
    return (
      <nav className="space-y-1 p-2">
        {flat.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    );
  }

  return (
    <nav className="space-y-2 p-2">
      {groups.map((group) => {
        const active = groupHasActive(pathname, group);
        const Icon = group.icon;
        const defaultExpanded = active || Boolean(q) || group.id === "home";
        return (
          <Disclosure
            key={group.id}
            defaultExpanded={defaultExpanded}
            className="rounded-xl border border-transparent"
          >
            <Disclosure.Heading>
              <Disclosure.Trigger
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wide transition-colors",
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-surface-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{group.label}</span>
                <Disclosure.Indicator className="size-3.5 opacity-60" />
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="mt-0.5 space-y-0.5 border-l border-border/70 ml-3.5 pl-2">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                ))}
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#60241E] to-[#E77B49] text-sm font-bold text-[#fff5f0] shadow-sm">
        A
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <div className="truncate text-sm font-bold tracking-tight text-foreground">
            Arunika ERP
          </div>
          <div className="truncate text-[11px] text-muted">Modular operations</div>
        </div>
      ) : null}
    </div>
  );
}

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
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");

  const currentLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => isActivePath(pathname, i.href))
      ?.label ?? "ERP";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(231,123,73,0.22),_transparent_55%),linear-gradient(180deg,#fff5f0_0%,#fde8df_45%,#fff5f0_100%)] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1700px]">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/80 bg-surface/90 backdrop-blur-md transition-[width] duration-200 lg:flex",
            collapsed ? "w-[72px]" : "w-[280px]",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/80 px-3 py-4">
            <Brand collapsed={collapsed} />
            <HeroButton
              variant="ghost"
              size="sm"
              isIconOnly
              aria-label={collapsed ? "Perluas menu" : "Ciutkan menu"}
              onPress={() => setCollapsed((v) => !v)}
            >
              {collapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronLeft className="size-4" />
              )}
            </HeroButton>
          </div>

          {!collapsed ? (
            <div className="border-b border-border/80 px-3 py-3">
              <div className="mb-2 truncate rounded-lg bg-accent/5 px-2.5 py-2 text-xs">
                <span className="text-muted">Perusahaan</span>
                <div className="truncate font-medium text-foreground">
                  {companyName}
                </div>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <Input
                  fullWidth
                  className="pl-8 text-sm"
                  placeholder="Cari menu..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <ScrollShadow className="flex-1 overflow-y-auto">
            <SidebarNav
              pathname={pathname}
              collapsed={collapsed}
              query={collapsed ? "" : query}
            />
          </ScrollShadow>

          <div className="border-t border-border/80 p-3">
            {!collapsed ? (
              <Chip color="accent" size="sm" variant="soft" className="w-full justify-center">
                <Chip.Label>HeroUI · multi-tenant</Chip.Label>
              </Chip>
            ) : (
              <div className="mx-auto size-2 rounded-full bg-accent" />
            )}
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/80 bg-surface/85 px-3 py-3 backdrop-blur-md md:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {/* Mobile menu */}
                <Drawer key={pathname}>
                  <Drawer.Trigger>
                    <HeroButton
                      variant="secondary"
                      size="sm"
                      isIconOnly
                      className="lg:hidden"
                      aria-label="Buka menu"
                    >
                      <Menu className="size-4" />
                    </HeroButton>
                  </Drawer.Trigger>
                  <Drawer.Backdrop>
                    <Drawer.Content placement="left" className="w-[min(100%,20rem)]">
                      <Drawer.Dialog>
                        <Drawer.Header className="border-b border-border">
                          <Brand />
                          <Drawer.CloseTrigger />
                        </Drawer.Header>
                        <Drawer.Body className="p-0">
                          <div className="border-b border-border px-3 py-3">
                            <div className="mb-2 truncate text-xs text-muted">
                              {companyName}
                            </div>
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                              <Input
                                fullWidth
                                className="pl-8 text-sm"
                                placeholder="Cari menu..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                              />
                            </div>
                          </div>
                          <ScrollShadow className="max-h-[70vh]">
                            <SidebarNav
                              pathname={pathname}
                              collapsed={false}
                              query={query}
                            />
                          </ScrollShadow>
                        </Drawer.Body>
                      </Drawer.Dialog>
                    </Drawer.Content>
                  </Drawer.Backdrop>
                </Drawer>

                <div className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar name={userName} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {currentLabel}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {userName}
                      <span className="mx-1.5 text-border">·</span>
                      {companyName}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link href="/notifications" className="hidden sm:block">
                  <HeroButton variant="ghost" size="sm" isIconOnly aria-label="Notifikasi">
                    <Bell className="size-4" />
                  </HeroButton>
                </Link>
                <Link href="/ai" className="hidden md:block">
                  <HeroButton variant="secondary" size="sm">
                    <Sparkles className="mr-1.5 size-3.5" />
                    AI
                  </HeroButton>
                </Link>
                {companies.length > 1 ? (
                  <form
                    action={actionSwitchCompany}
                    className="hidden items-center gap-2 md:flex"
                  >
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
                <Separator
                  orientation="vertical"
                  className="hidden h-6 sm:block"
                />
                <LogoutLink>
                  <HeroButton variant="secondary" size="sm">
                    Keluar
                  </HeroButton>
                </LogoutLink>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
