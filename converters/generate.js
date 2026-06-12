#!/usr/bin/env node
/**
 * generate.js — Full pipeline: scene config → hyperframes index.html
 */

const fs = require('fs');
const path = require('path');

const convertTheme = require('./convert_theme');
const convertLayout = require('./convert_layout');
const { getDefaultFX, generateFXCode } = require('./map_fx');
const { ANIM_MAP, generateGSAPCode } = require('./convert_animations');
const { selectThemeForScript } = require('./select_theme');
const { replaceFontVars } = convertTheme;

// ===== SHARED CSS =====
const SHARED_CSS = `
* { margin:0; padding:0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; overflow: hidden; width:100%; height:100%; }
#cfx { position: absolute; top:0; left:0; width: Wpx; height: Hpx; pointer-events: none; z-index:1; }
.scene { position: absolute; top:0; left:0; width: Wpx; height: Hpx; padding: 80px 72px; display: flex; flex-direction: column; box-sizing: border-box; z-index:2; opacity:0; }
.s-cover { justify-content: center; align-items: center; text-align: center; }
.s-cover .kicker { font-size: 32px; font-weight: 600; letter-spacing: 0.25em; color: var(--accent); margin-bottom: 32px; text-transform: uppercase; }
.s-cover h1 { font-size: 96px; line-height: 1.16; font-weight: 800; color: var(--text); margin-bottom: 32px; }
.s-cover .sub { font-size: 36px; color: var(--text-dim); margin-bottom: 48px; }
.s-cover .tags { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
.tag { background: var(--accent); color: var(--bg); padding: 12px 28px; border-radius: 100px; font-size: 28px; font-weight: 700; }
.kicker { font-size: 30px; font-weight: 600; letter-spacing: 0.15em; color: var(--accent); margin-bottom: 20px; text-transform: uppercase; }
.big-num { font-size: 120px; font-weight: 900; line-height: 1; color: var(--accent); margin-bottom: 16px; }
.sec-title { font-size: 72px; font-weight: 800; line-height: 1.1; color: var(--text); margin-bottom: 36px; }
.content-ul { list-style: none; display: flex; flex-direction: column; gap: 22px; flex:1; justify-content: center; }
.content-ul li { font-size: 36px; line-height: 1.5; padding-left: 40px; position: relative; }
.content-ul li::before { content: '▸'; position: absolute; left:0; color: var(--accent); font-size: 30px; top: 6px; }
.toc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 28px; flex:1; align-content: center; }
.toc-item { display: flex; align-items: flex-start; gap: 24px; padding: 32px; background: rgba(122,162,247,0.08); border-radius: var(--radius); border: 1px solid rgba(122,162,247,0.2); }
.toc-num { font-size: 56px; font-weight: 900; color: var(--accent); line-height: 1; min-width: 80px; }
.toc-text { font-size: 30px; line-height: 1.5; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 16px; flex:1; align-content: center; }
.compare-card { padding: 28px 16px; background: rgba(122,162,247,0.08); border-radius: var(--radius); text-align: center; border: 1px solid rgba(122,162,247,0.2); }
.compare-card .mode-name { font-size: 34px; font-weight: 800; color: var(--accent); margin-bottom: 10px; }
.compare-card .mode-use { font-size: 28px; color: var(--text-dim); margin-bottom: 14px; line-height: 1.4; }
.compare-card .mode-save { font-size: 48px; font-weight: 900; color: var(--good); }
.bad-line { font-size: 28px; color: var(--bad); margin-top: 4px; }
.step-flow { display: flex; flex-direction: column; gap: 14px; margin-top: 28px; flex:1; justify-content: center; }
.step-item { display: flex; align-items: center; gap: 28px; }
.step-num { width: 68px; height: 68px; border-radius: 50%; background: var(--accent); color: var(--bg); font-size: 30px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.step-text { font-size: 34px; flex:1; line-height: 1.4; }
.s-cta { justify-content: center; align-items: center; text-align: center; }
.s-cta h2 { font-size: 72px; font-weight: 800; line-height: 1.2; }
.cta-url { font-size: 56px; font-weight: 900; color: var(--accent); letter-spacing: 0.04em; margin: 28px 0 16px; }
.cta-sub { font-size: 32px; color: var(--text-dim); }
.s-thanks { justify-content: center; align-items: center; text-align: center; }
.s-thanks h1 { font-size: 120px; font-weight: 900; }
.gt { background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.s-thanks .sub { font-size: 40px; color: var(--text-dim); margin-top: 28px; }
.quote-wrap { display: flex; flex-direction: column; justify-content: center; align-items: center; flex:1; text-align: center; }
.big-quote-text { font-size: 48px; font-weight: 600; line-height: 1.4; color: var(--text); font-style: italic; position: relative; padding: 0 40px; }
.quote-author { font-size: 30px; color: var(--text-dim); margin-top: 24px; font-style: normal; }
.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; flex:1; align-content: center; }
.kpi-card { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 28px; text-align: center; border: 1px solid rgba(122,162,247,0.15); }
.kpi-num { font-size: 56px; font-weight: 900; color: var(--accent); line-height: 1; margin-bottom: 8px; }
.kpi-label { font-size: 28px; color: var(--text-dim); }
.data-table { width: 100%; border-collapse: collapse; font-size: 28px; margin-top: 20px; }
.data-table th { font-size: 26px; font-weight: 700; color: var(--accent); text-align: left; padding: 12px 16px; border-bottom: 2px solid var(--accent); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid rgba(122,162,247,0.15); color: var(--text); }
.two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; flex:1; align-content: center; }
.two-col-grid .col { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 24px; }
.two-col-grid .col h3 { font-size: 32px; font-weight: 700; color: var(--accent); margin-bottom: 12px; }
.three-col-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 20px; flex:1; align-content: center; }
.three-col-grid .col-item { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 20px; }
.chart-bars { flex:1; display: flex; flex-direction: column; justify-content: center; gap: 18px; }
.bar-row { display: flex; align-items: center; gap: 12px; }
.bar-track { flex:1; height: 32px; background: rgba(122,162,247,0.1); border-radius: 8px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 8px; }
.code-block { background: #0d1117; border-radius: 12px; overflow: hidden; flex:1; display: flex; flex-direction: column; }
.code-header { padding: 12px 20px; background: rgba(122,162,247,0.1); display: flex; align-items: center; }
.code-lang { font-size: 22px; font-weight: 600; color: var(--accent); text-transform: uppercase; }
.code-content { padding: 20px; overflow: auto; flex:1; }
.code-content code { font-family: 'Fira Code', monospace; font-size: 26px; line-height: 1.6; color: #e6edf3; }
.terminal-win { background: #0d1117; border-radius: 12px; overflow: hidden; flex:1; display: flex; flex-direction: column; }
.term-bar { padding: 10px 20px; background: rgba(122,162,247,0.08); font-size: 22px; color: var(--text-dim); }
.term-body { padding: 20px; flex:1; }
.term-line { display: flex; gap: 10px; margin-bottom: 8px; font-family: 'Fira Code', monospace; font-size: 26px; line-height: 1.5; }
.term-prompt { color: var(--good); font-weight: 700; }
.term-cmd { color: #e6edf3; }
.timeline { display: flex; flex-direction: column; gap:0; flex:1; justify-content: center; position: relative; padding-left: 40px; }
.tl-item { display: flex; gap: 20px; align-items: flex-start; position: relative; padding-bottom: 24px; border-left: 3px solid var(--accent); padding-left: 28px; }
.tl-dot { position: absolute; left: -9px; top: 6px; width: 14px; height: 14px; border-radius: 50%; background: var(--accent); }
.tl-time { font-size: 26px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
.tl-text { font-size: 30px; color: var(--text); line-height: 1.4; }
.pros-cons-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; flex:1; align-content: center; }
.pros-col, .cons-col { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 24px; }
.pros-col h3 { color: var(--good); font-size: 34px; font-weight: 700; margin-bottom: 12px; }
.cons-col h3 { color: var(--bad); font-size: 34px; font-weight: 700; margin-bottom: 12px; }
.pros-col li, .cons-col li { font-size: 30px; line-height: 1.5; margin-bottom: 8px; list-style: none; display: flex; gap: 10px; }
.pc-icon { font-size: 28px; }
`;

