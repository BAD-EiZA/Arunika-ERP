import "dotenv/config";
import { prisma } from "../src/lib/db";
import { cleanupFiles } from "../src/server/services/file-cleanup";

cleanupFiles()
  .then((result) => {
    console.log("File cleanup:", result);
    if (result.failed) process.exitCode = 1;
  })
  .catch((error) => { console.error("File cleanup failed:", error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
