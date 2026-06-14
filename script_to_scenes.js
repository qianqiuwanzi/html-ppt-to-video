#!/usr/bin/env node
/**
 * script_to_scenes.js — 文案驱动的场景规划器 (v1.0.0)
 *
 * 核心理念：
 *   从完整口播文案（_fullScript）出发，按句子语义匹配最合适的布局，
 *   一次性完成全部场景规划。不再"先有场景再补布局"。
 *
 * 替代：diversity_assigner.js 的"补全布局"思路
 *
 * 流程：
 *   1. 将 _fullScript 按句子拆分
 *   2. 对每句/几句文案，匹配最合适的布局（基于语义关键词）
 *   3. 为每个场景分配动画 + FX（均匀洗牌）
 *   4. 输出完整的 scenes 数组（所有场景都有 narration = 真实文案）
 *
 * 用法：
 *   node script_to_scenes.js --config config.json [--apply]
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// 布局 → 语义关键词映射
// 每种布局适合呈现什么类型的文案内容
// ═══════════════════════════════════════════════════════════
const LAYOUT_SEMANTICS = [
  {
    layout: 'cover',
    keywords: ['标题', '开篇', 'hook', '引入', '开头'],
    desc: '封面/开篇 — 适合视频第一帧的 hook 句',
    priority: 1,  // 最高优先级
    role: 'opener'
  },
  {
    layout: 'big-quote',
    keywords: ['核心观点', '金句', '名言', '关键', '最重要', '本质', '根本'],
    desc: '大字金句 — 适合核心论点、震撼观点',
    priority: 2,
    role: 'highlight'
  },
  {
    layout: 'stat-highlight',
    keywords: ['数据', '百分比', '%', '比例', '统计', '数字', '增长', '下降'],
    desc: '数据高亮 — 适合带数字的关键数据',
    priority: 2,
    role: 'data'
  },
  {
    layout: 'fullscreen-stat',
    keywords: ['唯一', '核心数据', '最关键', '最重要'],
    desc: '全屏数字 — 适合单一核心数据强调',
    priority: 3,
    role: 'emphasis'
  },
  {
    layout: 'bullets',
    keywords: ['要点', '几点', '几个', '方面', '原因', '特点', '包括'],
    desc: '要点列表 — 适合列举多个要点',
    priority: 5,
    role: 'general'
  },
  {
    layout: 'numbered-list',
    keywords: ['步骤', '第1', '第2', '第3', '第一步', '第二步', '流程', '顺序'],
    desc: '编号列表 — 适合有顺序的步骤/流程',
    priority: 4,
    role: 'sequence'
  },
  {
    layout: 'process-steps',
    keywords: ['怎么用', '怎么做', '步骤', '流程', '过程', '方法', '具体'],
    desc: '流程步骤 — 适合描述操作流程',
    priority: 3,
    role: 'process'
  },
  {
    layout: 'comparison',
    keywords: ['对比', '区别', '不同', 'vs', '比较', '而是'],
    desc: '对比 — 适合 A vs B 对比',
    priority: 4,
    role: 'compare'
  },
  {
    layout: 'two-column',
    keywords: ['一方面', '另一方面', '之前', '之后', '旧', '新'],
    desc: '双栏对比 — 适合前后/新旧对比',
    priority: 5,
    role: 'compare'
  },
  {
    layout: 'pros-cons',
    keywords: ['优点', '缺点', '好处', '坏处', '优势', '不足'],
    desc: '优劣对比 — 适合利弊分析',
    priority: 4,
    role: 'compare'
  },
  {
    layout: 'highlight-box',
    keywords: ['注意', '关键', '重点', '提示', '提醒', '记住'],
    desc: '高亮提示 — 适合强调重要信息',
    priority: 5,
    role: 'emphasis'
  },
  {
    layout: 'toc',
    keywords: ['概览', '目录', '包含', '几个部分', '主要内容'],
    desc: '内容概览 — 适合总结/目录',
    priority: 6,
    role: 'overview'
  },
  {
    layout: 'cta',
    keywords: ['获取', '免费', '关注', '订阅', '下载', '去', '链接', '试试'],
    desc: '行动号召 — 适合结尾引导',
    priority: 1,
    role: 'closer'
  },
  {
    layout: 'timeline',
    keywords: ['时间', '阶段', '历程', '发展', '演变', '过去', '未来'],
    desc: '时间线 — 适合时间顺序的叙述',
    priority: 5,
    role: 'chronology'
  },
  {
    layout: 'chart-bar',
    keywords: ['排名', '对比数据', '柱状'],
    desc: '柱状图 — 适合排名/对比数据',
    priority: 7,
    role: 'chart'
  },
  {
    layout: 'chart-pie',
    keywords: ['占比', '分布', '比例图'],
    desc: '饼图 — 适合占比/分布',
    priority: 7,
    role: 'chart'
  },
  {
    layout: 'kpi-grid',
    keywords: ['指标', 'KPI', '度量', '评估'],
    desc: 'KPI 网格 — 适合多指标展示',
    priority: 6,
    role: 'data'
  },
  {
    layout: 'three-column',
    keywords: ['三类', '三种', '三个方向'],
    desc: '三栏 — 适合三类并列内容',
    priority: 7,
    role: 'general'
  },
  {
    layout: 'flow-diagram',
    keywords: ['流程图', '工作流', '链条', '环节'],
    desc: '流程图 — 适合工作流可视化',
    priority: 6,
    role: 'process'
  },
  {
    layout: 'mindmap',
    keywords: ['思维导图', '发散', '脑图', '相关'],
    desc: '思维导图 — 适合发散性内容',
    priority: 7,
    role: 'visual'
  },
  {
    layout: 'arch-diagram',
    keywords: ['架构', '层级', '系统', '模块'],
    desc: '架构图 — 适合系统/架构说明',
    priority: 7,
    role: 'visual'
  },
  {
    layout: 'terminal',
    keywords: ['命令', '运行', '执行', '安装', '代码'],
    desc: '终端 — 适合技术操作展示',
    priority: 7,
    role: 'tech'
  },
  {
    layout: 'code',
    keywords: ['代码', '函数', 'API', '编程', '脚本'],
    desc: '代码 — 适合代码展示',
    priority: 7,
    role: 'tech'
  },
  {
    layout: 'diff',
    keywords: ['改进', '优化', '升级', '变更'],
    desc: '差异对比 — 适合前后变更',
    priority: 7,
    role: 'compare'
  },
  {
    layout: 'image-hero',
    keywords: ['配图', '展示', '画面'],
    desc: '全屏配图 — 适合视觉展示',
    priority: 8,
    role: 'visual'
  },
  {
    layout: 'data-table',
    keywords: ['表格', '列表数据', '明细'],
    desc: '数据表 — 适合表格数据',
    priority: 7,
    role: 'data'
  },
  {
    layout: 'chart-line',
    keywords: ['趋势', '走势', '变化曲线'],
    desc: '折线图 — 适合趋势',
    priority: 7,
    role: 'chart'
  },
  {
    layout: 'chart-radar',
    keywords: ['能力', '维度', '评估图'],
    desc: '雷达图 — 适合多维评估',
    priority: 8,
    role: 'chart'
  },
  {
    layout: 'roadmap',
    keywords: ['路线图', '规划', '里程碑'],
    desc: '路线图 — 适合规划展示',
    priority: 7,
    role: 'process'
  },
  {
    layout: 'gantt',
    keywords: ['进度', '排期', '甘特'],
    desc: '甘特图 — 适合进度/排期',
    priority: 8,
    role: 'chart'
  },
  {
    layout: 'icon-grid',
    keywords: ['功能', '特性', '能力', '概览'],
    desc: '图标网格 — 适合功能/能力概览',
    priority: 6,
    role: 'overview'
  }
];

const ALL_LAYOUTS = LAYOUT_SEMANTICS.map(function(ls) { return ls.layout; });

// ═══════════════════════════════════════════════════════════
// 动画 + FX 池
// ═══════════════════════════════════════════════════════════
const ALL_ANIMATIONS = [
  'fade-up', 'fade-down', 'fade-left', 'fade-right', 'rise-in', 'drop-in',
  'zoom-pop', 'blur-in', 'glitch-in', 'bounce-in',
  'stagger-list', 'card-flip-3d', 'cube-rotate-3d', 'page-turn-3d', 'perspective-zoom',
  'kenburns', 'typewriter', 'neon-glow', 'shimmer-sweep', 'gradient-flow',
  'path-draw', 'confetti-burst', 'spotlight', 'ripple-reveal',
  'morph-shape', 'marquee-scroll', 'parallax-tilt'
];

const ALL_FX = [
  'particle-burst', 'matrix-rain', 'bokeh', 'aurora',
  'gradient-wave', 'pulse-ring', 'trail', 'lightning',
  'firework', 'spiral',
  'neon-grid', 'snow-fall', 'smoke-drift', 'star-field',
  'ripple-expand', 'laser-sweep', 'dna-helix', 'wave-ocean',
  'pixel-rain', 'geo-pulse'
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════
// 文案拆句
// ═══════════════════════════════════════════════════════════

/**
 * 将完整文案拆分为句子数组
 * 规则：按句号/问号/叹号分割，保留标点
 */
