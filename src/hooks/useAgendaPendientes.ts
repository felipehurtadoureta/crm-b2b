import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/contexts/AuthContext'
import { useAuth } from '@/hooks/useAuth'
import { fetchPendientes, type PendienteItem } from '@/lib/agendaPendientes'

/** Carga la agenda con TanStack Query: caché y sin refetch molesto al volver a la pantalla. */
export function useAgendaPendientes(opts: { companyId?: string | null; enabled?: boolean }) {
  const { session, loading: sessionLoading } = useSession()
  const { profile, loading: profileLoading } = useAuth()

  const enabled =
    opts.enabled !== false &&
    !sessionLoading &&
    !profileLoading &&
    Boolean(session?.user) &&
    Boolean(profile)

  const query = useQuery({
    queryKey: ['agenda-pendientes', opts.companyId ?? 'all', profile?.id ?? '', profile?.role ?? ''],
    queryFn: async () => {
      if (!profile) return [] as PendienteItem[]
      return fetchPendientes({
        profile,
        companyId: opts.companyId ?? undefined,
      })
    },
    enabled,
    staleTime: 120_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  })

  return {
    items: query.data ?? [],
    loading: enabled && query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    reload: () => {
      void query.refetch()
    },
  }
}
