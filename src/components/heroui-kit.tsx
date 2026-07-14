"use client";

/**
 * App-facing HeroUI wrappers (safe defaults).
 * Native form helpers stay in ui.tsx (FormData-friendly).
 */
import type { ReactNode } from "react";
import {
  Checkbox,
  ComboBox,
  Dropdown,
  ErrorMessage,
  Fieldset,
  Form as HeroForm,
  Input,
  InputGroup,
  Label,
  ListBox,
  Meter,
  Modal,
  NumberField,
  Pagination,
  Popover,
  ProgressBar,
  Select as HeroSelect,
  Table as HeroTable,
  Tabs,
  TextField,
  Toast,
  toast,
  Button as HeroButton,
} from "@heroui/react";
import { cn } from "@/lib/cn";

export { toast, Toast };

export function AppForm({
  children,
  className,
  onSubmit,
}: {
  children: ReactNode;
  className?: string;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <HeroForm className={cn("space-y-3", className)} onSubmit={onSubmit as never}>
      {children}
    </HeroForm>
  );
}

export function AppFieldset({
  legend,
  children,
  className,
}: {
  legend: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Fieldset className={className}>
      <Fieldset.Legend className="mb-2 text-sm font-semibold">
        {legend}
      </Fieldset.Legend>
      <Fieldset.Group className="space-y-3">{children}</Fieldset.Group>
    </Fieldset>
  );
}

