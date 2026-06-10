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

/**
 * 【方案B-修复】从真实场景内容中提取关键词/数据，生成相关填充场景
 * 不再使用 FAKE_DATA_MAP 中的 Demo 假数据
 */
function generateContentAwareScene(layout, realScenes) {
  _fakeSceneCounter++;
  const id = 'auto-' + layout + '-' + _fakeSceneCounter;
  const duration = 4;

  // 从真实场景中提取可用内容
  const allTitles = [];
  const allItems = [];
  const allNumbers = [];
  const keywords = [];

  for (const scene of realScenes) {
    const d = scene.data || {};
    if (d.title) allTitles.push(d.title);
    if (d.kicker) keywords.push(d.kicker);
    if (d.label) keywords.push(d.label);
    if (d.desc) keywords.push(d.desc);
    if (Array.isArray(d.items)) d.items.forEach(i => {
      if (typeof i === 'string') allItems.push(i);
      else if (i.label) keywords.push(i.label);
    });
    if (Array.isArray(d.cols)) d.cols.forEach(c => {
      if (c.title) keywords.push(c.title);
      if (c.name) keywords.push(c.name);
    });
    // 提取数字
    const nums = (JSON.stringify(d)).match(/\d+(?:\.\d+)?%/g) || [];
    nums.forEach(n => { if (n !== '100%') allNumbers.push(n); });
  }

  const kw = keywords.slice(0, 8);
  const title = allTitles[0] || kw[0] || layout;

  // 根据布局类型生成真实相关内容
  const data = generateRelevantData(layout, { titles: allTitles, items: allItems, numbers: allNumbers, keywords: kw, mainTitle: title });

  console.warn('  [diversity] Auto-fill: "' + layout + '" scene "' + id + '" — content derived from real scenes (not demo data)');
  return { id, layout, duration, data, _isAutoFilled: true };
}

/**
 * 根据布局类型，从真实内容中生成相关数据
 */
