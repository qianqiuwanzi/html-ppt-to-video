#!/usr/bin/env node
/**
 * convert_animations.js — Map html-ppt CSS animations to GSAP tween equivalents for hyperframes
 *
 * This is the CORE of Route-B: translating CSS keyframes to GSAP timeline calls.
 *
 * Usage: node convert_animations.js [--html-ppt-dir <path>] [--output json|js]
 *
 * Output: A JSON map of animation-name → { gsapFrom, gsapTo, ease, duration }
 *         or a JS module with helper functions.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_HP_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\qianq',
  '.qclaw', 'skills', 'html-ppt-skill'
);

/**
 * Mapping: html-ppt CSS animation name → GSAP equivalent
 *
 * Strategy:
 * - Directional fades → gsap.from({ y/x, opacity: 0 })
 * - Dramatic entrances → gsap.from({ y, scale, opacity: 0 }) with special eases
 * - Typewriter → custom JS (not a simple tween)
 * - Glow/shimmer/gradient → gsap timeline with keyframes
 * - Stagger list → gsap.from with stagger option
 * - 3D effects → gsap.from with CSS 3D transform properties
 * - Continuous (neon, marquee, kenburns) → gsap.timeline with repeat
 */
const ANIMATION_MAP = {
  // ===== FADE DIRECTIONALS =====
  'fade-up': {
    gsapFrom: { y: 32, opacity: 0 },
    duration: 0.7,
    ease: 'power3.out',
  },
  'fade-down': {
    gsapFrom: { y: -32, opacity: 0 },
    duration: 0.7,
    ease: 'power3.out',
  },
  'fade-left': {
    gsapFrom: { x: -40, opacity: 0 },
    duration: 0.7,
    ease: 'power3.out',
  },
  'fade-right': {
    gsapFrom: { x: 40, opacity: 0 },
    duration: 0.7,
    ease: 'power3.out',
  },

  // ===== DRAMATIC ENTRANCES =====
  'rise-in': {
    gsapFrom: { y: 60, scale: 0.97, opacity: 0 },
    duration: 0.9,
    ease: 'power3.out',
  },
  'drop-in': {
    gsapFrom: { y: -60, scale: 0.97, opacity: 0 },
    duration: 0.8,
    ease: 'power3.out',
  },
  'zoom-pop': {
    gsapFrom: { scale: 0.6, opacity: 0 },
    duration: 0.7,
    ease: 'back.out(1.3)',
  },
  'blur-in': {
    gsapFrom: { opacity: 0, scale: 1.08 },
    duration: 0.8,
    ease: 'power2.out',
  },
  'glitch-in': {
    // Glitch is complex — approximate with x jitter + clipPath
    gsapFrom: { x: -6, opacity: 0 },
    duration: 0.8,
    ease: 'steps(5)',
    special: 'glitch',
  },

  // ===== TEXT EFFECTS =====
  'typewriter': {
    special: 'typewriter',
    duration: 2.4,
  },
  'neon-glow': {
    special: 'neon-glow',
    // Continuous — needs repeat
    duration: 2.0,
  },
  'shimmer-sweep': {
    special: 'shimmer-sweep',
    duration: 2.4,
  },
  'gradient-flow': {
    special: 'gradient-flow',
    duration: 4.0,
  },

  // ===== STAGGER LIST =====
  'stagger-list': {
    gsapFrom: { y: 30, opacity: 0 },
    duration: 0.65,
    stagger: 0.1,
    ease: 'power3.out',
    isStagger: true,
  },

  // ===== SVG =====
  'path-draw': {
    special: 'path-draw',
    duration: 2.0,
  },

  // ===== 3D EFFECTS =====
  'card-flip-3d': {
    gsapFrom: { rotateY: -90, opacity: 0, transformPerspective: 1200 },
    duration: 0.9,
    ease: 'power3.out',
  },
  'cube-rotate-3d': {
    gsapFrom: { rotateX: 20, rotateY: -90, z: -200, opacity: 0, transformPerspective: 1200 },
    duration: 1.0,
    ease: 'power3.out',
  },
  'page-turn-3d': {
    gsapFrom: { rotateY: -85, opacity: 0, transformPerspective: 1600, transformOrigin: 'left center' },
    duration: 1.0,
    ease: 'power3.out',
  },
  'perspective-zoom': {
    gsapFrom: { z: -400, rotateX: 12, opacity: 0, transformPerspective: 1400 },
    duration: 1.0,
    ease: 'power3.out',
  },
  'parallax-tilt': {
    special: 'parallax-tilt',
    // Hover effect — not applicable to video
    note: 'Skip for video — hover-only effect',
  },

  // ===== CONTINUOUS / ENVIRONMENT =====
  'marquee-scroll': {
    special: 'marquee-scroll',
    duration: 20.0,
    repeat: -1, // Will be capped by scene duration
  },
  'kenburns': {
    gsapFrom: { scale: 1 },
    gsapTo: { scale: 1.15, x: '-2%', y: '-1%' },
    duration: 14.0,
    ease: 'none',
    yoyo: true,
    repeat: -1,
  },
  'confetti-burst': {
    special: 'confetti-burst',
    duration: 1.2,
  },

  // ===== REVEAL =====
  'spotlight': {
    special: 'spotlight',
    duration: 1.1,
  },
  'ripple-reveal': {
    special: 'ripple-reveal',
    duration: 1.2,
  },
  'morph-shape': {
    special: 'morph-shape',
    duration: 6.0,
  },
};

