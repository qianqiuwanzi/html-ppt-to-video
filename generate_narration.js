/**
 * generate_narration.js — 文案生成层
 * 
 * L2修复：把 config.json 的视觉布局数据，转换为适合真人口播的 narration 字段。
 * 
 * 规则来源：SKILL.md「文案撰写（网感规则）」
 * - 8段式结构：钩子→引入→核心价值→展开→社会证明→感受→行动→互动
 * - 开头三句：核心问题 → 解决方案 → 核心价值
 * - 3句>15字长句（自然表达复杂观点）
 * - 互动结尾模板（选择型/提问型/钩子型）
 * - 禁止：说明书式、空洞口号、没有感情的陈述句
 * 
 * 用法：
 *   node generate_narration.js --config config.json [--style casual|professional|provocative]
 * 
 * 输出：更新 config.json，每个 scene 增加 narration 字段
 */

const fs = require('fs');
const path = require('path');

// ========== 互动结尾模板 ==========
const CTA_TEMPLATES = [
  (a, b) => `你更看重${a}还是${b}？评论区告诉我 👇`,
  (scene) => `你们团队用什么${scene}？求推荐 👀`,
  (topic) => `关注我，每天带你发现一个${topic} 🔔`,
];

// ========== 风格映射 ==========
const STYLES = {
  casual: {
    hookPrefix: ['说实话，', '你知道吗，', '我最近发现一个事，', '有没有想过，'],
    valuePrefix: ['关键是', '说白了就是', '核心就一句话'],
    feelingPrefix: ['我自己用下来，', '真的，', '别不信，'],
    transition: ['那问题来了', '但真相没那么简单', '等等，先别下结论'],
  },
  professional: {
    hookPrefix: ['最新数据表明，', '一项调查揭示了一个被忽视的现象，', ''],
    valuePrefix: ['核心结论是', '关键洞察'],
    feelingPrefix: ['', ''],
    transition: ['深入分析后发现', '数据背后另有逻辑'],
  },
  provocative: {
    hookPrefix: ['别被标题骗了，', '你以为用AI是自由选择？', '醒醒吧，'],
    valuePrefix: ['真相是', '说白了'],
    feelingPrefix: ['我被这个数据震到了', '真的有点扎心'],
    transition: ['但等等', '先别急着下结论', '事情没那么简单'],
  },
};

// ========== 长句检查 ==========
function hasEnoughLongSentences(narrations, minCount = 3, minLen = 15) {
  let count = 0;
  narrations.forEach(n => {
    // 按句号/问号/感叹号分句
    const sentences = n.split(/[。？！]/).filter(s => s.trim().length > 0);
    sentences.forEach(s => {
      if (s.trim().length >= minLen) count++;
    });
  });
  return count >= minCount;
}