// ===== CFX RUNTIME =====
const CFX_RUNTIME = `
var _cfxCtx = null, _cfxFx = null, _cfxActive = false;
function startCFX(name, startT, durT) {
  var canvas = document.getElementById('cfx');
  if (!canvas || !window.CFX || !window.CFX[name]) return;
  _cfxCtx = canvas.getContext('2d');
  _cfxFx = window.CFX[name];
  if (_cfxFx.init) _cfxFx.init(canvas.width, canvas.height);
  _cfxActive = true;
  var proxy = { t: startT };
  gsap.to(proxy, {
    t: startT + durT, duration: durT, ease: 'none',
    onUpdate: function() {
      if (!_cfxActive || !_cfxCtx || !_cfxFx) return;
      _cfxCtx.clearRect(0, 0, canvas.width, canvas.height);
      _cfxFx.draw(_cfxCtx, proxy.t - startT);
    },
    onComplete: function() { _cfxActive = false; if (_cfxCtx) _cfxCtx.clearRect(0, 0, canvas.width, canvas.height); }
  });
}
`;

// ===== Theme resolution =====
function _resolveThemeDir() {
  const skillDir = path.resolve(__dirname, '..');
  const own = path.join(skillDir, 'assets', 'themes');
  if (fs.existsSync(own)) return own;
  const sibling = path.join(skillDir, '..', 'html-ppt-skill', 'assets', 'themes');
  if (fs.existsSync(sibling)) return sibling;
  const ws = path.join(skillDir, '..', '..', 'workspace');
  const wsPath = path.join(ws, 'html-ppt-skill', 'assets', 'themes');
  if (fs.existsSync(wsPath)) return wsPath;
  return own;
}

