#!/usr/bin/env node
/**
 * parse_input.js — AI-driven text → scene config converter
 *
 * Takes raw text content (from file, stdin, or argument) and produces
 * a scene config JSON compatible with generate.js.
 *
 * Two modes:
 *   1. AI mode (default): Uses OpenAI API to analyze content and produce scenes
 *   2. Heuristic mode (--no-ai): Rule-based paragraph splitting + layout selection
 *
 * Usage:
 *   node parse_input.js --file article.txt [--theme tokyo-night] [--output config.json]
 *   node parse_input.js --text "Content here..." [--no-ai]
 *   echo "Content..." | node parse_input.js --stdin
 *   node parse_input.js --file article.txt --ai-model gpt-4o
 *
 * Output: JSON config for generate.js (printed to stdout or --output file)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const convertersDir = path.resolve(__dirname, '..', 'converters');
const { selectTheme, selectThemeForScript } = require(path.join(convertersDir, 'select_theme'));
const { getDefaultFX } = require(path.join(convertersDir, 'map_fx'));
const { AVAILABLE_LAYOUTS } = require(path.join(convertersDir, 'convert_layout'));
const { fetchWebpage, detectUrlType, needsBrowser } = require(path.join(__dirname, 'fetch_webpage'));

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  width: 1080,
  height: 1920,
  fps: 30,
  sceneDuration: {
    cover: 6,
    toc: 5,
    bullets: 8,
    'two-column': 8,
    'three-column': 7,
    'big-quote': 6,
    'stat-highlight': 6,
    'kpi-grid': 7,
    comparison: 8,
    'process-steps': 8,
    cta: 5,
    'data-table': 7,
    'chart-bar': 7,
    'chart-line': 7,
    'chart-pie': 7,
    'chart-radar': 7,
    code: 8,
    diff: 7,
    terminal: 7,
    'flow-diagram': 7,
    'arch-diagram': 7,
    mindmap: 7,
    timeline: 8,
    roadmap: 8,
    gantt: 7,
    'pros-cons': 8,
    'image-hero': 6,
    'fullscreen-stat': 5,
    'highlight-box': 6,
    'numbered-list': 8,
    'icon-grid': 7,
  },
  // Extra time per item in list-type layouts
  timePerItem: 1.5,
  // Minimum scene duration
  minDuration: 4,
  // Maximum scene duration
  maxDuration: 15,
  // Target total video duration range (seconds)
  targetDuration: { min: 60, max: 180 },
};

// ═══════════════════════════════════════════════════════════
// LAYOUT SELECTION RULES (heuristic mode)
// ═══════════════════════════════════════════════════════════

const LAYOUT_RULES = [
  // Patterns that suggest specific layouts
  { pattern: /^#{1,3}\s.+/m, layout: 'cover', role: 'title' },
  { pattern: /(?:目录|提纲|概览|overview|contents?|index)/i, layout: 'toc' },
  { pattern: /(?:对比|vs|versus|比较|compare)/i, layout: 'comparison' },
  { pattern: /(?:步骤|流程|过程|step|process|workflow)/i, layout: 'process-steps' },
  { pattern: /(?:优[点缺]|利弊|pros?\s*cons?|优劣)/i, layout: 'pros-cons' },
  { pattern: /(?:时间线|里程碑|年表|timeline|milestone)/i, layout: 'timeline' },
  { pattern: /(?:路线图|roadmap|规划)/i, layout: 'roadmap' },
  { pattern: /(?:代码|code|```)/i, layout: 'code' },
  { pattern: /(?:终端|命令|terminal|\$\s)/i, layout: 'terminal' },
  { pattern: /(?:数据|表格|table|指标)/i, layout: 'data-table' },
  { pattern: /(?:架构|系统|architecture|分层)/i, layout: 'arch-diagram' },
  { pattern: /(?:思维导图|脑图|mindmap)/i, layout: 'mindmap' },
  { pattern: /(?:引用|名言|quote|")/, layout: 'big-quote' },
  { pattern: /(?:注意|警告|highlight|warning|caution)/i, layout: 'highlight-box' },
  { pattern: /(?:排名|top\s*\d|排行)/i, layout: 'numbered-list' },
  { pattern: /(?:功能|特性|feature|能力)/i, layout: 'icon-grid' },
];

// ═══════════════════════════════════════════════════════════
// TEXT PARSING
// ═══════════════════════════════════════════════════════════

/**
 * Split raw text into semantic blocks
 * Returns array of { type, content, level }
 */
function splitIntoBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let currentBlock = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    // Heading detection
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      continue;
    }

    // List item detection
    const listMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (listMatch) {
      if (currentBlock && currentBlock.type !== 'list') {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      if (!currentBlock) currentBlock = { type: 'list', items: [] };
      currentBlock.items.push(listMatch[1]);
      continue;
    }

    // Numbered list detection
    const numListMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numListMatch) {
      if (currentBlock && currentBlock.type !== 'numbered-list') {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      if (!currentBlock) currentBlock = { type: 'numbered-list', items: [] };
      currentBlock.items.push(numListMatch[1]);
      continue;
    }

    // Regular paragraph
    if (currentBlock && currentBlock.type !== 'paragraph') {
      blocks.push(currentBlock);
      currentBlock = null;
    }
    if (!currentBlock) currentBlock = { type: 'paragraph', content: '' };
    currentBlock.content += (currentBlock.content ? ' ' : '') + trimmed;
  }

  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}

/**
 * Estimate speaking duration for text (Chinese + English)
 */
function estimateDuration(text) {
  if (!text) return 4;
  // Chinese: ~4 chars/sec at 1.2x speed, English: ~3 words/sec
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const seconds = chineseChars / 4 + englishWords / 3;
  return Math.max(DEFAULT_CONFIG.minDuration, Math.min(DEFAULT_CONFIG.maxDuration, Math.ceil(seconds + 1)));
}

// ═══════════════════════════════════════════════════════════
// HEURISTIC SCENE GENERATION (no AI)
// ═══════════════════════════════════════════════════════════

/**
 * Select layout based on content analysis
 */
function selectLayout(block, blockIndex, totalBlocks) {
  // First block → cover
  if (blockIndex === 0 && block.type === 'heading') return 'cover';

  // Last block → CTA if it looks like a call-to-action
  if (blockIndex === totalBlocks - 1) {
    const text = block.content || (block.items || []).join(' ');
    if (/(?:关注|订阅|下载|体验|开始|行动|点击|立即|join|subscribe|try|start)/i.test(text)) {
      return 'cta';
    }
  }

  // List blocks
  if (block.type === 'list') return 'bullets';
  if (block.type === 'numbered-list') return 'numbered-list';

  // Heading blocks (not first)
  if (block.type === 'heading') {
    if (block.level === 1) return 'cover';
    // Check content for specific layouts
    for (const rule of LAYOUT_RULES) {
      if (rule.pattern.test(block.content)) return rule.layout;
    }
    // Subheadings before lists become section headers
    return 'bullets';
  }

  // Paragraph blocks — check for special patterns
  if (block.type === 'paragraph') {
    for (const rule of LAYOUT_RULES) {
      if (rule.pattern.test(block.content)) return rule.layout;
    }
  }

  return 'bullets'; // default
}

/**
 * Generate scene data from a block based on layout
 */
