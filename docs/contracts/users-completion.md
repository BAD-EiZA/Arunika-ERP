# Users completion contract

Schema additions: **none**. Existing Role/Permission/RolePermission, Membership, Invitation, EmailOutbox suffice.

Owned API: POST `/api/erp/users` actions `role.create`, `role.copy`, `role.update`, `role.disable`, `role.activate`, `role.delete`; `id` required except create. Fields `name`, `description`, `permissionCodes`; copy uses source `id`. Member action `reactivate` restores only active global identities with a prior accepted invitation (or pre-invite membership); unaccepted disabled invitations must be removed/reinvited. `Membership.joinedAt` defaults at creation, even for INVITED; never treat it alone as proof of acceptance. Existing last-owner protection retained.

Role grants: only system roles may resolve ROLE_PERMISSIONS; custom roles always use DB links. Reserved built-in codes cannot become custom codes. Tenant role mutations lock Company, forbid system/global role changes, own-role changes, unauthorized grants, used-role deletion/disable. Assigned custom-role permission increases prohibited unless administrator has unrestricted branch/warehouse scope; no silent broadening of scoped users.

Invitation email: configure trusted absolute `KINDE_SITE_URL` (or `NEXT_PUBLIC_APP_URL`) for email links. Invitations/resends enqueue EmailOutbox PENDING within the same transaction; result `delivery: QUEUED`, never delivery confirmation. Missing origin retains explicit MANUAL fallback. No SMTP/provider infrastructure exists; no new dependency/sender invented.

INTEGRATION WARNING (parent-owned notification service): existing `notifications.ts::flushEmailOutbox` marks messages SENT after console logging without transport. Disable fake flushing or implement a verified transport before claiming delivery; this task does not own that service. Pending invitation bodies contain bearer tokens; restrict operational access, never log bodies. Old queued links become invalid on resend/revoke; outbox retention needs operational policy.

Auth owner: ensure auth resolves ROLE_PERMISSIONS only when Role.isSystem is true; custom role permissions must come from DB and inactive roles must deny access. This task never edits auth.ts.
