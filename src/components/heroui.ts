/**
 * Re-exports: raw HeroUI + safe app kit.
 * Prefer @/components/ui for forms; heroui-kit for tabs/modal/dropdown helpers.
 */
"use client";

export {
  Alert,
  Avatar,
  Badge as HeroBadge,
  Breadcrumbs,
  Button as HeroButton,
  Card as HeroCard,
  Chip,
  Input as HeroInput,
  Label,
  Skeleton,
  Spinner,
  TextArea as HeroTextArea,
} from "@heroui/react";

export * from "@/components/heroui-kit";
