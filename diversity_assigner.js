#!/usr/bin/env node
/**
 * diversity_assigner.js — 多样性分配器 (v0.9.0)
 *
 * 核心规则：
 * - >30s 视频：强制使用全部 31 布局 + 27 动画 + 20 FX
 * - <=30s 视频：使用一半（向上取整）
 * - 场景不足时，自动补充装饰性数据场景覆盖未使用布局
 * - 为每个场景分配一种动画、一种 FX（均匀洗牌分配）
 * - 原始场景布局保留不变，仅在不足时补充
 *
 * v0.9.0 变更：
 * - 新增 explodeForFullCoverage()：自动补充装饰场景覆盖全部 31 种布局
 * - 新增 FAKE_DATA_MAP：31 种布局的通用数据模板
 * - 时长控制：自动场景 2-4 秒，总时长 >120s 时截断场景
 * - 向后兼容：<=30s 走原有 half 模式
 */

'use strict';

// ═══════════════════════════════════════════════════════════
// 全部 31 种布局
// ═══════════════════════════════════════════════════════════
const ALL_LAYOUTS = [
  'cover', 'toc', 'bullets', 'comparison', 'process-steps', 'cta',
  'stat-highlight', 'two-column', 'three-column', 'big-quote', 'kpi-grid',
  'data-table', 'chart-bar', 'chart-line', 'chart-pie', 'chart-radar',
  'code', 'diff', 'terminal', 'flow-diagram', 'arch-diagram', 'mindmap',
  'timeline', 'roadmap', 'gantt', 'pros-cons', 'image-hero',
  'fullscreen-stat', 'highlight-box', 'numbered-list', 'icon-grid'
];

const ALL_ANIMATIONS = [
  'fade-up', 'fade-down', 'fade-left', 'fade-right', 'rise-in', 'drop-in',
  'zoom-pop', 'blur-in', 'glitch-in', 'bounce-in',
  'stagger-list', 'card-flip-3d', 'cube-rotate-3d', 'page-turn-3d', 'perspective-zoom',
  'kenburns', 'typewriter', 'neon-glow', 'shimmer-sweep', 'gradient-flow',
  'path-draw', 'confetti-burst', 'spotlight', 'ripple-reveal',
  'morph-shape', 'marquee-scroll', 'parallax-tilt'
];

const ALL_FX = [
  'particle-burst', 'matrix-rain', 'bokeh', 'aurora',
  'gradient-wave', 'pulse-ring', 'trail', 'lightning',
  'firework', 'spiral',
  'neon-grid', 'snow-fall', 'smoke-drift', 'star-field',
  'ripple-expand', 'laser-sweep', 'dna-helix', 'wave-ocean',
  'pixel-rain', 'geo-pulse'
];

