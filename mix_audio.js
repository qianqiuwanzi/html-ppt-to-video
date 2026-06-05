#!/usr/bin/env node
/**
 * mix_audio.js - html-ppt-to-video 音频后期处理
 *
 * 功能（模块化）：
 *   1. 从场景配置提取文本，生成 TTS 配音（edge-tts）
 *   2. FFmpeg 拼接所有 TTS 片段
 *   3. FFmpeg 混流 TTS + BGM
 *   4. FFmpeg 合并视频 + 音频
 *
 * 用法:
 *   node mix_audio.js --config config.json --video video.mp4 --bgm bgm.mp3 --output final.mp4
 *   node mix_audio.js --config config.json --video video.mp4 --output final.mp4  (无BGM)
 *
 * 可导入:
 *   const { extractSceneText, generateTTS, mergeAudioClip } = require('./mix_audio');
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

// ========== 公开 API ==========
exports.FFMPEG = FFMPEG;
exports.FFPROBE = FFPROBE;

/**
 * 提取场景文本（从 scene 对象）
 */
function extractSceneText(scene) {
  const data = scene.data || {};
  const parts = [];

  if (data.kicker) parts.push(data.kicker);
  if (data.title) parts.push(data.title);
  if (data.sub) parts.push(data.sub);
  if (data.quote) parts.push(`"${data.quote}"`);
  if (data.url) parts.push(data.url);
  if (data.leftTitle) parts.push(data.leftTitle);
  if (data.rightTitle) parts.push(data.rightTitle);

  // Handle items array: distinguish structured (timeline) from flat strings
  if (Array.isArray(data.items) && data.items.length > 0) {
    const first = data.items[0];
    if (typeof first === 'object' && first !== null) {
      // Structured items (timeline, milestones) — extract .time + .text
      data.items.forEach(item => {
        if (item.time) parts.push(item.time);
        if (item.text) parts.push(item.text);
      });
    } else {
      // Flat string items
      parts.push(...data.items);
    }
  }
  if (Array.isArray(data.steps)) {
    data.steps.forEach(s => {
      if (s.num) parts.push(`第${s.num}步`);
      if (s.text) parts.push(s.text);
    });
  }
  if (Array.isArray(data.pros)) parts.push(...data.pros.map(p => '优点：' + p));
  if (Array.isArray(data.cons)) parts.push(...data.cons.map(c => '缺点：' + c));
  if (Array.isArray(data.kpis)) {
    data.kpis.forEach(k => parts.push(`${k.num}，${k.label}`));
  }
  if (Array.isArray(data.tags)) parts.push(data.tags.join('，'));

  return parts.join('。').trim() || `第${scene.id}页`;
}
exports.extractSceneText = extractSceneText;

/**
 * 获取音频文件时长
 */
function getDuration(file) {
  if (!fs.existsSync(file)) return 0;
  try {
    const out = execSync(`"${FFPROBE}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`, {
      encoding: 'utf8', shell: 'cmd.exe', stdio: ['pipe', 'pipe', 'pipe']
    });
    return parseFloat(out.trim());
  } catch (e) {
    return 0;
  }
}
exports.getDuration = getDuration;

/**
 * 生成单个场景的 TTS（返回实际音频文件路径和时长）
 * @param {string} text - 要配音的文本
 * @param {string} ttsFile - 输出 MP3 路径
 * @param {string} voice - edge-tts 音色名
 * @param {number} speed - 语速百分比（默认 20）
 * @returns {{ file: string, dur: number }}
 */
