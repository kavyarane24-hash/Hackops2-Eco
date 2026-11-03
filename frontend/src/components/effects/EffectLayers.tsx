import { Component, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useUI } from '@/context/uiStore';
import { GLOW_CURSOR, LIQUID_ETHER, LIQUID_ETHER_MOBILE } from '@/config/motion';
import { useMediaQuery, useReducedMotion } from '@/hooks/motion';

// WebGL effects load in their own chunks so dashboards render first.
const LiquidEther = lazy(() => import('./LiquidEther'));
const GlowCursor = lazy(() => import('./GlowCursor'));

/** Swallows render errors from optional visual effects. */
class EffectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Single background layer behind all content. Never takes pointer events,
 * sits under near-opaque content surfaces (so charts and forms stay calm),
 * and falls back to a static tone when effects are off, motion is reduced,
 * or WebGL2 is missing.
 */
export function BackgroundLayer() {
  const enabled = useUI((s) => s.effectsEnabled);
  const reduced = useReducedMotion();
  const small = useMediaQuery('(max-width: 767px)');
  const webgl = useMemo(hasWebGL2, []);
  const live = enabled && !reduced && webgl;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 520px at 10% -10%, rgba(35,122,205,0.14), transparent 60%), radial-gradient(900px 480px at 100% 0%, rgba(135,78,43,0.1), transparent 60%), #0b1014',
        }}
      />
      {live && (
        <EffectBoundary>
          <Suspense fallback={null}>
            <div className="absolute inset-0" style={{ opacity: small ? 0.25 : 0.4 }}>
              <LiquidEther {...(small ? LIQUID_ETHER_MOBILE : LIQUID_ETHER)} />
            </div>
          </Suspense>
        </EffectBoundary>
      )}
      <div className="absolute inset-0 bg-ink-950/60" />
    </div>
  );
}

/** Optional glow trail; fine pointers only, off for reduced motion. Native cursor is untouched. */
export function CursorLayer() {
  const enabled = useUI((s) => s.cursorEnabled && s.effectsEnabled);
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const reduced = useReducedMotion();
  if (!enabled || !finePointer || reduced) return null;
  return (
    <EffectBoundary>
      <Suspense fallback={null}>
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[5]">
          <GlowCursor {...GLOW_CURSOR} />
        </div>
      </Suspense>
    </EffectBoundary>
  );
}
