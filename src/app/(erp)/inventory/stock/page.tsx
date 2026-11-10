import Link from "next/link";
import { StockClient } from "./stock-client";

export default function StockPage() {
  return <><nav className="flex gap-4 p-4"><Link href="/inventory/workflows" className="underline">Transfer, opname, penyesuaian berdokumen</Link><Link href="/settings/locations" className="underline">Cabang dan gudang</Link></nav><StockClient /></>;
}
