#!/usr/bin/env node
/**
 * map_fx.js — Canvas FX name mapping between html-ppt and hyperframes
 *
 * html-ppt uses: <div data-fx="xxx"> + fx-runtime.js
 * hyperframes uses: window.CFX.xxx() + canvas-fx.js
 *
 * Most FX share the same name. This module maps names and provides default FX assignments per layout type.
 */

const FX_MAP = {
  // Direct name mappings (same name in both systems)
  'particle-burst':  { hf: 'particle-burst',  duration: 10, opacity: 0.65 },
  'matrix-rain':     { hf: 'matrix-rain',      duration: 25, opacity: 0.65 },
  'bokeh':           { hf: 'bokeh',            duration: 25, opacity: 0.65 },
  'aurora':          { hf: 'aurora',           duration: 15, opacity: 0.65 },
  'gradient-wave':   { hf: 'gradient-wave',    duration: 10, opacity: 0.65 },
  'pulse-ring':      { hf: 'pulse-ring',       duration: 15, opacity: 0.65 },
  'trail':           { hf: 'trail',            duration: 10, opacity: 0.65 },
  'lightning':       { hf: 'lightning',        duration: 10, opacity: 0.65 },
  'firework':        { hf: 'firework',         duration: 10, opacity: 0.65 },
  'spiral':          { hf: 'spiral',           duration: 10, opacity: 0.65 },

  // html-ppt FX names → hyperframes equivalents
  'neural-net':      { hf: 'matrix-rain',      duration: 20, opacity: 0.5, note: 'approximate' },
  'knowledge-graph': { hf: 'matrix-rain',      duration: 20, opacity: 0.5, note: 'approximate' },
  'orbit-ring':      { hf: 'particle-burst',   duration: 10, opacity: 0.6, note: 'approximate' },
  'galaxy-swirl':    { hf: 'spiral',           duration: 15, opacity: 0.6, note: 'approximate' },
  'rain':            { hf: 'matrix-rain',      duration: 20, opacity: 0.65 },
  'confetti':        { hf: 'firework',         duration: 10, opacity: 0.65, note: 'approximate' },
  'ripple':          { hf: 'pulse-ring',       duration: 15, opacity: 0.5, note: 'approximate' },
};

/**
 * Default FX assignment per layout type
 * Used when user doesn't specify FX for a scene
 */
const DEFAULT_FX_PER_LAYOUT = {
  'cover':           'particle-burst',
  'toc':             'gradient-wave',
  'section-divider': 'gradient-wave',
  'bullets':         'bokeh',
  'two-column':      'bokeh',
  'three-column':    'bokeh',
  'stat-highlight':  'pulse-ring',
  'kpi-grid':        'bokeh',
  'comparison':      'lightning',
  'process-steps':   'pulse-ring',
  'cta':             'particle-burst',
  'thanks':          'aurora',
  'code':            'matrix-rain',
  'terminal':        'matrix-rain',
  'timeline':        'gradient-wave',
  'big-quote':       'bokeh',
  'image-hero':      null, // No FX for image scenes
};

/**
 * Text-heavy layouts that should skip FX (to avoid obscuring text)
 */
const SKIP_FX_LAYOUTS = ['bullets']; // Only skip if >4 items

function resolveFX(fxName) {
  if (!fxName) return null;
  return FX_MAP[fxName] || { hf: fxName, duration: 10, opacity: 0.65, note: 'unknown' };
}

function getDefaultFX(layoutName, data = {}) {
  // Skip FX for text-heavy scenes
  if (layoutName === 'bullets' && (data.items || []).length > 4) {
    return null; // skipFx
  }
  return DEFAULT_FX_PER_LAYOUT[layoutName] || 'bokeh';
}

/**
 * Generate GSAP code for Canvas FX
 * Matches the pattern used in wechat-video-new/index.html
 */
function generateFXCode(fxName, sceneStartTime, sceneDuration) {
  const fx = resolveFX(fxName);
  if (!fx) return null;

  const fxStart = sceneStartTime + 0.2;
  const fxDur = Math.min(fx.duration, sceneDuration - 0.5);

  return `tl.add(function() { startCFX('${fx.hf}', ${fxStart}, ${fxDur}); }, ${fxStart});`;
}

module.exports = { FX_MAP, DEFAULT_FX_PER_LAYOUT, SKIP_FX_LAYOUTS, resolveFX, getDefaultFX, generateFXCode };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--list') {
    console.log('FX Mapping (html-ppt → hyperframes):');
    for (const [hp, hf] of Object.entries(FX_MAP)) {
      console.log(`  ${hp} → ${hf.hf}${hf.note ? ` (${hf.note})` : ''}`);
    }
    console.log('\nDefault FX per layout:');
    for (const [layout, fx] of Object.entries(DEFAULT_FX_PER_LAYOUT)) {
      console.log(`  ${layout} → ${fx || 'skip'}`);
    }
  } else if (args[0]) {
    const fx = resolveFX(args[0]);
    console.log(fx ? JSON.stringify(fx, null, 2) : 'null');
  }
}