function convertThemeCSS(themeName) {
  const themeDir = _resolveThemeDir();
  const themePath = path.join(themeDir, themeName + '.css');
  console.log('[theme] looking for:', themePath);
  if (fs.existsSync(themePath)) {
    console.log('[theme] found:', themePath);
    const css = fs.readFileSync(themePath, 'utf8');
    const rootMatch = css.match(/:root\s*\{([^}]+)\}/s);
    if (rootMatch) {
      let block = rootMatch[1];
      block = block.replace(/--text-1:\s*/, '--text: ');
      block = block.replace(/--text-2:\s*/, '--text-dim: ');
      block = block.replace(/--text-3:\s*/, '--text-muted: ');
      block = block.replace(/--accent-2:\s*/, '--accent2: ');
      block = block.replace(/--accent-3:\s*/, '--accent3: ');
      return '/* Converted from html-ppt theme: ' + themeName + ' */\n:root {\n' + block + '}\n';
    }
    return '/* Theme: ' + themeName + ' (verbatim) */\n' + css;
  }
  console.log('[theme] not found, using fallback');
  return '/* Theme: ' + themeName + ' (fallback) */\n:root {\n  --bg: #1a1b26;\n  --text: #c0caf5;\n  --text-dim: #a9b1d6;\n  --text-muted: #565f89;\n  --accent: #7aa2f7;\n  --accent2: #bb9af7;\n  --accent3: #7dcfff;\n  --good: #9ece6a;\n  --bad: #f7768e;\n  --radius: 16px;\n}\n';
}

// ===== Animation helpers =====
function _guessAnimation(layoutName) {
  const pref = {
    'cover': 'fade-up', 'big-quote': 'fade-up', 'stat-highlight': 'zoom-pop',
    'cta': 'zoom-pop', 'thanks': 'fade-up', 'toc': 'stagger-list',
    'bullets': 'stagger-list', 'numbered-list': 'stagger-list', 'icon-grid': 'stagger-list',
    'two-column': 'fade-left', 'three-column': 'fade-right',
    'comparison': 'fade-up', 'process-steps': 'stagger-list',
    'kpi-grid': 'zoom-pop', 'fullscreen-stat': 'zoom-pop',
    'highlight-box': 'blur-in', 'pros-cons': 'fade-up',
    'timeline': 'fade-left', 'roadmap': 'fade-up', 'gantt': 'fade-up',
    'data-table': 'fade-up', 'chart-bar': 'fade-up', 'chart-line': 'fade-up',
    'chart-pie': 'zoom-pop', 'chart-radar': 'zoom-pop',
    'code': 'fade-up', 'diff': 'fade-up', 'terminal': 'fade-up',
    'flow-diagram': 'stagger-list', 'arch-diagram': 'stagger-list',
    'mindmap': 'stagger-list', 'image-hero': 'kenburns',
  };
  return pref[layoutName] || 'fade-up';
}

