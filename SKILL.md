---
name: html-ppt-to-video
description: Convert any content (webpage, text, document) to short video using html-ppt design system + hyperframes rendering pipeline. Automates theme conversion, layout generation, GSAP animation mapping, Canvas FX assignment, TTS voiceover, and post-production. Use when asked to create a video from an article, document, or any text content.
---

# html-ppt-to-video

**一句话**：输入内容 → 自动生成抖音/B站竖屏短视频。

## 架构

```
输入内容（网页/文本/文档）
    ↓
[文本解析层] scripts/parse_input.js
    ↓
[脚本生成层] AI提炼要点 → scene config JSON
    ↓
[视觉转换层] converters/
    ├─ convert_theme.js     — html-ppt 36主题 → hyperframes :root CSS
    ├─ convert_layout.js    — html-ppt 31布局 → hyperframes 场景HTML + GSAP
    ├─ convert_animations.js — html-ppt 27动画 → GSAP tween映射
    └─ map_fx.js            — Canvas FX名称映射 + 默认分配
    ↓
[视频合成层] converters/generate.js → index.html
    ↓
[渲染层] npx hyperframes render → video-only.mp4
    ↓
[后期层] scripts/post_production.py → final.mp4
```

## 使用方式

### 方式1：通过配置文件（当前可用）

1. 准备 `config.json`（场景配置）
2. 运行 `node converters/generate.js --config config.json --output-dir output/`
3. 运行 `npx hyperframes lint output/`
4. 运行 `npx hyperframes render output/ -o video-only.mp4 --fps 30 --quality draft --workers 1`
5. 运行 `python scripts/post_production.py`（混流TTS+BGM）
6. 产出 `final.mp4`

### 方式2：对话式（AI驱动）

告诉夏娃：「把这篇文章做成视频」，她会：
1. 抓取/解析内容
2. AI提炼要点，生成场景配置JSON
3. 调用转换器生成index.html
4. lint → render → post-production → 交付

## 配置文件格式

```json
{
  "title": "视频标题",
  "theme": "tokyo-night",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "scenes": [
    {
      "layout": "cover",
      "id": "s1",
      "startTime": 0,
      "duration": 10,
      "data": {
        "kicker": "AI · Agent · 趋势",
        "title": "标题文字",
        "subtitle": "副标题",
        "tags": ["#标签1", "#标签2"]
      },
      "fx": "particle-burst"
    }
  ]
}
```

## 支持的布局（共31种）

| 布局 | 说明 | data字段 |
|------|------|----------|
| **cover** | 封面页 | `kicker`, `title`, `subtitle`, `tags[]` |
| **toc** | 目录页 | `kicker`, `title`, `items[{title,desc}]` |
| **bullets** | 要点列表 | `kicker`, `num`, `title`, `items[]` |
| **comparison** | 对比卡片 | `kicker`, `title`, `cols[{title,items[]}]` |
| **process-steps** | 流程步骤 | `kicker`, `title`, `steps[]` |
| **cta** | 行动号召 | `title`, `subtitle`, `url` |
| **stat-highlight** | 数据强调 | `kicker`, `big`, `value`, `label`, `desc` |
| **two-column** | 双栏布局 | `kicker`, `title`, `left{title,items[]}`, `right{title,items[]}` |
| **three-column** | 三栏布局 | `kicker`, `title`, `cols[{title,items[]}]` |
| **big-quote** | 大引言 | `quote`, `author`, `role` |
| **kpi-grid** | KPI网格 | `kpis[{label,value,unit,trend}]` |
| **data-table** | 数据表格 | `headers[]`, `rows[][]` |
| **chart-bar** | 柱状图 | `bars[{label,value,color?}]` |
| **chart-line** | 折线图 | `points[{x,y,label?}]` |
| **chart-pie** | 饼图 | `slices[{label,value,color?}]` |
| **chart-radar** | 雷达图 | `labels[]`, `values[]` |
| **code** | 代码块 | `lang`, `code` |
| **diff** | 代码对比 | `lines[{text,type('+'|'-'|' ')}]` |
| **terminal** | 终端 | `title`, `commands[]`, `output[]` |
| **flow-diagram** | 流程图 | `nodes[{id,label,next[]}]` |
| **arch-diagram** | 架构图 | `layers[{label,nodes[]}]` |
| **mindmap** | 思维导图 | `root`, `branches[{label,children[]}]` |
| **timeline** | 时间线 | `items[{date,label,desc?}]` |
| **roadmap** | 路线图 | `phases[{phase,goal,items[]}]` |
| **gantt** | 甘特图 | `tasks[{name,start,end,color?}]` |
| **pros-cons** | 优缺点 | `pros[]`, `cons[]`, `prosLabel?`, `consLabel?` |
| **image-hero** | 大图背景 | `src`, `overlay?`, `caption?` |
| **fullscreen-stat** | 全屏数据 | `big`, `value`, `label`, `sub?` |
| **highlight-box** | 高亮框 | `type('note'|'tip'|'warning'|'danger')`, `title?`, `text` |
| **numbered-list** | 编号列表 | `kicker?`, `title?`, `items[]` |
| **icon-grid** | 图标网格 | `kicker?`, `title?`, `items[{icon,label,desc?}]` |

