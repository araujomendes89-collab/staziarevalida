import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
  errorStack?: string;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    };
  }

  override componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('[RootErrorBoundary] Application error:', error, errorInfo);
  }

  handleSafeReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Could not clear storage:', e);
    }
    this.setState({ hasError: false });
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#030305] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 mb-4 font-bold text-xl">
            +
          </div>
          <h1 className="text-xl font-bold mb-2">StaziaMed Revalida</h1>
          <p className="text-sm text-zinc-400 max-w-md mb-6">
            Ocorreu uma oscilação na inicialização da aplicação. Clique abaixo para reiniciar com cache seguro.
          </p>
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-4 py-2 bg-emerald-500 text-black font-semibold rounded-lg text-sm hover:bg-emerald-400 transition-colors cursor-pointer"
            >
              Recarregar Aplicação
            </button>
            <button
              onClick={this.handleSafeReset}
              className="px-4 py-2 bg-white/10 text-white font-medium rounded-lg text-sm hover:bg-white/20 transition-colors cursor-pointer"
            >
              Restaurar Padrão
            </button>
          </div>
          {this.state.errorMessage && (
            <details className="text-left text-xs text-zinc-500 max-w-md bg-white/[0.02] p-3 rounded-lg border border-white/5">
              <summary className="cursor-pointer text-zinc-400 font-mono">Detalhes técnicos</summary>
              <p className="mt-2 text-rose-400 font-mono break-words">{this.state.errorMessage}</p>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

try {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </StrictMode>,
    );
  } else {
    console.error('[Root] Fatal: element with id "root" not found in document.');
  }
} catch (initializationError) {
  console.error('[Root] Fatal mounting error:', initializationError);
}


