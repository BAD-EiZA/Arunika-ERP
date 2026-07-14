import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    "src/lib/**/*.{ts,tsx}",
    "src/server/services/**/*.{ts,tsx}",
    "!src/lib/db.ts",
    "!src/lib/auth.ts",
    "!src/lib/audit.ts",
    "!src/lib/cloudinary.ts",
    "!src/lib/api-client.ts",
    "!src/lib/api-route.ts",
    "!src/lib/query-keys.ts",
    "!src/server/services/manufacturing.ts",
    "!src/server/services/mrp.ts",
    "!src/server/services/mrp-convert.ts",
    "!src/server/services/hr.ts",
    "!src/server/services/payroll.ts",
    "!src/server/services/returns.ts",
    "!src/server/services/projects.ts",
    "!src/server/services/ai.ts",
    "!src/server/services/credit-notes.ts",
    "!src/server/services/crm.ts",
    "!src/server/services/import-csv.ts",
    "!src/server/services/notifications.ts",
    "!src/server/services/portal.ts",
    "!src/server/services/pos.ts",
    "!src/server/services/reports.ts",
    "!src/server/services/wms.ts",
    "!src/lib/pdf.ts",
    "!**/__tests__/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov", "json-summary"],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};

export default config;
