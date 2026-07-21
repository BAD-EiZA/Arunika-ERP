"use client";

import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";

const PALETTE = [
  "#0F4C75",
  "#3282B8",
  "#1B262C",
  "#5a9fc9",
  "#BBE1FA",
  "#1a6a9a",
  "#0a3a5c",
];

type Point = { label: string; value: number };

function shortMonth(ym: string) {
  const [, m] = ym.split("-");
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  return names[Number(m) - 1] ?? ym;
}

export function GroupedBarChart({
  labels,
  seriesA,
  seriesB,
  aLabel = "Penjualan",
  bLabel = "Pembelian",
}: {
  labels: string[];
  seriesA: number[];
  seriesB: number[];
  aLabel?: string;
  bLabel?: string;
}) {
  const max = Math.max(1, ...seriesA, ...seriesB);
  const w = 520;
  const h = 200;
  const padL = 8;
  const padB = 28;
  const padT = 12;
  const chartH = h - padB - padT;
  const groupW = (w - padL * 2) / Math.max(labels.length, 1);
  const barW = Math.min(18, groupW * 0.32);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[11px] font-medium text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#0F4C75]" />
          {aLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#3282B8]" />
          {bLabel}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-48 w-full"
        role="img"
        aria-label="Bar chart"
      >
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + chartH * (1 - t);
          return (
            <line
              key={t}
              x1={padL}
              x2={w - padL}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-border/80"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
          );
        })}
        {labels.map((label, i) => {
          const cx = padL + groupW * i + groupW / 2;
          const ha = (seriesA[i] / max) * chartH;
          const hb = (seriesB[i] / max) * chartH;
          return (
            <g key={label}>
              <rect
                x={cx - barW - 2}
                y={padT + chartH - ha}
                width={barW}
                height={Math.max(ha, 1)}
                rx={4}
                fill="#0F4C75"
              >
                <title>{`${aLabel} ${label}: ${formatIdr(seriesA[i])}`}</title>
              </rect>
              <rect
                x={cx + 2}
                y={padT + chartH - hb}
                width={barW}
                height={Math.max(hb, 1)}
                rx={4}
                fill="#3282B8"
              >
                <title>{`${bLabel} ${label}: ${formatIdr(seriesB[i])}`}</title>
              </rect>
              <text
                x={cx}
                y={h - 8}
                textAnchor="middle"
                className="fill-muted"
                fontSize={11}
              >
                {shortMonth(label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DonutChart({
  items,
  centerLabel,
  centerValue,
}: {
  items: Point[];
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = 54;
  const cx = 70;
  const cy = 70;
  const stroke = 18;
  const c = 2 * Math.PI * r;

  const segments = items.reduce<
    Array<{ label: string; value: number; len: number; offset: number; color: string }>
  >((acc, item, i) => {
    const len = (item.value / total) * c;
    const prev = acc[acc.length - 1];
    const offset = prev ? prev.offset + prev.len : 0;
    acc.push({
      label: item.label,
      value: item.value,
      len,
      offset,
      color: PALETTE[i % PALETTE.length],
    });
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 140 140"
        className="size-36 shrink-0"
        role="img"
        aria-label="Donut chart"
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-border/50"
          strokeWidth={stroke}
        />
        {segments.map((seg) => (
          <circle
            key={seg.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={`${seg.len} ${c - seg.len}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>{`${seg.label}: ${seg.value}`}</title>
          </circle>
        ))}
        <text
          x={cx}
          y={centerLabel ? cy - 4 : cy + 4}
          textAnchor="middle"
          className="fill-[#0F4C75]"
          fontSize={13}
          fontWeight={700}
        >
          {centerValue ?? total}
        </text>
        {centerLabel ? (
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            className="fill-muted"
            fontSize={9}
          >
            {centerLabel}
          </text>
        ) : null}
      </svg>
      <ul className="w-full space-y-2 text-xs">
        {segments.map((seg) => (
          <li
            key={seg.label}
            className="flex items-center justify-between gap-2 rounded-lg bg-[#f7fafc] px-2.5 py-1.5"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: seg.color }}
              />
              <span className="truncate text-muted">{seg.label}</span>
            </span>
            <span className="font-semibold tabular-nums text-[#0F4C75]">
              {seg.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBarChart({
  items,
  format = "idr",
}: {
  items: Array<{ label: string; value: number; sub?: string }>;
  format?: "idr" | "number";
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted">Belum ada data</p>
      ) : (
        items.map((item, i) => (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-foreground">
                {item.label}
                {item.sub ? (
                  <span className="ml-1 font-normal text-muted">
                    · {item.sub}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums font-medium text-[#0F4C75]">
                {format === "idr" ? formatIdr(item.value) : item.value}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#E8F4FC]">
              <div
                className={cn("h-full rounded-full transition-all duration-500")}
                style={{
                  width: `${Math.max(2, (item.value / max) * 100)}%`,
                  background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}, #3282B8)`,
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function ArApCompare({ ar, ap }: { ar: number; ap: number }) {
  const max = Math.max(1, ar, ap);
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="font-semibold text-[#0F4C75]">Piutang (AR)</span>
          <span className="tabular-nums font-medium text-muted">
            {formatIdr(ar)}
          </span>
        </div>
        <div className="h-3.5 overflow-hidden rounded-full bg-[#E8F4FC]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#1B262C] to-[#0F4C75]"
            style={{ width: `${(ar / max) * 100}%` }}
          />
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="font-semibold text-[#3282B8]">Utang (AP)</span>
          <span className="tabular-nums font-medium text-muted">
            {formatIdr(ap)}
          </span>
        </div>
        <div className="h-3.5 overflow-hidden rounded-full bg-[#E8F4FC]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#3282B8] to-[#7eb8d9]"
            style={{ width: `${(ap / max) * 100}%` }}
          />
        </div>
      </div>
      <div className="rounded-xl border border-[#0F4C75]/10 bg-[#E8F4FC]/60 px-3.5 py-2.5 text-xs text-muted">
        Net{" "}
        <span className="font-semibold text-[#0F4C75]">
          {formatIdr(ar - ap)}
        </span>{" "}
        <span className="text-muted/80">(AR − AP)</span>
      </div>
    </div>
  );
}
