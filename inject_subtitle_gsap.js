'use strict';

const fs = require('fs');
const path = require('path');

const MAX_CHARS_PER_LINE = 15;
const FONT_SIZE_VERTICAL = 44;   // #5 竖屏标准40-48px，推荐44px
const FONT_SIZE_HORIZONTAL = 32; // #5 横屏标准28-36px
const BOTTOM_OFFSET = 100;        // 距离底部100px
const FADE_DURATION = 0.3;      // 淡入/淡出时长
const LINE_GAP = 0.1;           // 行间隔（前一行开始淡出到下一行开始淡入）

/**
 * 截断超长行（<=15字），超出部分用...表示
 */
function truncateLine(line) {
  if (line.length <= MAX_CHARS_PER_LINE) return line;
  // 用三个点代替椭圆符号，避免非ASCII字符编码问题
  return line.substring(0, MAX_CHARS_PER_LINE - 3) + '...';
}

/**
 * 注入字幕 GSAP 逐行时序动画
 * @param {string} html - 原始HTML
 * @param {string} subtitleText - 字幕文本（用 | 分隔行）
 * @param {number} duration - 场景时长（秒），用于计算每行显示时间
 * @param {string} orientation - 'vertical'（9:16，默认）| 'horizontal'（16:9）
 * @returns {string} 注入后的HTML
 */
function injectSubtitleGSAP(html, subtitleText, duration, orientation) {
  if (!subtitleText || !html) return html;
  duration = duration || 8;
  // 默认竖屏（daily-video-factory 规则 #5.5）
  orientation = orientation || 'vertical';

  // 1. 解析字幕行（| 分隔）
  const lines = subtitleText.split('|').map(l => l.trim()).filter(Boolean).map(truncateLine);
  if (lines.length === 0) return html;

  // 2. 计算每行显示时间（音画同步：平分时长）
  const perLineDuration = duration / lines.length;

  // 3. 注入字幕 CSS（如果还没有）
  if (!html.includes('subtitle-container')) {
    const fontSize = orientation === 'vertical' ? FONT_SIZE_VERTICAL : FONT_SIZE_HORIZONTAL;
    const cssInsert = '\n    <style>\n    .subtitle-container { position: fixed; bottom: ' + BOTTOM_OFFSET + 'px; left: 0; width: 100%; text-align: center; padding: 0 48px; box-sizing: border-box; z-index: 15; pointer-events: none; }\n    .subtitle-line { display: none; background: rgba(0,0,0,0.62); color: #fff; font-size: ' + fontSize + 'px; line-height: 1.5; padding: 10px 24px; border-radius: 10px; max-width: 88%; margin: 0 auto 8px; word-break: break-all; font-family: \'Inter\', sans-serif; }\n    .subtitle-line.active { display: inline-block; }\n    </style>\n';
    html = html.replace(/(<\/head>)/i, (m) => cssInsert + m);
  }

  // 4. 注入字幕 HTML（容器 + 逐行 <span>，全部隐藏，由 GSAP 控制显示）
  const linesHtml = lines.map((line, idx) =>
    '<span class="subtitle-line" data-line="' + idx + '">' + line.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>'
  ).join('\n    ');

  const subtitleHtml = '\n    <div class="subtitle-container">\n      ' + linesHtml + '\n    </div>\n';

  if (!html.includes('class="subtitle-container"')) {
    // 插入在 </canvas> 后
    html = html.replace(/(<\/canvas>)/, (m) => m + subtitleHtml);
  }

  // 5. 注入 GSAP 逐行时序动画
  const gsapLines = [];
  gsapLines.push('  // Subtitle GSAP (v0.7.0) - 逐行时序，音画同步');
  gsapLines.push('  if (window.__timelines && window.__timelines["main"]) {');
  gsapLines.push('    var tl = window.__timelines["main"];');
  gsapLines.push('    var lines = document.querySelectorAll(\'.subtitle-line\');');
  gsapLines.push('    var perLine = ' + perLineDuration.toFixed(3) + ';');
  gsapLines.push('    lines.forEach(function(el, i) {');
  gsapLines.push('      var start = 0.4 + i * perLine;');  // 首行延迟0.4s，后续逐行推进
  gsapLines.push('      var end = start + perLine - 0.1;');
  gsapLines.push('      // 淡入');
  gsapLines.push("      tl.fromTo(el, {opacity:0, y:20}, {opacity:1, y:0, duration:0.3, ease:\'power2.out\'}, start);");
  gsapLines.push("      tl.add(function() { el.classList.add(\'active\'); }, start);");
  gsapLines.push('      // 淡出');
  gsapLines.push("      tl.to(el, {opacity:0, duration:0.3, ease:\'power2.in\'}, end);");
  gsapLines.push("      tl.add(function() { el.classList.remove(\'active\'); }, end);");
  gsapLines.push('    });');
  gsapLines.push('  }');

  const gsapInject = '\n' + gsapLines.join('\n  ') + '\n';

  // 注入到 __timelines["main"] = tl 之后（确保 timeline 对象已存在）
  if (!html.includes('Subtitle GSAP (v0.7.0)')) {
    const anchor2 = /window\.__(?:timelines|tl_main)["\]]?\s*=\s*tl\s*;?/;
    if (anchor2.test(html)) {
      html = html.replace(anchor2, (m) => m + gsapInject);
    } else {
      // fallback: 注入到 </script> 前
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
    // config.json 可能在上级或上两级目录（兼容不同项目结构）
    let configPath = path.join(sceneDir, '..', 'config.json');
    if (!fs.existsSync(configPath)) {
      configPath = path.join(sceneDir, '..', '..', 'config.json');
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const sceneIdx = parseInt(path.basename(sceneDir).replace('scene_', ''));
    const scene = config.scenes && config.scenes[sceneIdx];
    if (scene && scene.data) {
      subtitle = scene.data.subtitle || scene.data.script || '';
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
  console.log('  ✓ 字幕 GSAP 注入成功 (v0.7.0, ' + duration + 's, ' + orientation + ')');
}

module.exports = { injectSubtitleGSAP };
