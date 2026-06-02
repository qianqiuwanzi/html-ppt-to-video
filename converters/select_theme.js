/**
 * select_theme.js — 根据文案内容关键词自动选择 html-ppt 主题
 *
 * Usage:
 *   node select_theme.js "AI · Agent · 趋势"
 *   node select_theme.js --file content.txt
 *   node select_theme.js --score "文本"   # 调试模式
 *   node select_theme.js --list
 *
 *   const { selectTheme } = require('./select_theme.js');
 *   const theme = selectTheme("周鸿祎谈Agent，Token成本是落地核心问题");
 */

const fs = require('fs');

/**
 * 35个 html-ppt 主题
 * 每条记录含:
 *   .tags[]       - 风格标签（tech/corp/dram/life/fx/dark/light）
 *   .keywords{}   - 关键词 → 加分权重
 *   .mood         - 氛围描述
 */
const THEMES = {

  // ── 深色酷炫 Tech ──────────────────────────────────────
  'tokyo-night': {
    tags: ['dark','tech','anime','modern'],
    keywords: { ai:10, agent:8, 大模型:9, 模型:8, 智能体:8, 软件:7, 技术:8, 科技:9, 编程:7, 工具:6, 代码:7 },
    mood: '东京夜景·赛博朋克·AI科技风',
  },
  'cyberpunk-neon': {
    tags: ['dark','tech','neon','cyber'],
    keywords: { ai:9, agent:8, 代码:10, 编程:10, 黑客:10, 技术:9, 科技:10, 游戏:9, 终端:9 },
    mood: '霓虹灯光·赛博朋克·高对比',
  },
  'dracula': {
    tags: ['dark','tech','purple','coding'],
    keywords: { 代码:10, 编程:10, 软件:8, 技术:8, ai:7, agent:6, 工具:7, 开源:9 },
    mood: '吸血鬼紫·程序员最爱',
  },
  'terminal-green': {
    tags: ['dark','tech','terminal','retro'],
    keywords: { 代码:10, 编程:10, 终端:10, 黑客:9, linux:10, 命令行:10, 服务器:9, 技术:8 },
    mood: '绿色终端·复古黑客',
  },
  'gruvbox-dark': {
    tags: ['dark','tech','retro','warm'],
    keywords: { 代码:8, 编程:8, 技术:7, 软件:7 },
    mood: '复古暖色·程序员之选',
  },
  'sharp-mono': {
    tags: ['dark','tech','mono','minimal'],
    keywords: { 代码:9, 编程:9, 技术:7, 软件:7 },
    mood: '锐利等宽·极客风格',
  },
  'catppuccin-mocha': {
    tags: ['dark','tech','pastel','soft'],
    keywords: { 代码:7, 编程:7, 技术:7, 软件:7 },
    mood: '莫兰迪深色·柔和高级',
  },

  // ── 浅色冷静 Corporate ─────────────────────────────────
  'minimal-white': {
    tags: ['light','corp','minimal'],
    keywords: { 企业:9, 商务:9, 汇报:10, 产品:8, 增长:9, 商业:9, 数据:9, 投资:9, 招聘:9, 管理:8 },
    mood: '极简白·商务汇报',
  },
  'corporate-clean': {
    tags: ['light','corp','clean','biz'],
    keywords: { 企业:10, 商务:10, 汇报:9, 产品:9, 增长:9, 商业:9, 数据:8, 招聘:9, 管理:8 },
    mood: '企业级干净·商业演示',
  },
  'academic-paper': {
    tags: ['light','corp','academic'],
    keywords: { 学术:10, 论文:10, 研究:9, 报告:9, 调研:9, 数据:8, 科学:9 },
    mood: '学术论文·研究报告',
  },
  'engineering-whiteprint': {
    tags: ['light','corp','blueprint'],
    keywords: { 工程:10, 建筑:10, 技术:8, 架构:9, 设计:9 },
    mood: '工程蓝图·技术架构',
  },
  'editorial-serif': {
    tags: ['light','corp','editorial','serif'],
    keywords: { 媒体:10, 内容:9, 文章:9, 文字:10, 编辑:9, 新闻:9 },
    mood: '编辑出版·杂志风',
  },
  'swiss-grid': {
    tags: ['light','corp','grid','minimal'],
    keywords: { 设计:9, 品牌:9, 排版:10, 系统:8, 架构:8 },
    mood: '瑞士网格·系统设计',
  },
  'catppuccin-latte': {
    tags: ['light','corp','pastel','soft'],
    keywords: { 简约:7, 温暖:8, 生活:8 },
    mood: '拿铁色·柔和生活',
  },
  'solarized-light': {
    tags: ['light','corp','solarized'],
    keywords: { 环保:9, 简约:7, 学术:7, 绿色:8 },
    mood: '日光色·环保主题',
  },

  // ── 浓烈宣言 Dramatic ──────────────────────────────────
  'neo-brutalism': {
    tags: ['dark','dram','bold','pop'],
    keywords: { 路演:10, 创业:9, 分享:9, 观点:9, 宣言:10, 创意:9, 营销:9, 产品发布:9 },
    mood: '新粗野主义·大胆宣言',
  },
  'bauhaus': {
    tags: ['dark','dram','bauhaus','art'],
    keywords: { 路演:9, 创业:9, 设计:10, 艺术:9, 分享:8, 创意:9 },
    mood: '包豪斯·艺术设计',
  },
  'midcentury': {
    tags: ['light','dram','retro'],
    keywords: { 历史:8, 复盘:8, 经典:8, 分享:7 },
    mood: '中世纪现代·复古情怀',
  },
  'magazine-bold': {
    tags: ['light','dram','magazine','bold'],
    keywords: { 杂志:10, 封面:10, 观点:9, 人物:9, 访谈:9 },
    mood: '杂志封面·大标题冲击',
  },
  'pitch-deck-vc': {
    tags: ['light','dram','vc','invest'],
    keywords: { 路演:10, 融资:10, 创业:10, 商业计划:10, 投资:10, 增长:9, 企业:8, vc:10 },
    mood: 'VC融资路演·专业投资风',
  },
  'vaporwave': {
    tags: ['dark','dram','vapor','neon'],
    keywords: { 复古:9, 潮流:9, 艺术:9, 设计:8, 创意:9 },
    mood: '蒸汽波·千禧复古',
  },
  'retro-tv': {
    tags: ['dark','dram','retro','tv'],
    keywords: { 复古:8, 怀旧:8, 电视:8 },
    mood: '复古电视·怀旧风格',
  },
  'y2k-chrome': {
    tags: ['dark','dram','y2k','chrome'],
    keywords: { 复古:9, 科技:8, 未来:8, chrome:10 },
    mood: 'Y2K镀铬·千禧未来',
  },
  'rainbow-gradient': {
    tags: ['dark','dram','colorful'],
    keywords: { 多彩:10, 彩虹:10, 活泼:9, 创意:9, 五彩:10 },
    mood: '彩虹渐变·活泼多彩',
  },
  'memphis-pop': {
    tags: ['dark','dram','memphis','pop'],
    keywords: { 活泼:9, 创意:9, 设计:8, 艺术:8, 潮流:9 },
    mood: '孟菲斯波普·活泼有趣',
  },

  // ── 温暖活力 Lifestyle ─────────────────────────────────
  'sunset-warm': {
    tags: ['light','life','warm','sunset'],
    keywords: { 生活:10, 旅行:10, 美食:10, 摄影:9, 温暖:9, 日出:9, 日落:10, 阳光:9 },
    mood: '日落暖色·旅行生活',
  },
  'soft-pastel': {
    tags: ['light','life','pastel','soft'],
    keywords: { 小红书:9, 生活:9, 护肤:10, 家居:9, 穿搭:9, 温柔:10, 美妆:9 },
    mood: '马卡龙色·温柔生活',
  },
  'xiaohongshu-white': {
    tags: ['light','life','xhs'],
    keywords: { 小红书:10, 种草:10, 分享:9, 生活:9, 推荐:9, 好物:9 },
    mood: '小红书白·种草分享',
  },
  'japanese-minimal': {
    tags: ['light','life','japanese','zen'],
    keywords: { 日式:10, 极简:10, 茶:9, 冥想:9, 生活:8, 艺术:9, 禅:10 },
    mood: '日式禅意·极简生活',
  },

  // ── 特效重型 Effects ────────────────────────────────────
  'aurora': {
    tags: ['dark','fx','aurora','glow'],
    keywords: { 发布会:10, 特效:10, 品牌:9, 产品:9, 科技:8, 极光:10 },
    mood: '极光特效·品牌发布会',
  },
  'glassmorphism': {
    tags: ['dark','fx','glass','blur'],
    keywords: { 发布会:10, 产品:9, 品牌:9, 科技:9, 苹果:9, 设计:9, app:10 },
    mood: '玻璃拟态·苹果风格',
  },
  'blueprint': {
    tags: ['dark','fx','blueprint'],
    keywords: { 工程:10, 建筑:10, 技术:8, 蓝图:10, 设计:9, 架构:9 },
    mood: '工程蓝图·技术架构',
  },
  'arctic-cool': {
    tags: ['dark','fx','arctic','cool'],
    keywords: { 科技:9, 冰:9, 干净:8, 简洁:8, 冷静:9 },
    mood: '极地冰蓝·冷静科技',
  },
  'rose-pine': {
    tags: ['dark','fx','rose','moody'],
    keywords: { 情绪:9, 艺术:9, 音乐:9, 情感:9, 玫瑰:9 },
    mood: '玫瑰松石·情绪氛围',
  },
};

