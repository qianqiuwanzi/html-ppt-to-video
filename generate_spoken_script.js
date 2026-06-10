#!/usr/bin/env node
/**
 * generate_spoken_script.js — v1.1.0
 * 
 * 彻底重新设计文案生成方案：
 * 从"模板拼接"改为"自然语言生成"。
 * 
 * 流程：
 *   旧方案：scenes → 模板拼接 narration → 输出（机械、不口语）
 *   新方案：scenes → AI生成整篇口播稿 → 按场景时长拆分 → 输出（自然、流畅）
 * 
 * 使用方式：
 *   node generate_spoken_script.js --config config.json [--output script.json]
 * 
 * 输出：
 *   {
 *     "fullScript": "整篇口播稿（自然对话式）",
 *     "sceneScripts": ["场景1口播", "场景2口播", ...],
 *     "stats": { "totalChars": N, "longSentences": N, "hasInteraction": true }
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============ CLI ============
const argv = require('minimist')(process.argv.slice(2));
const configPath = argv.config || 'config.json';
const outputPath = argv.output || null;
const openaiApiKey = process.env.OPENAI_API_KEY || '';

// ============ 核心函数 ============

/**
 * 主函数：生成整篇口播稿
 */
async function main() {
  console.log('🎙️  口播稿生成器 v1.1.0（自然语言生成模式）\n');

  // 1. 加载配置
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const scenes = config.scenes || [];

  // 2. 准备素材上下文（所有场景的结构化数据）
  const context = buildContext(config, scenes);

  // 3. 调用 AI 生成整篇口播稿
  const fullScript = await generateFullScript(context, openaiApiKey);

  // 4. 按场景时长拆分口播稿
  const sceneScripts = splitByScenes(fullScript, scenes);

  // 5. 统计验证
  const stats = validateScript(fullScript, sceneScripts);

  // 6. 输出
  const result = { fullScript, sceneScripts, stats, generatedAt: new Date().toISOString() };

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n✅ 口播稿已保存: ${outputPath}`);
  }

  // 7. 打印摘要
  printSummary(result, scenes);

  return result;
}

/**
 * 构建 AI 所需的素材上下文
 */
function buildContext(config, scenes) {
  const title = config.title || '未命名';
  const theme = config.theme || 'tokyo-night';

  // 提取所有场景的关键信息（供 AI 参考）
  const sceneSummaries = scenes.map((s, i) => {
    const layout = s.layout || 'unknown';
    const duration = s.duration || 5;
    const data = s.data || {};

    // 提取该场景的关键文本内容
    const texts = extractSceneTexts(data, layout);

    return {
      index: i + 1,
      id: s.id || `s${i + 1}`,
      layout,
      duration: `${duration}s`,
      content: texts.length > 0 ? texts.join(' | ') : '(视觉场景，无文字)',
    };
  });

  return {
    title,
    theme,
    totalScenes: scenes.length,
    totalDuration: scenes.reduce((sum, s) => sum + (s.duration || 5), 0),
    sourceUrl: config.sourceUrl || '',
    sceneSummaries,
  };
}

/**
 * 从场景 data 字段提取所有文本内容
 */
function extractSceneTexts(data, layout) {
  const texts = [];

  function add(val) {
    if (typeof val === 'string' && val.trim()) texts.push(val.trim());
    if (typeof val === 'number') texts.push(String(val));
  }

  // 通用字段
  ['title', 'kicker', 'subtitle', 'quote', 'text', 'big', 'value', 'label', 'desc', 'sub'].forEach(k => add(data[k]));

  // 列表字段
  ['items', 'pros', 'cons', 'steps', 'commands'].forEach(k => {
    if (Array.isArray(data[k])) data[k].forEach(it => {
      if (typeof it === 'string') add(it);
      if (typeof it === 'object') {
        add(it.title); add(it.label); add(it.desc); add(it.text);
      }
    });
  });

  // 双栏/三栏
  ['left', 'right', 'cols'].forEach(k => {
    if (data[k]) {
      if (Array.isArray(data[k])) {
        data[k].forEach(col => {
          if (typeof col === 'object') {
            add(col.name || col.title);
            if (Array.isArray(col.items)) col.items.forEach(add);
          }
        });
      } else if (typeof data[k] === 'object') {
        add(data[k].name || data[k].title);
        if (Array.isArray(data[k].items)) data[k].items.forEach(add);
      }
    }
  });

  // KPI网格
  if (Array.isArray(data.kpis)) data.kpis.forEach(k => { add(k.label); add(k.value); });

  // 标签
  if (Array.isArray(data.tags)) data.tags.forEach(add);

  // 去重
  return [...new Set(texts)].slice(0, 20);
}

/**
 * 调用 OpenAI API 生成整篇口播稿
 */
function generateFullScript(context, apiKey) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      // 无 API Key：使用启发式生成（规则引擎）
      console.log('⚠️  未设置 OPENAI_API_KEY，使用规则引擎生成');
      resolve(generateHeuristicScript(context));
      return;
    }

    const prompt = buildPrompt(context);

    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `你是大卫自媒体频道的专业文案策划。
擅长撰写短视频口播稿，语言风格自然、口语化，像真人主播在说话。
禁止书面语、禁止文章摘要式表达、禁止说明书语气。
每句话都要让人感觉是"真人在说"，不是"AI在念稿"。`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.8,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error.message);
          const script = json.choices[0].message.content.trim();
          resolve(script);
        } catch (e) {
          reject(new Error(`OpenAI API 错误: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 构建 AI prompt
 */
function buildPrompt(context) {
  const totalDuration = Math.round(context.totalDuration);
  const sceneList = context.sceneSummaries
    .map(s => `场景${s.index} [${s.layout}, ${s.duration}]: ${s.content}`)
    .join('\n');

  return `
## 任务
为一篇自媒体视频撰写整篇口播稿。

## 视频信息
- 标题：${context.title}
- 总时长：约${totalDuration}秒
- 场景数量：${context.totalScenes}个
- 原文链接：${context.sourceUrl || '无'}

## 各场景素材（按顺序）

${sceneList}

## 写作要求

### 8段式结构（必须遵守）
1. **钩子开头**：第一句话直接点明核心问题/痛点，吸引眼球
2. **产品引入**：引入要讲的内容
3. **核心价值**：点明最大亮点/价值
4. **卖点展开**：逐条展开关键信息
5. **社会证明**：用数据/案例支撑
6. **使用感受**：主观感受/评价
7. **行动引导**：告诉观众该怎么做
8. **互动结尾**：抛出问题，引导评论（必须）

### 语言风格
- ✅ 自然口语，像真人说话："我觉得"、"说实话"、"你知道吗"
- ✅ 可以用感叹句、反问句
- ✅ 可以有情绪："震惊"、"真的"、"太牛了"
- ❌ 禁止："内容概览"、"目录"、"数据说话"（这些是书面语标题）
- ❌ 禁止：无意义的"那么"、"然后"连接词
- ❌ 禁止：文章摘要式表达（"本文研究了..."、"本报告指出..."）

### 格式要求
- 全篇为连续的自然段落，段落间用空行分隔
- 不要在开头写"口播稿"或"以下是正文"
- 不要在结尾写"以上就是..."或"感谢观看"
- 互动结尾必须使用以下模板之一：
  - "你更看重{A}还是{B}?评论区告诉我 👇"
  - "你们团队用什么{场景}?求推荐 👀"
  - "关注我，每天带你发现一个{主题} 🔔"

### 长句要求
- 至少3句话超过15字（含标点），用于表达复杂观点
- 其余句子保持15字以内，保持节奏感
- 不要每句都短——允许自然的长句存在

## 输出格式
直接输出口播稿正文，不要加任何说明文字。
`.trim();
}

/**
 * 启发式生成（无 API Key 时使用）
 */
function generateHeuristicScript(context) {
  const scenes = context.sceneSummaries;
  const title = context.title;

  // 收集所有文本
  const allTexts = scenes.map(s => s.content).filter(t => t !== '(视觉场景，无文字)');

  // 生成钩子（从第一个场景提取）
  const hookTemplates = [
    `你有没有想过，${title}到底是怎么回事？`,
    `今天聊个很多人都在问的话题——${title}。`,
    `说个可能会刷新你认知的事：${title}。`,
  ];

  // 生成各场景的叙述
  const sceneTexts = scenes.map((s, i) => {
    // 如果场景有内容，用内容生成叙述
    if (s.content && s.content !== '(视觉场景，无文字)') {
      return generateSceneNarrative(s, allTexts, i, scenes.length);
    }
    return null;
  }).filter(Boolean);

  // 组装整篇口播稿
  const hook = hookTemplates[Math.floor(Math.random() * hookTemplates.length)];
  const body = sceneTexts.join('\n\n');

  // 互动结尾
  const interactionTemplates = [
    '你更看重Claude还是ChatGPT？评论区告诉我 👇',
    '你用的是哪款AI？评论区聊聊 👀',
    '关注我，每天带你发现一个AI技巧 🔔',
  ];
  const interaction = interactionTemplates[Math.floor(Math.random() * interactionTemplates.length)];

  return `${hook}\n\n${body}\n\n${interaction}`;
}

/**
 * 为单个场景生成叙述（启发式）
 */
function generateSceneNarrative(scene, allTexts, index, total) {
  const texts = scene.content.split('|').map(t => t.trim()).filter(Boolean);
  const layout = scene.layout;

  // TOC 场景：生成自然引导语
  if (layout === 'toc') {
    const transitions = [
      '先给大家列个提纲，今天要讲这几件事。',
      '在说之前，先把今天的重点列出来。',
      '先把今天的内容理一遍，核心就三件事。',
    ];
    return transitions[Math.floor(Math.random() * transitions.length)] +
      texts.slice(0, 4).map(t => `第一，${t}。`).join(' ');
  }

  // 数据场景：自然引入
  if (layout === 'stat-highlight' || layout === 'fullscreen-stat') {
    const num = texts.find(t => /\d/.test(t)) || '';
    const label = texts.find(t => !/\d/.test(t)) || '';
    return num ? `你看这个数据，${num}，${label}。` : `说个关键数据：${texts[0]}。`;
  }

  // 引用场景
  if (layout === 'big-quote') {
    const quote = texts[0] || '';
    return `"${quote}"，这句话说得挺有道理的。`;
  }

  // CTA 场景
  if (layout === 'cta') {
    return texts[0] ? `最后，关注我，带你了解更多。${texts[0]}` : '好了，今天就到这里，关注我，带你了解更多。';
  }

  // 其他场景：直接用内容
  const mainText = texts[0] || '';
  if (!mainText) return null;

  // 避免重复内容
  if (allTexts.length > 1) {
    const prevTexts = allTexts.slice(0, index);
    if (prevTexts.some(p => p.includes(mainText) || mainText.includes(p))) {
      return null; // 跳过重复内容
    }
  }

  return mainText;
}

/**
 * 按场景时长拆分整篇口播稿
 * 策略：找到场景断点（空行/句号作为自然断点）
 */
function splitByScenes(fullScript, scenes) {
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 5), 0);
  const result = [];

  // 用标点符号分割成句子
  const sentences = fullScript
    .split(/([。！？\n])/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s !== '。' && s !== '！' && s !== '？' && s !== '\n');

  // 重新组合成带标点的句子
  const paragraphs = [];
  let current = '';
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const next = sentences[i + 1];
    current += s;
    if (['。', '！', '？'].includes(next)) {
      current += next;
      i++; // 跳过标点
    }
    if (current.trim()) paragraphs.push(current.trim());
    current = '';
  }

  // 按比例分配段落到各场景
  let charCount = paragraphs.join('').length;
  let pos = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const ratio = (scene.duration || 5) / totalDuration;
    const targetChars = Math.round(charCount * ratio);

    let sceneChars = '';
    let startPos = pos;

    while (pos < paragraphs.length) {
      sceneChars += (sceneChars ? ' ' : '') + paragraphs[pos];
      pos++;
      if (sceneChars.length >= targetChars * 0.9 || pos >= paragraphs.length) break;
    }

    result.push(sceneChars || paragraphs[pos - 1] || '');
  }

  // 确保每个场景都有内容
  return result.map((text, i) => text || `场景${i + 1}内容`).slice(0, scenes.length);
}