export function AppTextField({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
  error,
  description,
}: {
  label: string;
  name?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  description?: string;
}) {
  return (
    <TextField
      name={name}
      type={type}
      isRequired={required}
      defaultValue={defaultValue}
      className="w-full"
    >
      <Label className="mb-1 text-sm">{label}</Label>
      <Input placeholder={placeholder} fullWidth />
      {description ? (
        <p className="mt-1 text-xs text-muted">{description}</p>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </TextField>
  );
}

export function AppNumberField({
  label,
  name,
  defaultValue,
  min,
  max,
  step,
}: {
  label: string;
  name?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <NumberField
      name={name}
      defaultValue={defaultValue}
      minValue={min}
      maxValue={max}
      step={step}
      className="w-full"
    >
      <Label className="mb-1 text-sm">{label}</Label>
      <NumberField.Group className="w-full">
        <NumberField.DecrementButton>-</NumberField.DecrementButton>
        <NumberField.Input className="w-full" />
        <NumberField.IncrementButton>+</NumberField.IncrementButton>
      </NumberField.Group>
    </NumberField>
  );
}

export function AppInputGroup({
  label,
  name,
  prefix,
  suffix,
  placeholder,
  type = "text",
  defaultValue,
}: {
  label?: string;
  name?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label ? <Label className="text-sm">{label}</Label> : null}
      <InputGroup fullWidth>
        {prefix ? <InputGroup.Prefix>{prefix}</InputGroup.Prefix> : null}
        <InputGroup.Input
          name={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
        />
        {suffix ? <InputGroup.Suffix>{suffix}</InputGroup.Suffix> : null}
      </InputGroup>
    </div>
  );
}

export function AppCheckbox({
  children,
  name,
  defaultSelected,
  value,
}: {
  children: ReactNode;
  name?: string;
  defaultSelected?: boolean;
  value?: string;
}) {
  return (
    <Checkbox name={name} value={value} defaultSelected={defaultSelected}>
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>{children}</Checkbox.Content>
    </Checkbox>
  );
}

export function AppProgress({
  label,
  value,
  max = 100,
}: {
  label?: string;
  value: number;
  max?: number;
}) {
  return (
    <ProgressBar value={value} maxValue={max} className="w-full">
      {label ? (
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>{label}</span>
          <ProgressBar.Output />
        </div>
      ) : null}
      <ProgressBar.Track>
        <ProgressBar.Fill />
      </ProgressBar.Track>
    </ProgressBar>
  );
}

export function AppMeter({
  label,
  value,
  max = 100,
}: {
  label?: string;
  value: number;
  max?: number;
}) {
  return (
    <Meter value={value} maxValue={max} className="w-full">
      {label ? (
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>{label}</span>
          <Meter.Output />
        </div>
      ) : null}
      <Meter.Track>
        <Meter.Fill />
      </Meter.Track>
    </Meter>
  );
}

export function AppTabs({
  items,
  defaultSelectedKey,
}: {
  items: Array<{ id: string; title: string; content: ReactNode }>;
  defaultSelectedKey?: string;
}) {
  return (
    <Tabs defaultSelectedKey={defaultSelectedKey ?? items[0]?.id} className="w-full">
      <Tabs.ListContainer>
        <Tabs.List>
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

export function AppModal({
  trigger,
  title,
  children,
  size = "md",
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "cover" | "full" | "xs";
}) {
  return (
    <Modal>
      <Modal.Trigger>{trigger}</Modal.Trigger>
      <Modal.Backdrop>
        <Modal.Container size={size} placement="center">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function AppDropdown({
  label,
  items,
}: {
  label: ReactNode;
  items: Array<{ key: string; label: string; onAction?: () => void; danger?: boolean }>;
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger>{label}</Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          onAction={(key) => {
            const item = items.find((i) => i.key === String(key));
            item?.onAction?.();
          }}
        >
          {items.map((item) => (
            <Dropdown.Item
              key={item.key}
              id={item.key}
              className={item.danger ? "text-danger" : undefined}
            >
              {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function AppPopover({
  trigger,
  title,
  children,
}: {
  trigger: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <Popover.Trigger>{trigger}</Popover.Trigger>
      <Popover.Content className="max-w-xs p-3">
        <Popover.Dialog>
          {title ? <Popover.Heading className="mb-1 text-sm font-semibold">{title}</Popover.Heading> : null}
          <div className="text-sm text-muted">{children}</div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

export function AppListBox({
  items,
  "aria-label": ariaLabel,
  onAction,
}: {
  items: Array<{ id: string; label: string }>;
  "aria-label"?: string;
  onAction?: (id: string) => void;
}) {
  return (
    <ListBox
      aria-label={ariaLabel ?? "List"}
      className="max-h-48 overflow-auto rounded-lg border border-border p-1"
      onAction={(key) => onAction?.(String(key))}
    >
      {items.map((item) => (
        <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
          {item.label}
        </ListBox.Item>
      ))}
    </ListBox>
  );
}

export function AppHeroSelect({
  label,
  items,
  placeholder = "Pilih…",
  onSelectionChange,
  selectedKey,
  defaultSelectedKey,
}: {
  label?: string;
  items: Array<{ id: string; label: string }>;
  placeholder?: string;
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectionChange?: (key: string) => void;
}) {
  return (
    <HeroSelect
      className="w-full"
      selectedKey={selectedKey}
      defaultSelectedKey={defaultSelectedKey}
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange?.(String(key));
      }}
      placeholder={placeholder}
    >
      {label ? <Label className="mb-1 text-sm">{label}</Label> : null}
      <HeroSelect.Trigger>
        <HeroSelect.Value />
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
              {item.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}

export function AppComboBox({
  label,
  items,
  placeholder = "Cari…",
  onSelectionChange,
}: {
  label?: string;
  items: Array<{ id: string; label: string }>;
  placeholder?: string;
  onSelectionChange?: (key: string) => void;
}) {
  return (
    <ComboBox
      className="w-full"
      menuTrigger="focus"
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange?.(String(key));
      }}
    >
      {label ? <Label className="mb-1 text-sm">{label}</Label> : null}
      <ComboBox.InputGroup>
        <Input placeholder={placeholder} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
              {item.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

/** Date input via TextField — Calendar/DatePicker compound needs i18n provider later. */
export function AppDatePicker({
  label,
  name,
  defaultValue,
}: {
  label?: string;
  name?: string;
  defaultValue?: string;
}) {
  return (
    <TextField name={name} type="date" defaultValue={defaultValue} className="w-full">
      {label ? <Label className="mb-1 text-sm">{label}</Label> : null}
      <Input type="date" fullWidth />
    </TextField>
  );
}

export function AppCalendar() {
  return (
    <TextField type="date" className="w-full">
      <Label className="mb-1 text-sm">Tanggal</Label>
      <Input type="date" fullWidth />
    </TextField>
  );
}

/** HeroUI table shell — still accepts header strings + row children (`tr`). */
export function HeroDataTable({
  headers,
  children,
  className,
}: {
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <HeroTable className={cn("w-full", className)} variant="primary">
      <HeroTable.ScrollContainer>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {children}
            </tbody>
          </table>
        </div>
      </HeroTable.ScrollContainer>
    </HeroTable>
  );
}

export function HeroPaginationBar({
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

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted">
        Menampilkan {from}–{to} dari {total}
      </p>
      <Pagination>
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous
              isDisabled={disabled || page <= 1}
              onPress={() => onPageChange(page - 1)}
            >
              <Pagination.PreviousIcon />
              Prev
            </Pagination.Previous>
          </Pagination.Item>
          <Pagination.Item>
            <Pagination.Link isActive>{page}</Pagination.Link>
          </Pagination.Item>
          <Pagination.Item>
            <span className="px-1 text-xs text-muted">/ {totalPages}</span>
          </Pagination.Item>
          <Pagination.Item>
            <Pagination.Next
              isDisabled={disabled || page >= totalPages}
              onPress={() => onPageChange(page + 1)}
            >
              Next
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
    </div>
  );
}

export function ConfirmModal({
  triggerLabel,
  title,
  description,
  onConfirm,
  confirmLabel = "Ya, lanjut",
}: {
  triggerLabel: string;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <AppModal
      title={title}
      trigger={
        <HeroButton type="button" variant="secondary">
          {triggerLabel}
        </HeroButton>
      }
    >
      <p className="mb-4 text-sm text-muted">{description}</p>
      <HeroButton
        type="button"
        variant="primary"
        onPress={() => {
          onConfirm();
          toast.success("Berhasil");
        }}
      >
        {confirmLabel}
      </HeroButton>
    </AppModal>
  );
}
