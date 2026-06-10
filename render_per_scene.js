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

// ========== 【方案C-修复】配置验证：检查场景内容完整性 ==========
(function validateConfig() {
  const PLACEHOLDER_PATTERNS = /AI Video|31 layouts|Layouts: 31|100%|Full Coverage|v0\.9|Auto-Fill|html-ppt|3d|Done in 3m/i;
  let emptyCount = 0, placeholderCount = 0, goodCount = 0;
  for (const scene of scenes) {
    const d = scene.data || {};
    const str = JSON.stringify(d);
    if (!str || str === '{}' || str.length < 10) {
      emptyCount++;
    } else if (PLACEHOLDER_PATTERNS.test(str)) {
      placeholderCount++;
    } else {
      goodCount++;
    }
  }
  console.log('[render] Config validation: ' + scenes.length + ' scenes total');
  console.log('[render]   ✓ Real content: ' + goodCount + '  |  ⚠ Empty: ' + emptyCount + '  |  ⚠ Placeholder: ' + placeholderCount);
  if (placeholderCount > scenes.length * 0.3) {
    console.error('[render] ERROR: >30% scenes contain DEMO PLACEHOLDER data.');
    console.error('[render] The video will contain meaningless filler content (Layouts/FX charts etc).');
    console.error('[render] Root cause: parse_input.js likely failed to extract real article content.');
    console.error('[render] Fix: Check that OPENAI_API_KEY is set, or use --no-ai with real content.');
    console.error('[render] Stopping. Delete config.json and re-run parse_input.js with a valid API key.');
    process.exit(1);
  } else if (placeholderCount > 0 || emptyCount > 0) {
    console.warn('[render] WARNING: Some scenes have placeholder/empty data.');
    console.warn('[render] Fix: Set OPENAI_API_KEY env var for AI-powered content extraction.');
  } else {
    console.log('[render] Config validation PASSED: all scenes have real content.');
  }
})();

// ========== [v1.1.0] 口播文案生成（自然语言模式）==========
// 旧方案：模板拼接 narration（机械、不口语）
// 新方案：generate_spoken_script.js → AI生成整篇口播稿 → 按场景拆分 → narration
//
// 优先级：generate_spoken_script.js（有API Key时AI生成） > generate_narration.js（模板拼接） > 已有 narration
(function() {
  console.log('[0/5] 生成口播文案 (v1.1.0 自然语言模式)...');

  var nCount = 0;
  for (var si = 0; si < config.scenes.length; si++) {
    if (config.scenes[si].data && config.scenes[si].data.narration && config.scenes[si].data.narration.trim()) nCount++;
  }

  // 方案1：generate_spoken_script.js（AI自然语言生成，有 OPENAI_API_KEY 时）
  if (process.env.OPENAI_API_KEY && nCount < config.scenes.length * 0.5) {
    console.log('  [方案1] generate_spoken_script.js（AI生成整篇口播稿）...');
    try {
      var tmpOut = path.join(path.dirname(configPath), '.spoken_tmp.json');
      execSync('node "' + __dirname + '/generate_spoken_script.js" --config "' + configPath + '" --output "' + tmpOut + '"',
        { stdio: 'inherit', cwd: __dirname, shell: true }
      );
      if (fs.existsSync(tmpOut)) {
        var result = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
        fs.unlinkSync(tmpOut);
        if (result.sceneScripts) {
          for (var i = 0; i < config.scenes.length; i++) {
            if (result.sceneScripts[i]) {
              if (!config.scenes[i].data) config.scenes[i].data = {};
              config.scenes[i].data.narration = result.sceneScripts[i];
            }
          }
          config._fullScript = result.fullScript;
          config._scriptStats = result.stats;
          var fn = config.scenes.filter(function(s){ return s.data && s.data.narration && s.data.narration.trim(); }).length;
          console.log('  ✓ 口播稿已写入 narration: ' + fn + '/' + config.scenes.length + ' 场景');
          console.log('  ✓ 质量: ' + result.stats.quality + ' | 长句' + result.stats.longSentences + '句 | '
            + (result.stats.hasInteraction ? '有' : '无') + '互动结尾');
        }
      }
    } catch(e) {
      console.warn('  ⚠ AI生成失败: ' + e.message + ' → 回退到方案2');
    }
  }

  // 方案2：generate_narration.js（模板拼接，填充未填 narration 的场景）
  var n2c = 0;
  for (var sj = 0; sj < config.scenes.length; sj++) {
    if (config.scenes[sj].data && config.scenes[sj].data.narration && config.scenes[sj].data.narration.trim()) n2c++;
  }
  if (n2c < config.scenes.length) {
    console.log('  [方案2] generate_narration.js（模板拼接，' + n2c + '/' + config.scenes.length + '已有文案）...');
    try {
      var narPath = path.join(__dirname, 'generate_narration.js');
      if (fs.existsSync(narPath)) {
        var { generateNarration } = require(narPath);
        var nr = generateNarration(config, { voice: voice, speed: speed });
        if (nr.scenes) {
          for (var k = 0; k < nr.scenes.length; k++) {
            if (nr.scenes[k] && nr.scenes[k].data && nr.scenes[k].data.narration) {
              if (!config.scenes[k].data) config.scenes[k].data = {};
              config.scenes[k].data.narration = nr.scenes[k].data.narration;
            }
          }
        }
      }
    } catch(e2) {
      console.warn('  ⚠ 模板拼接失败: ' + e2.message);
    }
  }

  var fN = config.scenes.filter(function(s){ return s.data && s.data.narration && s.data.narration.trim(); }).length;
  console.log('  ✓ 口播文案完成: ' + fN + '/' + config.scenes.length + ' 场景');
  if (fN === 0) console.warn('  ⚠ 所有场景无口播文案，配音将使用 data.title');
})();



// ========== 多样性分配 (v0.6.0) ==========
const totalConfigDuration = scenes.reduce((a, s) => a + (s.duration || 0), 0);
const diversity = assignDiversity(config.scenes, totalConfigDuration, {});
config.scenes = diversity.scenes;

// [v0.9.5] 将多样性分配结果写回 config.json
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
console.log('  [render] 多样性分配结果已写回 config.json');
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

  // ========== [v1.0.0] 输出内容包 ==========
  console.log('');
  console.log('  输出内容包...');
  
  const packScript = path.join(__dirname, 'generate_content_pack.js');
  if (fs.existsSync(packScript)) {
    try {
      const packOutput = path.join(outputDir, 'content_pack.md');
      execSync(`node "${packScript}" --config "${path.resolve(configPath)}" --output "${packOutput}"`, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 10000
      });
      console.log(`  ✓ 内容包已输出: ${packOutput}`);
    } catch (e) {
      console.warn(`  ⚠ 内容包生成失败: ${e.message.split('\n').slice(-2)[0]}`);
    }
  } else {
    console.warn(`  ⚠ generate_content_pack.js 未找到，跳过内容包生成`);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  ✅ 完成！                                     ║`);
  console.log(`║  输出: ${finalOutput}`);
  console.log(`║  大小: ${finalSize} MB`);
  console.log(`║  时长: ${finalDur.toFixed(1)}s`);
  console.log(`║  封面: ${coverFile}`);
  console.log(`║  内容包: ${path.join(outputDir, 'content_pack.md')}`);
  console.log('╚══════════════════════════════════════════════╝');
} catch (err) {
  console.error(`\n❌ 拼接失败: ${err.message.split('\n').slice(-1)[0]}`);
  process.exit(1);
}
