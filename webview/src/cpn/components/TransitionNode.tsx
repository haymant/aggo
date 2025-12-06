import React, { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";

// Simple Badge component replacement
const Badge = ({ children, className, variant }: any) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className} ${variant === 'outline' ? 'border-neutral-300' : 'bg-neutral-900 text-white'}`}>
    {children}
  </span>
);

// Icons
const HandIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>;
const BotIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>;
const MessageSquareIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const BrainIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>;
const WrenchIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
const SearchIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const CodeIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
const TimerIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>;

const typeIconMap: Record<string, React.ReactNode> = {
  Manual: <HandIcon className="h-4 w-4 text-emerald-700" />,
  Auto: <BotIcon className="h-4 w-4 text-emerald-700" />,
  Message: <MessageSquareIcon className="h-4 w-4 text-emerald-700" />,
  LLM: <BrainIcon className="h-4 w-4 text-emerald-700" />,
  Tools: <WrenchIcon className="h-4 w-4 text-emerald-700" />,
  Retriever: <SearchIcon className="h-4 w-4 text-emerald-700" />,
};

export function TransitionNode({ id, data, selected }: NodeProps) {
  const [hoverLeft, setHoverLeft] = useState(false);
  const [hoverRight, setHoverRight] = useState(false);
  const tData = data as any;
  const guardExpression: string = tData.guardExpression ?? "";
  const time = (tData.time || {}) as { cron?: string; delaySec?: number };
  const hasTime = (time.cron && time.cron.trim().length > 0) || (typeof time.delaySec === 'number' && time.delaySec > 0);
  const trimmed = guardExpression.trim();
  const hasGuard = trimmed.length > 0;
  const displayGuard = trimmed.length > 20 ? `${trimmed.slice(0, 20)}...` : trimmed;

  const openGuard = () => {
    // Dispatch event or handle selection
  };

  return (
    <div
      className={[
        "group relative w-48 rounded-md border-2 bg-white px-3 py-2 text-sm",
        selected ? "border-emerald-600 ring-2 ring-emerald-200" : "border-neutral-300",
      ].join(" ")}
      role="group"
      aria-label={`Transition ${tData.name}`}
    >
      {/* Type icon inside the card */}
      <div className="pointer-events-none absolute left-1 top-1">
        {typeIconMap[(tData.kind as string) || "Manual"]}
      </div>

      {hasGuard && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openGuard();
          }}
          className="absolute -top-6 -left-2"
          aria-label={`Edit guard for ${tData.name || "Transition"}`}
          title="Edit guard expression"
        >
          <Badge variant="outline" className="flex max-w-[180px] items-center gap-1 bg-white text-xs">
            <CodeIcon className="h-3 w-3 text-emerald-700" />
            <span className="truncate">{displayGuard}</span>
          </Badge>
        </button>
      )}
      {hasTime && (
        <div className="pointer-events-none absolute -bottom-6 -left-2" aria-label="timer trigger" title="Time trigger active">
          <Badge variant="outline" className="flex items-center gap-1 bg-white text-xs">
            <TimerIcon className="h-3 w-3 text-emerald-700" />
          </Badge>
        </div>
      )}

      <div className="flex items-center justify-center">
        <div className="truncate text-neutral-800">{tData.name || "Transition"}</div>
      </div>

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
        }}
      />
    </div>
  );
}