// ═══════════════════════════════════════════════════════════
// 31 种布局的通用数据模板
// ═══════════════════════════════════════════════════════════
const FAKE_DATA_MAP = {
  'code': {
    lang: 'javascript',
    code: 'const ai = require("openclaw");\nconst video = ai.createVideo({\n  theme: "cyberpunk",\n  layouts: "all-31"\n});\nvideo.render(); // 5 min -> final.mp4'
  },
  'terminal': {
    title: 'AI Video Pipeline',
    commands: [
      'node parse_input.js --url article.html',
      'node render_per_scene.js --config config.json',
      'npx hyperframes render ./output -o video.mp4',
      'ffmpeg -i video.mp4 -i tts.mp3 -c copy final.mp4'
    ],
    output: [
      'Scenes: 31 | Layouts: 31/31 | FX: 20/20',
      'Duration: 108s | Size: 14.2MB',
      'Done in 3m 22s'
    ]
  },
  'data-table': {
    headers: ['Layout Type', 'Count', 'Status'],
    rows: [
      ['Cover/CTA', '2', 'Done'],
      ['Bullets/Steps', '5', 'Done'],
      ['Charts', '4', 'Done'],
      ['Code/Terminal', '3', 'Done'],
      ['Diagrams', '5', 'Done'],
      ['Data/KPI', '4', 'Done'],
      ['Others', '8', 'Done']
    ]
  },
  'chart-bar': {
    bars: [
      { label: 'Layouts', value: 31 },
      { label: 'Animations', value: 27 },
      { label: 'Canvas FX', value: 20 },
      { label: 'Themes', value: 36 }
    ]
  },
  'chart-line': {
    points: [
      { x: 1, y: 20, label: 'v0.1' },
      { x: 2, y: 35, label: 'v0.3' },
      { x: 3, y: 50, label: 'v0.5' },
      { x: 4, y: 65, label: 'v0.6' },
      { x: 5, y: 80, label: 'v0.8' },
      { x: 6, y: 100, label: 'v0.9' }
    ]
  },
  'chart-pie': {
    slices: [
      { label: 'Original Scenes', value: 40 },
      { label: 'Auto-Fill Scenes', value: 35 },
      { label: 'Transitions', value: 15 },
      { label: 'CTA/Outro', value: 10 }
    ]
  },
  'chart-radar': {
    labels: ['Creativity', 'Tech', 'Speed', 'Quality', 'Reach'],
    values: [88, 92, 95, 85, 78]
  },
  'timeline': {
    items: [
      { date: 'Phase 1', label: 'Content Analysis', desc: 'AI extracts key points' },
      { date: 'Phase 2', label: 'Layout Assignment', desc: '31 layouts auto-assigned' },
      { date: 'Phase 3', label: 'Render & Compose', desc: 'Per-scene rendering' },
      { date: 'Phase 4', label: 'Post-Production', desc: 'TTS + BGM + subtitles' }
    ]
  },
  'gantt': {
    tasks: [
      { name: 'Parse Input', start: 0, end: 15 },
      { name: 'Layout Assign', start: 10, end: 25 },
      { name: 'Generate HTML', start: 20, end: 45 },
      { name: 'Render Scenes', start: 40, end: 75 },
      { name: 'Audio Mix', start: 70, end: 85 },
      { name: 'Final Output', start: 80, end: 100 }
    ]
  },
  'roadmap': {
    phases: [
      { phase: 'Phase 1', goal: 'Foundation', items: ['31 Layouts', '27 Animations', '20 Canvas FX'] },
      { phase: 'Phase 2', goal: 'Automation', items: ['Auto-Fill Scenes', 'Smart Data Gen'] },
      { phase: 'Phase 3', goal: 'Optimization', items: ['Duration Control', 'Quality Metrics'] }
    ]
  },
  'mindmap': {
    root: 'AI Video Generator',
    branches: [
      { label: 'Input', children: ['URL', 'Text', 'Document'] },
      { label: 'Process', children: ['AI Parse', 'Layout Assign', 'FX Mapping'] },
      { label: 'Output', children: ['1080x1920 MP4', 'Cover Image', 'Content Pack'] }
    ]
  },
  'flow-diagram': {
    nodes: [
      { id: 'input', label: 'Input Content', next: ['parse'] },
      { id: 'parse', label: 'AI Parse + Layout', next: ['generate'] },
      { id: 'generate', label: 'HTML Generate', next: ['render'] },
      { id: 'render', label: 'HyperFrames Render', next: ['audio'] },
      { id: 'audio', label: 'TTS + BGM Mix', next: ['concat'] },
      { id: 'concat', label: 'Final Concat', next: [] }
    ]
  },
  'arch-diagram': {
    layers: [
      { label: 'Input Layer', nodes: ['Web URL', 'Markdown', 'JSON Config'] },
      { label: 'AI Layer', nodes: ['Content Parse', 'Layout Selection', 'Animation Map'] },
      { label: 'Render Layer', nodes: ['HTML Generator', 'HyperFrames', 'Canvas FX'] },
      { label: 'Output Layer', nodes: ['MP4 Video', 'Cover Image', 'Content Pack'] }
    ]
  },
  'pros-cons': {
    pros: ['Full 31-Layout Coverage', 'Auto Scene Generation', 'Smart Duration Control'],
    cons: ['Initial Learning Curve', 'Render Time (3-5 min)', 'Needs Modern GPU'],
    prosLabel: 'Advantages',
    consLabel: 'Trade-offs'
  },
  'stat-highlight': {
    kicker: 'Coverage',
    big: '100%',
    label: 'Layout Coverage',
    desc: 'All 31 layouts used in every >30s video',
    value: '100%'
  },
  'fullscreen-stat': {
    big: '31+27+20',
    label: 'Layouts + Animations + FX',
    sub: 'Full coverage in every video >30s'
  },
  'highlight-box': {
    type: 'tip',
    title: 'Key Insight',
    text: 'Content quality always beats visual effects. AI tools amplify your creativity, not replace it.'
  },
  'numbered-list': {
    kicker: 'Process',
    title: '6 Steps to Full Coverage',
    items: [
      'Analyze input content',
      'Generate core scenes',
      'Auto-fill missing layouts',
      'Assign animations + FX',
      'Per-scene render',
      'Concat and publish'
    ]
  },
  'icon-grid': {
    kicker: 'Capabilities',
    title: 'What AI Video Can Do',
    items: [
      { icon: '\u{1F3AF}', label: '31 Layouts', desc: 'Every type covered' },
      { icon: '\u{1F3AC}', label: '27 Animations', desc: 'GSAP powered' },
      { icon: '\u{1F4A5}', label: '20 FX', desc: 'Canvas effects' },
      { icon: '\u{1F3A8}', label: '36 Themes', desc: 'One-click style' }
    ]
  },
  'diff': {
    lines: [
      { text: '// Old way (manual)', type: '-' },
      { text: 'Write script -> Record voice -> Edit video -> 4 hours', type: '-' },
      { text: '// New way (AI-powered)', type: '+' },
      { text: 'Paste URL -> AI auto-generates -> Full render -> 5 minutes', type: '+' },
      { text: '// With v0.9.0: ALL 31 layouts auto-covered', type: '+' }
    ]
  },
  'toc': {
    items: [
      { title: '1. Layout System', desc: '31 layouts for any content' },
      { title: '2. Animation Engine', desc: '27 GSAP animations' },
      { title: '3. Canvas FX', desc: '20 real-time effects' },
      { title: '4. Auto Pipeline', desc: 'URL to MP4 in 5 min' }
    ]
  },
  'comparison': {
    cols: [
      { name: 'Manual', use: '4h/video', save: 'Slow' },
      { name: 'Semi-Auto', use: '30min/video', save: 'OK' },
      { name: 'AI Full', use: '5min/video', save: 'Fast', highlight: true }
    ]
  },
  'kpi-grid': {
    kpis: [
      { label: 'Layouts', value: '31', unit: 'types', trend: '100%' },
      { label: 'Animations', value: '27', unit: 'types', trend: '100%' },
      { label: 'Canvas FX', value: '20', unit: 'types', trend: '100%' },
      { label: 'Time Saved', value: '95%', unit: '', trend: '+45x' }
    ]
  },
  'three-column': {
    cols: [
      { title: 'Douyin', items: ['1080x1920', 'Fast pace', 'Massive traffic'] },
      { title: 'Bilibili', items: ['1920x1080', 'Deep content', 'High loyalty'] },
      { title: 'Xiaohongshu', items: ['Image+Text', 'Shopping', 'Female focus'] }
    ]
  },
  'two-column': {
    left: { title: 'Before', items: ['12 layouts used', 'Same style repeating', 'Boring visuals'] },
    right: { title: 'After', items: ['31 layouts used', 'Fresh every scene', 'Pro visual quality'] },
    kicker: 'Comparison'
  },
  'process-steps': {
    steps: [
      'Input Content (URL/Text)',
      'AI Parse + Extract Key Points',
      'Auto Layout + Animation Assignment',
      'Per-Scene HyperFrames Render',
      'TTS Voice + BGM Mix',
      'Final Concat -> MP4'
    ]
  },
  'cover': {
    kicker: 'AI Video',
    title: 'Full Coverage',
    subtitle: '31 Layouts + 27 Animations + 20 FX',
    tags: ['AI', 'Automation', 'Video']
  },
  'bullets': {
    kicker: 'Key Points',
    title: 'What Makes It Work',
    items: ['Auto scene generation for all layouts', 'Smart duration control (45-120s)', 'GSAP + Canvas FX for visual impact', 'One-click from URL to MP4']
  },
  'cta': {
    title: 'Start Creating',
    subtitle: 'Paste any URL, get a pro video in 5 minutes',
    url: 'openclaw.ai'
  },
  'big-quote': {
    quote: 'The best videos are not made, they are generated.',
    author: 'AI Video Engine v0.9',
    role: 'Full Coverage Mode'
  },
  'image-hero': {
    src: '',
    overlay: true,
    caption: 'AI-powered video generation'
  }
};

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let _fakeSceneCounter = 0;

