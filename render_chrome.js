/**
 * render_chrome.js — 使用 Chrome Headless + FFmpeg 渲染 HTML 为 MP4
 * 不依赖 puppeteer/playwright，纯命令行调用
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const FFMPEG = 'D:/software/ffmpeg-4.4-essentials_build/bin/ffmpeg.exe';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30;

function renderWithChromeHeadless(htmlFile, outputMp4, durationSec) {
  const absHtml = path.resolve(htmlFile);
  const outputDir = path.dirname(outputMp4);
  const frameDir = path.join(outputDir, 'frames');
  if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir, { recursive: true });

  // 清理旧帧
  if (fs.existsSync(frameDir)) {
    fs.readdirSync(frameDir).forEach(f => {
      if (f.endsWith('.png')) fs.unlinkSync(path.join(frameDir, f));
    });
  }

  const totalFrames = Math.ceil(durationSec * FPS);
  console.log(`  [渲染] ${totalFrames} 帧 (${durationSec}s × ${FPS}fps)`);

  // Chrome Headless 截图方案：
  // chrome --headless --screenshot=... --window-size=... file:///...
  // 但只能截一张图，不能录视频
  
  // 正确方案：用 Chrome DevTools Protocol (CDP) 截图序列
  // 通过 puppeteer 或 chrome-remote-interface
  
  // 先尝试简单方案：用 ffmpeg + chrome 截图（单张）然后 loop 生成视频
  // 但这不能捕获动画
  
  // 实际可行方案：
  // 1. 启动 Chrome with --remote-debugging-port=9222
  // 2. 通过 CDP 发送 Page.navigate
  // 3. 通过 CDP 发送 Page.captureScreenshot 每帧
  // 4. FFmpeg 合成
  
  // 简化：假设动画在 0.5s 内完成，只截 1 张图，然后 ffmpeg 生成视频（无动画）
  // 这是妥协方案
  
  console.log(`  ⚠ 注意：此方案不捕获动画，仅生成静态视频`);
  console.log(`  ℹ 如需动画，请安装 puppeteer 或 playwright`);
  
  // 截一张图
  const singleFrame = path.join(frameDir, 'frame_000001.png');
  const chromeArgs = [
    '--headless',
    '--disable-gpu',
    '--screenshot=' + singleFrame,
    '--window-size=' + 1080 + ',' + 1920,
    'file:///' + absHtml.replace(/\\/g, '/')
  ];
  
  try {
    execSync(`"${CHROME}" ${chromeArgs.join(' ')}`, {
      encoding: 'utf8',
      shell: 'cmd.exe',
      stdio: 'pipe',
      timeout: 30000
    });
  } catch (e) {
    // Chrome 截图后可能返回非0退出码（正常）
  }
  
  if (!fs.existsSync(singleFrame)) {
    console.error('  ✗ Chrome 截图失败');
    return false;
  }
  
  console.log(`  ✓ 截图成功: ${singleFrame}`);
  
  // FFmpeg：用单张图生成视频（loop filter）
  const ffmpegArgs = [
    '-y',
    '-loop', '1',
    '-i', `"${singleFrame}"`,
    '-c:v', 'libx264',
    '-t', String(durationSec),
    '-pix_fmt', 'yuv420p',
    '-vf', `scale=${1080}:${1920}`,
    `"${outputMp4}"`
  ];
  
  try {
    execSync(`"${FFMPEG}" ${ffmpegArgs.join(' ')}`, {
      encoding: 'utf8',
      shell: 'cmd.exe',
      stdio: 'pipe',
      timeout: 60000
    });
    console.log(`  ✓ 视频已生成: ${outputMp4}`);
    return true;
  } catch (e) {
    console.error('  ✗ FFmpeg 合成失败:', e.message);
    return false;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('用法: node render_chrome.js <html-file> <output.mp4> [duration]');
    process.exit(1);
  }
  
  const htmlFile = path.resolve(args[0]);
  const outputMp4 = path.resolve(args[1]);
  const duration = parseInt(args[2]) || 5;
  
  if (!fs.existsSync(htmlFile)) {
    console.error('✗ HTML 文件不存在:', htmlFile);
    process.exit(1);
  }
  
  const success = renderWithChromeHeadless(htmlFile, outputMp4, duration);
  process.exit(success ? 0 : 1);
}

module.exports = { renderWithChromeHeadless };
