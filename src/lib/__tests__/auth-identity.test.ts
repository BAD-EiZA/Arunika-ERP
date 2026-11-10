jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: { user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } },
}));
jest.mock("@kinde-oss/kinde-auth-nextjs/server", () => ({
  getKindeServerSession: jest.fn(),
}));

import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const db = prisma.user as unknown as Record<"findFirst" | "findUnique" | "create" | "update", jest.Mock>;
const identity = { id: "kinde-current", email: "owner@example.com", given_name: "Owner" };
const account = { id: "owner", email: identity.email, name: "Owner", kindeUserId: "kinde-original", isActive: true };
const oldEnv = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  process.env.MOCK_AUTH = "false";
  (getKindeServerSession as jest.Mock).mockReturnValue({
    isAuthenticated: jest.fn().mockResolvedValue(true),
    getUser: jest.fn().mockResolvedValue(identity),
  });
});
afterEach(() => { process.env = { ...oldEnv }; });

function rows(users: (typeof account | (Omit<typeof account, "kindeUserId"> & { kindeUserId: null }))[]) {
  db.findFirst.mockImplementation(async ({ where }) => users.find(user =>
    where.OR.some((condition: Record<string, unknown>) =>
      Object.entries(condition).every(([key, value]) => user[key as keyof typeof user] === value))) ?? null);
  db.findUnique.mockImplementation(async ({ where }) => users.find(user =>
    Object.entries(where).every(([key, value]) => user[key as keyof typeof user] === value)) ?? null);
}

test.each(["kinde-original", null])("email alone cannot claim an existing account bound to %s", async kindeUserId => {
  rows([{ ...account, kindeUserId }]);
  db.update.mockResolvedValue({ ...account, kindeUserId: identity.id });
  expect(await getSessionUser()).toBeNull();
  expect(db.update).not.toHaveBeenCalled();
  expect(db.create).not.toHaveBeenCalled();
});

test("matching Kinde ID authenticates even when email changed", async () => {
  rows([{ ...account, kindeUserId: identity.id, email: "old@example.com" }]);
  expect(await getSessionUser()).toMatchObject({ id: account.id, kindeUserId: identity.id });
  expect(db.update).not.toHaveBeenCalled();
});

test("matching Kinde ID takes precedence over another account with the session email", async () => {
  rows([account, { ...account, id: "current", kindeUserId: identity.id, email: "old@example.com" }]);
  expect(await getSessionUser()).toMatchObject({ id: "current", kindeUserId: identity.id });
  expect(db.findUnique).toHaveBeenCalledTimes(1);
});

test("deactivated matching Kinde ID cannot authenticate", async () => {
  rows([{ ...account, kindeUserId: identity.id, isActive: false }]);
  expect(await getSessionUser()).toBeNull();
});

test("new Kinde identity creates a new account when email is unclaimed", async () => {
  rows([]);
  db.create.mockResolvedValue({ ...account, kindeUserId: identity.id });
  expect(await getSessionUser()).toMatchObject({ id: account.id, kindeUserId: identity.id });
  expect(db.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: identity.email, kindeUserId: identity.id }) });
});
