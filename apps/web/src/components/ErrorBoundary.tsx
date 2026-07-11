import { Component, type ReactNode } from "react";

// A render crash used to blank the whole app (e.g. an inconsistent project). This catches it and
// shows a recoverable message + a reset, instead of a white screen.
interface Props { children: ReactNode; onReset?: () => void }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error("VBD render error:", error);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-error">
        <h2>Something went wrong rendering the app.</h2>
        <pre className="app-error-msg">{this.state.error.message}</pre>
        <div className="app-error-actions">
          <button className="generate" onClick={() => this.setState({ error: null })}>Try again</button>
          {this.props.onReset && (
            <button
              className="addcap"
              onClick={() => {
                try { localStorage.removeItem("vbd.projects"); } catch { /* ignore */ }
                this.props.onReset?.();
                this.setState({ error: null });
              }}
            >
              Reset to the example project
            </button>
          )}
        </div>
      </div>
    );
  }
}
