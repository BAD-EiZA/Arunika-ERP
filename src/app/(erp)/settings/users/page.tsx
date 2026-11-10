import { requirePermission } from "@/lib/auth";
import UsersClient from "./users-client";

export default async function UsersPage() {
  await requirePermission("user:view");
  return <UsersClient />;
}
