import { prisma } from "@/lib/db";
import { validationError } from "@/lib/errors";
import { createCustomer, createProduct, createSupplier } from "@/server/services/master-data";
import { postStockMovement } from "@/server/services/inventory";

function parseCsv(text: string): string[][] {
  const lines = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cols.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

export async function importProductsCsv(companyId: string, csv: string) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw validationError("CSV produk kosong");
  const [header, ...data] = rows;
  const idx = (name: string) =>
    header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iSku = idx("sku");
  const iName = idx("name");
  const iUnit = idx("unit");
  if (iSku < 0 || iName < 0) throw validationError("Header wajib: sku,name[,unit,purchasePrice,salePrice]");

  let unit = await prisma.unit.findFirst({
    where: { companyId, isActive: true },
  });
  if (!unit) {
    unit = await prisma.unit.create({
      data: { companyId, name: "Pieces", symbol: "Pcs", precision: 0 },
    });
  }

  const result = { created: 0, errors: [] as string[] };
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    try {
      let unitId = unit.id;
      if (iUnit >= 0 && row[iUnit]) {
        const u =
          (await prisma.unit.findFirst({
            where: { companyId, symbol: row[iUnit] },
          })) ||
          (await prisma.unit.create({
            data: {
              companyId,
              name: row[iUnit],
              symbol: row[iUnit],
              precision: 2,
            },
          }));
        unitId = u.id;
      }
      await createProduct({
        companyId,
        sku: row[iSku],
        name: row[iName],
        unitId,
        purchasePrice: row[idx("purchasePrice")] || 0,
        salePrice: row[idx("salePrice")] || 0,
      });
      result.created++;
    } catch (e) {
      result.errors.push(`Baris ${r + 2}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return result;
}

export async function importCustomersCsv(companyId: string, csv: string) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw validationError("CSV pelanggan kosong");
  const [header, ...data] = rows;
  const idx = (name: string) =>
    header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iCode = idx("code");
  const iName = idx("name");
  if (iCode < 0 || iName < 0) throw validationError("Header wajib: code,name[,email,phone]");

  const result = { created: 0, errors: [] as string[] };
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    try {
      await createCustomer({
        companyId,
        code: row[iCode],
        name: row[iName],
        email: row[idx("email")] || undefined,
        phone: row[idx("phone")] || undefined,
      });
      result.created++;
    } catch (e) {
      result.errors.push(`Baris ${r + 2}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return result;
}

export async function importSuppliersCsv(companyId: string, csv: string) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw validationError("CSV pemasok kosong");
  const [header, ...data] = rows;
  const idx = (name: string) =>
    header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iCode = idx("code");
  const iName = idx("name");
  if (iCode < 0 || iName < 0) throw validationError("Header wajib: code,name[,email,phone]");

  const result = { created: 0, errors: [] as string[] };
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    try {
      await createSupplier({
        companyId,
        code: row[iCode],
        name: row[iName],
        email: row[idx("email")] || undefined,
        phone: row[idx("phone")] || undefined,
      });
      result.created++;
    } catch (e) {
      result.errors.push(`Baris ${r + 2}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return result;
}

export async function importOpeningStockCsv(
  companyId: string,
  userId: string,
  csv: string,
) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw validationError("CSV stok kosong");
  const [header, ...data] = rows;
  const idx = (name: string) =>
    header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iSku = idx("sku");
  const iWh = idx("warehouse");
  const iQty = idx("quantity");
  if (iSku < 0 || iWh < 0 || iQty < 0) {
    throw validationError("Header wajib: sku,warehouse,quantity[,unitCost]");
  }

  const result = { created: 0, errors: [] as string[] };
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    try {
      const product = await prisma.product.findFirst({
        where: { companyId, sku: row[iSku] },
      });
      const warehouse = await prisma.warehouse.findFirst({
        where: { companyId, code: row[iWh] },
      });
      if (!product || !warehouse) throw new Error("SKU/gudang tidak ditemukan");
      await prisma.$transaction((tx) =>
        postStockMovement(tx, {
          companyId,
          warehouseId: warehouse.id,
          productId: product.id,
          type: "OPENING_BALANCE",
          quantity: row[iQty],
          unitCost: row[idx("unitCost")] || product.purchasePrice.toString(),
          referenceType: "CsvImport",
          createdById: userId,
          idempotencyKey: `csv-open:${product.id}:${warehouse.id}:${r}`,
        }),
      );
      result.created++;
    } catch (e) {
      result.errors.push(`Baris ${r + 2}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return result;
}