function generateFakeScene(layout) {
  _fakeSceneCounter++;
  const data = FAKE_DATA_MAP[layout];
  if (!data) {
    console.warn('  [diversity] No FAKE_DATA_MAP for: ' + layout + ', using fallback');
    return { id: 'auto-' + layout + '-' + _fakeSceneCounter, layout, duration: 4, data: { title: layout.replace(/-/g, ' '), kicker: 'Auto' } };
  }
  return { id: 'auto-' + layout + '-' + _fakeSceneCounter, layout, duration: 4, data: JSON.parse(JSON.stringify(data)) };
}

/**
 * Interleave: original[0], filler[0], original[1], filler[1], ...
 * Remaining fillers go at end.
 */
function interleaveScenes(originals, fillers) {
  if (fillers.length === 0) return originals;
  if (originals.length === 0) return fillers;
  const result = [];
  let oIdx = 0, fIdx = 0;
  while (oIdx < originals.length || fIdx < fillers.length) {
    if (oIdx < originals.length) result.push(originals[oIdx++]);
    if (fIdx < fillers.length) result.push(fillers[fIdx++]);
  }
  return result;
}

/**
 * Adjust filler durations and count to fit within targetMax.
 * If originals alone exceed budget, compress originals proportionally.
 * Returns re-interleaved scene list.
 */
