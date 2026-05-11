import { useEffect, useCallback, useRef } from 'react'

export function useSafeLoad(
  fn: (signal: AbortSignal) => Promise<void>,
  deps: unknown[]
) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  const load = useCallback(() => {
    const controller = new AbortController()
    fnRef.current(controller.signal)
    return controller
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    const controller = load()
    return () => controller.abort()
  }, [load])

  return load
}