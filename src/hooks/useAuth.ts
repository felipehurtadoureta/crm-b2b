import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/contexts/AuthContext'
import type { Profile } from '@/types'

export function useAuth() {
  const { session } = useSession()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setLoading(false)
      return
    }

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data)
        setLoading(false)
      })
  }, [session])

  const signOut = () => supabase.auth.signOut()

  return { profile, loading, signOut }
}