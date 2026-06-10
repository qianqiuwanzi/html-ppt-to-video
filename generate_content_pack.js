/**
 * generate_content_pack.js — 内容包生成器（v1.0.0）
 * 
 * 从 config.json 提取全部交付物信息，生成结构化的内容包 Markdown 文件。
 * 包含：原文链接 | 短视频文案 | 2个爆款标题 | 发布标签 | BGM选曲 | 发布时间建议
 * 
 * 用法：
 *   node generate_content_pack.js --config config.json [--output content_pack.md]
 */

const fs = require('fs');
const path = require('path');

// ========== 爆款标题模板库 ==========
const TITLE_PATTERNS = [
  // 反差型
  (topic, hook) => `${topic}，99%的人不知道的真相`,
  (topic, hook) => `${topic}的人，都在偷偷做这件事`,
  // 数字型
  (topic, hook) => `${topic}的3个残酷真相，第2个看哭了`,
  (topic, hook) => `3分钟看懂：${topic}`,
  // 疑问型
  (topic, hook) => `${topic}？看完沉默了`,
  (topic, hook) => `${topic}这件事，你想清楚了吗`,
  // 冲突型
  (topic, hook) => `别被骗了！${topic}的真相`,
  (topic, hook) => `${topic}，没人敢告诉你的秘密`,
  // 结果型
  (topic, hook) => `${topic}的秘密曝光：${hook}`,
  (topic, hook) => `${hook}，这组数据太扎心了`,
];

// ========== 发布时间建议 ==========
const PUBLISH_SCHEDULE = {
  bestDays: ['周二', '周三', '周四'],
  goodDays: ['周一', '周五'],
  avoidDays: ['周六', '周日'],
  bestHours: ['12:00-13:00', '18:00-19:00', '21:00-22:00'],
  goodHours: ['08:00-09:00', '11:00-12:00', '17:00-18:00'],
  avoidHours: ['02:00-06:00', '14:00-16:00'],
};

// ========== 标签生成 ==========
function generateTags(scenes, title) {
  const tagSet = new Set();
  // 从场景 data.tags 提取
  scenes.forEach(s => {
    const tags = s.data?.tags || [];
    tags.forEach(t => tagSet.add(t));
  });
  // 从标题提取关键词
  const keywords = ['AI', '科技', '洞察', '数据', '真相', '趋势'];
  keywords.forEach(k => { if (title.includes(k)) tagSet.add(k); });
  // 平台通用标签
  ['短视频', '知识分享', '干货'].forEach(t => tagSet.add(t));
  return Array.from(tagSet).slice(0, 10);
}

// ========== BGM 选曲建议（实际选曲） ==========
function pickRealBGM(config) {
  const bgmStyle = config.bgmStyle || 'tech-corporate';
  const bgmMood = config.bgmMood || 'ambient';

  const home = process.env.USERPROFILE || process.env.HOME || '';
  const bgmBase = path.join(home, '.qclaw', 'skills', 'bgm-library', 'assets', 'music-library');

  const styleDirMap = {
    'tech-corporate': 'tech-corporate',
    'social-media': 'social-media',
    'startup': 'startup',
  };
  const dir = styleDirMap[bgmStyle] || 'tech-corporate';
  const targetDir = path.join(bgmBase, dir, bgmMood);

  if (!fs.existsSync(targetDir)) {
    return { name: bgmStyle, file: '(bgm 目录未找到: ' + targetDir + ')', mood: bgmMood };
  }

  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.mp3'));
  if (files.length === 0) {
    return { name: bgmStyle, file: '(该风格无 mp3)', mood: bgmMood };
  }

  const picked = files[Math.floor(Math.random() * files.length)];

  return {
    name: bgmStyle,
    file: picked,
    mood: bgmMood,
    fullPath: path.join(targetDir, picked),
  };
}

// ========== 爆款标题生成 ==========
function generateViralTitles(config) {
  const scenes = config.scenes || [];
  const origScenes = scenes.filter(s => !s._isAutoFilled);
  const cover = origScenes[0]?.data || {};
  const title = cover.title || config.title || 'AI洞察';
  const hook = cover.subtitle || '没那么简单';
  
  // 提取核心数据点
  const dataPoints = [];
  origScenes.forEach(s => {
    if (s.data?.big) dataPoints.push(s.data.big);
    if (s.data?.bars) s.data.bars.forEach(b => dataPoints.push(b.label + b.value + (s.data.unit || '%')));
    if (s.data?.value) dataPoints.push(s.data.value);
  });
  
  // 选3个不同的模板生成，取最佳2个
  const shuffled = TITLE_PATTERNS.sort(() => Math.random() - 0.5);
  const titles = shuffled.slice(0, 5).map(fn => fn(title, hook));
  
  // 去重 + 限制长度 ≤ 30字
  return [...new Set(titles)]
    .filter(t => t.length <= 30)
    .slice(0, 2);
}

