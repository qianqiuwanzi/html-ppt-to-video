/**
 * render_headless.js — 使用 Chrome Headless + FFmpeg 渲染 HTML 为 MP4
 * 替代 hyperframes render，避免 Puppeteer 找不到 Chrome 的问题
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const FFMPEG = 'D:/software/ffmpeg-4.4-essentials_build/bin/ffmpeg.exe';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;
const DURATION = 5; // 默认 5 秒，可覆盖

function renderSceneHtml(htmlFile, outputMp4, durationSec) {
  // 1. 启动 Chrome Headless 截图序列（每帧一张 PNG）
  const frameDir = outputMp4.replace('.mp4', '_frames');
  if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir, { recursive: true });

  // Chrome Headless 截图方案：
  // chrome --headless --screenshot=... --window-size=... file:///...
  // 但这只能截一张图，不能录视频

  // 正确方案：Chrome Headless + MediaRecorder API（通过 Puppeteer）
  // 或者：用 Playwright（如果安装了）

  // 先检查 Playwright 是否可用
  try {
    const { chromium } = require('playwright');
    console.log('  使用 Playwright Chromium 渲染...');
    return renderWithPlaywright(htmlFile, outputMp4, durationSec);
  } catch (e) {
    console.log('  Playwright 不可用，尝试 Puppeteer...');
  }

  // 尝试 Puppeteer
  try {
    const puppeteer = require('puppeteer');
    console.log('  使用 Puppeteer 渲染...');
    return renderWithPuppeteer(puppeteer, htmlFile, outputMp4, durationSec);
  } catch (e) {
    console.error('  ✗ Puppeteer 不可用:', e.message);
    console.error('  请安装 Puppeteer: npm install puppeteer');
    return false;
  }
}

async function renderWithPlaywright(htmlFile, outputMp4, durationSec) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });

  const htmlPath = 'file:///' + htmlFile.replace(/\\/g, '/');
  await page.goto(htmlPath, { waitUntil: 'networkidle' });

  // 等待 __hf_ready 或超时
  await page.waitForTimeout(2000);

  // 录制视频（通过 CDP 获取视频流）
  // 简化方案：截图序列 + FFmpeg 合成
  const frameDir = outputMp4.replace('.mp4', '_frames');
  if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir, { recursive: true });

  const frameCount = Math.ceil(durationSec * FPS);
  for (let i = 0; i < frameCount; i++) {
    const framePath = path.join(frameDir, `frame_${String(i).padStart(6, '0')}.png`);
    await page.screenshot({ path: framePath });
    // 滚动或等待
    await page.evaluate(() => window.scrollBy(0, 1)); // 触发重绘
  }

  await browser.close();

  // FFmpeg 合成视频
  console.log(`  合成视频: ${frameCount} 帧 -> ${outputMp4}`);
  try {
    execSync(
      `"${FFMPEG}" -y -framerate ${FPS} -i "${frameDir}/frame_%06d.png" -c:v libx264 -pix_fmt yuv420p "${outputMp4}"`,
      { encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe' }
    );
    console.log('  ✓ 视频已生成:', outputMp4);
    return true;
  } catch (e) {
    console.error('  ✗ FFmpeg 合成失败:', e.message);
    return false;
  }
}

async function renderWithPuppeteer(puppeteer, htmlFile, outputMp4, durationSec) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  const htmlPath = 'file:///' + htmlFile.replace(/\\/g, '/');
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });

  await page.waitForTimeout(2000);

  const frameDir = outputMp4.replace('.mp4', '_frames');
  if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir, { recursive: true });

  const frameCount = Math.ceil(durationSec * FPS);
  for (let i = 0; i < frameCount; i++) {
    const framePath = path.join(frameDir, `frame_${String(i).padStart(6, '0')}.png`);
    await page.screenshot({ path: framePath });
    await page.evaluate(() => window.scrollBy(0, 1));
  }

  await browser.close();

  console.log(`  合成视频: ${frameCount} 帧 -> ${outputMp4}`);
  try {
    execSync(
      `"${FFMPEG}" -y -framerate ${FPS} -i "${frameDir}/frame_%06d.png" -c:v libx264 -pix_fmt yuv420p "${outputMp4}"`,
      { encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe' }
    );
    console.log('  ✓ 视频已生成:', outputMp4);
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
    console.error('用法: node render_headless.js <html-file> <output.mp4> [duration]');
    process.exit(1);
  }
  const htmlFile = path.resolve(args[0]);
  const outputMp4 = path.resolve(args[1]);
  const duration = parseInt(args[2]) || DURATION;

  if (!fs.existsSync(htmlFile)) {
    console.error('✗ HTML 文件不存在:', htmlFile);
    process.exit(1);
  }

  renderSceneHtml(htmlFile, outputMp4, duration).then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('✗ 渲染失败:', err);
    process.exit(1);
  });
}

module.exports = { renderSceneHtml };