## 支持的主题（html-ppt 36主题）

academic-paper, arctic-cool, aurora, bauhaus, blueprint, catppuccin-latte, catppuccin-mocha, corporate-clean, cyberpunk-neon, dracula, editorial-serif, engineering-whiteprint, glassmorphism, gruvbox-dark, japanese-minimal, magazine-bold, memphis-pop, midcentury, minimal-white, neo-brutalism, news-broadcast, nord, pitch-deck-vc, rainbow-gradient, retro-tv, rose-pine, sharp-mono, soft-pastel, solarized-light, sunset-warm, swiss-grid, terminal-green, tokyo-night, vaporwave, xiaohongshu-white, y2k-chrome

## Canvas FX映射

| html-ppt FX | hyperframes FX | 说明 |
|-------------|---------------|------|
| particle-burst | particle-burst | ✅ 直映射 |
| matrix-rain | matrix-rain | ✅ 直映射 |
| bokeh | bokeh | ✅ 直映射 |
| aurora | aurora | ✅ 直映射 |
| neural-net | matrix-rain | ⚠️ 近似映射 |
| knowledge-graph | matrix-rain | ⚠️ 近似映射 |
| confetti | firework | ⚠️ 近似映射 |

默认FX分配：cover→particle-burst / bullets→bokeh / comparison→lightning / cta→particle-burst / thanks→aurora

## 动画映射（html-ppt → GSAP）

| CSS动画 | GSAP from | ease |
|---------|-----------|------|
| fade-up | {y:32, opacity:0} | power3.out |
| fade-down | {y:-32, opacity:0} | power3.out |
| rise-in | {y:60, scale:0.97, opacity:0, filter:'blur(6px)'} | power3.out |
| zoom-pop | {scale:0.6, opacity:0} | back.out(1.3) |
| blur-in | {opacity:0, filter:'blur(18px)'} | power2.out |
| stagger-list | {y:30, opacity:0} + stagger:0.1 | power3.out |
| card-flip-3d | {rotateY:-90, opacity:0} | power3.out |

特殊动画（需手动实现）：typewriter, neon-glow, shimmer-sweep, gradient-flow, path-draw, glitch, spotlight, ripple-reveal

## 后期制作

- **TTS**：云健（zh-CN-YunjianNeural），语速+20%
- **混流**：video-only.mp4 + TTS音频 + BGM → final.mp4
- **字幕**：SRT格式（FFmpeg 4.4 Windows bug，需升级6.x或用软字幕）
- **封面图**：PIL生成，tokyo-night配色

## 技术约束

1. **渲染防OOM**：`--workers 1 --quality draft`（12GB内存系统）
2. **FX防遮挡**：文字密集场景（bullets>4项）自动 skipFx
3. **禁止 drawtext**：中文必须用 PIL overlay
4. **hyperframes 铁律**：
   - 所有 timeline `{ paused: true }`
   - 注册 `window.__timelines['main'] = tl`
   - 无 `repeat: -1`
   - 无异步构建 timeline
   - 场景间必须有过渡动画

## 文件结构

```
html-ppt-to-video/
├── SKILL.md                    # 本文件
├── converters/
│   ├── generate.js              # 主生成器（config → index.html，含主题自动选择）
│   ├── convert_theme.js        # 主题转换器
│   ├── convert_layout.js        # 布局转换器（31种布局）
│   ├── convert_animations.js   # 动画映射器
│   ├── select_theme.js         # 主题自动选择器（35主题关键词匹配）
│   └── map_fx.js               # Canvas FX映射器
├── scripts/
│   ├── parse_input.js          # 输入解析（✅ heuristic + AI 双模式）
│   └── post_production.py      # 后期混流（✅ TTS+BGM+SRT+PIL字幕）
└── references/
    └── test-config.json        # 测试配置
```

## 版本

- v0.1.0 (2026-06-01): 初始版本，Route-B MVP Demo
  - ✅ 主题转换（36主题CSS变量映射）
  - ✅ 布局转换（10种布局→hyperframes场景HTML+GSAP）
  - ✅ 动画映射（27种CSS动画→GSAP tween）
  - ✅ Canvas FX映射（10种直映射+4种近似映射）
  - ✅ 一键生成（config.json → index.html）
  - v0.2.0 (2026-06-02): parse_input.js 实现
  - ✅ 启发式模式（--no-ai）：段落分割 + 布局选择 + 时长计算
  - ✅ AI模式：OpenAI API 驱动内容提炼
  - ✅ Heading合并：heading 作为后续内容块的标题，不独立成场景
  - ✅ 主题自动选择：集成 select_theme.js（35主题关键词匹配）
  - ✅ FX自动分配：集成 map_fx.js
  - ✅ 竖屏字号重构：28px最小可读 + 20个新布局CSS
  - ✅ 场景出场动画：0.4s fade out
  - ⏳ 输入解析扩展（微信文章URL、Word/PPT/PDF文档）
  - ✅ AI全自动（输入任意内容→输出final.mp4）
  - ⚠️ SRT字幕拆分算法需优化（中英文混排断词）