function adjustDurations(originals, fillers, targetMax) {
  const originalDuration = originals.reduce((a, s) => a + (s.duration || 0), 0);
  const fillerCount = fillers.length;

  // Calculate ideal total with all fillers at 2-4s
  const idealFillerDur = Math.min(4, Math.max(2, (targetMax - originalDuration) / fillerCount));
  const idealTotal = originalDuration + idealFillerDur * fillerCount;

  // If everything fits nicely (originals + all fillers at ideal duration)
  if (idealTotal <= targetMax) {
    console.log('  [diversity] Duration adjust: original=' + originalDuration + 's, filler=' + idealFillerDur.toFixed(1) + 's x' + fillerCount + ' = ' + (idealFillerDur * fillerCount).toFixed(1) + 's, total=' + idealTotal.toFixed(1) + 's');
    const adjustedFillers = fillers.map(s => ({ ...s, duration: Math.round(idealFillerDur * 10) / 10 }));
    return { scenes: interleaveScenes(originals, adjustedFillers), usedFillers: fillerCount, fillerDuration: idealFillerDur, compressedOriginals: false };
  }

  // Doesn't fit - compress originals to ~40% of targetMax, fillers get ~55%
  const targetOrigDur = targetMax * 0.4;
  const targetFillDur = targetMax - targetOrigDur;
  const compressionRatio = targetOrigDur / originalDuration;
  const fillerDur = Math.min(4, Math.max(2, targetFillDur / fillerCount));
  const activeCount = Math.min(fillerCount, Math.floor(targetFillDur / fillerDur));

  console.log('  [diversity] COMPRESSING originals: ' + originalDuration + 's -> ' + (originalDuration * compressionRatio).toFixed(1) + 's (ratio=' + (compressionRatio * 100).toFixed(0) + '%)');

  const compressedOriginals = originals.map(s => ({
    ...s,
    duration: Math.max(3, Math.round(s.duration * compressionRatio * 10) / 10)
  }));
  const compressedDur = compressedOriginals.reduce((a, s) => a + s.duration, 0);
  const actualBudget = targetMax - compressedDur;
  const finalFillerDur = Math.min(fillerDur, actualBudget / activeCount);

  console.log('  [diversity] After compression: original=' + compressedDur.toFixed(1) + 's, filler=' + finalFillerDur.toFixed(1) + 's x' + activeCount + ' = ' + (finalFillerDur * activeCount).toFixed(1) + 's, total=' + (compressedDur + finalFillerDur * activeCount).toFixed(1) + 's');

  const keptFillers = fillers.slice(0, activeCount).map(s => ({ ...s, duration: Math.round(finalFillerDur * 10) / 10 }));
  return { scenes: interleaveScenes(compressedOriginals, keptFillers), usedFillers: activeCount, fillerDuration: finalFillerDur, compressedOriginals: true };
}

