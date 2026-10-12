import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportUnexpectedError } from "../errorReporting.ts";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  /** While the fallback shows, a new value clears it. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  failed: boolean;
}

// React only lets a class component catch errors thrown while rendering.
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportUnexpectedError(error, info.componentStack ?? undefined);
  }

  componentDidUpdate(
    previousProps: ErrorBoundaryProps,
    previousState: ErrorBoundaryState,
  ) {
    // Only once the fallback is showing, so the render that failed can't
    // clear it.
    if (
      previousState.failed &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
