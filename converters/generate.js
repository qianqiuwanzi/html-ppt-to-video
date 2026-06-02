#!/usr/bin/env node
/**
 * generate.js — Full pipeline: scene config → hyperframes index.html
 *
 * This is the main entry point for Route-B conversion.
 * Takes a JSON scene configuration and produces a complete hyperframes project.
 *
 * Usage: node generate.js --config <config.json> [--output-dir <dir>]
 *
 * Config format:
 * {
 *   "title": "视频标题",
 *   "theme": "tokyo-night",           // html-ppt theme name
 *   "width": 1080,
 *   "height": 1920,
 *   "fps": 30,
 *   "scenes": [
 *     {
 *       "layout": "cover",
 *       "id": "s1",
 *       "startTime": 0,
 *       "duration": 10,
 *       "data": { "kicker": "...", "title": "...", ... },
 *       "fx": "particle-burst"          // optional, auto-assigned if omitted
 *     },
 *     ...
 *   ]
 * }
 */

const fs = require('fs');
const path = require('path');

const convertTheme = require('./convert_theme');
const convertLayout = require('./convert_layout');
const { getDefaultFX, generateFXCode, resolveFX } = require('./map_fx');
const { ANIM_MAP } = require('./convert_animations');
const { selectThemeForScript } = require('./select_theme');
const { replaceFontVars } = convertTheme;

// ===== SHARED CSS (from wechat-video-new pattern) =====
const SHARED_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; overflow: hidden; width: 100%; height: 100%; }
/* CANVAS */
#cfx { position: absolute; top: 0; left: 0; width: Wpx; height: Hpx; pointer-events: none; z-index: 1; }
/* ─── VERTICAL (9:16) TYPOGRAPHY SCALE ───
   Min readable: 28px | Base body: 34px | Section title: 72px
   Designed for 1080×1920 with 80px/72px padding → 936×1760 content area */
