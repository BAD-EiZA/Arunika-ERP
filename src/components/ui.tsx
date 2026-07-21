"use client";

import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import {
  Alert,
  Avatar,
  Breadcrumbs,
  Button as HeroButton,
  Card as HeroCard,
  Chip,
  Input as HeroInput,
  Label as HeroLabel,
  Pagination,
  Skeleton,
  Spinner,
  Table as HeroTable,
  Tabs,
  TextArea as HeroTextArea,
} from "@heroui/react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  crumbs?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-2">
        {crumbs && crumbs.length > 0 ? (
          <Breadcrumbs className="text-xs">
            {crumbs.map((c) => (
              <Breadcrumbs.Item key={c.label} href={c.href}>
                {c.label}
              </Breadcrumbs.Item>
            ))}
          </Breadcrumbs>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F4C75] md:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}

export function Card({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <HeroCard
      className={cn(
        "w-full rounded-2xl border border-border/80 shadow-[0_2px_8px_rgba(15,76,117,0.04)]",
        className,
      )}
      variant="default"
    >
      {title ? (
        <HeroCard.Header>
          <HeroCard.Title className="text-sm font-semibold text-[#0F4C75]">
            {title}
          </HeroCard.Title>
        </HeroCard.Header>
      ) : null}
      <HeroCard.Content className={title ? undefined : "pt-4"}>
        {children}
      </HeroCard.Content>
    </HeroCard>
  );
}

export function Button({
  className,
  variant = "primary",
  type = "button",
  disabled,
  children,
  formAction,
  name,
  value,
  onClick,
}: {
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  children?: ReactNode;
  formAction?: ButtonHTMLAttributes<HTMLButtonElement>["formAction"];
  name?: string;
  value?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
}) {
  const heroVariant =
    variant === "primary"
      ? "primary"
      : variant === "secondary"
        ? "secondary"
        : variant === "danger"
          ? "danger"
          : "ghost";

  return (
    <HeroButton
      type={type}
      variant={heroVariant}
      isDisabled={disabled}
      className={className}
      formAction={formAction as never}
      name={name}
      value={value}
      onClick={onClick as never}
    >
      {children}
    </HeroButton>
  );
}

export function Input({
  className,
  name,
  type,
  required,
  defaultValue,
  placeholder,
  step,
  min,
  max,
  disabled,
  value,
  onChange,
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <HeroInput
      fullWidth
      className={className}
      name={name}
      type={type}
      required={required}
      defaultValue={defaultValue as string | number | undefined}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={value as string | number | undefined}
      onChange={onChange as never}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent focus:ring-2",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  name,
  required,
  defaultValue,
  placeholder,
  rows,
  disabled,
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <HeroTextArea
      fullWidth
      className={className}
      name={name}
      required={required}
      defaultValue={defaultValue as string | undefined}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <HeroLabel htmlFor={htmlFor} className="mb-1">
      {children}
    </HeroLabel>
  );
}

export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "success"
      : tone === "warning"
        ? "warning"
        : tone === "danger"
          ? "danger"
          : "default";

  return (
    <Chip color={color} size="sm" variant="soft">
      <Chip.Label>{children}</Chip.Label>
    </Chip>
  );
}

/**
 * HeroUI Table (v3 correct compound API).
 * Accepts legacy children as <tr><td>…</td></tr> and maps to Table.Row/Cell.
 */
export function Table({
  headers,
  children,
  "aria-label": ariaLabel = "Data table",
}: {
  headers: string[];
  children: ReactNode;
  "aria-label"?: string;
}) {
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<{
    children?: ReactNode;
  }>[];

  return (
    <HeroTable>
      <HeroTable.ScrollContainer>
        <HeroTable.Content
          aria-label={ariaLabel}
          className="min-w-full"
        >
          <HeroTable.Header>
            {headers.map((h, i) => (
              <HeroTable.Column key={h} isRowHeader={i === 0}>
                {h}
              </HeroTable.Column>
            ))}
          </HeroTable.Header>
          <HeroTable.Body>
            {rows.map((row, rowIndex) => {
              const cells = Children.toArray(row.props.children).filter(
                isValidElement,
              ) as ReactElement<{ children?: ReactNode }>[];
              const rowId = String(row.key ?? `row-${rowIndex}`);
              return (
                <HeroTable.Row key={rowId} id={rowId}>
                  {cells.map((cell, cellIndex) => (
                    <HeroTable.Cell key={`${rowId}-${cellIndex}`}>
                      {cell.props.children}
                    </HeroTable.Cell>
                  ))}
                </HeroTable.Row>
              );
            })}
          </HeroTable.Body>
        </HeroTable.Content>
      </HeroTable.ScrollContainer>
    </HeroTable>
  );
}

export function Form({
  children,
  className,
  onSubmit,
}: {
  children: ReactNode;
  className?: string;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form className={cn("space-y-3", className)} onSubmit={onSubmit}>
      {children}
    </form>
  );
}