function _sceneMainSelector(sceneId, layoutName) {
  // Must match the actual HTML structure generated by convert_layout.js
  // Cover: <h1 id="s1-title"> exists
  if (layoutName === 'cover') return '#' + sceneId + '-title';
  // Big-quote: <blockquote class="big-quote-text"> inside scene div
  if (layoutName === 'big-quote') return '#' + sceneId + ' .big-quote-text';
  // Bullets: <ul class="content-ul"> (items inside <li>)
  if (layoutName === 'bullets' || layoutName === 'content-ul') return '#' + sceneId + ' .content-ul';
  // TOC: <div class="toc-item">
  if (layoutName === 'toc') return '#' + sceneId + ' .toc-item';
  // CTA: scene <div> or <h2>
  if (layoutName === 'cta') return '#' + sceneId;
  // Steps: <div class="step-item">
  if (layoutName === 'process-steps') return '#' + sceneId + ' .step-item';
  // KPI: <div class="kpi-num"> inside kpi-grid
  if (layoutName === 'kpi-grid') return '#' + sceneId + ' .kpi-num';
  // KPI single stat: <div class="big-num">
  if (layoutName === 'stat-highlight') return '#' + sceneId + ' .big-num';
  // Pros-cons: <li> inside pros-col / cons-col
  if (layoutName === 'pros-cons') return '#' + sceneId + ' .pros-col, #' + sceneId + ' .cons-col';
  // Timeline: <div class="tl-item">
  if (layoutName === 'timeline') return '#' + sceneId + ' .tl-item';
  // Roadmap: <div class="rm-phase">
  if (layoutName === 'roadmap') return '#' + sceneId + ' .rm-phase';
  // Gantt: <div class="gantt-bar">
  if (layoutName === 'gantt') return '#' + sceneId + ' .gantt-bar';
  // Two-column / three-column: <div class="col"> / <div class="col-item">
  if (layoutName === 'two-column') return '#' + sceneId + ' .col';
  if (layoutName === 'three-column') return '#' + sceneId + ' .col-item';
  // Comparison: <div class="compare-card">
  if (layoutName === 'comparison') return '#' + sceneId + ' .compare-card';
  // Chart bars: <div class="bar-fill">
  if (layoutName === 'chart-bar') return '#' + sceneId + ' .bar-fill';
  // Chart pie: <path> elements
  if (layoutName === 'chart-pie') return '#' + sceneId + ' path';
  // Chart radar: <polygon> + <circle>
  if (layoutName === 'chart-radar') return '#' + sceneId + ' polygon';
  // Chart line: <polyline>
  if (layoutName === 'chart-line') return '#' + sceneId + ' polyline';
  // Mindmap: <div class="mm-root"> + <div class="mm-branch">
  if (layoutName === 'mindmap') return '#' + sceneId + ' .mm-root';
  // Code: <div class="code-block">
  if (layoutName === 'code') return '#' + sceneId + ' .code-block';
  // Terminal: <div class="term-line">
  if (layoutName === 'terminal') return '#' + sceneId + ' .term-line';
  // Data table: <tr> rows
  if (layoutName === 'data-table') return '#' + sceneId + ' tbody tr';
  // Flow diagram: <div class="flow-node">
  if (layoutName === 'flow-diagram') return '#' + sceneId + ' .flow-node';
  // Arch diagram: <div class="arch-layer">
  if (layoutName === 'arch-diagram') return '#' + sceneId + ' .arch-layer';
  // Image hero: <img class="hero-img"> or <div class="hero-text">
  if (layoutName === 'image-hero') return '#' + sceneId + ' .hero-text';
  // Fullscreen stat: <div class="big-num">
  if (layoutName === 'fullscreen-stat') return '#' + sceneId + ' .big-num';
  // Diff: <div class="diff-block">
  if (layoutName === 'diff') return '#' + sceneId + ' .diff-block';
  // Thanks: <h1> inside scene
  if (layoutName === 'thanks') return '#' + sceneId + ' h1';
  // Default: the scene div itself
  return '#' + sceneId;
}

