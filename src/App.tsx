import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSession } from '@/contexts/AuthContext'
import LoginPage from '@/pages/auth/LoginPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import MainLayout from '@/components/layout/MainLayout'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import CompaniesPage from '@/pages/companies/CompaniesPage'
import CompanyWorkspaceRedirect from '@/pages/companies/CompanyWorkspaceRedirect'
import CompanyWorkspacePageV2 from '@/pages/companies/CompanyWorkspacePageV2'
import ContactsPage from '@/pages/contacts/ContactsPage'
import CallsPage from '@/pages/calls/CallsPage'
import ProductsPage from '@/pages/products/ProductsPage'
import InventoryPage from '@/pages/products/InventoryPage'
import InvoicesPage from '@/pages/invoices/InvoicesPage'
import DocumentsPage from '@/pages/documents/DocumentsPage'
import QuotesPage from '@/pages/quotes/QuotesPage'
import AgendaPage from '@/pages/agenda/AgendaPage'
import AdminUsersPage from '@/pages/admin/AdminUsersPage'
import BankBookPage from '@/pages/bank/BankBookPage'
import BankGlosasAdminPage from '@/pages/bank/BankGlosasAdminPage'
import SiiDocumentsPage from '@/pages/sii/SiiDocumentsPage'

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
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route element={session ? <MainLayout /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/companies/:companyId/v2" element={<CompanyWorkspacePageV2 />} />
          <Route path="/companies/:companyId" element={<CompanyWorkspaceRedirect />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/contacts"  element={<ContactsPage />} />
          <Route path="/calls"     element={<CallsPage />} />
          <Route path="/quotes"    element={<QuotesPage />} />
          <Route path="/sales" element={<QuotesPage initialStage="facturada" />} />
          <Route path="/products"  element={<ProductsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/organization" element={<Navigate to="/admin/users?tab=organization" replace />} />
          <Route path="/admin/import" element={<Navigate to="/admin/users?tab=import" replace />} />
          <Route path="/bank" element={<BankBookPage />} />
          <Route path="/bank/glosas" element={<BankGlosasAdminPage />} />
          <Route path="/sii" element={<SiiDocumentsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}