export function EmptyState({
  message,
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  compact,
}: {
  /** @deprecated prefer title + description; still works as body text */
  message?: string;
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const heading = title ?? (description || action ? "Belum ada data" : undefined);
  const body = description ?? message ?? "Tidak ada data";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#0F4C75]/15 bg-[color-mix(in_srgb,#BBE1FA_12%,white)] text-center",
        compact ? "px-4 py-8" : "px-6 py-12",
        className,
      )}
    >
      <div
        className={cn(
          "mb-3 flex items-center justify-center rounded-2xl bg-white text-[#0F4C75] shadow-sm ring-1 ring-[#0F4C75]/10",
          compact ? "size-10" : "size-12",
        )}
      >
        <Icon className={compact ? "size-5" : "size-6"} strokeWidth={1.75} />
      </div>
      {heading ? (
        <p className="text-sm font-semibold text-[#0F4C75]">{heading}</p>
      ) : null}
      <p
        className={cn(
          "max-w-sm text-sm leading-relaxed text-muted",
          heading ? "mt-1" : null,
        )}
      >
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-surface/95 p-4 shadow-[0_2px_8px_rgba(15,76,117,0.05)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-4 -top-4 size-16 rounded-full bg-[#BBE1FA]/25 blur-2xl" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
        {Icon ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#E8F4FC] text-[#0F4C75]">
            <Icon className="size-4" />
          </div>
        ) : null}
      </div>
      <p className="relative mt-2 text-2xl font-semibold tracking-tight text-[#0F4C75] tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="relative mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Shared vertical rhythm for list/form module pages */
export function ListPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5 md:space-y-6", className)}>{children}</div>
  );
}

export function SectionLabel({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-[#0F4C75]">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function pageNumbers(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1) as Array<
      number | "ellipsis"
    >;
  }
  const pages: Array<number | "ellipsis"> = [1];
  if (page > 3) pages.push("ellipsis");
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (page < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

/** HeroUI Pagination — docs: onPress, Previous/Next + Link. */
export function PaginationBar({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (total === 0) return null;
  const from = (page - 1) * (limit ?? 20) + 1;
  const to = Math.min(page * (limit ?? 20), total);
  const pages = pageNumbers(page, totalPages);

  return (
    <Pagination className="mt-3 w-full" size="sm">
      <Pagination.Summary>
        Menampilkan {from}–{to} dari {total}
      </Pagination.Summary>
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous
            isDisabled={disabled || page <= 1}
            onPress={() => onPageChange(page - 1)}
          >
            <Pagination.PreviousIcon />
            <span>Sebelumnya</span>
          </Pagination.Previous>
        </Pagination.Item>
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <Pagination.Item key={`e-${i}`}>
              <Pagination.Ellipsis />
            </Pagination.Item>
          ) : (
            <Pagination.Item key={p}>
              <Pagination.Link
                isActive={p === page}
                isDisabled={disabled}
                onPress={() => onPageChange(p)}
              >
                {p}
              </Pagination.Link>
            </Pagination.Item>
          ),
        )}
        <Pagination.Item>
          <Pagination.Next
            isDisabled={disabled || page >= totalPages}
            onPress={() => onPageChange(page + 1)}
          >
            <span>Berikutnya</span>
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}

/** HeroUI Tabs — docs: Tab id + Indicator inside Tab, Panel id match. */
export function AppTabs({
  items,
  defaultSelectedKey,
  "aria-label": ariaLabel = "Tabs",
}: {
  items: Array<{ id: string; title: string; content: ReactNode }>;
  defaultSelectedKey?: string;
  "aria-label"?: string;
}) {
  if (!items.length) return null;
  return (
    <Tabs
      className="w-full"
      defaultSelectedKey={defaultSelectedKey ?? items[0].id}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={ariaLabel}>
          {items.map((item) => (
            <Tabs.Tab key={item.id} id={item.id}>
              {item.title}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {items.map((item) => (
        <Tabs.Panel key={item.id} id={item.id} className="pt-4">
          {item.content}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

export function AppAlert({
  title,
  description,
  status = "default",
}: {
  title: string;
  description?: string;
  status?: "default" | "accent" | "success" | "warning" | "danger";
}) {
  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        {description ? (
          <Alert.Description>{description}</Alert.Description>
        ) : null}
      </Alert.Content>
    </Alert>
  );
}

export function UserAvatar({
  name,
  src,
  size = "sm",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Avatar size={size} color="accent">
      {src ? <Avatar.Image src={src} alt={name} /> : null}
      <Avatar.Fallback>{initials || "?"}</Avatar.Fallback>
    </Avatar>
  );
}

export function LoadingBlock({
  label = "Memuat...",
  rows = 4,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Spinner size="sm" color="accent" />
        <span>{label}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: Math.min(rows, 4) }, (_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/60 bg-surface/80 p-4"
          >
            <Skeleton className="h-3 w-1/3 rounded-md" />
            <Skeleton className="mt-3 h-7 w-1/2 rounded-md" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex gap-3 border-t border-border/50 px-4 py-3"
          >
            <Skeleton className="h-3 w-1/4 rounded-md" />
            <Skeleton className="h-3 w-1/5 rounded-md" />
            <Skeleton className="h-3 flex-1 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
