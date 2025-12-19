import * as React from 'react';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getStraightPath } from '@xyflow/react';

type Point = { x: number; y: number };

function interpolate(p1: Point, p2: Point, weight: number): Point {
  const distance = { x: p2.x - p1.x, y: p2.y - p1.y };
  return { x: p1.x + distance.x * weight, y: p1.y + distance.y * weight };
}

function makeAggoQuadraticPath(from: Point, to: Point): { path: string; center: Point } {
  const f = from;
  const t = to;
  const upDown = f.y > t.y;
  const center = { x: (t.x + f.x) / 2, y: (t.y + f.y) / 2 };

  const maxBezier = 600.0;
  const bezierWeight = Math.min(0.9, Math.max(-0.15, (maxBezier - Math.abs(f.y - t.y)) / maxBezier));

  const bezierPoint1 = { x: (t.x + center.x) / 2.0, y: (t.y + center.y) / 2.0 };
  const bezier1 = interpolate(
    upDown ? { x: t.x, y: center.y } : { x: center.x, y: t.y },
    bezierPoint1,
    bezierWeight,
  );

  const bezierPoint2 = { x: (f.x + center.x) / 2.0, y: (f.y + center.y) / 2.0 };
  const bezier2 = interpolate(
    upDown ? { x: f.x, y: center.y } : { x: center.x, y: f.y },
    bezierPoint2,
    bezierWeight,
  );

  const path = `M ${t.x} ${t.y} Q ${bezier1.x} ${bezier1.y} ${center.x} ${center.y} Q ${bezier2.x} ${bezier2.y} ${f.x} ${f.y}`;
  return { path, center };
}

export function AggoRelationEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    selected,
    markerEnd,
    data,
  } = props;

  // If we don't have valid coordinates, fall back.
  const hasCoords = [sourceX, sourceY, targetX, targetY].every((n) => Number.isFinite(n));

  const { path, center } = React.useMemo(() => {
    if (!hasCoords) {
      const [fallbackPath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
      return { path: fallbackPath, center: { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 } };
    }
    return makeAggoQuadraticPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  }, [hasCoords, sourceX, sourceY, targetX, targetY]);

  const label = typeof (data as any)?.label === 'string' ? ((data as any).label as string) : '';
  const color = typeof (data as any)?.color === 'string' ? ((data as any).color as string) : 'rgba(255,255,255,0.28)';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? 'rgba(255,255,255,0.7)' : color,
          strokeWidth: selected ? 2 : 1,
        }}
      />

      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${center.x}px,${center.y}px)`,
              pointerEvents: 'none',
              fontSize: 11,
              opacity: selected ? 0.9 : 0.6,
            }}
            className="px-1.5 py-0.5 rounded border border-white/10 bg-black/30 text-white"
            data-aggo-edge-label
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