function generateSceneData(layout, block, allBlocks) {
  const data = {};

  switch (layout) {
    case 'cover': {
      const headingText = block.content || '';
      // Try to extract kicker from the first part (before — or · or |)
      const parts = headingText.split(/[—|·]\s*/);
      if (parts.length > 1) {
        data.kicker = parts[0].trim();
        data.title = parts.slice(1).join(' — ').trim();
      } else {
        data.title = headingText;
      }
      // Extract subtitle from next block if it's a paragraph
      const nextBlock = allBlocks[allBlocks.indexOf(block) + 1];
      if (nextBlock && nextBlock.type === 'paragraph' && nextBlock.content.length < 60) {
        data.subtitle = nextBlock.content;
      }
      break;
    }
    case 'toc': {
      data.title = block.content || '目录';
      data.items = (block.items || []).map(item => ({ title: item }));
      break;
    }
    case 'bullets': {
      if (block.type === 'list') {
        data.items = block.items;
        // Use merged heading if available
        if (block._heading) {
          data.title = block._heading;
        }
      } else if (block.type === 'heading') {
        data.title = block.content;
      } else {
        // Paragraph → split into sentences
        const sentences = block.content.split(/[。！？\.\!\?]+/).filter(s => s.trim());
        data.items = sentences.slice(0, 6);
        if (block._heading) data.title = block._heading;
      }
      break;
    }
    case 'numbered-list': {
      data.items = block.items || [];
      if (block._heading) data.kicker = block._heading;
      break;
    }
    case 'comparison': {
      const items = block.items || [];
      data.cols = items.map(item => ({
        name: item,
        use: '',
        save: '',
      }));
      if (items.length === 0) {
        data.cols = [{ name: '方案A' }, { name: '方案B' }];
      }
      break;
    }
    case 'process-steps': {
      data.steps = block.items || block.content.split(/[。；\.\;]+/).filter(s => s.trim()).slice(0, 6);
      if (block._heading) data.title = block._heading;
      break;
    }
    case 'pros-cons': {
      const items = block.items || [];
      const mid = Math.ceil(items.length / 2);
      data.pros = items.slice(0, mid);
      data.cons = items.slice(mid);
      break;
    }
    case 'big-quote': {
      data.quote = block.content || '';
      break;
    }
    case 'stat-highlight': {
      // Try to extract a number from the text
      const numMatch = block.content.match(/(\d+\.?\d*%?)/);
      data.big = numMatch ? numMatch[1] : '0';
      data.label = block.content.replace(numMatch ? numMatch[0] : '', '').trim();
      break;
    }
    case 'highlight-box': {
      data.text = block.content || '';
      data.type = /(?:注意|警告|warning|caution)/i.test(block.content) ? 'warning' : 'info';
      break;
    }
    case 'icon-grid': {
      data.items = (block.items || []).map(item => ({ icon: '🔗', label: item }));
      break;
    }
    case 'code': {
      data.code = block.content || '';
      data.lang = 'javascript';
      break;
    }
    case 'terminal': {
      const lines = (block.content || '').split('\n');
      data.commands = lines.filter(l => l.trim().startsWith('$')).map(l => l.replace(/^\$\s*/, ''));
      data.output = lines.filter(l => !l.trim().startsWith('$')).join('\n') || undefined;
      break;
    }
    case 'timeline': {
      data.items = (block.items || []).map(item => ({ text: item }));
      break;
    }
    case 'cta': {
      const text = block.content || (block.items || []).join(' ');
      data.title = text;
      break;
    }
    default: {
      // Generic: put content as bullets
      data.items = block.content ? block.content.split(/[。；\.\;]+/).filter(s => s.trim()).slice(0, 5) : [];
      if (block.type === 'heading') data.title = block.content;
      break;
    }
  }

  return data;
}

/**
 * Calculate scene duration based on layout and data
 */
function calculateDuration(layout, data) {
  const baseDuration = DEFAULT_CONFIG.sceneDuration[layout] || 7;
  const itemCounts = {
    bullets: (data.items || []).length,
    'numbered-list': (data.items || []).length,
    'process-steps': (data.steps || []).length,
    toc: (data.items || []).length,
    comparison: (data.cols || []).length,
    'icon-grid': (data.items || []).length,
    timeline: (data.items || []).length,
    'pros-cons': Math.max((data.pros || []).length, (data.cons || []).length),
    'data-table': (data.rows || []).length,
  };

  const count = itemCounts[layout] || 0;
  if (count > 0) {
    return Math.max(DEFAULT_CONFIG.minDuration,
      Math.min(DEFAULT_CONFIG.maxDuration, baseDuration + count * DEFAULT_CONFIG.timePerItem));
  }

  // Text-based duration estimation
  const textLength = JSON.stringify(data).length;
  if (textLength > 200) {
    return Math.min(DEFAULT_CONFIG.maxDuration, baseDuration + Math.floor(textLength / 100));
  }

  return baseDuration;
}

