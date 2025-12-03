import React from 'react';

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{onError?: (err:any) => void}>, {error: Error | null}> {
  constructor(props:any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error:any, info:any) {
    console.error('ErrorBoundary caught', error, info);
    this.props.onError?.(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, color: 'red' }}>
          <h3>Something went wrong while rendering the editor</h3>
          <pre>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
