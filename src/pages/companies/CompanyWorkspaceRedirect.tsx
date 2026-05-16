import { Navigate, useLocation, useParams } from 'react-router-dom'

/** Redirige la ruta antigua de ficha empresa a la ficha v2, conservando query y hash compatibles. */
export default function CompanyWorkspaceRedirect() {
  const { companyId } = useParams<{ companyId: string }>()
  const { search, hash } = useLocation()
  if (!companyId) return <Navigate to="/companies" replace />
  const normalizedHash = hash === '#seccion-crm-v2' ? '#seccion-seguimientos' : hash
  return <Navigate to={`/companies/${companyId}/v2${search}${normalizedHash}`} replace />
}