// ── 通用关键词快速匹配 ───────────────────────────────────
const FAST_PATTERNS = [
  [/terminal|黑客|linux|命令行/, 'terminal-green'],
  [/小红书|种草/, 'xiaohongshu-white'],
  [/融资|vc|投资|路演|商业计划|创业/, 'pitch-deck-vc'],
  [/学术|论文/, 'academic-paper'],
  [/年.{0,2}报|月报|周报|汇报/, 'corporate-clean'],
  [/复盘|述职/, 'corporate-clean'],
  [/极简|日式|禅/, 'japanese-minimal'],
  [/玻璃|glass|毛玻璃/, 'glassmorphism'],
  [/发布会|产品发布/, 'aurora'],
  [/旅行|日落|日出|美食/, 'sunset-warm'],
  [/护肤|美妆|家居|穿搭/, 'soft-pastel'],
  [/杂志|封面|访谈/, 'magazine-bold'],
  [/复古|千禧/, 'y2k-chrome'],
  [/工程|蓝图|架构/, 'blueprint'],
  [/情绪|艺术|音乐/, 'rose-pine'],
];

/**
 * 对一段文本评分，返回最高分主题
 */
function selectTheme(text, opts = {}) {
  const { defaultTheme = 'tokyo-night' } = opts;
  const t = (text || '').toString().trim();
  if (!t) return defaultTheme;

  // 快速通道
  for (const [re, theme] of FAST_PATTERNS) {
    if (re.test(t)) return theme;
  }

  // 关键词加权评分
  const scores = {};
  for (const [themeKey, themeData] of Object.entries(THEMES)) {
    let s = 0;
    for (const [kw, weight] of Object.entries(themeData.keywords || {})) {
      if (t.includes(kw)) s += weight;
    }
    scores[themeKey] = s;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : defaultTheme;
}

/**
 * 对整个脚本选主题（多数投票 + 首位场景优先）
 */
function selectThemeForScript(scenes, opts = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return opts.defaultTheme || 'tokyo-night';
  }

  // 如果首位有内容，用首位内容匹配（封面决定风格）
  const firstScene = scenes[0];
  const firstText = typeof firstScene === 'string' ? firstScene
    : (firstScene.kicker || firstScene.title || firstScene.text || firstScene.content || '');

  if (firstText) {
    return selectTheme(firstText, opts);
  }

  // 否则多数投票
  const counts = {};
  for (const scene of scenes) {
    const text = typeof scene === 'string' ? scene
      : (scene.kicker || scene.title || scene.text || scene.content || '');
    const t = selectTheme(text, opts);
    counts[t] = (counts[t] || 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : (opts.defaultTheme || 'tokyo-night');
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('Available themes:');
    for (const [key, data] of Object.entries(THEMES)) {
      console.log(`  ${key}  [${data.tags.join(', ')}]  ${data.mood}`);
    }
    console.log(`\nTotal: ${Object.keys(THEMES).length} themes`);
    return;
  }

  if (args.includes('--score')) {
    const text = args.filter(a => !a.startsWith('--')).join(' ');
    console.log(`Input: "${text}"\n`);
    const scores = {};
    for (const [key, data] of Object.entries(THEMES)) {
      let s = 0;
      for (const [kw, w] of Object.entries(data.keywords || {})) {
        if (text.includes(kw)) s += w;
      }
      scores[key] = s;
    }
    console.log('Top 5:');
    Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .forEach(([k, s]) => console.log(`  ${String(s).padStart(3)}  ${k}`));
    return;
  }

  let text;
  if (args.includes('--file') && args[args.indexOf('--file') + 1]) {
    const idx = args.indexOf('--file') + 1;
    text = fs.readFileSync(args[idx], 'utf-8');
  } else {
    text = args.join(' ');
  }

  if (!text.trim()) {
    console.log('tokyo-night');
    return;
  }
  console.log(selectTheme(text));
}

module.exports = { selectTheme, selectThemeForScript, THEMES };

if (require.main === module) main();