// ═══════════════════════════════════════════════════════════
// 核心分配器 (v0.9.0)
// ═══════════════════════════════════════════════════════════
function assignDiversity(scenes, totalDuration, options) {
  // [v0.9.5] 移除 skipFiller：>30s 强制使用全部31种布局
  _fakeSceneCounter = 0;
  const scenesWorking = scenes.map(s => ({ ...s, data: s.data ? JSON.parse(JSON.stringify(s.data)) : {} }));
  const sceneCount = scenesWorking.length;
  if (sceneCount === 0) return { scenes: [], stats: {} };

  const useAll = totalDuration > 30;

  // Step 1: Collect used layouts
  const usedLayoutSet = new Set(scenesWorking.map(s => s.layout).filter(Boolean));
  console.log('  [diversity] Original layouts (' + usedLayoutSet.size + '): ' + [...usedLayoutSet].join(', '));

  // Step 2: Auto-fill missing layouts if >30s
  const originals = [...scenesWorking];
  let autoFillCount = 0;

  if (useAll) {
    const unusedLayouts = ALL_LAYOUTS.filter(l => !usedLayoutSet.has(l));
    if (unusedLayouts.length > 0) {
      console.log('  [diversity] Auto-filling ' + unusedLayouts.length + ' missing layouts: ' + unusedLayouts.join(', '));
      const fillers = unusedLayouts.map(l => generateFakeScene(l));
      const adjusted = adjustDurations(originals, fillers, 120);
      scenesWorking.length = 0;
      scenesWorking.push(...adjusted.scenes);
      autoFillCount = adjusted.usedFillers;
      console.log('  [diversity] Scenes after fill: ' + scenesWorking.length);
    } else {
      console.log('  [diversity] All 31 layouts already covered');
    }
  } else {
    // ≤30s 规则：补满一半布局（向上取整）
    const targetLC = Math.ceil(ALL_LAYOUTS.length / 2);
    const unusedL = ALL_LAYOUTS.filter(l => !usedLayoutSet.has(l)).slice(0, targetLC - usedLayoutSet.size);
    if (unusedL.length > 0) {
      console.log('  [diversity] <=30s: auto-filling ' + unusedL.length + ' layouts to reach ' + targetLC);
      const fillers = unusedL.map(l => generateFakeScene(l));
      const adjusted = adjustDurations(originals, fillers, 60);
      scenesWorking.length = 0;
      scenesWorking.push(...adjusted.scenes);
      autoFillCount = adjusted.usedFillers;
    } else {
      console.log('  [diversity] <=30s: ' + usedLayoutSet.size + ' layouts (target: ' + targetLC + ')');
    }
  }

  const finalCount = scenesWorking.length;

  // Step 3: Animation assignment
  const targetAnimCount = useAll ? ALL_ANIMATIONS.length : Math.ceil(ALL_ANIMATIONS.length / 2);
  const availAnims = shuffle([...ALL_ANIMATIONS]);
  for (let i = 0; i < finalCount; i++) {
    let pick = availAnims[i % availAnims.length];
    if (pick === 'parallax-tilt' && finalCount < 10) {
      pick = availAnims[(i + 1) % availAnims.length];
    }
    if (!scenesWorking[i].data) scenesWorking[i].data = {};
    scenesWorking[i].data.animation = pick;
  }

  // Step 4: FX assignment
  const targetFxCount = useAll ? ALL_FX.length : Math.ceil(ALL_FX.length / 2);
  const availFx = shuffle([...ALL_FX]);
  for (let i = 0; i < finalCount; i++) {
    scenesWorking[i].fx = availFx[i % availFx.length];
  }

  // Stats
  const finalLayoutSet = new Set(scenesWorking.map(s => s.layout).filter(Boolean));
  const finalAnimSet = new Set(scenesWorking.map(s => s.data && s.data.animation).filter(Boolean));
  const finalFxSet = new Set(scenesWorking.map(s => s.fx).filter(Boolean));
  const finalTotalDuration = scenesWorking.reduce((a, s) => a + (s.duration || 0), 0);

  return {
    scenes: scenesWorking,
    stats: {
      totalDuration: finalTotalDuration,
      mode: useAll ? 'full' : 'half',
      originalSceneCount: sceneCount,
      explodedSceneCount: finalCount,
      autoFillCount,
      layouts: { used: finalLayoutSet.size, target: ALL_LAYOUTS.length },
      animations: { used: finalAnimSet.size, target: targetAnimCount },
      fx: { used: finalFxSet.size, target: targetFxCount },
    }
  };
}

