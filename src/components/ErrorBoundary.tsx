import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-surface-container/90 border border-outline-variant rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
              <AlertCircle className="w-8 h-8" />
            </div>

            <h1 className="text-2xl font-bold font-display text-on-surface mb-2">
              EasyPDF
            </h1>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              حدث خطأ غير متوقع أثناء عرض الصفحة. تم احتواء الخطأ لتوفير استقرار التطبيق.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={this.handleReset}
                className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                إعادة تحميل التطبيق
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