function splitToSentences(text) {
  if (!text || !text.trim()) return [];

  // 按中英文句末标点分割，但保留标点
  const raw = text.replace(/\n+/g, '\n').trim();
  const sentences = [];
  let current = '';

  for (let i = 0; i < raw.length; i++) {
    current += raw[i];
    if ('。！？!?.'.includes(raw[i])) {
      // 句末标点，断句
      const trimmed = current.trim();
      if (trimmed) sentences.push(trimmed);
      current = '';
    }
  }
  // 剩余内容
  if (current.trim()) sentences.push(current.trim());

  return sentences;
}

/**
 * 将句子分组为场景
 * 规则：
 *   - 每个 scene 包含 1-3 个句子
 *   - 同一语义段落不分拆
 *   - 超长单句（>80字）独立成场景
 *   - 目标：每场景 8-15 秒的口播量
 */
function groupSentencesToScenes(sentences) {
  const groups = [];
  let current = [];
  let charCount = 0;
  const TARGET_MIN = 25;  // 最少字数（约 6s @ 4字/s）
  const TARGET_MAX = 50;  // 最多字数（约 12s @ 4字/s）
  const FIRST_SCENE_MAX = 40;  // 首场景更短（hook要快）

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const sLen = s.length;
    const isFirstScene = groups.length === 0;  // 首场景
    const maxForThis = isFirstScene ? FIRST_SCENE_MAX : TARGET_MAX;

    // 超长单句独立成场景
    if (sLen >= TARGET_MAX) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
        charCount = 0;
      }
      groups.push([s]);
      continue;
    }

    current.push(s);
    charCount += sLen;

    // 首场景更早断组（hook 要快）
    const minForThis = isFirstScene ? Math.min(TARGET_MIN, 20) : TARGET_MIN;

    // 达到目标字数 → 断组
    if (charCount >= minForThis) {
      // 但如果当前已超 max，也断
      if (charCount >= maxForThis || charCount >= minForThis) {
        groups.push(current);
        current = [];
        charCount = 0;
      }
    }
  }

  // 剩余句子
  if (current.length > 0) {
    if (groups.length > 0) {
      // 少于2句且字数少 → 合并到上一组
      const lastGroup = groups[groups.length - 1];
      const mergedChars = lastGroup.join('').length + charCount;
      if (current.length <= 1 && charCount < TARGET_MIN && mergedChars <= TARGET_MAX * 1.5) {
        groups[groups.length - 1] = [...lastGroup, ...current];
      } else {
        groups.push(current);
      }
    } else {
      groups.push(current);
    }
  }

  return groups;
}

