
declare const acquireVsCodeApi: any;

const getVsCodeApi = () => {
    if (typeof acquireVsCodeApi === 'undefined') {
        return {
            postMessage: (msg: any) => {
                if (process.env.NODE_ENV === 'development') {
                    console.log('VS Code API (mock):', msg);
                }
            },
            getState: () => ({}),
            setState: (state: any) => {
                if (process.env.NODE_ENV === 'development') {
                    console.log('VS Code API (mock) setState:', state);
                }
            }
        };
    }
    
    // Singleton pattern to prevent multiple calls to acquireVsCodeApi
    if ((window as any)._vscodeApi) {
        return (window as any)._vscodeApi;
    }

    const api = acquireVsCodeApi();
    (window as any)._vscodeApi = api;
    return api;
};

export const vscode = getVsCodeApi();

// Provide a simple promise-based open/save API that the embedded schema editor can use. The
// editor will call window.vscodeOpenFile(path) and await the response from the extension.
// This bridge is auto-detected by the editor; if a host provides its own onOpenInHost, it
// can override this behavior.
(() => {
    const pending: Map<string, (content: unknown) => void> = new Map();
    const pendingSave: Map<string, (result: any) => void> = new Map();
    // Add function to window so the editor can call it
    (window as any).vscodeOpenFile = function (path: string) {
        const id = Math.random().toString(36).slice(2);
        vscode.postMessage({ command: 'openFile', type: 'openFile', path, id });
        return new Promise<unknown>((resolve) => {
            pending.set(id, resolve);
        });
    };
    (window as any).vscodeSaveFile = function (path: string, content: string) {
        const id = Math.random().toString(36).slice(2);
        vscode.postMessage({ command: 'saveFile', type: 'saveFile', path, content, id });
        return new Promise<any>((resolve) => {
            pendingSave.set(id, resolve);
        });
    };
    window.addEventListener('message', (ev: MessageEvent) => {
        const m = ev.data as any;
        if (!m) return;
        const kind = m.command || m.type;
        if (kind === 'openFileResponse' && m.id && pending.has(m.id)) {
            pending.get(m.id)?.(m.content);
            pending.delete(m.id);
        }
        if (kind === 'saveFileResponse' && m.id && pendingSave.has(m.id)) {
            pendingSave.get(m.id)?.(m);
            pendingSave.delete(m.id);
        }
    });
})();
