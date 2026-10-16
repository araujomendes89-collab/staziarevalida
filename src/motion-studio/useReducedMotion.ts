import { useEffect, useState } from 'react';

/** Le prefers-reduced-motion e acompanha mudancas. Sem matchMedia (SSR/teste) = falso. */
export function useReducedMotion(override?: boolean): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const read = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [reduced, setReduced] = useState<boolean>(read);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return override ?? reduced;
}
