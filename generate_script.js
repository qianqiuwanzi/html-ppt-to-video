#!/usr/bin/env node
/**
 * generate_script.js — 口播文案生成器 (v0.7.0)
 *
 * 输入：scenes 数组 + 原文内容
 * 输出：更新后的 scenes（每个 scene.data.script = 口播文案，data.subtitle = 字幕文本）
 *
 * v0.7.0 改造：移除 OpenAI API 依赖，改从本地文件读取预生成文案
 * - 单人工作流：AI 生成文案 → 写入 script_prompts/<sceneId>.txt
 * - 批量工作流：--batch 模式，从 script_prompts/ 目录读取所有文案并写入 config.json
 *
 * 口播文案要求：
 * - 抖音爆款口播结构：Hook（前3秒抓眼球）→ 痛点 → 方案 → CTA
 * - 长短句结合，符合人类语言习惯（不用书面语）
 * - 有深度知识讲解，也有情绪化的主观观点表达
 * - 不用念稿感，像真人对着镜头说话
 *
 * Usage:
 *   # 批量模式：从 script_prompts/ 读取文案，写入 config.json
 *   node generate_script.js --config config.json --batch script_prompts/
 *
 *   # 提示模式：生成每个场景的 Prompt，供 AI 使用（输出到 stdout）
 *   node generate_script.js --config config.json --prompt-only
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ===== 为单个场景生成 Prompt（供 AI 使用）=====
function genScenePrompt(scene, sceneIndex, totalScenes, sourceText) {
  const layout = scene.layout || 'bullets';
  const data = scene.data || {};
  const isFirst = sceneIndex === 0;
  const isLast = sceneIndex === totalScenes - 1;
  const duration = scene.duration || 8;

  const originalText = [
    data.kicker || '',
    data.title || '',
    (data.items || []).join('。') || '',
    data.quote || '',
    data.subtitle || '',
  ].filter(Boolean).join('。');

  return `你是一个抖音爆款短视频文案高手。请为以下场景写口播文案。

## 场景信息
- 场景类型：${layout}
- 场景位置：第 ${sceneIndex + 1}/${totalScenes} 个场景
- 目标时长：约 ${duration} 秒（≈ ${Math.round(duration * 4)} 字）
- ${isFirst ? '【这是开头场景】前3秒必须抓眼球！用悬念/反问/惊人数据开头' : ''}
- ${isLast ? '【这是结尾场景】要有力，引导关注/评论/收藏' : ''}

## 当前场景原始内容（参考用，不要照抄）
${originalText}

## 文案要求（必须遵守）
1. **🔴 强制约束：必须有3句>15字的长句**
   - 符合正常人类写作习惯，允许部分句子略长以表达完整意思
   - 至少有3句超过15字（含标点），其余句子≤15字
   - 示例：✅ "DeepSeek这波降价真的把我震惊到了"（17字） ❌ "每句都≤15字"（像机器人）
   - 生成规则：长句用于表达复杂观点，短句用于节奏感

2. **开头三句结构（必须包含）**
   | 句次 | 必须包含 | 示例 |
   |------|---------|------|
   | **第一句** | 核心问题或痛点 | "自媒体人最头疼的就是内容创作效率" |
   | **第二句** | 解决方案(产品名) | "有了美图 RoboNeo,一个人搞定一个团队" |
   | **第三句** | 核心价值 | "AI自动生成内容,速度快10倍" |

   ❌ 禁止无意义寒暄（"说实话"、"讲真"仅必要时用）

3. **8段式结构（全流程）**
   | # | 阶段 | 内容 |
   |---|------|------|
   | 1 | 钩子开头 | 直接点明主题/问题 |
   | 2 | 产品引入 | "有了XX,YY变简单" |
   | 3 | 核心价值 | "效果Z,效率提升N倍" |
   | 4 | 卖点展开 | 逐条说明产品能力 |
   | 5 | 社会证明 | 数据/用户量支撑 |
   | 6 | 使用感受 | "用了X,我真香了" |
   | 7 | 行动引导 | "一行命令就能跑起来" |
   | 8 | 互动结尾 | "你更看重哪个?评论区告诉我" |

   **必须包含**: 直接点明主题 + 产品名/品牌名 + 主观观点 + 专业词通俗化 + 对比吐槽 + 互动钩子
   **禁止**: 无意义寒暄 / 说明书式 / 空洞口号 / 没有感情的陈述句 / 没有互动的结尾

4. **互动结尾模板（必选其一）**
   - 选择题型:"你更看重{A}还是{B}?评论区告诉我 👇"
   - 场景提问型:"你们团队用什么{场景}?求推荐 👀"
   - 钩子型:"关注我,每天带你发现一个{主题} 🔔"

5. **口播感**：像真人对着镜头说话，不用书面语，不用"综上所述"这类表达
6. **长短句结合**：有短句（3-5字）制造节奏，有长句（15-20字）讲清楚
7. **情绪化表达**：加入主观观点，用"我觉得/说实话/真的是"等口语化表达
8. **知识密度**：每20-30字有一个知识点/洞察，不要废话
9. **禁用书面语**：不用"首先/其次/最后"，改为"对了/还有/另外"
10. **字数控制**：约 ${Math.round(duration * 3.5)}-${Math.round(duration * 4.5)} 字（按正常语速 3.5-4.5 字/秒）

## 输出格式
只输出口播文案，不要解释，不要标注[语气X]，纯文本。
如果这是字幕需要拆分的场景，在合适位置用 |\n 分隔（每行不超过14字，适合竖屏显示）。`;
}

// ===== 从 script_prompts/ 目录读取文案并写入 config =====
function batchApply(config, promptsDir) {
  const scenes = config.scenes || [];
  if (!fs.existsSync(promptsDir)) {
    console.error('提示目录不存在:', promptsDir);
    process.exit(1);
  }

  let ok = 0;
  for (const scene of scenes) {
    if (!scene.data) scene.data = {};
    const scriptFile = path.join(promptsDir, `${scene.id}.script.txt`);
    const subtitleFile = path.join(promptsDir, `${scene.id}.subtitle.txt`);

    if (fs.existsSync(scriptFile)) {
      scene.data.script = fs.readFileSync(scriptFile, 'utf8').trim();
      ok++;
      console.log(`  ✓ ${scene.id}: 读取口播文案 (${scene.data.script.length}字)`);
    } else {
      console.log(`  ✗ ${scene.id}: 未找到 ${scriptFile}`);
    }

    if (fs.existsSync(subtitleFile)) {
      scene.data.subtitle = fs.readFileSync(subtitleFile, 'utf8').trim();
    } else {
      // 自动从 script 生成 subtitle（每行14字，用 |\n 分隔）
      scene.data.subtitle = scene.data.script.replace(/(.{10,14})\s/g, '$1|\n').trim();
    }
  }

  console.log(`\n✓ 已应用 ${ok}/${scenes.length} 个场景的文案`);
  return config;
}

// ===== 生成所有场景的 Prompt（输出到 stdout 或文件）=====
function generatePrompts(config, outputDir) {
  const scenes = config.scenes || [];
  const total = scenes.length;

  if (outputDir) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let i = 0; i < total; i++) {
    const scene = scenes[i];
    const prompt = genScenePrompt(scene, i, total, '');

    if (outputDir) {
      const f = path.join(outputDir, `${scene.id}.prompt.txt`);
      fs.writeFileSync(f, prompt, 'utf8');
      console.log(`  ✓ ${scene.id}.prompt.txt`);
    } else {
      console.log(`\n===== ${scene.id} (${scene.layout}) =====\n`);
      console.log(prompt);
      console.log('\n');
    }
  }

  if (outputDir) {
    console.log(`\n✓ 已生成 ${total} 个 Prompt → ${outputDir}/`);
    console.log('请让 AI 根据每个 prompt 生成口播文案，保存到：');
    console.log(`  ${outputDir}/${scenes[0].id}.script.txt`);
    console.log(`  ${outputDir}/${scenes[0].id}.subtitle.txt`);
    console.log('然后运行：');
    console.log(`  node generate_script.js --config config.json --batch ${outputDir}`);
  }
}

// ===== 主函数 =====
function generateScript(config, sourceText, options = {}) {
  // v0.7.0: 保留原函数签名以兼容，但实际改用 batch 模式
  console.log('警告：generateScript() 已废弃，请使用 --batch 模式');
  return config;
}

// ===== CLI =====
if (require.main === module) {
  (() => {
    const args = process.argv.slice(2);
    let configPath = null, batchDir = null, promptOutputDir = null;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--config') configPath = args[++i];
      else if (args[i] === '--batch') batchDir = args[++i];
      else if (args[i] === '--prompt-only') promptOutputDir = args[++i] || 'script_prompts';
      else if (args[i] === '--help' || args[i] === '-h') {
        console.log('Usage:');
        console.log('  node generate_script.js --config config.json --prompt-only [output_dir]');
        console.log('    → 生成所有场景的 Prompt（供 AI 使用）');
        console.log('');
        console.log('  node generate_script.js --config config.json --batch prompts_dir');
        console.log('    → 从 prompts_dir 读取文案，写入 config.json');
        process.exit(0);
      }
    }

    if (!configPath || !fs.existsSync(configPath)) {
      console.error('用法: node generate_script.js --config config.json --prompt-only');
      console.error('  或: node generate_script.js --config config.json --batch script_prompts/');
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (batchDir) {
      // 批量模式：从 script_prompts/ 读取文案
      const result = batchApply(config, batchDir);
      fs.writeFileSync(configPath, JSON.stringify(result, null, 2), 'utf8');
      console.log(`\n✓ 配置已更新: ${configPath}`);
    } else {
      // Prompt 模式：生成 Prompt 供 AI 使用
      generatePrompts(config, promptOutputDir);
    }
  })();
}

module.exports = { generateScript, genScenePrompt, batchApply };