// ===== Main generation =====
function generateIndexHTML(config) {
  const { title, theme, width = 1080, height = 1920, scenes } = config;
  const W = width, H = height;

  const resolvedTheme = theme || selectThemeForScript(scenes || [], { defaultTheme: 'tokyo-night' });
  let themeCSS = convertThemeCSS(resolvedTheme);
  themeCSS = replaceFontVars(themeCSS);

  const css = SHARED_CSS.replace(/Wpx/g, W + 'px').replace(/Hpx/g, H + 'px');

  const sceneHTMLs = [];
  let gsapLines = [];
  let totalDuration = 0;

  for (const scene of scenes) {
    const layoutGen = convertLayout.LAYOUT_GENERATORS ? convertLayout.LAYOUT_GENERATORS[scene.layout] : convertLayout[scene.layout];
    if (!layoutGen) { console.error('Unknown layout: ' + scene.layout); continue; }

    const sceneData = Object.assign({}, scene.data, { id: scene.id });
    const result = layoutGen(sceneData);
    sceneHTMLs.push(result.html);

    const startTime = scene.startTime;
    const duration = scene.duration;
    totalDuration = Math.max(totalDuration, startTime + duration);

    for (const line of result.gsap) {
      gsapLines.push(line.replace(/startTime/g, String(startTime)).replace(/SCENE_DUR/g, String(duration)));
    }

    const sceneIndex = scenes.indexOf(scene);
    if (sceneIndex < scenes.length - 1) {
      gsapLines.push("tl.to('#" + scene.id + "',{opacity:0,duration:0.4,ease:'power2.in'}," + (startTime + duration - 0.4) + ")");
    }

    // Integrate convert_animations.js
    const animName = (scene.data && scene.data.animation) || _guessAnimation(scene.layout);
    if (animName && ANIM_MAP[animName]) {
      const selector = _sceneMainSelector(scene.id, scene.layout);
      if (selector && selector.trim()) {
        const animCode = generateGSAPCode(animName, selector, { startTime: startTime + 0.2 });
        if (animCode && !animCode.startsWith('//')) {
          gsapLines.push('  // animation: ' + animName);
          gsapLines.push('  ' + animCode);
        }
      }
    }

    // FX code
    const fxName = scene.fx !== undefined ? scene.fx : getDefaultFX(scene.layout, scene.data);
    if (fxName) {
      const fxCode = generateFXCode(fxName, startTime, duration);
      if (fxCode) gsapLines.push(fxCode);
    }
  }

  // Add overwrite: "auto" to all GSAP tweens to prevent overlaps
  gsapLines = gsapLines.map(line => {
    // Match tl.method('selector', {vars} and insert overwrite:"auto", after the {
    return line.replace(/,\s*\{/, (match) => {
      return match.slice(0, -1) + '{overwrite:"auto",';
    });
  });

  // Assemble HTML
  const lines = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + title + '</title>',
    '<style>',
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Fira+Code:wght@400;700&display=swap');",
    themeCSS,
    css,
    '</style>',
    '</head>',
    '<body>',
    '<div id="main" data-composition-id="main" data-width="' + W + '" data-height="' + H + '" data-start="0">',
    '',
    '<canvas id="cfx" width="' + W + '" height="' + H + '"></canvas>',
    '',
    sceneHTMLs.join('\n'),
    '',
    '<script src="canvas-fx.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>',
    '<script>',
    '(function() {',
    '  "use strict";',
    '  var W = ' + W + ', H = ' + H + ';',
    CFX_RUNTIME,
    '  gsap.defaults({ overwrite: "auto" });',
    '  var tl = gsap.timeline({ paused: true });',
    '',
    gsapLines.join('\n  '),
    '',
    '  // Expose hyperframes composition API',
    '  window.__hf = {',
    '    duration: ' + totalDuration + ',',
    '    seek: function(t) {',
    '      tl.play();',
    '      tl.seek(t);',
    '      tl.pause();',
    '    }',
    '  };',
    '',
    '  window.__timelines = window.__timelines || {};',
    '  window.__timelines["main"] = tl;',
    '})();',
    '</script>',
    '</div>',
    '</body>',
    '</html>'
  ];

  return { html: lines.join('\n'), totalDuration, sceneCount: scenes.length };
}

