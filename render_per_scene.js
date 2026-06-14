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
let sourceFile = null, voice = 'zh-CN-YunjianNeural', speed = 20, noDiversity = false;
let inputType = 'text'; // text | url | file — 默认 text 禁止修改文案

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config') configPath = args[++i];
  else if (args[i] === '--bgm') bgmPath = args[++i];
  else if (args[i] === '--output-dir') outputDir = args[++i];
  else if (args[i] === '--output') finalOutput = args[++i];
  else if (args[i] === '--source') sourceFile = args[++i];
  else if (args[i] === '--voice') voice = args[++i];
  else if (args[i] === '--speed') speed = parseInt(args[++i]);
  else if (args[i] === '--no-diversity') noDiversity = true;
  else if (args[i] === '--input-type') inputType = args[++i];
}

if (!configPath) {
  console.log('用法: node render_per_scene.js --config config.json [--source source_content.txt] [--bgm bgm.mp3] [--output-dir output/] [--output final.mp4]');
  process.exit(1);
}

// ========== 加载配置 ==========
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const scenes = config.scenes || [];

// ========== 输入类型检测 ==========
// 优先级: CLI --input-type > config._inputType > 'text'（安全默认）
const resolvedInputType = inputType || config._inputType || 'text';
// 持久化输入类型到 config，后续重渲染也能保留
config._inputType = resolvedInputType;
console.log('[render] 输入类型: ' + resolvedInputType + (resolvedInputType === 'text' ? ' → 原文案模式（禁止AI修改）' : ''));

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