// ========== 生成内容包 ==========
function generateContentPack(config) {
  const scenes = config.scenes || [];
  const origScenes = scenes.filter(s => !s._isAutoFilled);
  const cover = origScenes[0]?.data || {};
  const title = cover.title || config.title || '未命名视频';
  
  // 1. 原文链接
  const sourceUrl = config.sourceUrl || '（未记录原文链接）';
  
  // 2. 短视频文案：纯口播稿（不含场景编号和 layout）
  const narrationText = origScenes
    .map(s => (s.narration || '').trim())
    .filter(Boolean)
    .join('\n\n');
  
  // 3. 爆款标题
  const viralTitles = generateViralTitles(config);
  
  // 4. 发布标签
  const tags = generateTags(scenes, title);
  
  // 5. BGM选曲（实际选曲）
  const bgm = pickRealBGM(config);
  
  // 6. 发布时间建议
  const schedule = PUBLISH_SCHEDULE;
  
  return `# 🎬 内容包：${title}

> 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
> 技能版本：html-ppt-to-video v1.0.0

---

## 📄 原文链接

${sourceUrl}

---

## 🎬 短视频文案

${narrationText || '（未找到 narration 字段，请先运行 generate_narration.js）'}

---

## 🔥 爆款标题（2选1）

| # | 标题 | 风格 |
|---|------|------|
| 1 | ${viralTitles[0] || '(自动生成失败)'} | 高点击 |
| 2 | ${viralTitles[1] || '(自动生成失败)'} | 高互动 |

---

## 🏷️ 发布标签

\`\`\`
${tags.map(t => '#' + t).join(' ')}
\`\`\`

---

## 🎵 BGM选曲

| 项目 | 内容 |
|------|------|
| **风格** | ${bgm.name} |
| **实际曲目** | \`${bgm.file}\` |
| **情绪** | ${bgm.mood} |
| **混音参数** | TTS权重 1.0 : BGM权重 0.30，最终音量 2.5x |

> 曲目来源：bgm-library 技能目录（免版权，可商用）

---

## ⏰ 发布时间建议

| 维度 | 推荐 | 说明 |
|------|------|------|
| **最佳日期** | ${schedule.bestDays.join('、')} | 工作日流量高峰 |
| **可接受** | ${schedule.goodDays.join('、')} | 流量略低但竞争少 |
| **避开** | ${schedule.avoidDays.join('、')} | 周末流量分散 |
| **最佳时段** | ${schedule.bestHours.join(' / ')} | 午休+通勤+睡前 |
| **可接受** | ${schedule.goodHours.join(' / ')} | 晨间+上午 |
| **避开** | ${schedule.avoidHours.join(' / ')} | 凌晨+午后低谷 |

**🎯 最终建议**：**${schedule.bestDays[0]} ${schedule.bestHours[0]}** 发布，预留1小时预热时间。

---

## 📊 视频参数

| 参数 | 值 |
|------|-----|
| 分辨率 | ${config.width || 1080}×${config.height || 1920}（竖屏 9:16） |
| 帧率 | ${config.fps || 30}fps |
| 主题 | ${config.theme || 'tokyo-night'} |
| 配音 | ${config.voice || 'zh-CN-YunjianNeural'} (语速+${config.speed || 20}%) |
| 原场景数 | ${origScenes.length} |
| 总场景数 | ${scenes.length} |
| 预计时长 | ${scenes.reduce((a, s) => a + (s.duration || 3), 0).toFixed(0)}s |
`;
}

// ========== CLI 入口 ==========
function main() {
  const args = process.argv.slice(2);
  let configPath = '';
  let outputPath = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') configPath = args[++i];
    if (args[i] === '--output') outputPath = args[++i];
  }

  if (!configPath) {
    console.error('用法: node generate_content_pack.js --config config.json [--output content_pack.md]');
    process.exit(1);
  }

  if (!outputPath) {
    outputPath = path.join(path.dirname(path.resolve(configPath)), 'content_pack.md');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const content = generateContentPack(config);

  // 确保输出目录存在
  const outDir = path.dirname(path.resolve(outputPath));
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`✅ 内容包已生成: ${outputPath}`);
  console.log(`   包含: 原文链接 | 短视频文案 | 2个爆款标题 | 发布标签 | BGM选曲 | 发布时间建议`);
}

module.exports = { generateContentPack };

if (require.main === module) {
  main();
}