// ===== Single scene generation (for per-scene rendering) =====
/**
 * Generate HTML for a single scene (with its own GSAP timeline starting at 0).
 * Used by render_per_scene.js for perfect audio-video sync.
 * @param {Object} scene - single scene object
 * @param {string} theme - theme name
 * @param {number} width - viewport width (default 1080)
 * @param {number} height - viewport height (default 1920)
 * @returns {{ html: string, duration: number }}
 */
function generateSingleSceneHTML(scene, theme, width = 1080, height = 1920, opts) {
  const W = width, H = height;
  opts = opts || {};
  const sceneDuration = scene.duration || 8;
  const effectiveDuration = opts.durationOverride || sceneDuration;

  const resolvedTheme = theme || 'tokyo-night';
  let themeCSS = convertThemeCSS(resolvedTheme);
  themeCSS = replaceFontVars(themeCSS);

  const css = SHARED_CSS.replace(/Wpx/g, W + 'px').replace(/Hpx/g, H + 'px');

  const layoutGen = convertLayout.LAYOUT_GENERATORS
    ? convertLayout.LAYOUT_GENERATORS[scene.layout]
    : convertLayout[scene.layout];
  if (!layoutGen) throw new Error('Unknown layout: ' + scene.layout);

  const sceneData = Object.assign({}, scene.data, { id: scene.id });
  const result = layoutGen(sceneData);

  // [Bug3 修复] 不再此处注入字幕，改由 inject_subtitle_gsap.js 统一注入（带 GSAP 动画）

  // Build GSAP lines for this single scene (timeline starts at 0)
  const gsapLines = [];
  for (const line of result.gsap) {
    gsapLines.push(line.replace(/startTime/g, '0').replace(/SCENE_DUR/g, String(effectiveDuration)));
  }

  // Scene entry animation (fade in)
  gsapLines.push("tl.from('#" + scene.id + "',{opacity:0,duration:0.4,ease:'power2.out'},0)");
  // Scene exit animation (fade out)
  gsapLines.push("tl.to('#" + scene.id + "',{opacity:0,duration:0.4,ease:'power2.in'}," + (effectiveDuration - 0.4) + ")");

  // convert_animations.js integration
  const animName = (scene.data && scene.data.animation) || _guessAnimation(scene.layout);
  if (animName && ANIM_MAP[animName]) {
    const selector = _sceneMainSelector(scene.id, scene.layout);
    if (selector && selector.trim()) {
      const animCode = generateGSAPCode(animName, selector, { startTime: 0.2 });
      if (animCode && !animCode.startsWith('//')) {
        gsapLines.push('  // animation: ' + animName);
        gsapLines.push('  ' + animCode);
      }
    }
  }

  // FX
  const fxName = scene.fx !== undefined ? scene.fx : getDefaultFX(scene.layout, scene.data);
  if (fxName) {
    const fxCode = generateFXCode(fxName, 0, effectiveDuration);
    if (fxCode) gsapLines.push(fxCode);
  }

  // Add overwrite: "auto" to all GSAP tweens
  gsapLines.forEach((line, idx) => {
    gsapLines[idx] = line.replace(/,\s*\{/, (match) => {
      return match.slice(0, -1) + '{overwrite:"auto",';
    });
  });

  const lines = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + (scene.data && (scene.data.title || scene.data.kicker) || 'Scene') + '</title>',
    '<style>',
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Fira+Code:wght@400;700&display=swap');",
    themeCSS,
    css,
    '</style>',
    '</head>',
    '<body>',
    '<div id="main" data-composition-id="main" data-width="' + W + '" data-height="' + H + '" data-start="0">',
    '',
    '<canvas id="cfx" width="' + W + '" height="' + H + '"></canvas>',
    '',
    result.html,
    '',
    '<script src="canvas-fx.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>',
    '<script>',
    '(function() {',
    '  "use strict";',
    '  var W = ' + W + ', H = ' + H + ';',
    CFX_RUNTIME,
    '  gsap.defaults({ overwrite: "auto" });',
    '  var tl = gsap.timeline({ paused: true });',
    '',
    gsapLines.join('\n  '),
    '',
    '  window.__hf = { duration: ' + effectiveDuration + ', seek: function(t) { tl.play(); tl.seek(t); tl.pause(); } };',
    '  window.__timelines = window.__timelines || {};',
    '  window.__timelines["main"] = tl;',
    '})();',
    '</script>',
    '</div>',
    '</body>',
    '</html>'
  ];

  return { html: lines.join('\n'), duration: effectiveDuration };
}