// ═══════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  const configArg = args.find(a => a.startsWith('--config=')) || args.find(a => !a.startsWith('--'));
  const apply = args.includes('--apply');

  if (!configArg) {
    console.error('Usage: node diversity_assigner.js [--config=]config.json [--apply]');
    process.exit(1);
  }

  const configPath = configArg.replace('--config=', '');
  if (!fs.existsSync(configPath)) {
    console.error('Config not found: ' + configPath);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const totalConfigDuration = config.scenes.reduce((a, s) => a + (s.duration || 0), 0);
  const result = assignDiversity(config.scenes, totalConfigDuration, {});

  config.scenes = result.scenes;

  if (apply) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('Config updated: ' + configPath);
  }

  console.log('\nDiversity Assignment (v0.9.0):');
  console.log('  Mode: ' + result.stats.mode + ' (' + totalConfigDuration + 's -> ' + result.stats.totalDuration + 's)');
  console.log('  Scenes: ' + result.stats.originalSceneCount + ' (original) + ' + result.stats.autoFillCount + ' (auto-fill) = ' + result.stats.explodedSceneCount);
  console.log('  Layouts:    ' + result.stats.layouts.used + '/' + result.stats.layouts.target + (result.stats.layouts.used < result.stats.layouts.target ? ' WARN' : ' OK'));
  console.log('  Animations: ' + result.stats.animations.used + '/' + result.stats.animations.target + (result.stats.animations.used < result.stats.animations.target ? ' WARN' : ' OK'));
  console.log('  FX:         ' + result.stats.fx.used + '/' + result.stats.fx.target + (result.stats.fx.used < result.stats.fx.target ? ' WARN' : ' OK'));
}

module.exports = { assignDiversity, ALL_LAYOUTS, ALL_ANIMATIONS, ALL_FX, FAKE_DATA_MAP };
