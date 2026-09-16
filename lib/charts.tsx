"use client";

import { useState } from "react";
import type { FeynmanSession, TopicStats } from "./schemas";

/**
 * Two small inline-SVG charts, built to the dataviz skill's method: form picked
 * by job (trend -> line, magnitude -> bar), color assigned last, thin marks,
 * hairline recessive gridlines, a hover layer, values in text tokens not the
 * series color. No charting library - kept lightweight and dependency-free.
 */

const WEAK_THRESHOLD_PCT = 60;

// --- Feynman clarity trajectory (trend over time, single series) ---

export function FeynmanTrajectoryChart({ history }: { history: FeynmanSession[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (history.length === 0) return null;

  const width = 480;
  const height = 160;
  const padLeft = 34;
  const padRight = 16;
  const padTop = 12;
  const padBottom = 24;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const xFor = (i: number) =>
    history.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + (i / (history.length - 1)) * plotWidth;
  const yFor = (pct: number) => padTop + plotHeight - (pct / 100) * plotHeight;

  const points = history.map((s, i) => ({
    x: xFor(i),
    y: yFor(s.evaluation.clarityPct),
    attempt: s.attemptNumber,
    clarity: s.evaluation.clarityPct,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const gridSteps = [0, 25, 50, 75, 100];
  const last = points[points.length - 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`Clarity across ${history.length} attempt${history.length === 1 ? "" : "s"}, ending at ${last.clarity.toFixed(0)}%`}
      >
        {gridSteps.map((g) => (
          <g key={g}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="var(--outline-variant)"
              strokeWidth={1}
            />
            <text
              x={padLeft - 8}
              y={yFor(g)}
              textAnchor="end"
              dominantBaseline="middle"
              fontFamily="var(--font-label)"
              fontSize={9}
              fill="var(--outline)"
            >
              {g}
            </text>
          </g>
        ))}

        <path d={pathD} fill="none" stroke="var(--primary-container)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={5} fill="var(--primary-container)" stroke="var(--surface-container-low)" strokeWidth={2} />
            {/* hit target, larger than the mark */}
            <circle
              cx={p.x}
              cy={p.y}
              r={14}
              fill="transparent"
              tabIndex={0}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
              style={{ cursor: "pointer" }}
            />
            <text
              x={p.x}
              y={height - 6}
              textAnchor="middle"
              fontFamily="var(--font-label)"
              fontSize={9}
              fill="var(--outline)"
            >
              {p.attempt}
            </text>
          </g>
        ))}

        {/* direct label - endpoint only */}
        <text
          x={last.x}
          y={last.y - 12}
          textAnchor="middle"
          fontFamily="var(--font-label)"
          fontSize={11}
          fontWeight={500}
          fill="var(--on-surface)"
        >
          {last.clarity.toFixed(0)}%
        </text>

        {hoverIndex !== null && (
          <line
            x1={points[hoverIndex].x}
            x2={points[hoverIndex].x}
            y1={padTop}
            y2={height - padBottom}
            stroke="var(--outline)"
            strokeWidth={1}
          />
        )}
      </svg>

      {hovered && (
        <div
          className="card"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            padding: "0.4rem 0.6rem",
            margin: 0,
            pointerEvents: "none",
            fontSize: "0.8rem",
          }}
        >
          <strong>{hovered.clarity.toFixed(0)}%</strong>{" "}
          <span className="muted">attempt {hovered.attempt}</span>
        </div>
      )}
    </div>
  );
}

// --- Weak topics: magnitude comparison, status-colored (below/above threshold) ---

export function WeakTopicsBarChart({ topics }: { topics: TopicStats[] }) {
  const [hoverTopic, setHoverTopic] = useState<string | null>(null);
  if (topics.length === 0) return null;

  const width = 480;
  const rowHeight = 28;
  const barHeight = 14;
  const padLeft = 120;
  const padRight = 40;
  const trackWidth = width - padLeft - padRight;
  const height = topics.length * rowHeight + 20;
  const thresholdX = padLeft + (WEAK_THRESHOLD_PCT / 100) * trackWidth;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Average score percent per topic">
      <line
        x1={thresholdX}
        x2={thresholdX}
        y1={4}
        y2={height - 16}
        stroke="var(--outline)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <text x={thresholdX} y={height - 6} textAnchor="middle" fontFamily="var(--font-label)" fontSize={9} fill="var(--outline)">
        {WEAK_THRESHOLD_PCT}% threshold
      </text>

      {topics.map((t, i) => {
        const y = i * rowHeight + 8;
        const barLen = (Math.max(0, Math.min(100, t.avgScorePct)) / 100) * trackWidth;
        const color = t.isWeak ? "var(--error)" : "var(--primary-container)";
        const isHovered = hoverTopic === t.topic;
        const labelInside = barLen > trackWidth - 28;

        return (
          <g key={t.topic} opacity={isHovered ? 1 : 0.92}>
            <text
              x={padLeft - 10}
              y={y + barHeight / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontFamily="var(--font-label)"
              fontSize={10}
              letterSpacing="0.02em"
              fill="var(--on-surface-variant)"
            >
              {t.topic.length > 16 ? `${t.topic.slice(0, 15)}…` : t.topic}
            </text>

            <rect x={padLeft} y={y} width={trackWidth} height={barHeight} rx={2} fill="var(--surface-container)" />
            <rect x={padLeft} y={y} width={Math.max(2, barLen)} height={barHeight} rx={2} fill={color} />

            {labelInside ? (
              <text
                x={padLeft + barLen - 6}
                y={y + barHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontFamily="var(--font-label)"
                fontSize={10}
                fontWeight={500}
                fill="var(--surface-container-lowest)"
              >
                {t.avgScorePct.toFixed(0)}%
              </text>
            ) : (
              <text
                x={padLeft + barLen + 6}
                y={y + barHeight / 2}
                dominantBaseline="middle"
                fontFamily="var(--font-label)"
                fontSize={10}
                fontWeight={500}
                fill="var(--on-surface)"
              >
                {t.avgScorePct.toFixed(0)}%
              </text>
            )}

            <rect
              x={padLeft}
              y={y - 4}
              width={trackWidth}
              height={barHeight + 8}
              fill="transparent"
              tabIndex={0}
              onMouseEnter={() => setHoverTopic(t.topic)}
              onMouseLeave={() => setHoverTopic(null)}
              onFocus={() => setHoverTopic(t.topic)}
              onBlur={() => setHoverTopic(null)}
              style={{ cursor: "pointer" }}
            />
          </g>
        );
      })}
    </svg>
  );
}