function generateTTS(text, ttsFile, voice = 'zh-CN-YunjianNeural', speed = 20) {
  if (fs.existsSync(ttsFile)) {
    const dur = getDuration(ttsFile);
    if (dur > 0) return { file: ttsFile, dur };
  }

  const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ').trim();
  if (!safeText) {
    execSync(`"${FFMPEG}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t 2 "${ttsFile}"`, { stdio: 'pipe' });
    return { file: ttsFile, dur: 2.0 };
  }

  try {
    const rateArg = speed >= 0 ? `+${speed}%` : `${speed}%`;
    const cmd = `python -m edge_tts --voice ${voice} --rate=${rateArg} --text "${safeText}" --write-media "${ttsFile}"`;
    execSync(cmd, { encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe' });

    // 等待文件写入
    let retries = 0;
    while (!fs.existsSync(ttsFile) && retries < 10) {
      execSync('timeout /t 1 /nobreak > nul', { stdio: 'pipe', shell: 'cmd.exe' });
      retries++;
    }

    const dur = getDuration(ttsFile) || 5;
    return { file: ttsFile, dur };
  } catch (err) {
    console.error(`  [TTS ERROR] ${err.message.split('\n').slice(-1)[0]}`);
    const dur = 3;
    execSync(`"${FFMPEG}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${dur} "${ttsFile}"`, { stdio: 'pipe' });
    return { file: ttsFile, dur };
  }
}
exports.generateTTS = generateTTS;

/**
 * 合并单个视频片段 + 配音 → 输出文件
 * @param {string} videoFile - 输入视频（无声）
 * @param {string} ttsFile - 输入配音 MP3
 * @param {string} outputFile - 输出 MP4
 * @param {string} bgmFile - 可选 BGM MP3
 * @param {number} targetDuration - 目标时长（与视频一致）
 */
function mergeAudioClip(videoFile, ttsFile, outputFile, bgmFile, targetDuration) {
  const ttsDur = getDuration(ttsFile);
  const vidDur = getDuration(videoFile);

  let audioToMerge = ttsFile;

  // 如果 TTS 比目标时长长，裁剪并加渐出
  if (ttsDur > targetDuration + 0.1) {
    const fadeStart = Math.max(0, targetDuration - 0.5);
    const trimmed = ttsFile.replace('.mp3', '_trimmed.mp3');
    try {
      execSync(`"${FFMPEG}" -y -i "${ttsFile}" ` +
        `-af "afade=t=out:st=${fadeStart.toFixed(2)}:d=0.5" ` +
        `-t ${targetDuration.toFixed(2)} -acodec libmp3lame -b:a 192k "${trimmed}"`, {
          encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
        });
      audioToMerge = trimmed;
    } catch (e) {
      console.warn(`  [WARN] TTS 裁剪失败，使用原音频: ${e.message.split('\n').slice(-1)[0]}`);
    }
  }

  // 混流 BGM
  if (bgmFile && fs.existsSync(bgmFile)) {
    const mixed = ttsFile.replace('.mp3', '_mixed.mp3');
    try {
      execSync(`"${FFMPEG}" -y -i "${audioToMerge}" -i "${bgmFile}" ` +
        `-filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 0.12[aout]" ` +
        `-map "[aout]" -acodec libmp3lame -b:a 192k -shortest "${mixed}"`, {
          encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
        });
      audioToMerge = mixed;
    } catch (e) {
      console.warn(`  [WARN] BGM 混流失败，使用无BGM配音: ${e.message.split('\n').slice(-1)[0]}`);
    }
  }

  // 合并视频 + 音频
  execSync(`"${FFMPEG}" -y -i "${videoFile}" -i "${audioToMerge}" ` +
    `-c:v copy -c:a aac -b:a 192k -shortest "${outputFile}"`, {
      encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
    });
}
exports.mergeAudioClip = mergeAudioClip;

/**
 * FFmpeg concat 拼接多个 MP4 文件
 * @param {string[]} clipFiles - 片段文件路径数组
 * @param {string} outputFile - 合并输出路径
 */
function concatClips(clipFiles, outputFile) {
  const tmpDir = path.dirname(outputFile);
  const listFile = path.join(tmpDir, '_concat_list.txt');
  const list = clipFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listFile, list, 'utf8');
  execSync(`"${FFMPEG}" -y -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}"`, {
    encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
  });
  fs.unlinkSync(listFile);
}
exports.concatClips = concatClips;

// ========== CLI 主程序（完整流程） ==========
function mainCLI() {
  const args = process.argv.slice(2);
  let configPath = null, videoPath = null, bgmPath = null, outputPath = null;
  let voice = 'zh-CN-YunjianNeural', speed = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') configPath = args[++i];
    else if (args[i] === '--video') videoPath = args[++i];
    else if (args[i] === '--bgm') bgmPath = args[++i];
    else if (args[i] === '--output') outputPath = args[++i];
    else if (args[i] === '--voice') voice = args[++i];
    else if (args[i] === '--speed') speed = parseInt(args[++i]);
  }

  if (!configPath || !videoPath) {
    console.log('用法: node mix_audio.js --config config.json --video video.mp4 [--bgm bgm.mp3] --output final.mp4');
    process.exit(1);
  }
  if (!outputPath) outputPath = videoPath.replace('.mp4', '_with_audio.mp4');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const scenes = config.scenes || [];
  const ttsOutputDir = path.join(path.dirname(videoPath), 'tts_audio');
  if (!fs.existsSync(ttsOutputDir)) fs.mkdirSync(ttsOutputDir, { recursive: true });

  console.log(`FFmpeg: ${FFMPEG}`);
  console.log(`Voice: ${voice} | Speed: +${speed}%`);
  console.log('');

  // 生成所有 TTS
  console.log('=== [1/4] 生成 TTS ===');
  const ttsFiles = [];
  let currentTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneText = extractSceneText(scene);
    const ttsFile = path.join(ttsOutputDir, `scene_${String(i + 1).padStart(2, '0')}.mp3`);
    console.log(`  [${i + 1}] ${sceneText.substring(0, 30)}...`);
    const { file, dur } = generateTTS(sceneText, ttsFile, voice, speed);
    ttsFiles.push({ file, start: currentTime, end: currentTime + dur, dur });
    currentTime += dur;
    console.log(`         ✓ ${dur.toFixed(1)}s`);
  }

  console.log(`  总计: ${currentTime.toFixed(1)}s`);

  // 拼接 TTS
  console.log('\n=== [2/4] 拼接 TTS ===');
  const concatListFile = path.join(ttsOutputDir, 'concat_list.txt');
  fs.writeFileSync(concatListFile, ttsFiles.map(t => `file '${t.file.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const combinedTts = path.join(ttsOutputDir, 'combined_tts.mp3');
  execSync(`"${FFMPEG}" -y -f concat -safe 0 -i "${concatListFile}" -acodec libmp3lame -b:a 192k "${combinedTts}"`, {
    encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
  });
  console.log(`  ✓ combined_tts.mp3 (${getDuration(combinedTts).toFixed(1)}s)`);

  // 混流 BGM
  console.log('\n=== [3/4] 混流 TTS + BGM ===');
  const finalAudio = path.join(ttsOutputDir, 'final_audio.mp3');
  if (bgmPath && fs.existsSync(bgmPath)) {
    execSync(`"${FFMPEG}" -y -i "${combinedTts}" -i "${bgmPath}" ` +
      `-filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 0.12[aout]" ` +
      `-map "[aout]" -acodec libmp3lame -b:a 192k -shortest "${finalAudio}"`, {
        encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
      });
    console.log(`  ✓ BGM 混流完成`);
  } else {
    fs.copyFileSync(combinedTts, finalAudio);
    console.log(`  ℹ 无 BGM`);
  }

  // 合并视频 + 音频
  console.log('\n=== [4/4] 合并视频 + 音频 ===');
  const videoDur = getDuration(videoPath);
  const audioDur = getDuration(finalAudio);
  let audioToMerge = finalAudio;

  if (audioDur > videoDur + 0.5) {
    const fadeStart = Math.max(0, videoDur - 0.5);
    const trimmedAudio = path.join(ttsOutputDir, 'trimmed_tts.mp3');
    execSync(`"${FFMPEG}" -y -i "${finalAudio}" ` +
      `-af "afade=t=out:st=${fadeStart.toFixed(2)}:d=0.5" ` +
      `-t ${videoDur.toFixed(2)} -acodec libmp3lame -b:a 192k "${trimmedAudio}"`, {
        encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
      });
    audioToMerge = trimmedAudio;
  }

  execSync(`"${FFMPEG}" -y -i "${videoPath}" -i "${audioToMerge}" ` +
    `-c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`, {
      encoding: 'utf8', shell: 'cmd.exe', stdio: 'pipe'
    });

  const finalSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  const finalDur = getDuration(outputPath).toFixed(1);
  console.log(`\n=== ✅ 完成 ===`);
  console.log(`  输出: ${outputPath}`);
  console.log(`  大小: ${finalSize} MB | 时长: ${finalDur}s`);
}

if (require.main === module) mainCLI();
