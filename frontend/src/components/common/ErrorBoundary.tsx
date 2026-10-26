import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#080d0a",
            color: "#f7ffeb",
            padding: "24px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "600px",
              background: "rgba(20, 30, 24, 0.95)",
              border: "1px solid rgba(234, 179, 8, 0.4)",
              borderRadius: "12px",
              padding: "32px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚡</div>
            <h2 style={{ margin: "0 0 12px", color: "var(--rg-gold, #eab308)", fontSize: "20px" }}>
              Adjudication Interface Interrupted
            </h2>
            <p style={{ margin: "0 0 20px", color: "rgba(255, 255, 255, 0.75)", fontSize: "14px", lineHeight: "1.6" }}>
              An unexpected anomaly occurred while rendering this view. Your session data is preserved.
            </p>

            {this.state.error && (
              <pre
                style={{
                  background: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#fca5a5",
                  padding: "12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  textAlign: "left",
                  overflowX: "auto",
                  margin: "0 0 24px",
                  maxHeight: "150px",
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: "10px 20px",
                  background: "var(--rg-gold, #eab308)",
                  color: "#080d0a",
                  fontWeight: 700,
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
                style={{
                  padding: "10px 20px",
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "#f7ffeb",
                  fontWeight: 600,
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
