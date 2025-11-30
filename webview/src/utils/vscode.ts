
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
