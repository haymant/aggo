import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";

type Pt = { x: number; y: number };

function isFinitePoint(p: any): p is Pt {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function polylinePath(points: Pt[]): string {
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
}

function midpointAlongPolyline(points: Pt[]): Pt {
  if (points.length === 1) return points[0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= half) {
      const t = seg === 0 ? 0 : (half - acc) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += seg;
  }
  return points[Math.max(0, points.length - 1)];
}

// Simple Badge component replacement
const Badge = ({ children, className, variant }: any) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className} ${variant === 'outline' ? 'aggo-border' : 'aggo-badge'}`}>
    {children}
  </span>
);

// Icons
const CodeIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as any;
  const maybePoints: any[] = Array.isArray(edgeData?.points) ? edgeData.points : [];
  const routedPoints: Pt[] = maybePoints.filter(isFinitePoint);

  const { edgePath, labelX, labelY } = React.useMemo(() => {
    if (routedPoints.length >= 2) {
      const mid = midpointAlongPolyline(routedPoints);
      return { edgePath: polylinePath(routedPoints), labelX: mid.x, labelY: mid.y };
    }
    const [p, lx, ly] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    return { edgePath: p, labelX: lx, labelY: ly };
  }, [
    routedPoints,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  ]);

  const expression = edgeData?.expression || "";
  const trimmed = expression.trim();
  const hasLabel = trimmed.length > 0;
  const displayLabel = trimmed.length > 20 ? `${trimmed.slice(0, 20)}...` : trimmed;

  const openExpression = () => {
    // Dispatch event or handle selection
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 2 : 1.5,
          stroke: selected ? "var(--aggo-accent)" : "var(--aggo-muted)",
        }}
      />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openExpression();
              }}
              className="nodrag nopan"
              aria-label={`Edit edge expression: ${trimmed}`}
              title="Edit edge expression"
            >
              <Badge
                variant="outline"
                className={`flex max-w-[150px] items-center gap-1 aggo-badge text-xs shadow-sm ${
                  selected ? "aggo-border-selected" : "aggo-border"
                }`}
              >
                <CodeIcon className="h-3 w-3 aggo-accent" />
                <span className="truncate">{displayLabel}</span>
              </Badge>
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
