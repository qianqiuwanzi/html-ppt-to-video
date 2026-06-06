#!/usr/bin/env node
/**
 * inject_subtitle_gsap.js — 字幕GSAP动画注入器 (v0.6.0)
 *
 * 在已生成的场景 index.html 中注入字幕显示/隐藏的 GSAP 动画
 * 读取 scene.data.script 或 data.subtitle 获取字幕文本和 timing
 *
 * Usage (module):
 *   const { injectSubtitleGSAP } = require('./inject_subtitle_gsap');
 *   const updatedHtml = injectSubtitleGSAP(htmlString, subtitleText, duration);
 *
 * Usage (CLI):
 *   node inject_subtitle_gsap.js <scene_dir> [--duration <sec>]
 */

'use strict';

const fs = require('fs');
const path = require('path');

function injectSubtitleGSAP(html, subtitleText, duration) {
  if (!subtitleText || !html) return html;
  duration = duration || 8;

  // 1. 注入字幕 CSS（如果还没有）
  if (!html.includes('subtitle-overlay')) {
    const cssInsert = `\n    <style>\n    .subtitle-overlay { position: fixed; bottom: 100px; left: 0; width: 100%; text-align: center; padding: 0 48px; box-sizing: border-box; opacity: 0; z-index: 15; pointer-events: none; }\n    .subtitle-text { display: inline-block; background: rgba(0,0,0,0.62); color: #fff; font-size: 38px; line-height: 1.5; padding: 10px 24px; border-radius: 10px; max-width: 88%; word-break: break-all; font-family: 'Inter', sans-serif; }\n    </style>\n`;
    html = html.replace(/(<\/head>)/i, (m) => cssInsert + m);
  }

  // 2. 注入字幕 HTML（在 </canvas> 后）
  const subtitleHtml = `\n    <div class="subtitle-overlay"><span class="subtitle-text">${subtitleText.replace(/\|n/g, '<br>')}</span></div>\n`;
  if (!html.includes('subtitle-overlay')) {
    html = html.replace(/(<\/canvas>)/, (m) => m + subtitleHtml);
  }

  // 3. 注入 GSAP 动画（显示/隐藏）
  const gsapInject = `\n  // Subtitle GSAP (v0.6.0)\n  if (window.__timelines && window.__timelines['main']) {\n    var tl = window.__timelines['main'];\n    tl.fromTo('.subtitle-overlay', {opacity:0, y:20}, {opacity:1, y:0, duration:0.3, ease:'power2.out'}, 0.4);\n    tl.to('.subtitle-overlay', {opacity:0, duration:0.3, ease:'power2.in'}, ${duration - 0.4});\n  }\n`;
  
  if (!html.includes('subtitle-overlay') || !html.includes('Subtitle GSAP')) {
    html = html.replace(/(window\.__timelines\s*=\s*window\.__timelines\s*\|\|\s*\{\})/, (m) => m + gsapInject);
  }

  return html;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('用法: node inject_subtitle_gsap.js <scene_dir>');
    process.exit(1);
  }
  const sceneDir = args[0];
  const htmlFile = path.join(sceneDir, 'index.html');
  if (!fs.existsSync(htmlFile)) {
    console.error('未找到 index.html:', htmlFile);
    process.exit(1);
  }

  // 读取 config.json 获取字幕文本
  const configPath = path.join(sceneDir, '..', 'config.json');
  let subtitle = '';
  let duration = 8;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const sceneIdx = parseInt(path.basename(sceneDir).replace('scene_', ''));
    const scene = config.scenes && config.scenes[sceneIdx];
    if (scene && scene.data) {
      subtitle = scene.data.subtitle || scene.data.script || '';
      duration = scene.duration || 8;
    }
  } catch (e) { /* ignore */ }

  if (!subtitle) {
    console.log('  无字幕文本，跳过');
    process.exit(0);
  }

  const html = fs.readFileSync(htmlFile, 'utf8');
  const updatedHtml = injectSubtitleGSAP(html, subtitle, duration);
  fs.writeFileSync(htmlFile, updatedHtml, 'utf8');
  console.log('  ✓ 字幕 GSAP 注入成功');
}

module.exports = { injectSubtitleGSAP };
