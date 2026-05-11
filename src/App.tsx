import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSession } from '@/contexts/AuthContext'
import LoginPage from '@/pages/auth/LoginPage'
import MainLayout from '@/components/layout/MainLayout'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import CompaniesPage from '@/pages/companies/CompaniesPage'
import ContactsPage from '@/pages/contacts/ContactsPage'
import CallsPage from '@/pages/calls/CallsPage'
import ProductsPage from '@/pages/products/ProductsPage'
import InventoryPage from '@/pages/products/InventoryPage'
import DealsPage from '@/pages/deals/DealsPage'
import QuotesPage from '@/pages/quotes/QuotesPage'

export default function App() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Cargando...</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route element={session ? <MainLayout /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/contacts"  element={<ContactsPage />} />
          <Route path="/calls"     element={<CallsPage />} />
          <Route path="/deals"     element={<DealsPage />} />
          <Route path="/quotes"    element={<QuotesPage />} />
          <Route path="/sales"     element={<QuotesPage defaultStatus="orden_de_venta" />} />
          <Route path="/products"  element={<ProductsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}