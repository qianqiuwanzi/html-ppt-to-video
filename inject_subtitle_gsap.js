'use strict';

const fs = require('fs');
const path = require('path');

// ========== daily-video-factory 字幕规范 ==========
const MAX_CHARS_PER_LINE = 15;    // 每行最多15字
const FONT_SIZE_VERTICAL = 44;    // 竖屏44px (规则明确要求)
const FONT_SIZE_HORIZONTAL = 32;  // 横屏32px
const BOTTOM_MARGIN_V = 120;      // 底部边距 (类似ASS MarginV)
const FADE_DURATION = 0.3;        // 淡入/淡出时长

/**
 * 智能断句：将长文本按标点分割为≤15字的短句
 * 对齐 daily-video-factory generate_ass.py smart_split() 逻辑
 * 规则（SKILL.md v1.4.0）：
 * 1. 遇标点自动断句
 * 2. 禁止行尾出现标点
 * 3. 顿号替换为空格
 * 4. 每行≤15字（含空格，不含标点）
 * 5. 超长无标点句用空格分词或硬截断
 */
function smartSplit(text) {
  if (!text) return [];
  
  // 预处理：换行替换为逗号（触发标点断句）
  text = text.replace(/\r\n/g, '，').replace(/\n/g, '，').replace(/\r/g, '，');
  // 顿号替换为空格
  text = text.replace(/、/g, ' ');
  // 移除引号
  text = text.replace(/["'`]/g, '');
  // 括号替换为逗号
  text = text.replace(/[()\[\]{}<>]/g, '，');
  // 合并多余空格
  text = text.replace(/\s+/g, ' ').trim();
  
  if (!text) return [];
  
  // 中文标点集合（断句标点，不含顿号已替换）
  const PUNCT = new Set(['，', '。', '！', '？', '：', '；', ',', '.', '!', '?', ':', ';']);
  
  // 第一步：按标点断句（标点作为分隔符，不保留在结果中）
  const sentences = [];
  let current = '';
  for (const ch of text) {
    if (PUNCT.has(ch)) {
      // 遇标点：结束当前句
      if (current.trim()) {
        sentences.push(current.trim());
      }
      current = '';
    } else {
      current += ch;
    }
  }
  // 处理最后一句
  if (current.trim()) {
    sentences.push(current.trim());
  }
  
  // 第二步：处理每个句子（短句直接保留，长句按空格分词再组合）
  const result = [];
  for (const sent of sentences) {
    if (sent.length <= MAX_CHARS_PER_LINE) {
      result.push(sent);
    } else {
      // 长句：按空格分词，组合成≤15字的行
      const words = sent.split(/\s+/).filter(w => w.length > 0);
      let line = '';
      for (const word of words) {
        if (!line) {
          line = word;
        } else if ((line + ' ' + word).length <= MAX_CHARS_PER_LINE) {
          line += ' ' + word;
        } else {
          result.push(line);
          line = word;
        }
      }
      if (line) {
        if (line.length <= MAX_CHARS_PER_LINE) {
          result.push(line);
        } else {
          // 无空格可分，硬截断
          for (let i = 0; i < line.length; i += MAX_CHARS_PER_LINE) {
            result.push(line.substring(i, i + MAX_CHARS_PER_LINE));
          }
        }
      }
    }
  }
  
  return result.filter(l => l.length > 0);
}

/**
 * 注入字幕 GSAP 逐行时序动画
 * 遵循 daily-video-factory 字幕规范：
 * - 单行显示（同一时间只显示一行）
 * - 每行≤15字，智能断句
 * - 音画同步（根据TTS时长计算每行显示时间）
 * - 底部居中，竖屏42px
 * 
 * @param {string} html - 原始HTML
 * @param {string} subtitleText - 字幕文本（完整 narration）
 * @param {number} duration - 场景时长（秒）
 * @param {string} orientation - 'vertical'（9:16，默认）| 'horizontal'（16:9）
 * @returns {string} 注入后的HTML
 */
function injectSubtitleGSAP(html, subtitleText, duration, orientation) {
  if (!subtitleText || !html) return html;
  duration = duration || 8;
  orientation = orientation || 'vertical';

  // 1. 智能断句为≤15字的短句
  const lines = smartSplit(subtitleText);
  if (lines.length === 0) return html;

  // 2. 计算每行显示时间（音画同步：平分时长）
  const perLineDuration = duration / lines.length;

  // 3. 注入字幕 CSS（daily-video-factory 风格）
  if (!html.includes('subtitle-container')) {
    const fontSize = orientation === 'vertical' ? FONT_SIZE_VERTICAL : FONT_SIZE_HORIZONTAL;
    const cssInsert = `
    <style>
    /* Subtitle Style - daily-video-factory v18.0规范 */
    .subtitle-container {
      position: fixed;
      bottom: ${BOTTOM_MARGIN_V}px;
      left: 0;
      width: 100%;
      text-align: center;
      z-index: 100;
      pointer-events: none;
    }
    .subtitle-line {
      display: none;
      background: rgba(0,0,0,0.75);
      color: #fff;
      font-size: ${fontSize}px;
      font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
      font-weight: bold;
      line-height: 1.4;
      padding: 12px 28px;
      border-radius: 8px;
      max-width: 85%;
      margin: 0 auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .subtitle-line.active {
      display: inline-block;
    }
    </style>
`;
    html = html.replace(/(<\/head>)/i, (m) => cssInsert + m);
  }

  // 4. 注入字幕 HTML（只创建一个span，动态切换内容）
  const subtitleHtml = `
    <div class="subtitle-container">
      <span class="subtitle-line" id="subtitle-active"></span>
    </div>
`;

  if (!html.includes('class="subtitle-container"')) {
    html = html.replace(/(<\/canvas>)/, (m) => m + subtitleHtml);
  }

  // 5. 注入 GSAP 逐行时序动画（单行切换，非多行叠加）
  const gsapLines = [];
  gsapLines.push('  // Subtitle GSAP (v1.0.0-dvf) - daily-video-factory规范');
  gsapLines.push('  // 规则：单行显示，≤15字/行，音画同步，底部居中');
  gsapLines.push('  if (window.__timelines && window.__timelines["main"]) {');
  gsapLines.push('    var tl = window.__timelines["main"];');
  gsapLines.push('    var subtitleEl = document.getElementById("subtitle-active");');
  gsapLines.push('    var lines = ' + JSON.stringify(lines) + ';');
  gsapLines.push('    var perLine = ' + perLineDuration.toFixed(3) + ';');
  gsapLines.push('    ');
  gsapLines.push('    lines.forEach(function(text, i) {');
  gsapLines.push('      var start = i * perLine;');
  gsapLines.push('      var end = start + perLine - 0.15;');
  gsapLines.push('      ');
  gsapLines.push('      // 显示新字幕（带淡入）');
  gsapLines.push('      tl.call(function() { subtitleEl.textContent = text; subtitleEl.classList.add("active"); }, null, start);');
  gsapLines.push('      tl.fromTo(subtitleEl, {opacity:0, y:10}, {opacity:1, y:0, duration:0.25, ease:"power2.out"}, start);');
  gsapLines.push('      ');
  gsapLines.push('      // 淡出当前字幕');
  gsapLines.push('      tl.to(subtitleEl, {opacity:0, duration:0.2, ease:"power2.in"}, end);');
  gsapLines.push('    });');
  gsapLines.push('  }');

  const gsapInject = '\n' + gsapLines.join('\n  ') + '\n';

  // 注入到 __timelines["main"] = tl 之后
  if (!html.includes('Subtitle GSAP (v1.0.0-dvf)')) {
    const anchor2 = /window\._\_(?:timelines|tl_main)["\]]?\s*=\s*tl\s*;?/;
    if (anchor2.test(html)) {
      html = html.replace(anchor2, (m) => m + gsapInject);
    } else {
      html = html.replace(/(<\/script>)(?!.*<\/script>)/s, gsapInject + '\n$1');
    }
  }

  return html;
}

// ===== CLI =====
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node inject_subtitle_gsap.js <scene_dir> [--duration <sec>] [--orientation vertical|horizontal]');
    process.exit(1);
  }

  const sceneDir = args[0];
  const htmlFile = path.join(sceneDir, 'index.html');
  if (!fs.existsSync(htmlFile)) {
    console.error('未找到 index.html:', htmlFile);
    process.exit(1);
  }

  // 读取 config.json 获取字幕文本和时长
  let subtitle = '';
  let duration = 8;
  let orientation = 'vertical';

  try {
    let configPath = path.join(sceneDir, '..', 'config.json');
    if (!fs.existsSync(configPath)) {
      configPath = path.join(sceneDir, '..', '..', 'config.json');
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const sceneIdx = parseInt(path.basename(sceneDir).replace('scene_', ''));
    const scene = config.scenes && config.scenes[sceneIdx];
    if (scene && scene.data) {
      // 优先用 narration（配音同步文本）
      subtitle = scene.data.narration || scene.data.subtitle || scene.data.script || '';
      duration = scene.duration || 8;
    }
    orientation = (config.width > config.height) ? 'horizontal' : 'vertical';
  } catch (e) { /* ignore */ }

  if (!subtitle) {
    console.log('  无字幕文本，跳过');
    process.exit(0);
  }

  const html = fs.readFileSync(htmlFile, 'utf8');
  const updatedHtml = injectSubtitleGSAP(html, subtitle, duration, orientation);
  fs.writeFileSync(htmlFile, updatedHtml, 'utf8');
  console.log('  ✓ 字幕 GSAP 注入成功 (v1.0.0-dvf, ' + duration + 's, ' + orientation + ', ' + smartSplit(subtitle).length + '行)');
}

module.exports = { injectSubtitleGSAP, smartSplit };
