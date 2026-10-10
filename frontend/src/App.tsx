import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { AuthPage } from './pages/AuthPage'
import { EditListingPage } from './pages/EditListingPage'
import { HomePage } from './pages/HomePage'
import { ListingDetailPage } from './pages/ListingDetailPage'
import { MessagesPage } from './pages/MessagesPage'
import { MyListingsPage } from './pages/MyListingsPage'
import { NewListingPage } from './pages/NewListingPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="signup" element={<AuthPage mode="signup" />} />
            <Route path="auth" element={<Navigate to="/login" replace />} />
            <Route path="listings/new" element={<NewListingPage />} />
            <Route path="listings/:id/edit" element={<EditListingPage />} />
            <Route path="listings/:id" element={<ListingDetailPage />} />
            <Route path="my-listings" element={<MyListingsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="messages/:conversationId" element={<MessagesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
