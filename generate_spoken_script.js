#!/usr/bin/env node
/**
 * generate_spoken_script.js — v1.2.0
 * 
 * 彻底重新设计文案生成方案：
 * 从"模板拼接"改为"自然语言生成"。
 * 
 * 流程：
 *   旧方案：scenes → 模板拼接 narration → 输出（机械、不口语）
 *   新方案：scenes → AI生成整篇口播稿 → 按场景时长拆分 → 输出（自然、流畅）
 * 
 * v1.2.0 改进：
 *   方案A：用原始场景（非 _isAutoFilled）生成口播稿 → 按比例拆分为全部场景
 *   LLM：通过 QClaw 本地网关（127.0.0.1:57632/v1/chat/completions），零成本
 * 
 * 使用方式：
 *   node generate_spoken_script.js --config config.json [--output script.json]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

// ============ CLI ============
var argv={};for(var i=2;i<process.argv.length;i++){if(process.argv[i]==='--config')argv.config=process.argv[++i];else if(process.argv[i]==='--output')argv.output=process.argv[++i];}
const configPath = argv.config || 'config.json';
const outputPath = argv.output || null;

// ============ QClaw 网关配置 ============
function getQClawGateway() {
  try {
    const cfgPath = path.join(process.env.USERPROFILE || '~', '.qclaw', 'openclaw.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const port = cfg.gateway?.port || 57632;
    const token = cfg.gateway?.auth?.token || '';
    return { baseUrl: `http://127.0.0.1:${port}/v1`, token, model: 'openclaw' };
  } catch (e) {
    return null;
  }
}

// ============ 核心函数 ============

async function main() {
  console.log('🎙️  口播稿生成器 v1.2.0（自然语言生成 + 方案A）\n');

  // 1. 加载配置
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const allScenes = config.scenes || [];

  // 2. 方案A：检测原始场景（ID 不以 "auto-" 开头，且非 _isAutoFilled）
  const isAuto = (s) => (s.data && s.data._isAutoFilled) || (s.id && s.id.startsWith('auto-'));
  const originalScenes = allScenes.filter(s => !isAuto(s));
  const autoFilledScenes = allScenes.filter(s => isAuto(s));
  const useOriginalOnly = originalScenes.length > 0 && originalScenes.length < allScenes.length;

  const genScenes = useOriginalOnly ? originalScenes : allScenes;
  console.log(`  场景分析: 原始${originalScenes.length}个 + 自动填充${autoFilledScenes.length}个 = 总计${allScenes.length}个`);
  if (useOriginalOnly) console.log(`  方案A: 用${originalScenes.length}个原始场景生成口播稿 → 按比例拆分到${allScenes.length}个场景\n`);

  // 3. 准备素材上下文
  const context = buildContext(config, genScenes);

  // 4. 获取 QClaw 网关配置
  const gateway = getQClawGateway();
  let fullScript;

  if (gateway && gateway.token) {
    console.log(`  🚀 使用 QClaw 本地网关 (${gateway.model}@${gateway.baseUrl})`);
    fullScript = await callQClawGateway(context, gateway);
  } else {
    console.log('  ⚠️  未找到 QClaw 网关配置，使用规则引擎生成');
    fullScript = generateHeuristicScript(context);
  }

  // 5. 按场景时长拆分口播稿（方案A：用原始场景的比例拆分到全部场景）
  const sceneScripts = splitByScenes(fullScript, genScenes, allScenes);

  // 6. 统计验证
  const stats = validateScript(fullScript, sceneScripts);

  // 7. 输出
  const result = { fullScript, sceneScripts, stats, generatedAt: new Date().toISOString() };

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n✅ 口播稿已保存: ${outputPath}`);
  }

  printSummary(result, allScenes);
  return result;
}

function buildContext(config, scenes) {
  const title = config.title || '';
  const sceneSummaries = scenes.map((s, i) => {
    const layout = s.layout || 'unknown';
    const duration = s.duration || 5;
    const data = s.data || {};
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
    theme: config.theme || 'cyberpunk-neon',
    totalScenes: scenes.length,
    totalDuration: scenes.reduce((sum, s) => sum + (s.duration || 5), 0),
    sourceUrl: config.sourceUrl || '',
    sceneSummaries,
  };
}

function extractSceneTexts(data, layout) {
  var texts = [];
  function add(val) {
    if (typeof val === 'string' && val.trim()) texts.push(val.trim());
    if (typeof val === 'number') texts.push(String(val));
  }
  ['title', 'kicker', 'subtitle', 'quote', 'text', 'big', 'value', 'label', 'desc', 'sub'].forEach(k => add(data[k]));
  ['items', 'pros', 'cons', 'steps', 'commands'].forEach(k => {
    if (Array.isArray(data[k])) data[k].forEach(it => {
      if (typeof it === 'string') add(it);
      if (typeof it === 'object') { add(it.title); add(it.label); add(it.desc); add(it.text); }
    });
  });
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
  if (Array.isArray(data.kpis)) data.kpis.forEach(k => { add(k.label); add(k.value); });
  if (Array.isArray(data.tags)) data.tags.forEach(add);

  var badWords = ['内容概览', '目录', '数据说话', '来看几个关键点', '本文研究', '本报告指出', '结论', '摘要'];
  texts = texts.filter(function(t) {
    return !badWords.some(function(b) { return t.includes(b); });
  });
  return [...new Set(texts)].slice(0, 20);
}

/**
 * 调用 QClaw 本地网关（OpenAI 兼容）
 */
