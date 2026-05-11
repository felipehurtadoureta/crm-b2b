import { useEffect } from 'react'

export function useRefreshOnFocus(fn: () => void) {
  useEffect(() => {
    const onFocus = () => fn()
    const onVisible = () => { if (document.visibilityState === 'visible') fn() }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fn])
}