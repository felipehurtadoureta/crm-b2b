import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/contexts/AuthContext'
import type { Profile } from '@/types'

export function useAuth() {
  const { session } = useSession()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    // Solo limpiar si cambió el usuario (no en cada refresh de token al volver a la pestaña).
    setProfile(prev => (prev && prev.id !== userId ? null : prev))

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (cancelled) return
        setProfile(error ? null : (data as Profile))
        setLoading(false)
      } catch {
        if (cancelled) return
        setProfile(null)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  const signOut = () => supabase.auth.signOut()

  const refetchProfile = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) return
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(error ? null : (data as Profile))
  }, [session?.user?.id])

  return { profile, loading, signOut, refetchProfile }
}