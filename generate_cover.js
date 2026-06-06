#!/usr/bin/env node
/**
 * generate_cover.js v2 — 3:4 封面图生成器
 *
 * 使用 FFmpeg drawtext 生成封面图（1080×1440 JPG）
 * 移除不支持的 wrap_width 参数，手动分行
 *
 * Usage:
 *   node generate_cover.js --title "标题" [--output cover.jpg]
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ===== 工具路径 =====
function findExecutable(name) {
  const guesses = [
    `D:\\software\\ffmpeg-4.4-essentials_build\\bin\\${name}.exe`,
    `C:\\Program Files\\ffmpeg\\bin\\${name}.exe`,
  ];
  for (const g of guesses) {
    if (fs.existsSync(g)) return g;
  }
  return name;
}
const FFMPEG = findExecutable('ffmpeg');

// ===== 主函数 =====
function generateCover(opts = {}) {
  const {
    title = '视频标题',
    subtitle = '',
    output = 'cover.jpg',
    width = 1080,
    height = 1440,  // 3:4 ratio
    bgColor = '0x1a1b26',
    textColor = 'white',
  } = opts;

  // 确保输出目录存在
  const outDir = path.dirname(output);
  if (outDir && outDir !== '.' && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Windows 字体路径
  const fontFile = 'C\\:\\\\Windows\\\\Fonts\\\\msyh.ttc';
  const fontSize = Math.round(width * 0.09);

  // 手动分行（每行最多 10 个字符）
  const titleLines = [];
  const maxCharsPerLine = 10;
  for (let i = 0; i < title.length; i += maxCharsPerLine) {
    titleLines.push(title.substring(i, i + maxCharsPerLine));
  }

  // 构建 VF 链
  const vfParts = [];

  // 背景
  vfParts.push(`color=c=${bgColor}:s=${width}x${height}:d=0.04`);

  // 标题（多行）
  titleLines.forEach((line, idx) => {
    const escapedLine = line.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    const yPos = `h*0.35+${idx}*${fontSize + 20}`;
    vfParts.push(
      `drawtext=fontfile='${fontFile}':text='${escapedLine}':fontsize=${fontSize}:fontcolor=${textColor}:` +
      `x=(w-text_w)/2:y=${yPos}`
    );
  });

  // 副标题
  if (subtitle) {
    const subEscaped = subtitle.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    vfParts.push(
      `drawtext=fontfile='${fontFile}':text='${subEscaped}':fontsize=${Math.round(fontSize * 0.5)}:fontcolor='#a9b1d6':` +
      `x=(w-text_w)/2:y=h*0.55`
    );
  }

  // 底部装饰线
  vfParts.push(
    `drawtext=text='':fontsize=1:fontcolor=${textColor}:` +
    `x=(w-w*0.6)/2:y=h*0.85:box=1:boxcolor=${textColor}@0.4:boxborderw=3`
  );

  const vf = vfParts.join(',');

  // FFmpeg 命令
  const cmd = `"${FFMPEG}" -f lavfi -i "${vf}" -vframes 1 "${output}" -y`;
  
  try {
    execSync(cmd, { encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe' });
    const size = (fs.statSync(output).size / 1024).toFixed(1);
    console.log(`  ✓ 封面已生成: ${output} (${size}KB)`);
    return output;
  } catch (e) {
    console.error(`  ✗ 封面生成失败: ${e.message}`);
    // fallback: 纯色块
    console.log('  尝试 fallback：纯色块...');
    const fbCmd = `"${FFMPEG}" -f lavfi -i "color=c=${bgColor}:s=${width}x${height}:d=0.1" -vframes 1 "${output}" -y`;
    try {
      execSync(fbCmd, { encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe' });
      console.log(`  ✓ Fallback 封面已生成: ${output}`);
      return output;
    } catch (e2) {
      console.error(`  ✗ Fallback 也失败: ${e2.message}`);
      return null;
    }
  }
}

// ===== CLI =====
if (require.main === module) {
  const args = process.argv.slice(2);
  let title = null, subtitle = '', output = 'cover.jpg';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title') title = args[++i];
    else if (args[i] === '--subtitle') subtitle = args[++i];
    else if (args[i] === '--output' || args[i] === '-o') output = args[++i];
  }

  if (!title) {
    console.error('用法: node generate_cover.js --title "标题" [--subtitle "副标题"] [--output cover.jpg]');
    process.exit(1);
  }

  generateCover({ title, subtitle, output });
}

module.exports = { generateCover };
