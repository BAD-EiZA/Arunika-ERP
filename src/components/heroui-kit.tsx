"use client";

/**
 * HeroUI v3 wrappers — compound API per official docs.
 * https://www.heroui.com/docs/react/components/*
 */
import type { ReactNode } from "react";
import {
  Button,
  Checkbox,
  ComboBox,
  Dropdown,
  Input,
  InputGroup,
  Label,
  ListBox,
  Modal,
  NumberField,
  Select,
  TextField,
  Toast,
  toast,
} from "@heroui/react";
import { cn } from "@/lib/cn";

export { toast, Toast };

/** Toast.Provider — render once at app root (docs: no special placement required). */
export function ToastProvider({
  children,
  placement = "bottom end",
}: {
  children?: ReactNode;
  placement?:
    | "top"
    | "top start"
    | "top end"
    | "bottom"
    | "bottom start"
    | "bottom end";
}) {
  return (
    <>
      {children}
      <Toast.Provider placement={placement} maxVisibleToasts={4} />
    </>
  );
}

export function AppModal({
  trigger,
  title,
  children,
  size = "md",
  footer,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  size?: "xs" | "sm" | "md" | "lg" | "cover" | "full";
  footer?: ReactNode;
}) {
  return (
    <Modal>
      {trigger}
      <Modal.Backdrop>
        <Modal.Container size={size} placement="center">
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
            {footer ? <Modal.Footer>{footer}</Modal.Footer> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function AppDropdown({
  label,
  items,
  placement = "bottom",
  "aria-label": ariaLabel = "Menu",
}: {
  label: ReactNode;
  items: Array<{
    key: string;
    label: string;
    onAction?: () => void;
    danger?: boolean;
  }>;
  placement?: "bottom" | "bottom start" | "bottom end" | "top" | "top start" | "top end" | "left" | "left top" | "left bottom" | "right" | "right top" | "right bottom";
  "aria-label"?: string;
}) {
  return (
    <Dropdown>
      {typeof label === "string" ? (
        <Button aria-label={ariaLabel} variant="secondary" size="sm">
          {label}
        </Button>
      ) : (
        label
      )}
      <Dropdown.Popover placement={placement}>
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
              textValue={item.label}
              variant={item.danger ? "danger" : "default"}
            >
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function AppCheckbox({
  children,
  name,
  value,
  defaultSelected,
  isSelected,
  onChange,
}: {
  children: ReactNode;
  name?: string;
  value?: string;
  defaultSelected?: boolean;
  isSelected?: boolean;
  onChange?: (selected: boolean) => void;
}) {
  return (
    <Checkbox
      name={name}
      value={value}
      defaultSelected={defaultSelected}
      isSelected={isSelected}
      onChange={onChange}
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        {children}
      </Checkbox.Content>
    </Checkbox>
  );
}

export function AppNumberField({
  label,
  name,
  defaultValue,
  min,
  max,
  step,
  className,
}: {
  label: string;
  name?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <NumberField
      name={name}
      defaultValue={defaultValue}
      minValue={min}
      maxValue={max}
      step={step}
      className={cn("w-full max-w-full", className)}
    >
      <Label>{label}</Label>
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input className="w-full min-w-[5rem]" />
        <NumberField.IncrementButton />
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
  className,
}: {
  label?: string;
  name?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <TextField name={name} className={cn("w-full", className)}>
      {label ? <Label>{label}</Label> : null}
      <InputGroup fullWidth>
        {prefix ? <InputGroup.Prefix>{prefix}</InputGroup.Prefix> : null}
        <InputGroup.Input
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
        />
        {suffix ? <InputGroup.Suffix>{suffix}</InputGroup.Suffix> : null}
      </InputGroup>
    </TextField>
  );
}

export function AppHeroSelect({
  label,
  items,
  placeholder = "Pilih…",
  name,
  defaultSelectedKey,
  selectedKey,
  onSelectionChange,
  className,
}: {
  label?: string;
  items: Array<{ id: string; label: string }>;
  placeholder?: string;
  name?: string;
  defaultSelectedKey?: string;
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
  className?: string;
}) {
  return (
    <Select
      name={name}
      className={cn("w-full", className)}
      placeholder={placeholder}
      defaultValue={defaultSelectedKey}
      value={selectedKey}
      onChange={(value) => {
        if (value != null) onSelectionChange?.(String(value));
      }}
    >
      {label ? <Label>{label}</Label> : null}
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function AppComboBox({
  label,
  items,
  placeholder = "Cari…",
  onSelectionChange,
  className,
}: {
  label?: string;
  items: Array<{ id: string; label: string }>;
  placeholder?: string;
  onSelectionChange?: (key: string) => void;
  className?: string;
}) {
  return (
    <ComboBox
      className={cn("w-full", className)}
      menuTrigger="focus"
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange?.(String(key));
      }}
    >
      {label ? <Label>{label}</Label> : null}
      <ComboBox.InputGroup>
        <Input placeholder={placeholder} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

/** Date field (native type=date via TextField+Input — Calendar compound optional later). */
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
      {label ? <Label>{label}</Label> : null}
      <Input type="date" fullWidth />
    </TextField>
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
    <fieldset className={cn("rounded-lg border border-border p-3", className)}>
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      <div className="mt-2 space-y-3">{children}</div>
    </fieldset>
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
        <Button variant="secondary" size="sm">
          {triggerLabel}
        </Button>
      }
      footer={
        <>
          <Button slot="close" variant="secondary">
            Batal
          </Button>
          <Button
            onPress={() => {
              onConfirm();
              toast.success("Berhasil");
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{description}</p>
    </AppModal>
  );
}
