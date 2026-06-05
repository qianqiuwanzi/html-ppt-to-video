---
name: html-ppt-to-video
description: Convert any content (webpage, text, document) to short video using html-ppt design system + hyperframes rendering pipeline. Automates theme conversion, layout generation, GSAP animation mapping, Canvas FX assignment, TTS voiceover, and post-production. Use when asked to create a video from an article, document, or any text content.
---

# html-ppt-to-video

**一句话**：输入内容 → 自动生成抖音/B站竖屏短视频。

## 架构

```
输入内容（URL/网页/文本/文档）
    ↓
[网页获取层] scripts/fetch_webpage.js  ← 新增：三级回退（HTTP→you-get→无头浏览器）
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
[后期层] mix_audio.js → final.mp4（TTS+BGM）
```

## 使用方式

### 方式1：全量渲染（快速，推荐简单场景）

1. 准备 `config.json`（场景配置）
2. 运行 `node converters/generate.js --config config.json --output-dir output/`
3. 运行 `npx hyperframes lint output/`
4. 运行 `npx hyperframes render output/ -o video-only.mp4`
5. 运行 `node mix_audio.js --config config.json --video video-only.mp4 [--bgm bgm.mp3] --output final.mp4`
6. 产出 `final.mp4`（含 TTS 配音）

### 方式2：Per-Scene 独立渲染（✅ 推荐，音画完美同步）

> 每场景独立渲染 → 独立配音 → 拼接。TTS 时长 = 视频时长，彻底解决同步问题。

```powershell
node render_per_scene.js `
  --config config.json `
  --output-dir output/ `
  [--bgm bgm.mp3] `
  [--output final.mp4] `
  [--voice zh-CN-YunjianNeural] `
  [--speed 20]
```

**输出结构**：
```
output/
  scene_00/index.html     # 场景0 HTML
  scene_00/clip.mp4       # 场景0 渲染视频（无声）
  scene_00/final.mp4       # 场景0 最终片段（配音）
  scene_01/...
  ...
  final.mp4                # 所有片段拼接结果
```

**流程**：
1. 对每个场景生成单场景 HTML
2. hyperframes 渲染（每场景独立，精确时长）
3. edge-tts 生成逐场景配音（时长 = 渲染时长）
4. FFmpeg 合并配音 + 视频（时长完美对齐）
5. FFmpeg concat 拼接 → final.mp4

### 方式3：对话式（AI驱动）

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

## 音频后期制作（mix_audio.js）

使用 `mix_audio.js`（Node.js，无 Python 依赖）：

```powershell
node mix_audio.js `
  --config config.json `
  --video video-only.mp4 `
  --bgm bgm.mp3      `# 可选：有BGM则混流，无BGM则纯配音
  --output final.mp4 `
  --voice zh-CN-YunjianNeural  `# 可选，默认云健
  --speed 20         `# 可选，默认+20%（语速快20%）
```

**流程**：
1. 从 config.json 提取每场景文本（title/kicker/items/quote 等字段）
2. edge-tts 生成逐场景 MP3（`scene_01.mp3` ~ `scene_XX.mp3`）
3. FFmpeg concat 拼接为 `combined_tts.mp3`
4. FFmpeg amix 混流 TTS + BGM（权重 1.0 : 0.12，与 daily-video-factory 一致）
5. 如果 TTS > 视频时长，自动裁剪 + 0.5s 渐出
6. FFmpeg 合并视频 + 音频 → final.mp4

**TTS 参数（USER.md 偏好）**：
- Voice: `zh-CN-YunjianNeural`（云健，清亮有力）
- Speed: `+20%`（比默认快 20%，节奏紧凑）
- 格式: MP3 192kbps

**BGM 要求**：MP3/WAV/AAC 格式，放置在 config.json 同目录或指定 `--bgm` 路径

**⚠️ 已知限制**：
- **全量模式**：TTS 时长按 config.scene.duration 分配，可能与实际渲染视频有偏差（<5s）
- **Per-Scene 模式**：✅ 完美同步，推荐使用
- 单场景渲染有 hyperframes 启动开销（每场景额外 ~3s）

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
├── render_per_scene.js          # Per-Scene 独立渲染编排脚本（v0.5.0 新增）
├── mix_audio.js                # 音频后期（TTS+BGM+混流，导出可复用函数）
├── canvas-fx.js               # 10种Canvas FX实现
├── converters/
│   ├── generate.js             # 主生成器（config → index.html）
│   │                            #  --single-scene <idx>：单场景模式
│   ├── convert_theme.js        # 主题转换器
│   ├── convert_layout.js       # 布局转换器（31种布局）
│   ├── convert_animations.js   # 动画映射器
│   ├── select_theme.js         # 主题自动选择器
│   └── map_fx.js              # Canvas FX映射器
├── scripts/
│   ├── fetch_webpage.js        # 网页获取（三级回退：HTTP→you-get→浏览器）
│   ├── parse_input.js          # 输入解析（heuristic + AI + URL 双模式）
│   └── post_production.py      # Python后期（备选，SRT字幕+PIL）
└── assets/
    └── themes/                 # hyperframes 主题CSS（35+主题）
```

## 版本

- v0.5.0 (2026-06-04): Per-Scene 独立渲染 ✅
  - ✅ generate.js: 添加 `generateSingleSceneHTML()` + `--single-scene <idx>` CLI
  - ✅ mix_audio.js: 重构为可导出模块（extractSceneText / generateTTS / mergeAudioClip / concatClips）
  - ✅ render_per_scene.js: 主编排脚本（生成 → 渲染 → 配音 → 合并 → 拼接）
  - ✅ Per-Scene 模式：每场景 TTS 时长 = 视频时长，音画完美同步
  - ✅ 单场景测试通过（s1 cover，6s，366KB，ffprobe 确认 6.000000s）
  - ⚠️ BGM 在 per-scene 模式下每场景重复混流（可优化为最后统一混流）

- v0.4.0 (2026-06-04): 选择器修复 + TTS+BGM音频管线
  - ✅ generate.js: `_sceneMainSelector` 扩展（30+布局完整映射）
  - ✅ 空选择器 guard（避免空 tl.from 警告）
  - ✅ config `bullets` → `items` 字段修正
  - ✅ `overlapping_gsap_tweens` 警告 0 条（overwrite:auto）
  - ✅ `GSAP target not found` 警告 0 条
  - ✅ mix_audio.js：edge-tts + FFmpeg amix + 视频合并（Node.js版）
  - ✅ TTS 云健音色 +20%语速，配置与 USER.md 一致
  - ✅ TTS自动裁剪 + 渐出（video 优先）

- v0.3.0 (2026-06-03): 网页内容获取
  - ✅ fetch_webpage.js：三级回退策略（HTTP → you-get → 无头浏览器）
  - ✅ 支持 17+ 站点自动识别（微信、知乎、B站、抖音、YouTube 等）
  - ✅ JS 动态渲染页面自动回退到浏览器渲染
  - ✅ 支持 Puppeteer / Playwright / xbrowser 三种浏览器引擎
  - ✅ parse_input.js 集成 --url 参数，一行命令从URL生成视频配置
  - ✅ 自动提取网页元数据（标题、作者、日期、图片列表）

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
  - ✅ 输入解析扩展（微信文章URL、任意网页URL）— v0.3.0
  - ⏳ 输入解析扩展（Word/PPT/PDF文档）
  - ✅ AI全自动（输入任意内容→输出final.mp4）
  - ⚠️ SRT字幕拆分算法需优化（中英文混排断词）
