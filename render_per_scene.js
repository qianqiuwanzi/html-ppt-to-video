#!/usr/bin/env node
/**
 * render_per_scene.js v0.6.0 — Per-Scene 独立渲染编排脚本（完整集成版）
 *
 * 集成4项新功能：
 *   1. 口播文案生成（generate_script.js）
 *   2. 字幕显示（inject_subtitle_gsap.js）
 *   3. 封面图片 3:4（generate_cover.js）
 *   4. 输出内容包（原始链接、文案、标题、标签）
 *
 * 用法:
 *   node render_per_scene.js --config config.json [--bgm bgm.mp3] [--output-dir output/] [--output final.mp4] [--source source_content.txt]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ========== 工具路径 ==========
function findExecutable(name) {
  const guesses = [
    `D:\\software\\ffmpeg-4.4-essentials_build\\bin\\${name}.exe`,
    `C:\\Program Files\\ffmpeg\\bin\\${name}.exe`,
  ];
  for (const g of guesses) {
    if (fs.existsSync(g)) return g;
  }
  try {
    const out = execSync(`where ${name}`, { encoding: 'utf8', shell: 'cmd.exe', stdio: ['pipe', 'pipe', 'pipe'] });
    return out.trim().split('\n')[0].trim().replace(/"/g, '');
  } catch (e) {
    return name;
  }
}
const FFMPEG = findExecutable('ffmpeg');
const FFPROBE = findExecutable('ffprobe');

// ========== 加载模块 ==========
const { generateSingleSceneHTML } = require('./converters/generate');
const { extractSceneText, generateTTS, mergeAudioClip, concatClips, getDuration } = require('./mix_audio');
const { assignDiversity } = require('./diversity_assigner');

// ========== 参数 ==========
const args = process.argv.slice(2);
let configPath = null, bgmPath = null, outputDir = null, finalOutput = null;
let sourceFile = null, voice = 'zh-CN-YunjianNeural', speed = 20;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config') configPath = args[++i];
  else if (args[i] === '--bgm') bgmPath = args[++i];
  else if (args[i] === '--output-dir') outputDir = args[++i];
  else if (args[i] === '--output') finalOutput = args[++i];
  else if (args[i] === '--source') sourceFile = args[++i];
  else if (args[i] === '--voice') voice = args[++i];
  else if (args[i] === '--speed') speed = parseInt(args[++i]);
}

if (!configPath) {
  console.log('用法: node render_per_scene.js --config config.json [--source source_content.txt] [--bgm bgm.mp3] [--output-dir output/] [--output final.mp4]');
  process.exit(1);
}

// ========== 加载配置 ==========
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const scenes = config.scenes || [];

// ========== [新增1] 口播文案生成 (v0.6.0) ==========
if (sourceFile && fs.existsSync(sourceFile)) {
  console.log('[0/5] 生成口播文案...');
  try {
    const sourceText = fs.readFileSync(sourceFile, 'utf8');
    const { generateScript } = require('./generate_script');
    const result = generateScript(config, sourceText, { voice, speed });
    config.scenes = result.scenes || config.scenes;
    console.log(`  ✓ 文案已生成 (${result.scenes ? result.scenes.length : 0} 场景)`);
  } catch (e) {
    console.warn(`  ⚠ 文案生成失败: ${e.message}`);
  }
} else {
  // 尝试自动查找 source_content.txt
  const autoSource = path.join(path.dirname(configPath), 'source_content.txt');
  if (fs.existsSync(autoSource)) {
    console.log('[0/5] 生成口播文案...');
    try {
      const sourceText = fs.readFileSync(autoSource, 'utf8');
      const { generateScript } = require('./generate_script');
      const result = generateScript(config, sourceText, { voice, speed });
      config.scenes = result.scenes || config.scenes;
      console.log(`  ✓ 文案已生成 (${result.scenes ? result.scenes.length : 0} 场景)`);
    } catch (e) {
      console.warn(`  ⚠ 文案生成失败: ${e.message}`);
    }
  }
}

// ========== 多样性分配 (v0.6.0) ==========
const totalConfigDuration = scenes.reduce((a, s) => a + (s.duration || 0), 0);
const diversity = assignDiversity(config.scenes, totalConfigDuration, { skipFiller: config.skipFiller });
config.scenes = diversity.scenes;
console.log(`\n  多样性: ${diversity.stats.mode}模式 (${totalConfigDuration}s)`);
console.log(`  布局: ${diversity.stats.layouts.used}/${diversity.stats.layouts.target}, 动画: ${diversity.stats.animations.used}/${diversity.stats.animations.target}, FX: ${diversity.stats.fx.used}/${diversity.stats.fx.target}`);
const total = config.scenes.length;

if (outputDir === null) {
  outputDir = path.join(path.dirname(configPath), 'per-scene-output');
}
if (finalOutput === null) {
  finalOutput = path.join(outputDir, 'final.mp4');
}
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   Per-Scene 独立渲染  (html-ppt-to-video)  ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log(`  配置文件: ${configPath}`);
console.log(`  输出目录: ${outputDir}`);
console.log(`  场景数  : ${total}`);
console.log(`  BGM     : ${bgmPath || '无'}`);
console.log(`  音色    : ${voice} (+${speed}%)`);
console.log(`  FFmpeg  : ${FFMPEG}`);
console.log('');

// ========== 逐场景处理 ==========
const finalClips = [];

for (let i = 0; i < total; i++) {
  const scene = config.scenes[i];
  const sceneDir = path.join(outputDir, `scene_${String(i).padStart(2, '0')}`);
  const clipFile = path.join(sceneDir, 'clip.mp4');
  const ttsFile = path.join(sceneDir, `scene_${String(i).padStart(2, '0')}.mp3`);
  const finalClip = path.join(sceneDir, 'final.mp4');

  console.log('━'.repeat(52));
  console.log(`  场景 [${i + 1}/${total}]  ${scene.id}  (${scene.layout})`);
  console.log('━'.repeat(52));

  // ── Step 0: 创建输出目录 ──
  if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true });

  // ── Step 1: 生成 TTS（基准） ──
  console.log('  [1/4] 生成 TTS（基准）...');
  const sceneText = extractSceneText(scene);
  console.log(`        "${sceneText.substring(0, 40)}${sceneText.length > 40 ? '...' : ''}"`);

  const configDuration = scene.duration || 8;

  if (fs.existsSync(ttsFile)) {
    const existingDur = getDuration(ttsFile);
    if (existingDur > 0) {
      console.log(`        ℹ 已存在 TTS，跳过生成 (${existingDur.toFixed(1)}s)`);
    }
  } else {
    const { dur: ttsDur } = generateTTS(sceneText, ttsFile, voice, speed);
    console.log(`        ✓ ${ttsDur.toFixed(1)}s`);
  }

  const ttsDuration = getDuration(ttsFile);
  console.log(`        ℹ TTS ${ttsDuration.toFixed(1)}s → 视频将按此时长渲染`);

  // ── Step 2: 生成单场景 HTML ──
  console.log(`  [2/4] 生成 HTML (duration=${configDuration}s)...`);

  // 复制 canvas-fx.js
  const skillRoot = path.resolve(__dirname);
  const cfxCandidates = [
    path.join(skillRoot, 'canvas-fx.js'),
    path.join(skillRoot, 'html-ppt-skill', 'canvas-fx.js'),
    path.join(process.env.USERPROFILE || 'C:\\Users\\qianq', '.qclaw', 'skills', 'html-ppt-to-video', 'canvas-fx.js'),
  ];
  for (const cfxSrc of cfxCandidates) {
    if (fs.existsSync(cfxSrc)) {
      fs.copyFileSync(cfxSrc, path.join(sceneDir, 'canvas-fx.js'));
      break;
    }
  }

  try {
    const { html, duration } = generateSingleSceneHTML(scene, config.theme, config.width, config.height, { durationOverride: ttsDuration });
    const htmlFile = path.join(sceneDir, 'index.html');
    fs.writeFileSync(htmlFile, html, 'utf8');
    console.log(`        ✓ index.html (duration=${duration}s, TTS-override=${ttsDuration.toFixed(1)}s)`);

    // ========== [新增2] 注入字幕 GSAP (v0.6.0) ==========
    if (scene.data && scene.data.subtitle) {
      console.log(`        ℹ 注入字幕: "${scene.data.subtitle.substring(0, 30)}..."`);
      try {
        const { injectSubtitleGSAP } = require('./inject_subtitle_gsap');
        // v0.7.0：传入 ttsDuration + orientation，支持逐行时序+音画同步
        const orientation = (config.width > config.height) ? 'horizontal' : 'vertical';
        const updatedHtml = injectSubtitleGSAP(html, scene.data.subtitle, ttsDuration, orientation);
        fs.writeFileSync(htmlFile, updatedHtml, 'utf8');
        console.log(`        ✓ 字幕已注入`);
      } catch (e2) {
        console.warn(`        ⚠ 字幕注入失败: ${e2.message}`);
      }
    }
  } catch (err) {
    console.error(`        ✗ HTML生成失败: ${err.message}`);
    continue;
  }

  // ── Step 3: 渲染视频 ──
  console.log('  [3/4] 渲染视频...');
  if (fs.existsSync(clipFile)) {
    const dur = getDuration(clipFile);
    if (dur > 0) {
      console.log(`        ℹ 已存在，跳过渲染 (${dur.toFixed(1)}s)`);
    }
  }

  try {
    execSync(
      `npx hyperframes render "${sceneDir}" -o "${clipFile}" --fps 30 --quality draft --workers 1`,
      { encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe' }
    );
    const dur = getDuration(clipFile);
    const sizeMB = (fs.statSync(clipFile).size / 1024 / 1024).toFixed(2);
    console.log(`        ✓ clip.mp4 (${dur.toFixed(1)}s, ${sizeMB}MB)`);
  } catch (err) {
    if (fs.existsSync(clipFile) && getDuration(clipFile) > 0) {
      const dur = getDuration(clipFile);
      const sizeMB = (fs.statSync(clipFile).size / 1024 / 1024).toFixed(2);
      console.warn(`        ⚠ 渲染退出码非0，但文件已生成 (${dur.toFixed(1)}s, ${sizeMB}MB)`);
    } else {
      const stderr = err.stderr || '';
      const lastLine = stderr.split('\n').filter(Boolean).slice(-3).join(' | ');
      console.error(`        ✗ 渲染失败: ${lastLine || err.message.trim()}`);
      continue;
    }
  }

  // ── Step 4: 合并视频 + 配音 ──
  console.log('  [4/4] 合并音视频...');

  let audioToMerge = ttsFile;
  if (bgmPath && fs.existsSync(bgmPath)) {
    const mixedAudio = ttsFile.replace('.mp3', '_mixed.mp3');
    try {
      execSync(`"${FFMPEG}" -y -i "${ttsFile}" -i "${bgmPath}" ` +
        `-filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 0.12[aout]" ` +
        `-map "[aout]" -acodec libmp3lame -b:a 192k -shortest "${mixedAudio}"`, {
          encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
        });
      audioToMerge = mixedAudio;
    } catch (e) {
      console.warn(`        ⚠ BGM 混流失败: ${e.message.split('\n').slice(-1)[0]}`);
    }
  }

  try {
    execSync(`"${FFMPEG}" -y -i "${clipFile}" -i "${audioToMerge}" ` +
      `-c:v copy -c:a aac -b:a 192k "${finalClip}"`, {
        encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
      });
    const mergedSize = (fs.statSync(finalClip).size / 1024 / 1024).toFixed(2);
    const mergedDur = getDuration(finalClip);
    console.log(`        ✓ final.mp4 (${mergedDur.toFixed(1)}s, ${mergedSize}MB)`);
    finalClips.push(finalClip);
  } catch (err) {
    console.error(`        ✗ 合并失败: ${err.message.split('\n').slice(-1)[0]}`);
  }

  console.log('');
}

// ========== [新增3] 生成封面图 3:4 ==========
console.log('═'.repeat(52));
console.log('  生成封面图 3:4...');
const coverFile = path.join(outputDir, 'cover_3x4.jpg');
try {
  const { generateCover } = require('./generate_cover');
  generateCover(config, coverFile);
  console.log(`  ✓ 封面已生成: ${coverFile}`);
} catch (e) {
  console.warn(`  ⚠ 封面生成失败: ${e.message}`);
}

// ========== 拼接所有片段 ==========
if (finalClips.length === 0) {
  console.error('❌ 没有可拼接的片段');
  process.exit(1);
}

console.log('═'.repeat(52));
console.log(`  拼接 ${finalClips.length}/${total} 个片段...`);

try {
  concatClips(finalClips, finalOutput);
  const finalSize = (fs.statSync(finalOutput).size / 1024 / 1024).toFixed(2);
  const finalDur = getDuration(finalOutput);

  // ========== [新增4] 输出内容包 ==========
  console.log('');
  console.log('  输出内容包...');
  const pack = {
    source: {
      url: config.sourceUrl || '',
      title: config.title || '',
    },
    scripts: config.scenes.map((s, i) => ({
      scene: i + 1,
      script: (s.data && s.data.script) || '',
      subtitle: (s.data && s.data.subtitle) || '',
    })),
    titles: [
      config.title || '',
      (config.scenes[0] && config.scenes[0].data && config.scenes[0].data.title) || '',
    ],
    tags: (config.scenes[0] && config.scenes[0].data && config.scenes[0].data.tags) || ['#短视频', '#AI赋能', '#干货分享'],
    cover: coverFile,
    video: finalOutput,
  };

  const packFile = path.join(outputDir, 'content_pack.json');
  fs.writeFileSync(packFile, JSON.stringify(pack, null, 2), 'utf8');
  console.log(`  ✓ 内容包已输出: ${packFile}`);

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  ✅ 完成！                                     ║`);
  console.log(`║  输出: ${finalOutput}`);
  console.log(`║  大小: ${finalSize} MB`);
  console.log(`║  时长: ${finalDur.toFixed(1)}s`);
  console.log(`║  封面: ${coverFile}`);
  console.log(`║  内容包: ${packFile}`);
  console.log('╚══════════════════════════════════════════════╝');
} catch (err) {
  console.error(`\n❌ 拼接失败: ${err.message.split('\n').slice(-1)[0]}`);
  process.exit(1);
}