/**
 * 验证口播稿质量
 */
function validateScript(fullScript, sceneScripts) {
  const chars = fullScript.replace(/\s/g, '');
  const sentences = fullScript.split(/[。！？\n]/).filter(s => s.trim().length > 0);
  const longSentences = sentences.filter(s => s.length > 15);
  const hasInteraction = /评论区|告诉我|关注我/.test(fullScript);
  const hasOralWords = /你觉得|说实话|你知道吗|我觉得|真的/.test(fullScript);
  const hasBadWords = /内容概览|目录|数据说话|本文研究|本报告指出/.test(fullScript);

  return {
    totalChars: chars.length,
    totalSentences: sentences.length,
    longSentences: longSentences.length,
    hasInteraction,
    hasOralWords,
    hasBadWords,
    badWordSamples: hasBadWords ? '发现书面语词汇' : null,
    quality: hasBadWords ? 'FAIL' : hasInteraction ? 'PASS' : 'WARN',
  };
}

/**
 * 打印摘要
 */
function printSummary(result, scenes) {
  const { stats, sceneScripts, fullScript } = result;

  console.log('\n========== 口播稿质量报告 ==========');
  console.log(`总字数：${stats.totalChars}`);
  console.log(`总句数：${stats.totalSentences}`);
  console.log(`>15字长句：${stats.longSentences} 句`);
  console.log(`有互动结尾：${stats.hasInteraction ? '✅' : '❌'}`);
  console.log(`有口语词：${stats.hasOralWords ? '✅' : '❌'}`);
  console.log(`含书面语：${stats.hasBadWords ? '❌ 需优化' : '✅ 通过'}`);
  console.log(`质量评级：${stats.quality}`);

  console.log('\n--- 逐场景口播（预览前3句）---');
  sceneScripts.forEach((script, i) => {
    const preview = script.split(/[。！？]/)[0] || script;
    console.log(`  场景${i + 1} [${scenes[i]?.layout}]: ${preview.slice(0, 40)}...`);
  });

  if (stats.quality === 'FAIL') {
    console.log('\n⚠️  口播稿含书面语词汇，建议手动优化或重试');
  }
}

// ============ 执行 ============
main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});