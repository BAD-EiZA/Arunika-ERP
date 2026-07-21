"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { AppDropdown, toast } from "@/components/heroui-kit";
import { filterNavByPermissions } from "@/lib/nav-access";

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

type PermissionGrant = "*" | string[];

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
      { href: "/finance/recurring", label: "Recurring" },
      { href: "/finance/periods", label: "Periode" },
      { href: "/finance/bank", label: "Bank" },
      { href: "/finance/budget", label: "Budget" },
      { href: "/finance/assets", label: "Aset Tetap" },
      { href: "/finance/expenses", label: "Biaya" },
      { href: "/finance/approvals", label: "Approval Matrix" },
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
        "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors duration-200",
        collapsed && "justify-center px-2",
        active
          ? "bg-[#0F4C75] text-white shadow-sm"
          : "text-foreground/75 hover:bg-[#0F4C75]/08 hover:text-[#0F4C75]",
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
  permissions,
}: {
  pathname: string;
  collapsed: boolean;
  query: string;
  onNavigate?: () => void;
  permissions: PermissionGrant;
}) {
  const router = useRouter();
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const allowed = filterNavByPermissions(NAV_GROUPS, permissions);
    if (!q) return allowed;
    return allowed
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            i.href.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [q, permissions]);

  if (collapsed) {
    return (
      <nav className="flex flex-col items-center gap-1 p-2">
        {groups.map((group) => {
          const active = groupHasActive(pathname, group);
          const Icon = group.icon;
          if (group.items.length === 1) {
            const only = group.items[0];
            return (
              <Link
                key={group.id}
                href={only.href}
                title={only.label}
                onClick={onNavigate}
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-foreground/70 hover:bg-accent/10 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </Link>
            );
          }
          return (
            <AppDropdown
              key={group.id}
              aria-label={group.label}
              placement="right"
              label={
                <HeroButton
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label={group.label}
                  className={cn(
                    "size-10 min-w-10",
                    active && "bg-accent/15 text-accent",
                  )}
                >
                  <Icon className="size-4" />
                </HeroButton>
              }
              items={group.items.map((item) => ({
                key: item.href,
                label: item.label,
                onAction: () => {
                  router.push(item.href);
                  onNavigate?.();
                },
              }))}
            />
          );
        })}
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
            key={`${group.id}-${defaultExpanded ? "open" : "closed"}`}
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
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4C75] to-[#3282B8] text-sm font-bold text-white shadow-sm">
        A
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <div className="truncate text-sm font-bold tracking-tight text-[#0F4C75]">
            Arunika ERP
          </div>
          <div className="truncate text-[11px] text-muted">Operasi terpadu</div>
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
  permissions = "*",
  roleCode,
}: {
  children: React.ReactNode;
  companyName: string;
  userName: string;
  companies: Array<{ id: string; name: string }>;
  activeCompanyId: string;
  permissions?: PermissionGrant;
  roleCode?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");

  const allowedNav = useMemo(
    () => filterNavByPermissions(NAV_GROUPS, permissions),
    [permissions],
  );

  const currentLabel =
    allowedNav.flatMap((g) => g.items).find((i) => isActivePath(pathname, i.href))
      ?.label ?? "ERP";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(50,130,184,0.14),_transparent_55%),linear-gradient(180deg,#f5fafd_0%,#eef6fb_50%,#f5fafd_100%)] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1700px]">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col overflow-x-hidden border-r border-border/70 bg-surface/95 shadow-[4px_0_24px_rgba(15,76,117,0.03)] backdrop-blur-md transition-[width] duration-200 lg:flex",
            collapsed ? "w-[72px]" : "w-[280px]",
          )}
        >
          <div
            className={cn(
              "flex border-b border-border/80 px-3 py-4",
              collapsed
                ? "flex-col items-center gap-2"
                : "items-center justify-between gap-2",
            )}
          >
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
              permissions={permissions}
            />
          </ScrollShadow>

          <div className="border-t border-border/80 p-3">
            {!collapsed ? (
              <Chip color="accent" size="sm" variant="soft" className="w-full justify-center">
                <Chip.Label>{roleCode || "ERP"}</Chip.Label>
              </Chip>
            ) : (
              <div className="mx-auto size-2 rounded-full bg-accent" />
            )}
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-surface/90 px-3 py-3 shadow-[0_1px_0_rgba(15,76,117,0.04)] backdrop-blur-xl md:px-5">
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
                              permissions={permissions}
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
                <div className="hidden lg:block">
                  <AppDropdown
                    label={
                      <HeroButton variant="ghost" size="sm">
                        Tools
                      </HeroButton>
                    }
                    items={[
                      {
                        key: "import",
                        label: "Import CSV",
                        onAction: () => {
                          window.location.href = "/import";
                        },
                      },
                      {
                        key: "reports",
                        label: "Laporan FS",
                        onAction: () => {
                          window.location.href = "/reports";
                        },
                      },
                      {
                        key: "ping",
                        label: "Toast uji",
                        onAction: () => toast.info("Shell dropdown OK"),
                      },
                    ]}
                  />
                </div>
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

          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