/**
 * Merge headings with their following content blocks.
 * A heading should become the title of the next content block,
 * not a standalone scene.
 */
function mergeHeadingBlocks(blocks) {
  const merged = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'heading' && i > 0) {
      // Not the first heading (that's the cover title)
      // Attach this heading to the next content block
      const next = blocks[i + 1];
      if (next && next.type !== 'heading') {
        next._heading = block.content;
        next._headingLevel = block.level;
        continue; // skip the heading block itself
      }
      // Heading at end or before another heading → keep as-is
      merged.push(block);
    } else {
      merged.push(block);
    }
  }
  return merged;
}

/**
 * Heuristic mode: convert blocks to scenes without AI
 */
function heuristicParse(blocks, options = {}) {
  const scenes = [];
  let sceneIndex = 0;

  // Ensure first scene is cover
  if (blocks.length === 0) {
    return scenes;
  }

  // Merge headings with their content blocks
  const mergedBlocks = mergeHeadingBlocks(blocks);

  // If first block is not a heading, create a cover from the first meaningful text
  if (mergedBlocks[0].type !== 'heading') {
    const firstText = mergedBlocks[0].content || (mergedBlocks[0].items || [])[0] || '视频标题';
    scenes.push({
      layout: 'cover',
      id: 's1',
      data: { title: firstText.slice(0, 40) },
    });
    sceneIndex = 1;
  }

  for (let i = 0; i < mergedBlocks.length; i++) {
    const block = mergedBlocks[i];
    const layout = selectLayout(block, i, mergedBlocks.length);

    // Skip blocks that were consumed by previous scenes (e.g., subtitle for cover)
    if (i === 1 && scenes[0] && scenes[0].layout === 'cover' && block.type === 'paragraph' && block.content.length < 60) {
      scenes[0].data.subtitle = block.content;
      continue;
    }

    // Use merged heading as title/kicker
    if (block._heading) {
      if (!block._titleApplied) {
        block._titleApplied = true;
      }
    }

    const data = generateSceneData(layout, block, mergedBlocks);

    // Apply merged heading as title/kicker
    if (block._heading && !data.title && !data.kicker) {
      data.title = block._heading;
    } else if (block._heading && data.title && data.title !== block._heading) {
      data.kicker = block._heading;
    }

    const duration = calculateDuration(layout, data);
    const fx = getDefaultFX(layout, data);

    scenes.push({
      layout,
      id: 's' + (sceneIndex + 1),
      data,
      duration,
      ...(fx ? { fx } : {}),
    });
    sceneIndex++;
  }

  // Ensure last scene is CTA
  const lastScene = scenes[scenes.length - 1];
  if (lastScene && lastScene.layout !== 'cta') {
    scenes.push({
      layout: 'cta',
      id: 's' + (sceneIndex + 1),
      data: { title: '关注了解更多', subtitle: '持续分享干货' },
      duration: DEFAULT_CONFIG.sceneDuration.cta,
      fx: 'particle-burst',
    });
  }

  // Assign startTime
  let currentTime = 0;
  for (const scene of scenes) {
    scene.startTime = currentTime;
    currentTime += scene.duration;
  }

  return scenes;
}

// ═══════════════════════════════════════════════════════════
// AI-DRIVEN SCENE GENERATION
// ═══════════════════════════════════════════════════════════

/**
 * Call OpenAI API to generate scene config from text
 */
