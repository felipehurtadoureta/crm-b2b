import { useEffect, useRef } from 'react'

export function usePageLoad(load: () => Promise<void>) {
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function safeLoad() {
    try {
      await load()
    } catch (err) {
      console.error(err)
    }
  }

  return { safeLoad, mounted }
}