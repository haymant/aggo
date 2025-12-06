import React from 'react';
import { Controls, ControlButton } from '@xyflow/react';
import { Save, Lock, LockOpen, ZoomIn, ZoomOut, Maximize2, SlidersHorizontal, CirclePlus, SquarePlus, WandSparkles } from 'lucide-react';

interface CanvasControlsProps {
  onSave?: () => void;
  edited?: boolean;
  interactive?: boolean;
  setInteractive?: React.Dispatch<React.SetStateAction<boolean>>;
  openProperties?: () => void;
  addPlace: () => void;
  addTransition: () => void;
  onAutoLayout: () => void;
  zoomIn?: (opts?: any) => void;
  zoomOut?: (opts?: any) => void;
  fitView?: (opts?: any) => void;
}

export function CanvasControls({
  onSave,
  edited,
  interactive,
  setInteractive,
  openProperties,
  addPlace,
  addTransition,
  zoomIn,
  zoomOut,
  fitView,
  onAutoLayout,
}: CanvasControlsProps) {
  return (
    <div
      className="aggo-toolbar"
      style={{ position: 'absolute', left: 15, bottom: 15, zIndex: 10, pointerEvents: 'auto' }}
      aria-label="Canvas toolbar"
    >
      <Controls position="bottom-left" showZoom={false} showFitView={false} showInteractive={false}>
        {onSave && (
          <ControlButton
            onClick={onSave}
            title={edited ? 'Save workflow' : 'No changes'}
            disabled={!edited}
            style={{ opacity: edited ? 1 : 0.5 }}
          >
            <Save className="h-4 w-4" />
          </ControlButton>
        )}
        {setInteractive && (
          <ControlButton
            onClick={() => setInteractive(v => !v)}
            title={interactive ? 'Disable interactivity' : 'Enable interactivity'}
          >
            {interactive ? <LockOpen className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
          </ControlButton>
        )}
        
        <ControlButton onClick={() => zoomIn?.({ duration: 200 })} title="Zoom in" aria-label="Zoom in">
          <ZoomIn className="h-5 w-5" aria-hidden />
        </ControlButton>
        <ControlButton onClick={() => zoomOut?.({ duration: 200 })} title="Zoom out" aria-label="Zoom out">
          <ZoomOut className="h-5 w-5" aria-hidden />
        </ControlButton>
        <ControlButton onClick={() => fitView?.({ padding: 0.2, duration: 300 })} title="Fit view">
          <Maximize2 className="h-4 w-4" aria-hidden />
        </ControlButton>
        
        {openProperties && (
          <ControlButton onClick={openProperties} title="Open Properties">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </ControlButton>
        )}
        
        <ControlButton onClick={addPlace} title="Add Place">
          <CirclePlus className="h-4 w-4" aria-hidden />
        </ControlButton>
        <ControlButton onClick={addTransition} title="Add Transition">
          <SquarePlus className="h-4 w-4" aria-hidden />
        </ControlButton>
        <ControlButton onClick={onAutoLayout} title="Auto layout">
          <WandSparkles className="h-4 w-4" aria-hidden />
        </ControlButton>
      </Controls>
    </div>
  );
}
