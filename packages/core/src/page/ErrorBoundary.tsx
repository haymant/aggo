import * as React from 'react';

export default class ErrorBoundary extends React.Component<
  { onError?: (err: unknown) => void; children?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    try {
      this.props.onError?.(error);
    } catch {
      // ignore
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children as any;
  }
}
