import React, { useState } from 'react';
import { vscode } from '../utils/vscode';
import { libraryCategories } from '../../../packages/core/dist';

// Simple icons as components
const Icons: Record<string, React.FC<{ className?: string }>> = {
  Square: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2" /></svg>,
  Link: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  Heading1: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="m17 12 3-2v8" /></svg>,
  Heading2: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" /></svg>,
  Heading3: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M17.5 20.5c2 0 2.5-2 2.5-4a2.5 2.5 0 0 0-2.5-2.5H17" /><path d="M17.5 14a2.5 2.5 0 0 0 2.5-2.5c0-2-2-3-4-3" /></svg>,
  Heading4: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 18V6" /><path d="M4 12h8" /><path d="M4 18V6" /><path d="M17 10v4h4" /><path d="M21 10v8" /></svg>,
  AlignLeft: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="21" x2="3" y1="6" y2="6" /><line x1="15" x2="3" y1="12" y2="12" /><line x1="17" x2="3" y1="18" y2="18" /></svg>,
  Quote: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" /></svg>,
  List: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></svg>,
  Code: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
  Minus: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14" /></svg>,
  ImageIcon: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>,
  Youtube: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" /><path d="m10 15 5-3-5-3z" /></svg>,
  Type: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" x2="15" y1="20" y2="20" /><line x1="12" x2="12" y1="4" y2="20" /></svg>,
  AlignJustify: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="3" x2="21" y1="6" y2="6" /><line x1="3" x2="21" y1="12" y2="12" /><line x1="3" x2="21" y1="18" y2="18" /></svg>,
  ChevronDown: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>,
  Circle: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /></svg>,
  CheckSquare: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  Calendar: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>,
  Clock: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  ChevronsUpDown: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>,
  Tabs: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><path d="M21 9H3" /><path d="M9 21V9" /></svg>,
  ChevronRight: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6" /></svg>,
};

const componentCategories = libraryCategories;

export const Library: React.FC = () => {
	const [pluginComponents, setPluginComponents] = useState<Record<string, any>>({});
	const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
		const init: Record<string, boolean> = {};
		for (let i = 0; i < componentCategories.length; i++) {
			init[componentCategories[i].key] = i === 0;
		}
		return init;
	});

  const toggle = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDragStart = (e: React.DragEvent, component: any) => {
    e.dataTransfer.setData('application/json', JSON.stringify(component.template));
    e.dataTransfer.effectAllowed = 'copy';
  };

	const handleClick = (component: any) => {
		vscode.postMessage({ type: 'addComponent', data: component.template });
	};

	React.useEffect(() => {
		const handler = (ev: MessageEvent) => {
			if (ev?.data?.type === 'componentCatalogUpdated') {
				try { setPluginComponents(ev.data.registry || {}); } catch (err) { console.warn('[aggo library] failed parsing componentCatalogUpdated', err); }
			}
		};
		window.addEventListener('message', handler);
		// Signal that Library is mounted and ready to receive registry
		vscode.postMessage({ type: 'libraryReady' });
		return () => window.removeEventListener('message', handler);
	}, []);

	const categoriesWithPlugins = React.useMemo(() => {
		const out = [...componentCategories];
		const ids = Object.keys(pluginComponents || {});
		if (ids.length > 0) {
			const components = ids.map(id => {
				const entry = pluginComponents[id];
				// Registry format is { id, name, category, icon, file }
				const template: any = {
					tagName: 'plugin',
					attributes: { 'data-component': id },
					styles: {},
					content: ''
				};
				return {
					icon: entry.icon || 'Square',
					name: entry.name || id,
					description: entry.category || 'Plugin',
					template
				};
			});
			out.push({ key: 'plugins', label: 'Plugins', components });
		}
		return out;
	}, [pluginComponents]);

	return (
    <div className="p-2 select-none">
      <h3 className="text-sm font-bold mb-4 px-1">Components</h3>
      <div className="space-y-2">
		{categoriesWithPlugins.map(category => (
          <div key={category.key} className="border border-border rounded-md overflow-hidden">
            <div 
              className="bg-secondary/50 p-2 text-xs font-semibold cursor-pointer flex justify-between items-center hover:bg-secondary"
              onClick={() => toggle(category.key)}
            >
              {category.label}
              <span>{expanded[category.key] ? '▼' : '▶'}</span>
            </div>
            {expanded[category.key] && (
              <div className="p-2 grid grid-cols-2 gap-2 bg-background">
                {category.components.map((component, idx) => {
                  const Icon = Icons[component.icon] || Icons.Square;
                  return (
                    <div 
                      key={idx}
                      className="flex flex-col items-center justify-center p-2 border border-border rounded hover:bg-accent hover:text-accent-foreground cursor-grab active:cursor-grabbing transition-colors"
                      draggable
                      onDragStart={(e) => handleDragStart(e, component)}
                      onClick={() => handleClick(component)}
                      title={component.description}
                    >
                      <Icon className="w-6 h-6 mb-1 opacity-70" />
                      <span className="text-[10px] text-center leading-tight">{component.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

