// All animation parameters live here so motion can be tuned in one place.

export const MOTION = {
  reveal: { y: 10, duration: 0.4, stagger: 0.04, ease: 'power2.out' },
  countUp: { duration: 0.8, ease: 'power1.out' },
  flash: { duration: 0.6, ease: 'power2.out' },
  lenis: { duration: 1.05, wheelMultiplier: 0.95, touchMultiplier: 1.2 },
} as const;

/** Background fluid. Kept subtle: low opacity, strong scrim, no click bursts. */
export const LIQUID_ETHER = {
  colors: ['#237acd', '#6ea0b1', '#874e2b'],
  mouseForce: 14,
  cursorSize: 100,
  persistence: 0.75,
  autoDemo: true,
  autoSpeed: 0.4,
  autoIntensity: 1.8,
  intensity: 0.8,
  viscosity: 0,
  resolution: 0.45,
  clickBurst: false,
  bounceEdges: false,
  intro: true,
  lightMode: false,
};

export const LIQUID_ETHER_MOBILE = { ...LIQUID_ETHER, resolution: 0.3, intensity: 0.5, autoIntensity: 1.2, mouseForce: 8 };

/** Optional soft glow trail behind the pointer; the native cursor stays visible. */
export const GLOW_CURSOR = {
  color: '#4cc3a5',
  secondaryColor: '#3f86c9',
  intensity: 0.45,
  trailWidth: 0.6,
  linger: 0.4,
  glow: 0.6,
  quality: 'low' as const,
  clickBurst: false,
  theme: 'dark' as const,
  blendMode: 'screen' as const,
};

export const CAROUSEL = {
  effect: 'slide' as const,
  indicator: 'dots' as const,
  arrows: true,
  autoplay: false,
  loop: true,
  draggable: true,
  aspectRatio: 1.9,
  gap: 12,
  radius: 12,
  frame: false,
  theme: 'light' as const,
};
