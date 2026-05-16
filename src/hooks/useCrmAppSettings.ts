import { useQuery } from '@tanstack/react-query'
import { fetchCrmAppSettingsMerged } from '@/lib/crmAppSettings'

const QUERY_KEY = ['crm-app-settings'] as const

export function useCrmAppSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchCrmAppSettingsMerged,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

export { QUERY_KEY as CRM_APP_SETTINGS_QUERY_KEY }