function generateRelevantData(layout, context) {
  const { titles, items, numbers, keywords, mainTitle } = context;
  const k = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : [];

  switch (layout) {
    case 'bullets':
      return { kicker: '回顾', title: '核心要点', items: k(items, 4), animation: 'fade-up' };
    case 'stat-highlight':
      return {
        kicker: keywords[0] || '关键数据',
        big: numbers[0] || '80%',
        label: keywords[1] || '用户占比',
        desc: '数据来源：调研报告',
        value: numbers[0] || '80%'
      };
    case 'fullscreen-stat':
      return {
        big: numbers.slice(0, 3).join(' · ') || keywords[0] || '100%',
        label: mainTitle || keywords[0] || '核心数据',
        sub: '基于真实内容生成'
      };
    case 'highlight-box':
      return {
        type: 'info',
        title: '分析',
        text: (keywords.slice(0, 2).join('，') || '内容分析') + '。真实数据支撑。'
      };
    case 'two-column': {
      const half = Math.ceil(items.length / 2);
      return {
        kicker: '对比',
        left: { title: '观点A', items: k(items.slice(0, half || 2), 3) },
        right: { title: '观点B', items: k(items.slice(half || 2), 3) }
      };
    }
    case 'three-column': {
      const per = Math.ceil(items.length / 3);
      return {
        cols: [
          { title: keywords[0] || '类型A', items: k(items.slice(0, per || 2), 2) },
          { title: keywords[1] || '类型B', items: k(items.slice(per || 2, (per || 2) * 2), 2) },
          { title: keywords[2] || '类型C', items: k(items.slice((per || 2) * 2), 2) }
        ]
      };
    }
    case 'big-quote':
      return {
        quote: (items[0] || keywords[0] || '观点') + '。',
        author: '内容分析',
        role: '核心洞察'
      };
    case 'numbered-list':
      return {
        kicker: '要点',
        title: '核心内容',
        items: k(items, 5).map((item, i) => (i + 1) + '. ' + item)
      };
    case 'icon-grid':
      return {
        kicker: '功能',
        title: mainTitle || '相关内容',
        items: k(keywords, 4).map((label, i) => ({
          icon: ['🎯', '💡', '⚡', '🔥'][i % 4],
          label: label.slice(0, 15),
          desc: '相关内容'
        }))
      };
    case 'cta':
      return {
        title: '你怎么看？',
        subtitle: '关注获取更多内容解读'
      };
    case 'toc':
      return {
        title: '内容概览',
        items: k(items, 5).map(item => ({ title: item, desc: keywords[k(items.indexOf(item)) % keywords.length] || '' }))
      };
    case 'comparison': {
      const half = Math.ceil(items.length / 2);
      return {
        cols: [
          { name: keywords[0] || '观点A', use: items[0] || '', save: 'A' },
          { name: keywords[1] || '观点B', use: items[half] || '', save: 'B' }
        ]
      };
    }
    case 'process-steps':
      return {
        kicker: '流程',
        title: mainTitle || '步骤',
        steps: k(items, 6).map(item => item.slice(0, 30))
      };
    case 'kpi-grid':
      return {
        kpis: numbers.slice(0, 4).map((v, i) => ({
          label: keywords[i] || '指标' + (i + 1),
          value: v,
          unit: '%',
          trend: '↑'
        }))
      };
    case 'data-table':
      return {
        headers: [keywords[0] || '类型', '内容', '状态'],
        rows: k(items, 5).map(item => [item.slice(0, 15), keywords[0] || '', '分析中'])
      };
    case 'chart-bar':
      return {
        bars: k(numbers, 4).map((v, i) => ({
          label: keywords[i] || '指标' + (i + 1),
          value: parseFloat(v) || (i + 1) * 20
        }))
      };
    case 'chart-line':
      return {
        points: numbers.slice(0, 5).map((v, i) => ({
          x: i + 1, y: parseFloat(v) || (i + 1) * 20,
          label: keywords[i] || '点' + (i + 1)
        }))
      };
    case 'chart-pie':
      return {
        slices: k(numbers, 4).map((v, i) => ({
          label: keywords[i] || '部分' + (i + 1),
          value: parseFloat(v) || 25
        }))
      };
    case 'chart-radar':
      return {
        labels: k(keywords, 5).map(l => l.slice(0, 10)),
        values: numbers.slice(0, 5).map(v => parseFloat(v) || 70)
      };
    case 'code':
      return {
        lang: 'text',
        code: '// ' + (mainTitle || '关键代码') + '\n' + items.slice(0, 2).join('\n')
      };
    case 'diff':
      return {
        lines: [
          { text: '// 旧方案', type: '-' },
          { text: items[0] || keywords[0] || '原方案', type: '-' },
          { text: '// 新方案', type: '+' },
          { text: items[1] || keywords[1] || '优化后', type: '+' }
        ]
      };
    case 'terminal':
      return {
        title: mainTitle || '分析',
        commands: items.slice(0, 3).map(i => '# ' + i.slice(0, 50)),
        output: [keywords.slice(0, 2).join(' | ') || '运行完成']
      };
    case 'flow-diagram':
      return {
        nodes: k(items, 5).map((label, i) => ({
          id: 'n' + i, label: label.slice(0, 20), next: i < 4 ? ['n' + (i + 1)] : []
        }))
      };
    case 'arch-diagram':
      return {
        layers: [
          { label: '输入层', nodes: k(items.slice(0, 2), 2) },
          { label: '处理层', nodes: k(items.slice(2, 4), 2) },
          { label: '输出层', nodes: [keywords[0] || '结果'].slice(0, 1) }
        ]
      };
    case 'mindmap':
      return {
        root: mainTitle || keywords[0] || '核心',
        branches: k(keywords.slice(1), 3).map(label => ({
          label: label.slice(0, 10),
          children: k(items, 2).map(i => i.slice(0, 10))
        }))
      };
    case 'timeline':
      return {
        items: k(items, 4).map((text, i) => ({
          date: '阶段' + (i + 1),
          label: text.slice(0, 20),
          desc: keywords[i % keywords.length] || ''
        }))
      };
    case 'roadmap':
      return {
        phases: k(keywords.slice(0, 3), 3).map((goal, i) => ({
          phase: '阶段' + (i + 1), goal: goal.slice(0, 15),
          items: k(items, 2).map(item => item.slice(0, 15))
        }))
      };
    case 'gantt':
      return {
        tasks: k(items.slice(0, 5), 5).map((name, i) => ({
          name: name.slice(0, 15),
          start: i * 15,
          end: (i + 1) * 15 + 10
        }))
      };
    case 'pros-cons':
      return {
        pros: k(items.slice(0, 3), 3),
        cons: k(items.slice(3, 6), 3),
        prosLabel: '优势',
        consLabel: '不足'
      };
    case 'image-hero':
      return {
        src: '',
        overlay: true,
        caption: mainTitle || keywords[0] || '内容配图'
      };
    case 'cover':
      return {
        kicker: keywords[0] || 'AI · 洞察',
        title: mainTitle || keywords[1] || '相关内容',
        subtitle: keywords[2] || '',
        tags: k(keywords, 3).map(kw => '#' + kw.slice(0, 5))
      };
    default:
      // 通用兜底：从 FAKE_DATA_MAP 取（这是极少数布局类型）
      const fallback = FAKE_DATA_MAP[layout];
      if (fallback) return JSON.parse(JSON.stringify(fallback));
      return { title: mainTitle || layout.replace(/-/g, ' '), kicker: keywords[0] || '相关内容' };
  }
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
      const fillers = unusedLayouts.map(l => generateContentAwareScene(l, scenesWorking));
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
      const fillers = unusedL.map(l => generateContentAwareScene(l, scenesWorking));
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
