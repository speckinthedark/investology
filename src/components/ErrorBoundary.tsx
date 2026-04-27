import * as React from 'react';

interface Props { children: React.ReactNode }
interface State { error: string | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  // Explicit declarations needed due to useDefineForClassFields: false in tsconfig
  declare state: State;
  declare setState: React.Component<Props, State>['setState'];
  declare props: Readonly<Props>;

  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(err: Error): State {
    return { error: err.message };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-xl p-8 max-w-lg w-full shadow-xl border border-red-100">
            <h2 className="text-xl font-bold text-red-600 mb-3">Something went wrong</h2>
            <pre className="bg-gray-100 rounded-xl p-4 text-xs text-gray-700 overflow-auto max-h-48 mb-6 whitespace-pre-wrap">
              {error}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
