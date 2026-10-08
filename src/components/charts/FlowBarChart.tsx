"use client";

import { useEffect, useRef, useState } from "react";
import { compactMoney, formatMoney } from "@/lib/utils";

export type FlowSeries = { key: string; label: string; color: string };
export type FlowDatum = { label: string; values: Record<string, number> };

const TOP = 30; // room for value labels
const BOTTOM = 28; // room for x-axis labels
const GAP = 3; // gap between stacked segments
const RADIUS = 5;

const fmt = (n: number) => formatMoney(n);

/**
 * Stacked bars with translucent "flow" bands joining each segment to the
 * matching segment of the next bar. Series are stacked bottom → top.
 */
export function FlowBarChart({
  data,
  series,
  height = 264,
}: {
  data: FlowDatum[];
  series: FlowSeries[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotH = height - TOP - BOTTOM;
  const baseY = TOP + plotH;
  const totals = data.map((d) => series.reduce((s, se) => s + (d.values[se.key] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const n = data.length;
  // Wide bars for a few months, narrower as the range grows (up to 12+ bars).
  const barW = Math.max(14, Math.min(78, width * 0.2, (width / Math.max(n, 1)) * 0.62));
  const compactLabels = n > 4;
  const step = n > 1 ? (width - barW) / (n - 1) : 0;

  const bars = data.map((d, i) => {
    const x = i * step;
    const total = totals[i];
    const usable = Math.max(0, (total / max) * plotH - GAP * (series.length - 1));
    let y = baseY;
    const segs = series.map((se) => {
      const h = total > 0 ? ((d.values[se.key] ?? 0) / total) * usable : 0;
      const seg = { top: y - h, bottom: y, color: se.color };
      y -= h + GAP;
      return seg;
    });
    return { x, segs, total, label: d.label, top: segs[segs.length - 1].top };
  });

  const hovered = hover !== null ? bars[hover] : null;
  const tipOnRight = hover !== null && hover < n - 1;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          {/* Flow bands between neighbouring bars */}
          {bars.slice(0, -1).map((left, i) => {
            const right = bars[i + 1];
            return left.segs.map((s, k) => {
              const r = right.segs[k];
              return (
                <polygon
                  key={`${i}-${k}`}
                  points={`${left.x + barW},${s.top} ${right.x},${r.top} ${right.x},${r.bottom} ${left.x + barW},${s.bottom}`}
                  fill={s.color}
                  fillOpacity={hover === null ? 0.17 : 0.09}
                  className="transition-[fill-opacity] duration-200"
                />
              );
            });
          })}

          {bars.map((b, i) => (
            <g
              key={b.label}
              opacity={hover === null || hover === i ? 1 : 0.4}
              className="transition-opacity duration-200"
            >
              {b.segs.map((s, k) => {
                const h = s.bottom - s.top;
                if (h <= 0.5) return null;
                return (
                  <rect
                    key={k}
                    x={b.x}
                    y={s.top}
                    width={barW}
                    height={h}
                    rx={Math.min(RADIUS, h / 2)}
                    fill={s.color}
                  />
                );
              })}
              <text
                x={b.x + barW / 2}
                y={b.top - 11}
                textAnchor="middle"
                fontSize={compactLabels ? 11.5 : 13}
                fontWeight={500}
                fill="rgb(var(--ink))"
              >
                {compactLabels ? compactMoney(b.total) : fmt(b.total)}
              </text>
              <text x={b.x + barW / 2} y={baseY + 21} textAnchor="middle" fontSize={12} fill="#8A8A8A">
                {b.label}
              </text>
              <rect
                x={b.x}
                y={0}
                width={barW}
                height={baseY}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
      )}

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[180px] rounded-xl bg-ink px-3 py-2.5 text-white shadow-xl"
          style={{
            left: tipOnRight ? hovered.x + barW + 10 : hovered.x - 10,
            top: (hovered.top + baseY) / 2,
            transform: `translate(${tipOnRight ? "0" : "-100%"}, -50%)`,
          }}
        >
          <p className="mb-1.5 text-[11px] text-white/55">{data[hover].label} revenue</p>
          {[...series].reverse().map((se) => (
            <div key={se.key} className="flex items-center justify-between gap-4 py-0.5 text-[12px]">
              <span className="flex items-center gap-1.5 text-white/80">
                <span className="h-2 w-2 rounded-full" style={{ background: se.color }} />
                {se.label}
              </span>
              <span className="font-medium">{fmt(data[hover].values[se.key] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
