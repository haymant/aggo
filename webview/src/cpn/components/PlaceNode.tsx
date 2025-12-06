import React, { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";

// Simple Badge component replacement
const Badge = ({ children, className, variant }: any) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className} ${variant === 'outline' ? 'border-neutral-300' : 'bg-neutral-900 text-white'}`}>
    {children}
  </span>
);

// Icons
const CoinsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>
);
const SquareIcon = ({ className, size, style }: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
);

export function PlaceNode({ id, data, selected }: NodeProps) {
  const [hoverLeft, setHoverLeft] = useState(false);
  const [hoverRight, setHoverRight] = useState(false);
  const place = data as any;

  const openTokens = () => {
    // Dispatch event for parent to handle or post message directly
    // For now, we'll rely on selection to show tokens in the side panel
  };

  // Compute total token multiplicity (sum of counts, default 1)
  let totalTokens: number = 0;
  try {
    const list: any[] = Array.isArray((place as any).tokenList) ? (place as any).tokenList : [];
    totalTokens = list.reduce((acc, t) => {
      const c = (t && typeof t.count === 'number' && t.count > 0) ? t.count : 1;
      return acc + c;
    }, 0);
  } catch { totalTokens = place.tokens ?? 0; }

  return (
    <div className="group flex select-none flex-col items-center">
      <div
        className={[
          "relative grid h-20 w-20 place-items-center bg-white",
          selected ? "border-emerald-600 ring-2 ring-emerald-200" : "border-neutral-300",
        ].join(" ")}
        style={{ borderRadius: "50%", borderWidth: 2, borderStyle: "solid" }}
        role="figure"
        aria-label={`Place ${place.name}`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openTokens();
          }}
          className="absolute -top-2 -right-2"
          aria-label={`Open tokens for ${place.name}`}
          title="View tokens"
          style={{zIndex:2}}
        >
          <Badge variant="outline" className="flex items-center gap-1 bg-white text-xs">
            <CoinsIcon className="h-3 w-3 text-amber-600" />
            {totalTokens}
          </Badge>
        </button>

        {/* End icon */}
        {place.isEnd && (
          <SquareIcon size={18} className="absolute right-2 bottom-2 text-blue-600 bg-white rounded p-0.5 shadow" style={{zIndex:2}} aria-label="End" />
        )}

        <Handle
          type="target"
          position={Position.Left}
          className="!bg-neutral-400 rounded-full border border-white cursor-crosshair"
          onMouseEnter={() => setHoverLeft(true)}
          onMouseLeave={() => setHoverLeft(false)}
          style={{
            width: hoverLeft ? 14 : 8,
            height: hoverLeft ? 14 : 8,
            transition: "width 120ms ease, height 120ms ease, box-shadow 120ms ease",
            boxShadow: hoverLeft ? "0 0 0 3px rgba(16,185,129,0.25)" : "none",
            zIndex:3
          }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-neutral-400 rounded-full border border-white cursor-crosshair"
          onMouseEnter={() => setHoverRight(true)}
          onMouseLeave={() => setHoverRight(false)}
          style={{
            width: hoverRight ? 14 : 8,
            height: hoverRight ? 14 : 8,
            transition: "width 120ms ease, height 120ms ease, box-shadow 120ms ease",
            boxShadow: hoverRight ? "0 0 0 3px rgba(16,185,129,0.25)" : "none",
            zIndex:3
          }}
        />
      </div>
      <div className="mt-1 rounded px-1 text-xs text-neutral-800 dark:text-neutral-200">{place.name || "Place"}</div>
    </div>
  );
}