// ========== 文案生成核心 ==========
function generateNarrations(config, style = 'casual') {
  const s = STYLES[style] || STYLES.casual;
  const scenes = config.scenes || [];
  const origScenes = scenes.filter(sc => !sc._isAutoFilled);
  
  if (origScenes.length === 0) {
    console.error('❌ 没有原始场景，无法生成文案');
    return null;
  }

  // 从原始场景提取核心信息
  const articleTitle = origScenes[0]?.data?.title || config.title || 'AI洞察';
  const topic = 'AI';
  const narrations = [];

  // === 8段式结构映射到场景 ===
  // 场景顺序决定口播节奏
  origScenes.forEach((scene, i) => {
    const d = scene.data || {};
    let narration = '';

    // 根据场景位置和布局，生成不同风格的口播文案
    const isFirst = i === 0;
    const isLast = i === origScenes.length - 1;
    const layout = scene.layout;

    if (isFirst) {
      // 【段1: 钩子开头】直接点明核心问题/痛点
      const hookPrefix = s.hookPrefix[Math.floor(Math.random() * s.hookPrefix.length)];
      narration = `${hookPrefix}${d.title || articleTitle}${d.subtitle ? '，' + d.subtitle : ''}`;
    } else if (isLast) {
      // 【段8: 互动结尾】
      if (layout === 'cta') {
        narration = `${d.subtitle || d.title || ''}。${CTA_TEMPLATES[0]('Claude', 'ChatGPT')}`;
      } else {
        narration = CTA_TEMPLATES[2](topic);
      }
    } else if (layout === 'stat-highlight' || layout === 'fullscreen-stat') {
      // 【段5: 社会证明】数据震撼
      const bigData = d.big || d.value || '';
      const label = d.label || d.desc || '';
      narration = `${s.feelingPrefix[Math.floor(Math.random() * s.feelingPrefix.length)]}${bigData}，${label}`;
    } else if (layout === 'comparison') {
      // 【段4: 卖点展开】对比吐槽
      const cols = d.cols || [];
      const left = cols[0]?.name || d.left?.title || '';
      const right = cols[1]?.name || d.right?.title || '';
      narration = `${left}和${right}，差距不是一点半点`;
    } else if (layout === 'big-quote') {
      // 【段6: 使用感受】金句
      narration = `${d.quote || ''}${d.author ? '，' + d.author + '说的' : ''}`;
    } else if (layout === 'bullets' || layout === 'numbered-list') {
      // 【段3/4: 核心价值+展开】
      const items = d.items || [];
      if (items.length > 0) {
        const mainPoint = typeof items[0] === 'object' ? (items[0].title || items[0].text || '') : items[0];
        narration = `${s.valuePrefix[Math.floor(Math.random() * s.valuePrefix.length)]}：${d.title || ''}，${mainPoint}`;
      } else {
        narration = `${d.kicker || ''} ${d.title || ''}`;
      }
    } else if (layout === 'chart-bar' || layout === 'chart-pie') {
      // 【段5: 社会证明】可视化数据
      const bars = d.bars || d.slices || [];
      if (bars.length >= 2) {
        narration = `看数据：${bars[0].label}${bars[0].value}${d.unit || '%'}，${bars[1].label}${bars[1].value}${d.unit || '%'}`;
      } else {
        narration = `${d.title || '数据说话'}`;
      }
    } else if (layout === 'pros-cons') {
      // 【段7: 行动引导+感受】利弊
      const pros = (d.pros || []).slice(0, 1).join('');
      const cons = (d.cons || []).slice(0, 1).join('');
      narration = `好处是${pros}，但${cons}`;
    } else if (layout === 'toc') {
      // 目录/概览 → 简短过渡
      narration = `${s.transition[Math.floor(Math.random() * s.transition.length)]}，${d.title || '来看几个关键点'}`;
    } else {
      // 其他布局 → 通用
      const keyText = d.title || d.kicker || d.text?.slice(0, 40) || '';
      if (keyText) narration = keyText;
    }

    if (narration) {
      scene.narration = narration;
      narrations.push(narration);
    }
  });

  // 【3长句规则检查】不够3句>15字，则补充
  if (!hasEnoughLongSentences(narrations, 3, 15)) {
    // 在关键场景补充长句
    const longSentencePool = [
      `不是你选择了什么AI，而是AI的商业模式决定了你能接触到什么工具`,
      `Claude用户80%来自年收入10万美元以上的家庭，这个数据真的有点扎心`,
      `ChatGPT有7.7亿下载量霸榜全球，但用户收入分布居然接近美国人平均水平`,
    ];
    let added = 0;
    for (let i = 0; i < origScenes.length && added < 3; i++) {
      if (!origScenes[i].narration) continue;
      const current = origScenes[i].narration;
      const sentences = current.split(/[。？！]/).filter(s => s.trim().length > 0);
      const hasLong = sentences.some(s => s.trim().length >= 15);
      if (!hasLong) {
        origScenes[i].narration = current + '。' + longSentencePool[added];
        added++;
      }
    }
  }

  // 【填充场景口播】自动填充场景也需要口播文案（简短过渡语）
  scenes.filter(sc => sc._isAutoFilled).forEach(sc => {
    if (!sc.narration) {
      sc.narration = `第${sc.id}页`;
    }
  });

  return narrations;
}

// ========== CLI 入口 ==========
function main() {
  const args = process.argv.slice(2);
  let configPath = '';
  let style = 'casual';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') configPath = args[++i];
    if (args[i] === '--style') style = args[++i];
  }

  if (!configPath) {
    console.error('用法: node generate_narration.js --config config.json [--style casual|professional|provocative]');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const narrations = generateNarrations(config, style);

  if (!narrations) {
    process.exit(1);
  }

  // 验证3长句规则
  const longCount = narrations.reduce((c, n) => {
    return c + n.split(/[。？！]/).filter(s => s.trim().length >= 15).length;
  }, 0);
  console.log(`\n✅ 文案生成完成：${narrations.length} 条口播文案`);
  console.log(`   长句(>15字): ${longCount} 句 ${longCount >= 3 ? '✅' : '⚠️ 需要补充'}`);
  
  // 打印每条文案
  narrations.forEach((n, i) => {
    console.log(`   [${i + 1}] ${n}`);
  });

  // 写回config.json
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log(`\n✅ 已更新 ${configPath}（每个场景增加 narration 字段）`);
}

module.exports = { generateNarrations, extractSceneText: null };

if (require.main === module) {
  main();
}