/**
 * Generate GSAP timeline code for a given animation
 */
function generateGSAPCode(animName, selector, options = {}) {
  const map = ANIMATION_MAP[animName];
  if (!map) return `// Unknown animation: ${animName}`;

  const { startTime = 0, delay = 0 } = options;
  const pos = startTime > 0 ? `, ${startTime + delay}` : (delay > 0 ? `, ${delay}` : '');

  if (map.special) {
    return generateSpecialCode(map.special, selector, map, options);
  }

  if (map.isStagger) {
    const fromVars = { ...map.gsapFrom, duration: map.duration, stagger: map.stagger || 0.1, ease: map.ease };
    return `tl.from('${selector}', ${JSON.stringify(fromVars)}${pos});`;
  }

  if (map.gsapTo) {
    // Both from and to (e.g., kenburns)
    const fromVars = { ...map.gsapFrom, duration: map.duration, ease: map.ease, yoyo: map.yoyo || false };
    return `tl.fromTo('${selector}', ${JSON.stringify(fromVars)}, ${JSON.stringify({ ...map.gsapTo, duration: map.duration, ease: map.ease })}${pos});`;
  }

  // Simple gsap.from
  const fromVars = { ...map.gsapFrom, duration: map.duration, ease: map.ease };
  return `tl.from('${selector}', ${JSON.stringify(fromVars)}${pos});`;
}

function generateSpecialCode(special, selector, map, options) {
  const { startTime = 0 } = options;
  switch (special) {
    case 'typewriter':
      return `// typewriter: custom JS needed for '${selector}'`;
    case 'neon-glow':
      return `// neon-glow: continuous — implement as keyframe tween for '${selector}'`;
    case 'shimmer-sweep':
      return `// shimmer-sweep: CSS pseudo-element — needs manual implementation for '${selector}'`;
    case 'gradient-flow':
      return `// gradient-flow: CSS background animation — needs manual implementation for '${selector}'`;
    case 'path-draw':
      return `// path-draw: SVG stroke-dasharray animation for '${selector}'`;
    case 'glitch':
      return `// glitch: complex x-jitter sequence for '${selector}'`;
    case 'confetti-burst':
      return `// confetti-burst: decorative — consider Canvas FX instead for '${selector}'`;
    case 'spotlight':
      return `// spotlight: clip-path circle reveal for '${selector}'`;
    case 'ripple-reveal':
      return `// ripple-reveal: clip-path circle reveal for '${selector}'`;
    case 'marquee-scroll':
      return `// marquee-scroll: continuous x-translate for '${selector}'`;
    case 'parallax-tilt':
      return `// parallax-tilt: skip — hover-only, not for video`;
    default:
      return `// Unknown special: ${special}`;
  }
}

function main() {
  const args = process.argv.slice(2);
  let hpDir = DEFAULT_HP_DIR;
  let outputFmt = 'json';
  let filterName = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--html-ppt-dir' && args[i + 1]) {
      hpDir = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFmt = args[++i];
    } else if (args[i] === '--filter' && args[i + 1]) {
      filterName = args[++i];
    }
  }

  let map = ANIMATION_MAP;
  if (filterName) {
    const filtered = {};
    for (const [k, v] of Object.entries(map)) {
      if (k.includes(filterName)) filtered[k] = v;
    }
    map = filtered;
  }

  if (outputFmt === 'js') {
    console.log('/**');
    console.log(' * GSAP animation helpers — auto-generated from html-ppt animations.css');
    console.log(' * Use: gsapFrom("fade-up", ".my-element", { startTime: 2 })');
    console.log(' */');
    console.log('');
    console.log('const ANIM_MAP = ' + JSON.stringify(map, null, 2) + ';');
    console.log('');
    console.log('function applyAnim(tl, animName, selector, options = {}) {');
    console.log('  const m = ANIM_MAP[animName];');
    console.log('  if (!m) { console.warn("Unknown animation:", animName); return; }');
    console.log('  if (m.special) { console.log("// Special:", m.special, "for", selector); return; }');
    console.log('  const pos = options.startTime ? `, ${options.startTime}` : "";');
    console.log('  if (m.isStagger) {');
    console.log('    tl.from(selector, { ...m.gsapFrom, duration: m.duration, stagger: m.stagger, ease: m.ease }, options.startTime);');
    console.log('  } else {');
    console.log('    tl.from(selector, { ...m.gsapFrom, duration: m.duration, ease: m.ease }, options.startTime);');
    console.log('  }');
    console.log('}');
    console.log('');
    console.log('module.exports = { ANIM_MAP, applyAnim, generateGSAPCode };');
  } else {
    console.log(JSON.stringify(map, null, 2));
  }
}

module.exports = { ANIM_MAP: ANIMATION_MAP, generateGSAPCode, generateSpecialCode };

if (require.main === module) main();