/* SCENES */
.scene { position: absolute; top: 0; left: 0; width: Wpx; height: Hpx; padding: 80px 72px; display: flex; flex-direction: column; box-sizing: border-box; z-index: 2; opacity: 0; }
/* COVER */
.s-cover { justify-content: center; align-items: center; text-align: center; }
.s-cover .kicker { font-size: 32px; font-weight: 600; letter-spacing: 0.25em; color: var(--accent); margin-bottom: 32px; text-transform: uppercase; }
.s-cover h1 { font-size: 96px; line-height: 1.16; font-weight: 800; color: var(--text); margin-bottom: 32px; }
.s-cover .sub { font-size: 36px; color: var(--text-dim); margin-bottom: 48px; }
.s-cover .tags { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
.tag { background: var(--accent); color: var(--bg); padding: 12px 28px; border-radius: 100px; font-size: 28px; font-weight: 700; }
/* CONTENT */
.kicker { font-size: 30px; font-weight: 600; letter-spacing: 0.15em; color: var(--accent); margin-bottom: 20px; text-transform: uppercase; }
.big-num { font-size: 120px; font-weight: 900; line-height: 1; color: var(--accent); margin-bottom: 16px; }
.sec-title { font-size: 72px; font-weight: 800; line-height: 1.1; color: var(--text); margin-bottom: 36px; }
.content-ul { list-style: none; display: flex; flex-direction: column; gap: 22px; flex: 1; justify-content: center; }
.content-ul li { font-size: 36px; line-height: 1.5; padding-left: 40px; position: relative; }
.content-ul li::before { content: '▸'; position: absolute; left: 0; color: var(--accent); font-size: 30px; top: 6px; }
/* TOC */
.toc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 28px; flex: 1; align-content: center; }
.toc-item { display: flex; align-items: flex-start; gap: 24px; padding: 32px; background: rgba(122,162,247,0.08); border-radius: var(--radius); border: 1px solid rgba(122,162,247,0.2); }
.toc-num { font-size: 56px; font-weight: 900; color: var(--accent); line-height: 1; min-width: 80px; }
.toc-text { font-size: 30px; line-height: 1.5; }
.toc-text strong { color: var(--text); }
/* COMPARE */
.compare-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 16px; flex: 1; align-content: center; }
.compare-card { padding: 28px 16px; background: rgba(122,162,247,0.08); border-radius: var(--radius); text-align: center; border: 1px solid rgba(122,162,247,0.2); }
.compare-card .mode-name { font-size: 34px; font-weight: 800; color: var(--accent); margin-bottom: 10px; }
.compare-card .mode-use { font-size: 28px; color: var(--text-dim); margin-bottom: 14px; line-height: 1.4; }
.compare-card .mode-save { font-size: 48px; font-weight: 900; color: var(--good); }
.compare-card.bordered { border-color: var(--accent2); }
.bad-line { font-size: 28px; color: var(--bad); margin-top: 4px; }
/* STEPS */
.step-flow { display: flex; flex-direction: column; gap: 14px; margin-top: 28px; flex: 1; justify-content: center; }
.step-item { display: flex; align-items: center; gap: 28px; }
.step-num { width: 68px; height: 68px; border-radius: 50%; background: var(--accent); color: var(--bg); font-size: 30px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.step-text { font-size: 34px; flex: 1; line-height: 1.4; }
.step-arrow { font-size: 30px; color: var(--accent); text-align: center; opacity: 0.7; }
/* CTA */
.s-cta { justify-content: center; align-items: center; text-align: center; }
.s-cta h2 { font-size: 72px; font-weight: 800; line-height: 1.2; }
.cta-url { font-size: 56px; font-weight: 900; color: var(--accent); letter-spacing: 0.04em; margin: 28px 0 16px; }
.cta-sub { font-size: 32px; color: var(--text-dim); }
/* THANKS */
.s-thanks { justify-content: center; align-items: center; text-align: center; }
.s-thanks h1 { font-size: 120px; font-weight: 900; }
.gt { background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.s-thanks .sub { font-size: 40px; color: var(--text-dim); margin-top: 28px; }
/* ─── NEW LAYOUT STYLES (9:16 vertical) ─── */
/* TWO-COLUMN */
.two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; flex: 1; align-content: center; }
.two-col-grid .col { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 24px; }
.two-col-grid .col h3 { font-size: 32px; font-weight: 700; color: var(--accent); margin-bottom: 12px; }
.two-col-grid .col li { font-size: 30px; line-height: 1.5; margin-bottom: 6px; list-style: none; padding-left: 24px; position: relative; }
.two-col-grid .col li::before { content: '▸'; position: absolute; left: 0; color: var(--accent); font-size: 24px; top: 2px; }
/* THREE-COLUMN */
.three-col-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 20px; flex: 1; align-content: center; }
.three-col-grid .col-item { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 20px; }
.three-col-grid .col-item h3 { font-size: 30px; font-weight: 700; color: var(--accent); margin-bottom: 10px; }
.three-col-grid .col-item li { font-size: 28px; line-height: 1.4; margin-bottom: 4px; list-style: none; padding-left: 22px; position: relative; }
.three-col-grid .col-item li::before { content: '▸'; position: absolute; left: 0; color: var(--accent); font-size: 22px; top: 2px; }
/* BIG-QUOTE */
.quote-wrap { display: flex; flex-direction: column; justify-content: center; align-items: center; flex: 1; text-align: center; }
.big-quote-text { font-size: 48px; font-weight: 600; line-height: 1.4; color: var(--text); font-style: italic; position: relative; padding: 0 40px; }
.big-quote-text::before { content: '\\201C'; font-size: 120px; color: var(--accent); opacity: 0.3; position: absolute; top: -40px; left: 0; line-height: 1; }
.quote-author { font-size: 30px; color: var(--text-dim); margin-top: 24px; font-style: normal; }
.quote-role { font-size: 26px; color: var(--text-muted); }
/* KPI-GRID */
.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; flex: 1; align-content: center; }
.kpi-card { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 28px; text-align: center; border: 1px solid rgba(122,162,247,0.15); }
.kpi-num { font-size: 56px; font-weight: 900; color: var(--accent); line-height: 1; margin-bottom: 8px; }
.kpi-label { font-size: 28px; color: var(--text-dim); }
.kpi-delta { font-size: 24px; color: var(--good); margin-top: 6px; }
/* DATA-TABLE */
.data-table { width: 100%; border-collapse: collapse; font-size: 28px; margin-top: 20px; }
.data-table th { font-size: 26px; font-weight: 700; color: var(--accent); text-align: left; padding: 12px 16px; border-bottom: 2px solid var(--accent); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid rgba(122,162,247,0.15); color: var(--text); }
.data-table tr:hover td { background: rgba(122,162,247,0.04); }
/* CHART-BAR */
.chart-bars { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 18px; }
.bar-row { display: flex; align-items: center; gap: 12px; }
.bar-label { font-size: 28px; min-width: 100px; text-align: right; color: var(--text); }
.bar-track { flex: 1; height: 32px; background: rgba(122,162,247,0.1); border-radius: 8px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 8px; }
.bar-value { font-size: 28px; font-weight: 700; color: var(--accent); min-width: 60px; }
/* CHART-LINE / PIE / RADAR (shared) */
.chart-svg { width: 100%; max-height: 500px; margin-top: 20px; }
.chart-label { font-size: 24px; fill: var(--text-dim); }
.chart-val { font-size: 26px; fill: var(--text); font-weight: 700; }
.pie-legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; justify-content: center; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 26px; color: var(--text-dim); }
.legend-dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
/* CODE-BLOCK */
.code-block { background: #0d1117; border-radius: 12px; overflow: hidden; flex: 1; display: flex; flex-direction: column; }
.code-header { padding: 12px 20px; background: rgba(122,162,247,0.1); display: flex; align-items: center; }
.code-lang { font-size: 22px; font-weight: 600; color: var(--accent); text-transform: uppercase; }
.code-content { padding: 20px; overflow: auto; flex: 1; }
.code-content code { font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace; font-size: 26px; line-height: 1.6; color: #e6edf3; }
/* DIFF-BLOCK */
.diff-block { background: #0d1117; border-radius: 12px; padding: 20px; overflow: auto; flex: 1; font-family: 'Fira Code', 'Consolas', monospace; font-size: 24px; line-height: 1.6; }
.diff-add { color: #3fb950; padding: 2px 8px; background: rgba(63,185,80,0.1); }
.diff-del { color: #f85149; padding: 2px 8px; background: rgba(248,81,73,0.1); }
.diff-meta { color: #58a6ff; padding: 2px 8px; }
.diff-context { color: #8b949e; padding: 2px 8px; }
/* TERMINAL */
.terminal-win { background: #0d1117; border-radius: 12px; overflow: hidden; flex: 1; display: flex; flex-direction: column; }
.term-bar { padding: 10px 20px; background: rgba(122,162,247,0.08); font-size: 22px; color: var(--text-dim); }
.term-body { padding: 20px; flex: 1; }
.term-line { display: flex; gap: 10px; margin-bottom: 8px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 26px; line-height: 1.5; }
.term-prompt { color: var(--good); font-weight: 700; }
.term-cmd { color: #e6edf3; }
.term-output { color: var(--text-dim); font-family: 'Fira Code', 'Consolas', monospace; font-size: 24px; line-height: 1.5; margin-top: 12px; white-space: pre-wrap; }
/* FLOW-DIAGRAM */
.flow-container { position: relative; flex: 1; }
.flow-node { position: absolute; background: rgba(122,162,247,0.08); border: 1px solid var(--accent); border-radius: 12px; padding: 14px 24px; min-width: 120px; text-align: center; }
.flow-node-inner { font-size: 28px; font-weight: 600; color: var(--text); }
.flow-arrow { position: absolute; font-size: 32px; color: var(--accent); }
/* ARCH-DIAGRAM */
.arch-diagram { display: flex; flex-direction: column; gap: 14px; flex: 1; justify-content: center; }
.arch-layer { display: flex; align-items: center; gap: 12px; background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 16px 20px; }
.arch-layer-label { font-size: 28px; font-weight: 700; color: var(--accent); min-width: 100px; }
.arch-layer-items { display: flex; gap: 10px; flex-wrap: wrap; }
.arch-item { font-size: 26px; background: rgba(122,162,247,0.1); padding: 6px 16px; border-radius: 8px; color: var(--text); }
/* MINDMAP */
.mindmap { display: flex; flex-direction: column; align-items: center; flex: 1; justify-content: center; gap: 20px; }
.mm-root { font-size: 40px; font-weight: 800; color: var(--accent); background: rgba(122,162,247,0.1); padding: 16px 32px; border-radius: 50px; }
.mm-branch { font-size: 28px; color: var(--text); }
.mm-node { font-weight: 600; }
.mm-child { font-size: 24px; color: var(--text-dim); margin-top: 4px; }
/* TIMELINE */
.timeline { display: flex; flex-direction: column; gap: 0; flex: 1; justify-content: center; position: relative; padding-left: 40px; }
.tl-item { display: flex; gap: 20px; align-items: flex-start; position: relative; padding-bottom: 24px; border-left: 3px solid var(--accent); padding-left: 28px; }
.tl-dot { position: absolute; left: -9px; top: 6px; width: 14px; height: 14px; border-radius: 50%; background: var(--accent); }
.tl-time { font-size: 26px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
.tl-text { font-size: 30px; color: var(--text); line-height: 1.4; }
.tl-content { flex: 1; }
/* ROADMAP */
.roadmap { display: flex; flex-direction: column; gap: 16px; flex: 1; justify-content: center; }
.rm-phase { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 20px; border-left: 4px solid var(--accent); }
.rm-phase-label { font-size: 32px; font-weight: 700; color: var(--accent); margin-bottom: 8px; }
.rm-items { display: flex; gap: 8px; flex-wrap: wrap; }
.rm-item { font-size: 26px; background: rgba(122,162,247,0.08); padding: 6px 14px; border-radius: 8px; color: var(--text-dim); }
/* GANTT */
.gantt-chart { display: flex; flex-direction: column; gap: 12px; flex: 1; justify-content: center; }
.gantt-row { display: flex; align-items: center; gap: 12px; }
.gantt-task-name { font-size: 26px; min-width: 140px; text-align: right; color: var(--text); }
.gantt-bar-wrap { flex: 1; height: 28px; background: rgba(122,162,247,0.1); border-radius: 8px; overflow: hidden; position: relative; }
.gantt-bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 8px; position: absolute; top: 0; }
/* PROS-CONS */
.pros-cons-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; flex: 1; align-content: center; }
.pros-col, .cons-col { background: rgba(122,162,247,0.06); border-radius: var(--radius); padding: 24px; }
.pros-col h3, .cons-col h3 { font-size: 34px; font-weight: 700; margin-bottom: 12px; }
.pros-col h3 { color: var(--good); }
.cons-col h3 { color: var(--bad); }
.pros-col li, .cons-col li { font-size: 30px; line-height: 1.5; margin-bottom: 8px; list-style: none; display: flex; gap: 10px; }
.pc-icon { font-size: 28px; }
.pro-item .pc-icon { color: var(--good); }
.con-item .pc-icon { color: var(--bad); }
`;

// ===== CANVAS FX RUNTIME (inline) =====
const CFX_RUNTIME = `
var _cfxCtx = null, _cfxFx = null, _cfxActive = false;
function startCFX(name, startT, durT) {
  var canvas = document.getElementById('cfx');
  if (!canvas || !window.CFX || !window.CFX[name]) return;
  _cfxCtx = canvas.getContext('2d');
  _cfxFx = window.CFX[name];
  if (_cfxFx.init) _cfxFx.init(0);
  _cfxActive = true;
  var proxy = { t: startT };
  gsap.to(proxy, {
    t: startT + durT, duration: durT, ease: 'none',
    onUpdate: function() {
      if (!_cfxActive || !_cfxCtx || !_cfxFx) return;
      _cfxCtx.clearRect(0, 0, W, H);
      _cfxFx(_cfxCtx, proxy.t);
    },
    onComplete: function() { _cfxActive = false; if (_cfxCtx) _cfxCtx.clearRect(0, 0, W, H); }
  });
}
`;

function generateIndexHTML(config) {
  const { title, theme, width = 1080, height = 1920, scenes } = config;
  const W = width, H = height;

  // 1. Auto-select theme if not provided
  const resolvedTheme = theme || selectThemeForScript(scenes || [], { defaultTheme: 'tokyo-night' });
  let themeCSS = convertThemeCSS(resolvedTheme);
  themeCSS = replaceFontVars(themeCSS);

  // 2. Generate CSS (replace W/H placeholders)
  const css = SHARED_CSS.replace(/Wpx/g, `${W}px`).replace(/Hpx/g, `${H}px`);

  // 3. Generate scene HTML and GSAP code
  const sceneHTMLs = [];
  const gsapLines = [];
  let totalDuration = 0;

  for (const scene of scenes) {
    const layoutGen = convertLayout.LAYOUT_GENERATORS[scene.layout];
    if (!layoutGen) {
      console.error(`Unknown layout: ${scene.layout}`);
      continue;
    }

    const sceneData = { ...scene.data, id: scene.id };
    const result = layoutGen(sceneData);

    sceneHTMLs.push(result.html);

    // Generate GSAP lines with startTime from config
    const startTime = scene.startTime;
    const duration = scene.duration;
    totalDuration = Math.max(totalDuration, startTime + duration);

    // Replace 'startTime' and 'SCENE_DUR' placeholders in gsap code
    for (const line of result.gsap) {
      gsapLines.push(line.replace(/startTime/g, String(startTime)).replace(/SCENE_DUR/g, String(duration)));
    }

    // Exit animation: fade out scene before next scene starts
    // Last 0.4s of each scene duration, fade opacity to 0
    // But NOT for the very last scene (keep it visible at end)
    const sceneIndex = scenes.indexOf(scene);
    if (sceneIndex < scenes.length - 1) {
      const fadeOutStart = startTime + duration - 0.4;
      gsapLines.push(`tl.to('#${scene.id}',{opacity:0,duration:0.4,ease:'power2.in'},${fadeOutStart})`);
    }

    // Generate FX code
    const fxName = scene.fx !== undefined ? scene.fx : getDefaultFX(scene.layout, scene.data);
    if (fxName) {
      const fxCode = generateFXCode(fxName, startTime, duration);
      if (fxCode) gsapLines.push(fxCode);
    }
  }

  // 4. Assemble HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
${themeCSS}
${css}
</style>
</head>
<body>
<div id="main" data-composition-id="main" data-width="${W}" data-height="${H}" data-start="0">

<canvas id="cfx" width="${W}" height="${H}"></canvas>

${sceneHTMLs.join('\n\n')}

<script src="canvas-fx.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"><\/script>
<script>
(function() {
  'use strict';
  var W = ${W}, H = ${H};
${CFX_RUNTIME}
  var tl = gsap.timeline({ paused: true });

${gsapLines.join('\n  ')}

  window.__timelines = window.__timelines || {};
  window.__timelines['main'] = tl;
})();
<\/script>
</div>
</body>
</html>`;

  return { html, totalDuration, sceneCount: scenes.length };
}

function convertThemeCSS(themeName) {
  // Try to read the theme file directly
  const hpDir = path.join(
    process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\qianq',
    '.qclaw', 'skills', 'html-ppt-skill'
  );
  const themePath = path.join(hpDir, 'assets', 'themes', `${themeName}.css`);

  if (fs.existsSync(themePath)) {
    const css = fs.readFileSync(themePath, 'utf-8');
    // Extract :root block and remap tokens
    const rootMatch = css.match(/:root\s*\{([^}]+)\}/s);
    if (rootMatch) {
      // Remap: --text-1 → --text, --text-2 → --text-dim, --text-3 → --text-muted
      let block = rootMatch[1];
      block = block.replace(/--text-1:/g, '--text:');
      block = block.replace(/--text-2:/g, '--text-dim:');
      block = block.replace(/--text-3:/g, '--text-muted:');
      block = block.replace(/--accent-2:/g, '--accent2:');
      block = block.replace(/--accent-3:/g, '--accent3:');
      return `/* Converted from html-ppt theme: ${themeName} */\n:root {${block}}`;
    }
  }

  // Fallback: return basic dark theme
  return `/* Theme: ${themeName} (fallback) */\n:root {\n  --bg: #1a1b26;\n  --text: #c0caf5;\n  --text-dim: #a9b1d6;\n  --text-muted: #565f89;\n  --accent: #7aa2f7;\n  --accent2: #bb9af7;\n  --accent3: #7dcfff;\n  --good: #9ece6a;\n  --bad: #f7768e;\n  --radius: 16px;\n}`;
}

function main() {
  const args = process.argv.slice(2);
  let configPath = null;
  let outputDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) configPath = args[++i];
    if (args[i] === '--output-dir' && args[i + 1]) outputDir = args[++i];
  }

  if (!configPath) {
    console.error('Usage: node generate.js --config <config.json> [--output-dir <dir>]');
    console.error('\nConfig format:');
    console.error(JSON.stringify({
      title: "视频标题",
      theme: "tokyo-night",
      width: 1080,
      height: 1920,
      fps: 30,
      scenes: [
        { layout: "cover", id: "s1", startTime: 0, duration: 10, data: { kicker: "...", title: "..." }, fx: "particle-burst" }
      ]
    }, null, 2));
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const result = generateIndexHTML(config);

  if (outputDir) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outPath = path.join(outputDir, 'index.html');
    fs.writeFileSync(outPath, result.html, 'utf-8');

    // Copy canvas-fx.js from wechat-video-hf if available
    const cfxSource = path.join('D:\\workspace\\wechat-video-hf', 'canvas-fx.js');
    if (fs.existsSync(cfxSource)) {
      fs.copyFileSync(cfxSource, path.join(outputDir, 'canvas-fx.js'));
    }

    console.log(`Generated: ${outPath}`);
    console.log(`Scenes: ${result.sceneCount}, Duration: ${result.totalDuration}s`);
  } else {
    console.log(result.html);
  }
}

// Export for programmatic use
module.exports = { generateIndexHTML, convertThemeCSS, SHARED_CSS, CFX_RUNTIME };

if (require.main === module) main();