// ═══════════════════════════════════════════════════════════
// 布局匹配
// ═══════════════════════════════════════════════════════════

/**
 * 为一个场景的文案匹配最合适的布局
 * 
 * 策略：
 *   1. 特殊位置：首场景→cover，末场景→cta
 *   2. 关键词匹配：扫描文案中的语义关键词
 *   3. 优先级：匹配到的高优先级布局优先
 *   4. 去重：已使用的低优先级布局让给未使用的高优先级布局
 *   5. 兜底：无匹配 → bullets（万能布局）
 */
function matchLayout(sceneText, sceneIndex, totalScenes, usedLayouts, layoutBudget) {
  // ── 特殊位置 ──
  if (sceneIndex === 0) return 'cover';
  if (sceneIndex === totalScenes - 1) {
    // 结尾如果文案包含 CTA 关键词 → cta，否则 → big-quote/cta
    const ctaWords = ['关注', '获取', '免费', '订阅', '试试', '下载', '链接'];
    if (ctaWords.some(w => sceneText.includes(w))) return 'cta';
    return 'big-quote'; // 总结性结尾
  }

  // ── 关键词匹配 ──
  const candidates = [];

  for (const ls of LAYOUT_SEMANTICS) {
    let score = 0;
    for (const kw of ls.keywords) {
      if (sceneText.includes(kw)) {
        score += 10;
      }
    }
    if (score > 0) {
      // 已使用的布局降分，鼓励多样性
      const usedCount = usedLayouts.filter(l => l === ls.layout).length;
      score -= usedCount * 3;
      // 优先级加成
      score += (10 - ls.priority);
      candidates.push({ layout: ls.layout, score, role: ls.role });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].layout;
  }

  // ── 兜底：从未使用的布局中选 ──
  const unusedLowPriority = LAYOUT_SEMANTICS
    .filter(ls => !usedLayouts.includes(ls.layout) && ls.priority >= 5)
    .map(ls => ls.layout);

  if (unusedLowPriority.length > 0) {
    return unusedLowPriority[Math.floor(Math.random() * unusedLowPriority.length)];
  }

  // ── 终极兜底 ──
  return 'bullets';
}

