import { useEffect, useRef, useState, type RefObject } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import Lenis from 'lenis';
import { MOTION } from '@/config/motion';

gsap.registerPlugin(useGSAP);

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setMatch(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return match;
}

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

/**
 * Staggered entrance for `.reveal` children of the scope. Uses
 * gsap.matchMedia so reduced-motion users get the final state immediately.
 */
export function useReveal(scope: RefObject<HTMLElement | null>, deps: unknown[] = [], cfg = MOTION.reveal) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Background tabs throttle rAF; skip the entrance so content is never left faded.
        if (document.hidden) return;
        const tween = gsap.from('.reveal', { opacity: 0, y: cfg.y, duration: cfg.duration, stagger: cfg.stagger, ease: cfg.ease, clearProps: 'all' });
        // Safety net: if frames are throttled, jump to the end rather than leave panels faded.
        const t = setTimeout(() => tween.progress(1), 1500);
        return () => clearTimeout(t);
      });
      return () => mm.revert();
    },
    { scope, dependencies: deps },
  );
}

/** Animated number for KPI tiles. */
export function useCountUp(value: number, cfg = MOTION.countUp) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const obj = { v: prev.current };
    const tween = gsap.to(obj, {
      v: value,
      duration: cfg.duration,
      ease: cfg.ease,
      onUpdate: () => setDisplay(Math.round(obj.v)),
    });
    prev.current = value;
    return () => {
      tween.kill();
    };
  }, [value, reduced, cfg.duration, cfg.ease]);
  return display;
}

/**
 * Lenis smooth scrolling, synced to the GSAP ticker. Mounted only on pages
 * that are long-form (citizen); dashboards with tables/maps keep native scroll.
 */
export function useLenis(enabled = true, cfg = MOTION.lenis) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!enabled || reduced) return;
    const lenis = new Lenis({ autoRaf: false, duration: cfg.duration, wheelMultiplier: cfg.wheelMultiplier, touchMultiplier: cfg.touchMultiplier });
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, [enabled, reduced, cfg.duration, cfg.wheelMultiplier, cfg.touchMultiplier]);
}

/** Brief highlight when a value (e.g. status) changes. */
export function useFlashOnChange(ref: RefObject<HTMLElement | null>, value: unknown) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(
      ref.current,
      { boxShadow: '0 0 0 2px rgba(58,214,224,0.9)' },
      { boxShadow: '0 0 0 0px rgba(58,214,224,0)', duration: MOTION.flash.duration * 2, ease: MOTION.flash.ease },
    );
  }, [value, ref]);
}