async function callOpenAI(text, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const baseURL = options.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set. Use --no-ai for heuristic mode, or set OPENAI_API_KEY env var.');
  }

  const systemPrompt = `你是一个短视频脚本生成器。根据输入文本，生成抖音竖屏短视频的场景配置。

可用布局（31个）：
- cover: 封面页（kicker, title, subtitle, tags[]）
- toc: 目录页（title, items[{title,desc}]）
- bullets: 要点列表（kicker, title, items[]）
- two-column: 双栏（title, left:{title,items[]}, right:{title,items[]}）
- three-column: 三栏（cols:[{title,items[]}]）
- big-quote: 大引用（quote, author, role）
- stat-highlight: 数据强调（kicker, big/value, label, desc）
- kpi-grid: KPI网格（kpis:[{value,label,delta}]）
- comparison: 对比卡片（cols:[{name,use,save,highlight,bad}]）
- process-steps: 流程步骤（kicker, title, steps[]）
- cta: 行动号召（title, url, subtitle）
- data-table: 数据表格（headers[], rows[]）
- chart-bar: 柱状图（bars:[{label,value}]）
- chart-line: 折线图（points:[{x,y,label,value}]）
- chart-pie: 饼图（slices:[{label,value}]）
- chart-radar: 雷达图（labels[], values[]）
- code: 代码展示（code, lang）
- diff: 代码差异（lines:[{type,text}]）
- terminal: 终端（commands[], output, title）
- flow-diagram: 流程图（nodes[]）
- arch-diagram: 架构图（layers:[{name,items[]}]）
- mindmap: 思维导图（root, branches:[{label,children[]}]）
- timeline: 时间线（items:[{time,text}]）
- roadmap: 路线图（phases:[{label,items[]}]）
- gantt: 甘特图（tasks:[{name,start,width}]）
- pros-cons: 优劣对比（pros[], cons[]）
- image-hero: 图片英雄（src, caption, overlay）
- fullscreen-stat: 全屏数据（big/value, label, sub）
- highlight-box: 高亮框（title, text, type:info|warning|success|error）
- numbered-list: 编号列表（kicker, title, items[]）
- icon-grid: 图标网格（items:[{icon,label,desc}]）

规则：
1. 第一个场景必须是 cover
2. 最后一个场景必须是 cta
3. 每个场景时长 4-15 秒，总时长 60-180 秒
4. 内容要精炼，每个 bullets 场景不超过 5 条
5. 提取关键数据和数字，用 stat-highlight 或 fullscreen-stat 展示
6. 有对比内容用 comparison，有步骤用 process-steps
7. 禁止出现具体企业/机构/政府名 → 匿名化描述
8. kicker 使用大写英文标签（如 AI · AGENT · 趋势）

输出格式：JSON数组，每个元素包含 {layout, id, duration, data}
- id 格式: s1, s2, s3...
- duration: 秒数
- data: 对应布局的 data 字段

只输出JSON，不要其他内容。`;

  const url = baseURL.replace(/\/+$/, '') + '/chat/completions';
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const proto = urlObj.protocol === 'https:' ? https : http;
    const req = proto.request(urlObj, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error('OpenAI API error: ' + json.error.message));
            return;
          }
          const content = json.choices[0].message.content;
          // Extract JSON from markdown code block if present
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
          const scenes = JSON.parse(jsonMatch[1].trim());
          resolve(scenes);
        } catch (e) {
          reject(new Error('Failed to parse AI response: ' + e.message + '\nRaw: ' + data.slice(0, 500)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * AI mode: use LLM to generate scenes, then post-process
 */
async function aiParse(text, options = {}) {
  const aiScenes = await callOpenAI(text, options);

  // Post-process: validate and fix scenes
  const scenes = [];
  let currentTime = 0;

  for (let i = 0; i < aiScenes.length; i++) {
    const scene = aiScenes[i];

    // Validate layout
    if (!AVAILABLE_LAYOUTS.includes(scene.layout)) {
      console.error(`Warning: Unknown layout "${scene.layout}" in scene ${scene.id}, falling back to bullets`);
      scene.layout = 'bullets';
    }

    // Ensure id
    scene.id = 's' + (i + 1);

    // Ensure duration within bounds
    scene.duration = Math.max(DEFAULT_CONFIG.minDuration,
      Math.min(DEFAULT_CONFIG.maxDuration, scene.duration || DEFAULT_CONFIG.sceneDuration[scene.layout] || 7));

    // Assign FX if missing
    if (!scene.fx) {
      scene.fx = getDefaultFX(scene.layout, scene.data || {});
    }

    // Assign startTime
    scene.startTime = currentTime;
    currentTime += scene.duration;

    scenes.push(scene);
  }

  // Ensure first scene is cover
  if (scenes.length > 0 && scenes[0].layout !== 'cover') {
    scenes.unshift({
      layout: 'cover',
      id: 's0',
      startTime: 0,
      duration: DEFAULT_CONFIG.sceneDuration.cover,
      data: { title: '视频标题' },
      fx: 'particle-burst',
    });
    // Re-assign IDs and startTimes
    for (let i = 0; i < scenes.length; i++) {
      scenes[i].id = 's' + (i + 1);
    }
    let t = 0;
    for (const s of scenes) {
      s.startTime = t;
      t += s.duration;
    }
  }

  // Ensure last scene is CTA
  const last = scenes[scenes.length - 1];
  if (last.layout !== 'cta') {
    scenes.push({
      layout: 'cta',
      id: 's' + (scenes.length + 1),
      startTime: currentTime,
      duration: DEFAULT_CONFIG.sceneDuration.cta,
      data: { title: '关注了解更多', subtitle: '持续分享干货' },
      fx: 'particle-burst',
    });
  }

  return scenes;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

function parseArgs(argv) {
  const args = argv || process.argv.slice(2);
  const opts = {
    file: null,
    url: null,
    text: null,
    stdin: false,
    noAI: false,
    browser: false,
    theme: null,
    output: null,
    model: null,
    width: DEFAULT_CONFIG.width,
    height: DEFAULT_CONFIG.height,
    fps: DEFAULT_CONFIG.fps,
    title: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file': opts.file = args[++i]; break;
      case '--url': opts.url = args[++i]; break;
      case '--text': opts.text = args[++i]; break;
      case '--stdin': opts.stdin = true; break;
      case '--no-ai': opts.noAI = true; break;
      case '--browser': opts.browser = true; break;
      case '--theme': opts.theme = args[++i]; break;
      case '--output': case '-o': opts.output = args[++i]; break;
      case '--ai-model': case '--model': opts.model = args[++i]; break;
      case '--title': opts.title = args[++i]; break;
      case '--width': opts.width = parseInt(args[++i]); break;
      case '--height': opts.height = parseInt(args[++i]); break;
      case '--fps': opts.fps = parseInt(args[++i]); break;
      case '--help': case '-h':
        console.log(`
parse_input.js — AI-driven text → scene config converter

Usage:
  node parse_input.js --file article.txt [--theme tokyo-night] [-o config.json]
  node parse_input.js --url <URL> [--browser] [-o config.json]
  node parse_input.js --text "Content..." [--no-ai]
  echo "Content..." | node parse_input.js --stdin

Options:
  --file <path>       Input text file
  --url <URL>         Fetch content from URL (auto-detects static/dynamic pages)
  --browser           Force browser rendering for --url (for JS-heavy pages)
  --text <text>       Input text directly
  --stdin             Read from stdin
  --no-ai             Use heuristic mode (no API call)
  --theme <name>      Override theme (auto-selected if omitted)
  --title <title>     Override video title
  --output, -o <path> Output config file path (default: stdout)
  --ai-model <model>  OpenAI model (default: gpt-4o-mini)
  --width <px>        Video width (default: 1080)
  --height <px>       Video height (default: 1920)
  --fps <num>         Frame rate (default: 30)
  --help, -h          Show this help

URL Support:
  Supports WeChat articles, Zhihu, Bilibili, Douyin, Toutiao,
  Jianshu, CSDN, Juejin, Weibo, Twitter/X, YouTube, Medium,
  Substack, GitHub, and any generic webpage.
  Auto-detects JS-heavy pages and falls back to browser rendering.

Environment variables:
  OPENAI_API_KEY      Required for AI mode
  OPENAI_BASE_URL     Optional API base URL
  OPENAI_MODEL        Default model override
`);
        process.exit(0);
    }
  }

  return opts;
}

async function readInput(opts) {
  if (opts.url) {
    console.error(`[parse_input] Fetching URL: ${opts.url}`);
    const webpage = await fetchWebpage(opts.url, { browser: opts.browser });
    console.error(`[parse_input] Fetched ${webpage.content.length} chars from ${webpage.source}`);
    // Prepend metadata as markdown heading for better scene generation
    let text = '';
    if (webpage.title) text += `# ${webpage.title}\n\n`;
    if (webpage.author) text += `> 作者：${webpage.author}\n\n`;
    text += webpage.content;
    // Store webpage metadata for later use
    opts._webpage = webpage;
    return text;
  }
  if (opts.file) {
    return fs.readFileSync(opts.file, 'utf-8');
  }
  if (opts.text) {
    return opts.text;
  }
  if (opts.stdin) {
    return new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  }
  throw new Error('No input specified. Use --url, --file, --text, or --stdin');
}

async function main(argv) {
  const opts = parseArgs(argv);

  // Read input
  const text = await readInput(opts);
  if (!text.trim()) {
    throw new Error('Input is empty');
  }

  // Parse into scenes
  let scenes;
  if (opts.noAI) {
    const blocks = splitIntoBlocks(text);
    scenes = heuristicParse(blocks);
  } else {
    scenes = await aiParse(text, { model: opts.model });
  }

  // Select theme
  const theme = opts.theme || selectTheme(text);

  // Build config
  const config = {
    title: opts.title || (opts._webpage && opts._webpage.title) || extractTitle(text, scenes),
    theme,
    width: opts.width,
    height: opts.height,
    fps: opts.fps,
    scenes,
  };

  // Include webpage metadata if available
  if (opts._webpage) {
    config.source = {
      url: opts._webpage.url,
      title: opts._webpage.title,
      author: opts._webpage.author,
      date: opts._webpage.date,
      images: opts._webpage.images,
      fetchMethod: opts._webpage.source,
    };
  }

  // Output
  const json = JSON.stringify(config, null, 2);
  if (opts.output) {
    fs.writeFileSync(opts.output, json, 'utf-8');
    console.error('Config written to: ' + opts.output);
    console.error('Scenes: ' + scenes.length + ', Duration: ' + (scenes[scenes.length - 1].startTime + scenes[scenes.length - 1].duration) + 's, Theme: ' + theme);
  } else {
    console.log(json);
  }
}

/**
 * Extract a title from the text or first scene
 */
function extractTitle(text, scenes) {
  // First heading
  const headingMatch = text.match(/^#{1,3}\s+(.+)/m);
  if (headingMatch) return headingMatch[1].slice(0, 40);

  // First scene title
  if (scenes[0] && scenes[0].data && scenes[0].data.title) {
    return scenes[0].data.title.slice(0, 40);
  }

  // First line of text
  const firstLine = text.split('\n').find(l => l.trim());
  if (firstLine) return firstLine.trim().slice(0, 40);

  return '短视频';
}

module.exports = {
  splitIntoBlocks,
  heuristicParse,
  aiParse,
  selectLayout,
  generateSceneData,
  calculateDuration,
  estimateDuration,
  extractTitle,
  DEFAULT_CONFIG,
};

if (require.main === module) {
  main().catch(err => {
    console.error('Error: ' + err.message);
    process.exit(1);
  });
}