// ===== CLI =====
function main() {
  const args = process.argv.slice(2);
  let configPath = null, outputDir = null;
  let singleSceneIndex = null; // 0-based index

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) configPath = args[++i];
    else if (args[i] === '--output-dir' && args[i + 1]) outputDir = args[++i];
    else if (args[i] === '--single-scene' && args[i + 1]) singleSceneIndex = parseInt(args[++i]);
  }

  if (!configPath) {
    console.error('Usage: node generate.js --config <config.json> [--output-dir <dir>] [--single-scene <index>]');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Single scene mode
  if (singleSceneIndex !== null) {
    const scenes = config.scenes || [];
    if (singleSceneIndex < 0 || singleSceneIndex >= scenes.length) {
      console.error('Scene index out of range: ' + singleSceneIndex + ' (0-' + (scenes.length - 1) + ')');
      process.exit(1);
    }
    const scene = scenes[singleSceneIndex];
    const theme = config.theme;
    const { html, duration } = generateSingleSceneHTML(scene, theme, config.width, config.height);

    if (outputDir) {
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const outPath = path.join(outputDir, 'index.html');
      fs.writeFileSync(outPath, html, 'utf8');

      // Copy canvas-fx.js
      const skillRoot = path.resolve(__dirname, '..');
      const cfxCandidates = [
        path.join(skillRoot, 'canvas-fx.js'),
        path.join(skillRoot, '..', 'html-ppt-skill', 'canvas-fx.js'),
      ];
      let copied = false;
      for (const cfxSrc of cfxCandidates) {
        if (fs.existsSync(cfxSrc)) {
          fs.copyFileSync(cfxSrc, path.join(outputDir, 'canvas-fx.js'));
          console.log('[canvas-fx] copied from: ' + cfxSrc);
          copied = true;
          break;
        }
      }
      if (!copied) console.warn('[canvas-fx] WARNING: canvas-fx.js not found');

      console.log('Generated scene ' + singleSceneIndex + ' (' + scene.id + ') → ' + outPath + ' (duration: ' + duration + 's)');
    } else {
      console.log(html);
    }
    return;
  }

  // Full config mode (original)
  const result = generateIndexHTML(config);

  if (outputDir) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outPath = path.join(outputDir, 'index.html');
    fs.writeFileSync(outPath, result.html, 'utf8');

    // Copy canvas-fx.js from multiple candidate locations
    const skillRoot = path.resolve(__dirname, '..');
    const cfxCandidates = [
      path.join(skillRoot, 'canvas-fx.js'),
      path.join(skillRoot, '..', 'html-ppt-skill', 'canvas-fx.js'),
      path.join(process.env.USERPROFILE || 'C:\\Users\\qianq', '.qclaw', 'skills', 'html-ppt-to-video', 'canvas-fx.js'),
    ];
    let copied = false;
    for (const cfxSrc of cfxCandidates) {
      if (fs.existsSync(cfxSrc)) {
        fs.copyFileSync(cfxSrc, path.join(outputDir, 'canvas-fx.js'));
        console.log('[canvas-fx] copied from: ' + cfxSrc);
        copied = true;
        break;
      }
    }
    if (!copied) console.warn('[canvas-fx] WARNING: canvas-fx.js not found, FX will not work');

    console.log('Generated: ' + outPath);
    console.log('Scenes: ' + result.sceneCount + ', Duration: ' + result.totalDuration + 's');
  } else {
    console.log(result.html);
  }
}

module.exports = { generateIndexHTML, generateSingleSceneHTML, convertThemeCSS };

if (require.main === module) main();
