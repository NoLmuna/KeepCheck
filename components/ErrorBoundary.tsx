"use client";

import React, { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
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

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[KeepCheck ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.removeItem("keepcheck-feedback-draft");
      localStorage.removeItem("keepcheck-pending-pin");
      window.location.hash = "";
    } catch {
      // ignore
    }
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    this.handleReset();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full min-h-[300px] flex items-center justify-center p-4 bg-[#FAF7F2] dark:bg-[#15110F]">
          <div className="max-w-md w-full bg-white dark:bg-[#1C1612] rounded-2xl p-6 border border-stone-200/90 dark:border-stone-800 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif font-bold text-lg text-stone-900 dark:text-stone-100">
                Something went wrong
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                KeepCheck encountered an unexpected render issue. Your saved spots are safely stored offline on your device.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 min-h-[44px] px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reset View / Clear Draft</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="min-h-[44px] px-4 py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Reload App</span>
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