function callQClawGateway(context, gateway) {
  return new Promise((resolve, reject) => {
    const prompt = buildPrompt(context);

    const body = JSON.stringify({
      model: gateway.model,
      messages: [
        {
          role: 'system',
          content: '你是大卫自媒体频道的专业文案策划。擅长撰写短视频口播稿，语言风格自然、口语化，像真人主播在说话。禁止书面语、禁止文章摘要式表达、禁止说明书语气。每句话都要让人感觉是"真人在说"，不是"AI在念稿"。'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4000,
      temperature: 0.8,
    });

    const url = new URL(gateway.baseUrl + '/chat/completions');
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.token}`,
      },
      timeout: 60000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error.message);
          if (!json.choices || json.choices.length === 0) throw new Error('AI 返回为空');
          const script = json.choices[0].message.content.trim();
          console.log(`  ✅ AI 生成完成 (${script.length} 字符)`);
          resolve(script);
        } catch (e) {
          console.warn(`  ⚠️  AI 调用失败: ${e.message}`);
          console.warn('  → 回退到规则引擎生成');
          resolve(generateHeuristicScript(context));
        }
      });
    });

    req.on('error', (e) => {
      console.warn(`  ⚠️  网关连接失败: ${e.message}`);
      console.warn('  → 回退到规则引擎生成');
      resolve(generateHeuristicScript(context));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(body);
    req.end();
  });
}

function buildPrompt(context) {
  const totalDuration = Math.round(context.totalDuration);
  const sceneList = context.sceneSummaries
    .map(s => `场景${s.index} [${s.layout}, ${s.duration}]: ${s.content}`)
    .join('\n');

  return `
## 任务
为一篇自媒体视频撰写整篇口播稿。

## 视频信息
- 标题：${context.title || '(无标题)'}
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
 * 启发式生成（无 API 时使用）
 */
function generateHeuristicScript(context) {
  const scenes = context.sceneSummaries;
  const hookTemplates = [
    '你有没有想过，用什么AI其实暴露了你的阶层？',
    '今天说个扎心的真相：用AI的人，有钱人比普通人多得多。',
    '你知道吗，AI这东西，用的人有钱没钱，差太多了。',
  ];

  const sceneTexts = scenes.map((s, i) => {
    if (s.content && s.content !== '(视觉场景，无文字)') {
      return generateSceneNarrative(s, i, scenes.length);
    }
    return null;
  }).filter(Boolean);

  const hook = hookTemplates[Math.floor(Math.random() * hookTemplates.length)];
  const body = sceneTexts.join('\n\n');

  const interactionTemplates = [
    '你更看重Claude还是ChatGPT？评论区告诉我 👇',
    '你用的是哪款AI？评论区聊聊 👀',
    '关注我，每天带你发现一个AI技巧 🔔',
  ];
  const interaction = interactionTemplates[Math.floor(Math.random() * interactionTemplates.length)];

  var bodyLast = body.split(/\n+/).filter(Boolean).slice(-1)[0] || '';
  if (/评论区|关注我|告诉我/.test(bodyLast)) return hook + '\n\n' + body;
  return hook + '\n\n' + body + '\n\n' + interaction;
}

function generateSceneNarrative(scene, index, total) {
  const texts = scene.content.split('|').map(t => t.trim()).filter(Boolean);
  const layout = scene.layout;

  if (layout === 'toc') {
    const transitions = [
      '先给大家列个提纲，今天要讲这几件事。',
      '在说之前，先把今天的重点列出来。',
      '先把今天的内容理一遍，核心就三件事。',
    ];
    return transitions[Math.floor(Math.random() * transitions.length)] +
      texts.slice(0, 4).map(t => `第一，${t}。`).join(' ');
  }

  if (layout === 'stat-highlight' || layout === 'fullscreen-stat') {
    const num = texts.find(t => /\d/.test(t)) || '';
    const label = texts.find(t => !/\d/.test(t)) || '';
    return num ? `你看这个数据，${num}，${label}。` : `说个关键数据：${texts[0]}。`;
  }

  if (layout === 'big-quote') {
    const quote = texts[0] || '';
    return `"${quote}"，这句话说得挺有道理的。`;
  }

  if (layout === 'cta') {
    return texts[0] ? `最后，关注我，带你了解更多。${texts[0]}` : '好了，今天就到这里，关注我，带你了解更多。';
  }

  const mainText = texts[0] || '';
  if (!mainText) return null;
  return mainText;
}

/**
 * splitByScenes — 方案A 版本
 * 用原始场景（genScenes）的比例，拆分内容到全部场景（allScenes）
 */
function splitByScenes(fullScript, genScenes, allScenes) {
  // ========== 第1步：把口播稿切成完整句子（绝不截断） ==========
  const rawParts = fullScript.split(/([。！？\n])/).map(s => s.trim());
  const sentences = [];
  let buf = '';
  for (const p of rawParts) {
    if (p === '。' || p === '！' || p === '？') {
      buf += p;
      if (buf.trim()) sentences.push(buf.trim());
      buf = '';
    } else if (p === '\n' || p === '') {
      if (buf.trim()) { sentences.push(buf.trim()); buf = ''; }
    } else {
      buf += p;
    }
  }
  if (buf.trim()) sentences.push(buf.trim());

  if (sentences.length === 0) {
    return allScenes.map(() => '');
  }

  // ========== 第2步：按时长比例把句子分配给【全部】场景 ==========
  // 关键规则：句子是原子单位，绝不截断！
  const totalDuration = allScenes.reduce((s, sc) => s + (sc.duration || 3), 0);
  const sceneSentenceCounts = allScenes.map(sc => {
    const ratio = (sc.duration || 3) / totalDuration;
    return Math.max(0, Math.round(sentences.length * ratio));
  });

  // 调整：确保总分配数 = 句子总数（把余数分配给最长的场景）
  let assigned = sceneSentenceCounts.reduce((a, b) => a + b, 0);
  let diff = sentences.length - assigned;
  // diff > 0：句子有剩，按时长降序补给
  if (diff > 0) {
    const indices = allScenes.map((sc, i) => i).sort((a, b) => (allScenes[b].duration || 3) - (allScenes[a].duration || 3));
    for (let k = 0; k < diff; k++) sceneSentenceCounts[indices[k % indices.length]]++;
  }
  // diff < 0：分配多了，从最短的场景收回（但每场景至少0句）
  if (diff < 0) {
    const indices = allScenes.map((sc, i) => i).sort((a, b) => (allScenes[a].duration || 3) - (allScenes[b].duration || 3));
    for (let k = 0; k < -diff; k++) {
      const idx = indices[k % indices.length];
      if (sceneSentenceCounts[idx] > 0) sceneSentenceCounts[idx]--;
    }
  }

  // ========== 第3步：按顺序把句子填入场景 ==========
  const result = [];
  let cursor = 0;
  for (let i = 0; i < allScenes.length; i++) {
    const count = sceneSentenceCounts[i];
    if (count <= 0) {
      result.push('');  // 无口播的场景（纯视觉）
    } else {
      result.push(sentences.slice(cursor, cursor + count).join(''));
      cursor += count;
    }
  }

  // 安全防护：如果还有没分配完的句子，追加到最后一个有内容的场景
  if (cursor < sentences.length) {
    const tail = sentences.slice(cursor).join('');
    for (let j = result.length - 1; j >= 0; j--) {
      if (result[j] !== '') { result[j] += tail; break; }
      if (j === 0) result[j] = tail;
    }
  }

  return result;
}

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

function printSummary(result, scenes) {
  const { stats, sceneScripts } = result;

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
    const preview = (script || '').split(/[。！？]/)[0] || script || '(空)';
    console.log(`  场景${i + 1} [${scenes[i]?.layout}]: ${preview.slice(0, 50)}${preview.length > 50 ? '...' : ''}`);
  });

  if (stats.quality === 'FAIL') console.log('\n⚠️  口播稿含书面语词汇，建议手动优化或重试');
}

// ============ 执行 ============
main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});