// ========== [v2.0.0] 口播文案生成（输入类型感知模式）=========
//
// v2.0.0 重构：根据输入类型决定是否生成口播稿
//   text 类型 → 直接使用用户提供的原文案，禁止任何修改
//   url/file 类型 → 使用 generate_spoken_script.js 进行 AI 提炼
//
// 优先级：inputType==='text'（跳过） > 已有 narration > AI 生成
(function() {
  if (resolvedInputType === 'text') {
    // 🔴 v2.0.0 强制规则：纯文本/文案输入 → 直接作为口播稿，禁止 AI 修改
    var textCount = 0;
    for (var st = 0; st < config.scenes.length; st++) {
      if (config.scenes[st].data && config.scenes[st].data.narration && config.scenes[st].data.narration.trim()) {
        textCount++;
      }
    }
    console.log('[0/5] 口播文案: 输入类型=text, 跳过AI生成');
    console.log('  ✓ 使用用户原文案: ' + textCount + '/' + config.scenes.length + ' 场景');
    if (textCount === 0) {
      console.warn('  ⚠ 所有场景无 narration（用户未提供文案），将使用 data.title 作为配音');
    }
    return; // ← 完全跳过下方 AI 生成逻辑
  }

  // --- 以下仅对 url/file 输入类型执行 ---
  console.log('[0/5] 生成口播文案 (v2.0.0 输入类型=' + resolvedInputType + ')...');

  var nCount = 0;
  for (var si = 0; si < config.scenes.length; si++) {
    if (config.scenes[si].data && config.scenes[si].data.narration && config.scenes[si].data.narration.trim()) nCount++;
  }

  // 如果所有场景已有完整 narration，跳过
  if (nCount >= config.scenes.length) {
    console.log('  ✓ 所有场景已有 narration, 跳过 AI 生成');
    return;
  }

  // generate_spoken_script.js（AI自然语言生成，使用 QClaw 本地网关）
  console.log('  [AI] generate_spoken_script.js（生成整篇口播稿）...');
  try {
    var tmpOut = path.join(path.dirname(configPath), '.spoken_tmp.json');
    var absConfigPath = path.resolve(configPath);
    execSync('node "' + __dirname + '/generate_spoken_script.js" --config "' + absConfigPath + '" --output "' + tmpOut + '"',
      { stdio: 'inherit', cwd: path.dirname(absConfigPath), shell: true }
    );
    if (fs.existsSync(tmpOut)) {
      var result = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
      fs.unlinkSync(tmpOut);
      if (result.sceneScripts) {
        for (var i = 0; i < config.scenes.length; i++) {
          if (result.sceneScripts[i]) {
            if (!config.scenes[i].data) config.scenes[i].data = {};
            config.scenes[i].data.narration = result.sceneScripts[i];
            config.scenes[i].data.subtitle = result.sceneScripts[i];
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
    console.warn('  ⚠ AI生成失败: ' + e.message);
  }

  var fN = config.scenes.filter(function(s){ return s.data && s.data.narration && s.data.narration.trim(); }).length;
  console.log('  ✓ 口播文案完成: ' + fN + '/' + config.scenes.length + ' 场景');
  if (fN === 0) console.warn('  ⚠ 所有场景无口播文案，配音将使用 data.title');
})();



// ========== 多样性分配 (v0.6.0) ==========
if (noDiversity) {
  console.log('  [diversity] 跳过 (--no-diversity), 使用原始场景数: ' + config.scenes.length);
} else {
const totalConfigDuration = scenes.reduce((a, s) => a + (s.duration || 0), 0);
const diversity = assignDiversity(config.scenes, totalConfigDuration, {});
config.scenes = diversity.scenes;

// [v0.9.5] 将多样性分配结果写回 config.json
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
console.log('  [render] 多样性分配结果已写回 config.json');
console.log(`\n  多样性: ${diversity.stats.mode}模式 (${totalConfigDuration}s)`);
console.log(`  布局: ${diversity.stats.layouts.used}/${diversity.stats.layouts.target}, 动画: ${diversity.stats.animations.used}/${diversity.stats.animations.target}, FX: ${diversity.stats.fx.used}/${diversity.stats.fx.target}`);
} // end if noDiversity
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

  try {
    execSync(`"${FFMPEG}" -y -i "${clipFile}" -i "${ttsFile}" ` +
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

// ========== [v1.0.0] 输出内容包（独立于拼接，放在try之外确保总是执行） ==========
(function generateContentPack() {
  const packScript = path.join(__dirname, 'generate_content_pack.js');
  const packOutput = path.join(outputDir, 'content_pack.md');
  if (!fs.existsSync(packScript)) {
    console.warn('  ⚠ generate_content_pack.js 未找到，跳过内容包');
    return;
  }
  try {
    execSync(`node "${packScript}" --config "${path.resolve(configPath)}" --output "${packOutput}"`, {
      stdio: 'pipe', encoding: 'utf8', timeout: 15000,
      cwd: path.dirname(path.resolve(configPath))
    });
    console.log(`  ✓ 内容包已输出: ${packOutput}`);
  } catch (e) {
    console.warn(`  ⚠ 内容包生成失败: ${e.message.split('\n').slice(-2)[0]}`);
  }
})();

// ========== 拼接（独立try-catch，不再阻塞后续步骤） ==========
console.log('═'.repeat(52));
console.log(`  拼接 ${finalClips.length}/${total} 个片段...`);

let concatSuccess = false;
try {
  concatClips(finalClips, finalOutput);
  const finalSize = (fs.statSync(finalOutput).size / 1024 / 1024).toFixed(2);
  const finalDur = getDuration(finalOutput);
  concatSuccess = true;

  if (concatSuccess) {

  // ========== BGM 混音（依赖 concat 产物） ==========
  const bgmConfig = config.bgm || {};
  const bgmStyle = bgmConfig.style || 'tech-corporate';
  const bgmMood = bgmConfig.mood || 'ambient';
  const bgmVolume = bgmConfig.volume || 0.3;
  const bgmFadeIn = bgmConfig.fadeIn || 2.0;
  const bgmFadeOut = bgmConfig.fadeOut || 3.0;
  const finalWithBgm = finalOutput.replace('.mp4', '_with_bgm.mp4');

  // 优先用 --bgm 参数指定的文件，否则用 add_bgm.py 随机选曲
  if (bgmPath && fs.existsSync(bgmPath)) {
    // 方式1：直接指定 BGM 文件
    console.log(`\n  添加 BGM（指定文件）: ${path.basename(bgmPath)}`);
    try {
      // 获取视频时长用于淡出
      let fadeOutStart = Math.max(0, finalDur - bgmFadeOut);
      execSync(`"${FFMPEG}" -y -i "${finalOutput}" -i "${bgmPath}" ` +
        `-filter_complex "[1:a]volume=${bgmVolume},afade=type=in:st=0:d=${bgmFadeIn},afade=type=out:st=${fadeOutStart}:d=${bgmFadeOut}[BGM];[0:a][BGM]amix=inputs=2:duration=first:normalize=0[mixed]" ` +
        `-map 0:v -map "[mixed]" -c:v copy -c:a aac -b:a 192k "${finalWithBgm}"`, {
        encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
      });
      console.log(`  ✓ BGM 混音完成: ${finalWithBgm}`);
      // 用含BGM版本替换final
      try { fs.renameSync(finalWithBgm, finalOutput); } catch(e) { /* 保留两个文件 */ }
    } catch (e) {
      console.warn(`  ⚠ BGM 混音失败: ${e.message.split('\n').slice(-1)[0]}`);
    }
  } else {
    // 方式2：通过 add_bgm.py 随机选曲
    const addBgmScript = path.join(
      process.env.USERPROFILE || '~',
      '.qclaw', 'skills', 'bgm-library', 'scripts', 'add_bgm.py'
    );
    if (fs.existsSync(addBgmScript)) {
      console.log(`\n  添加 BGM（随机选曲: ${bgmStyle}/${bgmMood}）...`);
      try {
        execSync(`python "${addBgmScript}" --input "${finalOutput}" --output "${finalWithBgm}" ` +
          `--style ${bgmStyle} --mood ${bgmMood} --volume ${bgmVolume} ` +
          `--fade-in ${bgmFadeIn} --fade-out ${bgmFadeOut}`, {
          encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe', timeout: 300
        });
        console.log(`  ✓ BGM 混音完成: ${finalWithBgm}`);
        // 用含BGM版本替换final
        try { fs.renameSync(finalWithBgm, finalOutput); } catch(e) { /* 保留两个文件 */ }
      } catch (e) {
        console.warn(`  ⚠ BGM 混音失败: ${e.message.split('\n').slice(-1)[0]}`);
        console.warn(`  → 视频无BGM，但可正常播放`);
      }
    } else {
      console.log(`\n  ⚠ add_bgm.py 未找到，跳过 BGM 混音`);
      console.log(`    安装 bgm-library 技能即可自动添加 BGM`);
    }
  }

  } // end if concatSuccess

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  ${concatSuccess ? '✅ 完成！' : '⚠️  拼接未完成'}`);
  console.log(`║  输出: ${finalOutput}`);
  try {
    const finalSizeNow = (fs.statSync(finalOutput).size / 1024 / 1024).toFixed(2);
    console.log(`║  大小: ${finalSizeNow} MB`);
    const finalDur2 = getDuration(finalOutput);
    console.log(`║  时长: ${finalDur2.toFixed(1)}s`);
  } catch(e) { console.log(`║  大小/时长: 未知`); }
  console.log(`║  封面: ${coverFile}`);
  console.log(`║  内容包: ${path.join(outputDir, 'content_pack.md')}`);
  console.log('╚══════════════════════════════════════════════╝');
} catch (err) {
  console.error(`\n❌ 拼接失败: ${err.message.split('\n').slice(-1)[0]}`);
  // 不 exit(1)，内容包和摘要仍已输出
}
