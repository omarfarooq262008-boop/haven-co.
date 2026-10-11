import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppErrorFallback } from './AppErrorFallback'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Local boundary with friendly UI; reports to Sentry only when DSN is configured. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void import('../lib/sentry').then(({ captureAppError }) => {
      captureAppError(error, info.componentStack)
    })
  }

  render() {
    if (this.state.error) {
      return (
        <AppErrorFallback
          resetError={() => {
            this.setState({ error: null })
          }}
        />
      )
    }
    return this.props.children
  }
}