/**
 * 从文案中提取布局所需的 data 字段
 * 
 * 核心原则：画面内容 = 口播内容
 * - narration 字段 = 原口播文案（TTS 用，不可修改）
 * - 其他 data 字段 = 从 narration 中提炼/修饰后的视觉内容
 * - 画面只展示提炼后的关键信息，不直接显示口播句子
 */
function extractLayoutData(layout, narration) {
  const data = { narration };

  // 提取数字/百分比
  const percentages = (narration.match(/\d+(?:\.\d+)?%/g) || []);
  const numbers = (narration.match(/\d+(?:\.\d+)?/g) || []).filter(n => !narration.includes(n + '%'));

  // 提取句子（用于列表类布局）
  // 提取短句（用于列表类布局），限制更短确保画面可读
  const shortPhrases = narration
    .split(/[，,、；;。！？!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 20);

  // 从文案中提炼核心短语（最核心的词组，不超过12字）
  var corePhrase = narration.replace(/[。！？!?。，、；;“”‘’（）()]/g, ' ').trim().split(/\s+/).filter(s => s.length >= 2)[0] || narration.slice(0, 12);
  if (corePhrase.length > 12) corePhrase = corePhrase.slice(0, 12);

  switch (layout) {
    case 'cover':
      // 画面：大标题 = 核心短语，不显示整句口播
      data.kicker = '';
      data.title = corePhrase;
      data.subtitle = '';
      break;

    case 'big-quote':
      // 画面：提炼后半句最有力的部分，不显示整句
      var halfParts = narration.split(/[，,]/);
      var quoteText = halfParts.length > 1 ? halfParts[1].trim() : narration.replace(/[。！？]/g, '').trim();
      if (quoteText.length > 40) quoteText = quoteText.slice(0, 40) + '\u2026';
      data.quote = quoteText;
      data.author = '';
      data.role = '';
      break;

    case 'stat-highlight':
      // 画面：有数字就显示数字，否则显示核心短语
      data.kicker = '';
      data.big = percentages[0] || numbers[0] || corePhrase;
      data.label = corePhrase;
      data.desc = '';
      data.value = data.big;
      break;

    case 'fullscreen-stat':
      data.big = percentages[0] || numbers[0] || narration.slice(0, 10);
      data.label = narration.replace(/\d+/g, '').trim().slice(0, 20);
      data.sub = '';
      break;

    case 'bullets':
      // 画面：精简要点列表（<=15字），不显示口播原文
      data.kicker = '';
      data.title = corePhrase;
      data.items = shortPhrases.length > 0
        ? shortPhrases.slice(0, 5).map(s => s.length > 15 ? s.slice(0, 15) + '\u2026' : s)
        : [narration.slice(0, 15)];
      break;

    case 'numbered-list':
      // 画面：精简要点列表
      data.kicker = '';
      data.title = corePhrase;
      data.items = shortPhrases.length > 0
        ? shortPhrases.slice(0, 6).map(s => s.length > 15 ? s.slice(0, 15) + '\u2026' : s)
        : [narration.slice(0, 15)];
      break;

    case 'process-steps':
      data.kicker = '';
      data.title = '';
      data.steps = shortPhrases.slice(0, 6).map(s => s.trim());
      break;

    case 'comparison':
    case 'two-column': {
      const half = Math.ceil(shortPhrases.length / 2);
      data.kicker = '';
      data.left = { title: shortPhrases[0] || 'A', items: shortPhrases.slice(1, half) };
      data.right = { title: shortPhrases[half] || 'B', items: shortPhrases.slice(half + 1) };
      break;
    }

    case 'pros-cons': {
      const half = Math.ceil(shortPhrases.length / 2);
      data.pros = shortPhrases.slice(0, half);
      data.cons = shortPhrases.slice(half);
      data.prosLabel = '优势';
      data.consLabel = '注意';
      break;
    }

    case 'highlight-box':
      // 画面：标题=核心短语，正文=精简版（不是口播原文）
      data.type = 'tip';
      data.title = corePhrase;
      var bodyText = narration.replace(corePhrase, '').trim().slice(0, 50);
      if (bodyText.length > 50) bodyText = bodyText.slice(0, 50) + '\u2026';
      data.text = bodyText;
      break;

    case 'toc':
      data.title = '';
      data.items = shortPhrases.slice(0, 5).map(s => ({ title: s.trim(), desc: '' }));
      break;

    case 'cta':
      // 画面：提炼行动号召关键词
      data.title = corePhrase;
      data.subtitle = '';
      data.url = '';
      break;

    case 'timeline':
      data.items = shortPhrases.slice(0, 5).map((text, i) => ({
        date: '阶段' + (i + 1), label: text.trim().slice(0, 20), desc: ''
      }));
      break;

    case 'kpi-grid':
      data.kpis = (percentages.length > 0 ? percentages : numbers.slice(0, 4)).map((v, i) => ({
        label: shortPhrases[i] ? shortPhrases[i].trim().slice(0, 10) : '指标' + (i + 1),
        value: v, unit: '', trend: '↑'
      }));
      if (data.kpis.length === 0) data.kpis = [{ label: '指标', value: 'N/A', unit: '', trend: '' }];
      break;

    case 'icon-grid':
      data.kicker = '';
      data.title = narration.split(/[，,。]/)[0].trim().slice(0, 15);
      data.items = shortPhrases.slice(0, 4).map((s, i) => ({
        icon: ['🎯', '💡', '⚡', '🔥'][i % 4],
        label: s.trim().slice(0, 12),
        desc: ''
      }));
      break;

    case 'chart-bar':
      data.bars = numbers.slice(0, 5).map((v, i) => ({
        label: shortPhrases[i] ? shortPhrases[i].trim().slice(0, 10) : '指标' + (i + 1),
        value: parseFloat(v) || 0
      }));
      if (data.bars.length === 0) data.bars = [{ label: '数据', value: 50 }];
      break;

    case 'chart-pie':
      data.slices = numbers.slice(0, 5).map((v, i) => ({
        label: shortPhrases[i] ? shortPhrases[i].trim().slice(0, 10) : '部分' + (i + 1),
        value: parseFloat(v) || 25
      }));
      if (data.slices.length === 0) data.slices = [{ label: '占比', value: 100 }];
      break;

    case 'chart-line':
      data.points = numbers.slice(0, 6).map((v, i) => ({
        x: i + 1, y: parseFloat(v) || (i + 1) * 20,
        label: shortPhrases[i] ? shortPhrases[i].trim().slice(0, 8) : 'P' + (i + 1)
      }));
      if (data.points.length === 0) data.points = [{ x: 1, y: 50, label: 'P1' }];
      break;

    case 'chart-radar':
      data.labels = shortPhrases.slice(0, 5).map(s => s.trim().slice(0, 8));
      data.values = numbers.slice(0, 5).map(v => parseFloat(v) || 70);
      if (data.labels.length === 0) data.labels = ['维度1', '维度2', '维度3'];
      if (data.values.length === 0) data.values = [70, 80, 90];
      break;

    case 'three-column': {
      const per = Math.ceil(shortPhrases.length / 3);
      data.cols = [0, 1, 2].map(i => ({
        title: shortPhrases[i * per] ? shortPhrases[i * per].trim().slice(0, 10) : '类别' + (i + 1),
        items: shortPhrases.slice(i * per + 1, (i + 1) * per).map(s => s.trim())
      }));
      break;
    }

    case 'flow-diagram':
      data.nodes = shortPhrases.slice(0, 5).map((label, i) => ({
        id: 'n' + i, label: label.trim().slice(0, 15), next: i < 4 ? ['n' + (i + 1)] : []
      }));
      if (data.nodes.length === 0) data.nodes = [{ id: 'n0', label: '开始', next: [] }];
      break;

    case 'arch-diagram':
      data.layers = [
        { label: '输入', nodes: shortPhrases.slice(0, 2) },
        { label: '处理', nodes: shortPhrases.slice(2, 4) },
        { label: '输出', nodes: shortPhrases.slice(4, 5).length > 0 ? shortPhrases.slice(4, 5) : ['结果'] }
      ];
      break;

    case 'mindmap':
      data.root = narration.split(/[，,。]/)[0].trim().slice(0, 10);
      data.branches = shortPhrases.slice(1, 4).map(s => ({ label: s.trim().slice(0, 8), children: [] }));
      break;

    case 'roadmap':
      data.phases = shortPhrases.slice(0, 3).map((goal, i) => ({
        phase: '阶段' + (i + 1), goal: goal.trim().slice(0, 15), items: []
      }));
      if (data.phases.length === 0) data.phases = [{ phase: '阶段1', goal: '开始', items: [] }];
      break;

    case 'gantt':
      data.tasks = shortPhrases.slice(0, 5).map((name, i) => ({
        name: name.trim().slice(0, 12), start: i * 15, end: (i + 1) * 15
      }));
      if (data.tasks.length === 0) data.tasks = [{ name: '任务', start: 0, end: 30 }];
      break;

    case 'code':
      data.lang = 'text';
      data.code = '// ' + narration.trim();
      break;

    case 'diff':
      data.lines = [
        { text: '// 问题', type: '-' },
        { text: shortPhrases[0] || narration.slice(0, 30), type: '-' },
        { text: '// 方案', type: '+' },
        { text: shortPhrases[1] || '优化后', type: '+' }
      ];
      break;

    case 'terminal':
      data.title = narration.split(/[，,。]/)[0].trim().slice(0, 15);
      data.commands = shortPhrases.slice(0, 3).map(s => '# ' + s.trim());
      data.output = '完成';
      break;

    case 'data-table':
      data.headers = ['项目', '内容', '状态'];
      data.rows = shortPhrases.slice(0, 5).map(s => [s.trim().slice(0, 12), '', '✓']);
      if (data.rows.length === 0) data.rows = [['项目1', '', '✓']];
      break;

    case 'image-hero':
      data.src = '';
      data.overlay = true;
      data.caption = narration.slice(0, 30);
      break;

    default:
      // 万能兜底
      data.kicker = '';
      data.title = narration.split(/[，,。]/)[0].trim().slice(0, 20);
      data.items = shortPhrases.slice(0, 4);
      break;
  }

  return data;
}

// ═══════════════════════════════════════════════════════════
// 核心：文案 → 场景规划
// ═══════════════════════════════════════════════════════════

/**
 * 从完整文案生成全部场景
 * @param {string} fullScript - 完整口播文案
 * @param {object} config - config.json 对象（读取 theme/width/height 等）
 * @returns {object} { scenes, stats }
 */
function scriptToScenes(fullScript, config) {
  if (!fullScript || !fullScript.trim()) {
    return { scenes: [], stats: { error: 'No _fullScript provided' } };
  }

  // Step 1: 拆句
  const sentences = splitToSentences(fullScript);
  console.log('  [script→scenes] 拆句: ' + sentences.length + ' 句');

  // Step 2: 第一轮 - 一句一场景，语义匹配布局
  const scenes = [];
  const usedLayouts = [];
  const usedSentenceCounts = new Map();

  for (let i = 0; i < sentences.length; i++) {
    const layout = matchLayout(sentences[i], i, sentences.length, usedLayouts);
    const data = extractLayoutData(layout, sentences[i]);
    const duration = estimateDuration(sentences[i]);
    scenes.push({
      id: 's' + (i + 1),
      layout,
      duration,
      data
    });
    usedLayouts.push(layout);
    usedSentenceCounts.set(i, 1);
  }

  console.log('  [script→scenes] 第一轮: ' + scenes.length + ' 场景, ' + new Set(usedLayouts).size + ' 种布局');

  // Step 3: 不再强制补全未覆盖布局（避免场景膨胀和配音重复）
  // 布局覆盖数取决于原文案能支撑的场景数，不少于18种即可
  const unmatchedLayouts = ALL_LAYOUTS.filter(l => !usedLayouts.includes(l));
  console.log('  [script→scenes] 未覆盖布局: ' + unmatchedLayouts.length + ' 种（不强制补全）');
  console.log('  [script→scenes] 已覆盖: ' + usedLayouts.size + ' / 31 种布局');

  // Step 4: 分配动画 + FX（均匀洗牌，强制覆盖全部 27 动画 + 20 FX）
  const anims = shuffle([...ALL_ANIMATIONS]); // 27 种
  const fxs = shuffle([...ALL_FX]);       // 20 种

  for (let i = 0; i < scenes.length; i++) {
    scenes[i].data.animation = anims[i % anims.length];
    scenes[i].fx = fxs[i % fxs.length];
  }

  // Step 5: 统计
  const layoutSet = new Set(scenes.map(s => s.layout));
  const animSet = new Set(scenes.map(s => s.data.animation));
  const fxSet = new Set(scenes.map(s => s.fx));
  const totalDur = scenes.reduce((a, s) => a + (s.duration || 0), 0);

  const stats = {
    totalDuration: Math.round(totalDur * 10) / 10,
    sceneCount: scenes.length,
    sentenceCount: sentences.length,
    layouts: { used: layoutSet.size, available: ALL_LAYOUTS.length, list: [...layoutSet] },
    animations: { used: Math.min(animSet.size, ALL_ANIMATIONS.length), available: ALL_ANIMATIONS.length },
    fx: { used: Math.min(fxSet.size, ALL_FX.length), available: ALL_FX.length }
  };

  return { scenes, stats };
}

/**
 * 估算口播时长（4字/秒 + 标点停顿）
 */
function estimateDuration(text) {
  let duration = (text || '').length / 4.0;
  duration += (text.match(/[，,、；;]/g) || []).length * 0.15;
  duration += (text.match(/[。！？!?]/g) || []).length * 0.3;
  return Math.max(3, Math.round(duration * 10) / 10);
}

/**
 * 为未覆盖的布局找最匹配的句子索引
 * @param {string[]} sentences - 所有句子
 * @param {string} layout - 目标布局
 * @param {Set<number>} usedIdx - 已使用的句子索引集合
 * @returns {number} 最匹配的句子索引
 */
function findBestMatchingSentenceIdx(sentences, layout, usedCounts) {
  const ls = LAYOUT_SEMANTICS.find(l => l.layout === layout);
  if (!ls) {
    // 无语义定义，返回使用次数最少的句子
    let minUse = Infinity, minIdx = 0;
    for (let i = 0; i < sentences.length; i++) {
      const cnt = usedCounts.get(i) || 0;
      if (cnt < minUse) { minUse = cnt; minIdx = i; }
    }
    return minIdx;
  }

  let bestScore = -Infinity;
  let bestIdx = -1;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    let score = 0;
    for (const kw of ls.keywords) {
      if (s.includes(kw)) score += 10;
    }
    // 已使用次数越多，扣分越多（鼓励轮换，避免重复同一句）
    const useCnt = usedCounts.get(i) || 0;
    score -= useCnt * 20;
    // 位置多样性：优先选中间和尾部的句子（避免总选第一句）
    const posRatio = i / Math.max(sentences.length - 1, 1);
    score += posRatio * 2; // 0~2 分加成
    // 同分时随机打破平局（避免总选第一个）
    if (score === bestScore) score += Math.random() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 ? bestIdx : 0;
}

// ═══════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════
if (require.main === module) {
  const args = process.argv.slice(2);
  const configArg = args.find(a => a.startsWith('--config=')) || args.find(a => !a.startsWith('--'));
  const apply = args.includes('--apply');

  if (!configArg) {
    console.error('Usage: node script_to_scenes.js [--config=]config.json [--apply]');
    console.error('');
    console.error('从 config.json 的 _fullScript 字段生成 scenes 数组');
    console.error('--apply  写回 config.json');
    process.exit(1);
  }

  const configPath = configArg.replace('--config=', '');
  if (!fs.existsSync(configPath)) {
    console.error('Config not found: ' + configPath);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const fullScript = config._fullScript;

  if (!fullScript) {
    console.error('❌ config.json 缺少 _fullScript 字段');
    console.error('提示：先运行 generate_spoken_script.js 生成口播稿');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  文案驱动场景规划器 (script→scenes) v1.0.0  ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('  文案长度: ' + fullScript.length + ' 字');
  console.log('');

  const result = scriptToScenes(fullScript, config);

  console.log('');
  console.log('  ── 场景规划结果 ──');
  result.scenes.forEach((s, i) => {
    const narr = (s.data.narration || '').slice(0, 40);
    console.log('  [' + (i + 1) + '/' + result.scenes.length + '] ' + s.id + ' (' + s.layout + ', ' + s.duration + 's) ' + narr + '...');
  });
  console.log('');
  console.log('  ── 统计 ──');
  console.log('  场景数: ' + result.stats.sceneCount);
  console.log('  总时长: ' + result.stats.totalDuration + 's');
  console.log('  布局覆盖: ' + result.stats.layouts.used + '/' + result.stats.layouts.available + ' → ' + result.stats.layouts.list.join(', '));
  console.log('  动画覆盖: ' + result.stats.animations.used + '/' + result.stats.animations.available);
  console.log('  FX覆盖: ' + result.stats.fx.used + '/' + result.stats.fx.available);

  if (apply) {
    config.scenes = result.scenes;
    // 保留原有字段
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('');
    console.log('  ✅ 已写入: ' + configPath);
  } else {
    console.log('');
    console.log('  ℹ 加 --apply 写入 config.json');
  }
}

module.exports = { scriptToScenes, splitToSentences, groupSentencesToScenes, matchLayout, extractLayoutData };
