import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { AuthProvider } from './context/AuthContext'

const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })),
)
const NewListingPage = lazy(() =>
  import('./pages/NewListingPage').then((m) => ({ default: m.NewListingPage })),
)
const EditListingPage = lazy(() =>
  import('./pages/EditListingPage').then((m) => ({ default: m.EditListingPage })),
)
const BookMeetingPage = lazy(() =>
  import('./pages/BookMeetingPage').then((m) => ({ default: m.BookMeetingPage })),
)
const ListingDetailPage = lazy(() =>
  import('./pages/ListingDetailPage').then((m) => ({ default: m.ListingDetailPage })),
)
const MyListingsPage = lazy(() =>
  import('./pages/MyListingsPage').then((m) => ({ default: m.MyListingsPage })),
)
const MyBookingsPage = lazy(() =>
  import('./pages/MyBookingsPage').then((m) => ({ default: m.MyBookingsPage })),
)
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })),
)
const MessagesPage = lazy(() =>
  import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })),
)
const PaymentResultPage = lazy(() =>
  import('./pages/PaymentResultPage').then((m) => ({ default: m.PaymentResultPage })),
)
const StatusPage = lazy(() =>
  import('./pages/StatusPage').then((m) => ({ default: m.StatusPage })),
)
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })),
)
const PrivacyPage = lazy(() =>
  import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
)
const TermsPage = lazy(() =>
  import('./pages/TermsPage').then((m) => ({ default: m.TermsPage })),
)
const ContactPage = lazy(() =>
  import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })),
)
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)
const SentryTestPage = lazy(() =>
  import('./pages/SentryTestPage').then((m) => ({ default: m.SentryTestPage })),
)

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <p className="text-sm text-ink-soft">Loading…</p>
    </div>
  )
}

export default function App() {
  return (
    <div className="app-root">
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="login" element={<AuthPage mode="login" />} />
                <Route path="signup" element={<AuthPage mode="signup" />} />
                <Route path="auth" element={<Navigate to="/login" replace />} />
                <Route path="listings/new" element={<NewListingPage />} />
                <Route path="listings/:id/edit" element={<EditListingPage />} />
                <Route path="listings/:id/book" element={<BookMeetingPage />} />
                <Route path="listings/:id" element={<ListingDetailPage />} />
                <Route path="listing/:id/book" element={<BookMeetingPage />} />
                <Route path="my-listings" element={<MyListingsPage />} />
                <Route path="my-bookings" element={<MyBookingsPage />} />
                <Route path="payment/result" element={<PaymentResultPage />} />
                <Route path="status" element={<StatusPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="sentry-test" element={<SentryTestPage />} />
                <Route path="messages" element={<MessagesPage />} />
                <Route path="messages/:conversationId" element={<MessagesPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
    </div>
  )
}
