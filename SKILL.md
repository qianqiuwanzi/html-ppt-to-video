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
[多样性分配层] diversity_assigner.js ← v0.6.0 新增
    ├─ >30s: 全部 31布局 + 27动画 + 20FX 均匀分配
    └─ ≤30s: 一半（向上取整）均匀分配
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

## Canvas FX（20种）

| FX 名称 | 说明 |
|---------|------|
| particle-burst | 粒子爆发 |
| matrix-rain | 矩阵雨 |
| bokeh | 散景光斑 |
| aurora | 极光 |
| gradient-wave | 渐变波浪 |
| pulse-ring | 脉冲环 |
| trail | 轨迹拖尾 |
| lightning | 闪电 |
| firework | 烟花 |
| spiral | 螺旋 |
| neon-grid | 霓虹网格 |
| snow-fall | 雪花飘落 |
| smoke-drift | 烟雾飘散 |
| star-field | 星空闪烁 |
| ripple-expand | 涟漪扩展 |
| laser-sweep | 激光扫描 |
| dna-helix | DNA 双螺旋 |
| wave-ocean | 海浪 |
| pixel-rain | 像素雨 |
| geo-pulse | 几何脉冲 |

## 🎯 多样性分配规则（v0.6.0）

**自动生效**：`render_per_scene.js` 在执行前自动调用 `diversity_assigner.js`，无需手动配置。

| 视频时长 | 布局 | 动画 | FX |
|----------|------|------|-----|
| **> 30s** | 全部 31 种 | 全部 27 种 | 全部 20 种 |
| **≤ 30s** | 16 种（ceil(31/2)） | 14 种（ceil(27/2)） | 10 种（ceil(20/2)） |

**分配策略**：
- 所有类型均匀洗牌后分配到各场景（全部自动，不保留手动指定）
- 布局优先分配通用数据兼容的（generic），其次数据结构型的（data）
- 动画分配跳过 `parallax-tilt`（hover 效果，视频不适用）

**⚠️ 注意**：config.json 中的 `layout`、`data.animation`、`fx` 字段会被 diversity_assigner **全部覆盖**。如需固定某个场景的布局/动画/FX，请在分配后手动修改生成的 config。

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

## 文案撰写（网感规则）

### 约束（从源头杜绝返工）

> **🔴 强制规则：整体文案中必须有3句>15字的长句**
> - 符合正常人类写作习惯，允许部分句子略长以表达完整意思
> - 至少有3句超过15字（含标点），其余句子<=15字
> - 示例：✅ "DeepSeek这波降价真的把我震惊到了"（17字） ❌ "每句都<=15字"（像机器人）
> - 生成规则：长句用于表达复杂观点，短句用于节奏感

### 文案开头三句

| 句次 | 必须包含 | 示例 |
|------|---------|------|
| **第一句** | 核心问题或痛点 | "自媒体人最头疼的就是内容创作效率" |
| **第二句** | 解决方案(产品名) | "有了美图 RoboNeo,一个人搞定一个团队" |
| **第三句** | 核心价值 | "AI自动生成内容,速度快10倍" |

❌ 禁止无意义寒暄（"说实话"、"讲真"仅必要时用）

### 8段式结构

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

**必须包含**：直接点明主题 + 产品名/品牌名 + 主观观点 + 专业词通俗化 + 对比吐槽 + 互动钩子
**禁止**：无意义寒暄 / 说明书式 / 空洞口号 / 没有感情的陈述句 / 没有互动的结尾

### 互动结尾模板（必选其一）

- 选择题型：`你更看重{A}还是{B}?评论区告诉我 👇`
- 场景提问型：`你们团队用什么{场景}?求推荐 👀`
- 钩子型：`关注我,每天带你发现一个{主题} 🔔`

---

## 竖屏布局规范

**三区域结构(1080x1920)**：

| 区域 | 高度范围 | 占比 | 内容 |
|------|---------|------|------|
| 字幕区 | y=1248..1920px | 15% | SRT字幕,距底部80-120px |

**字幕位置**：竖屏距底部80-120px（MarginV=100），字号40-48px（推荐44px），单行≤15字

## 字幕规则（参考 daily-video-factory 规则 #5）

> **🔴 强制规则，违反 = 拒绝发布**

| # | 规则 | 最低要求 | 原因 |
|---|------|---------|------|
| #5 | **字幕** | ≤15字/行,**单行显示**,**音画同步**,横屏32px(标准28-36px)/竖屏44px(标准40-48px) | 禁止多行,禁止不同步 |

### 规则 #5：字幕显示

**执行脚本**：`inject_subtitle_gsap.js`（v0.8.0+）

1. **≤15字/行**：
   - `MAX_CHARS_PER_LINE = 15`
   - 超出部分用 `...` 表示（禁用 `…` 非ASCII字符）
   - 函数 `truncateLine()` 实现截断逻辑

2. **单行显示**：
   - 字幕逐行显示（非多行同时显示）
   - 使用 GSAP 时序控制每行显示/隐藏
   - 当前行显示时，其他行隐藏（`class="subtitle-line"` + `display: none` + `active` 类控制）

3. **音画同步**：
   - 每行显示时间 = 场景时长 / 行数（`perLineDuration = duration / lines.length`）
   - 首行延迟 0.4s 出现（用户体验优化）
   - 行间隔 0.1s（`LINE_GAP = 0.1`）

4. **字体大小**：
   - 竖屏（9:16）：`FONT_SIZE_VERTICAL = 44px`（标准 40-48px，距底部 80-120px）
   - 横屏（16:9）：`FONT_SIZE_HORIZONTAL = 32px`（标准 28-36px）
   - 通过 `orientation` 参数自动选择（`vertical` | `horizontal`）

5. **竖屏字幕位置**：
   - `BOTTOM_OFFSET = 100px`（距底部 80-120px 中值，MarginV=100）
   - 位于字幕区域（y=1248..1920px）

6. **样式**：
   - 背景：半透明黑色（`rgba(0,0,0,0.62)`）
   - 文字颜色：白色（`#fff`）
   - 圆角：10px
   - 最大宽度：88%
   - 字体：`Inter`, sans-serif
   - 行高：1.5

### 字幕注入流程

1. `render_per_scene.js` 调用 `injectSubtitleGSAP(html, subtitle, duration, orientation)`
2. 解析字幕文本（`|` 分隔符）
3. 截断超长行（`truncateLine()`）
4. 注入字幕 CSS（如果还没有 `.subtitle-container`）
5. 注入字幕 HTML（容器 + 逐行 `<span>`，全部隐藏）
6. 注入 GSAP 逐行时序动画（淡入 + 淡出）

### 已知问题修复（v0.7.0 - v0.8.0）

- ✅ **v0.7.0**：修复 BOM 问题（UTF-8 BOM 导致 Node.js `require()` 失败）
- ✅ **v0.7.0**：修复非 ASCII 字符问题（`…` 改成 `...`）
- ✅ **v0.7.0**：修复淡出时间参数（传入 `ttsDuration`）
- ✅ **v0.7.0**：修复字幕重复注入（移除 `converters/generate.js` 中的字幕注入代码）

---

## 技术约束

1. **🔴 视频总时长：45~120 秒**
   - 生成的视频总时长必须在 **45~120 秒** 之间
   - 短于 45 秒 → 内容太单薄，不够抖音完播率要求
   - 超过 120 秒 → 太长，观众流失，建议拆分为多集
   - 执行时机：场景拆分时预估总时长，超出范围时调整场景数量或单场景时长

2. **渲染防OOM**：`--workers 1 --quality draft`（12GB内存系统）
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
├── diversity_assigner.js       # 多样性分配器（v0.6.0）
├── render_per_scene.js          # Per-Scene 独立渲染编排脚本
├── mix_audio.js                # 音频后期（TTS+BGM+混流）
├── canvas-fx.js               # 20种Canvas FX实现
├── converters/
│   ├── generate.js             # 主生成器（config → index.html）
│   ├── convert_theme.js        # 主题转换器
│   ├── convert_layout.js       # 布局转换器（31种布局）
│   ├── convert_animations.js   # 动画映射器（27种动画）
│   ├── select_theme.js         # 主题自动选择器
│   └── map_fx.js              # Canvas FX映射器（20种FX）
├── scripts/
│   ├── fetch_webpage.js        # 网页获取（三级回退）
│   ├── parse_input.js          # 输入解析
│   └── post_production.py      # Python后期（备选）
└── assets/
    └── themes/                 # 35+主题CSS
```

## 版本

- v0.6.0 (2026-06-05): 多样性分配 + Canvas FX 扩展 ✅
  - ✅ 新增 `diversity_assigner.js`：核心分配器
  - ✅ 规则：>30s 用全部 31布局+27动画+20FX，≤30s 用一半
  - ✅ `render_per_scene.js` 自动集成分配器（渲染前自动分配）
  - ✅ `canvas-fx.js`：10种 → 20种 FX（新增 neon-grid, snow-fall, smoke-drift, star-field, ripple-expand, laser-sweep, dna-helix, wave-ocean, pixel-rain, geo-pulse）
  - ✅ `convert_animations.js`：26种 → 27种（新增 bounce-in）
  - ✅ `map_fx.js`：扩展 FX 映射到 20 种，覆盖全部布局默认 FX
  - ✅ `generate.js`：`_guessAnimation` 覆盖全部 31 种布局
  - ✅ 全部自动分配，覆盖用户手动指定（保证多样性最大化）

- v0.7.0 (2026-06-05): 多样性分配器根因修复 ✅
  - ✅ 修复 `explodeScenes` 子场景共享 `data` 引用导致动画覆盖（deep clone）
  - ✅ 修复动画分配 27/27（之前 7/27，根因：子场景 `data` 是浅拷贝，同一父场景的所有子场景共享同一 `data` 对象）
  - ✅ `assignDiversity` 使用 `JSON.parse(JSON.stringify(...))` deep clone
  - ✅ 测试通过：7 场景 → 35 子场景，布局 31/31，动画 27/27 ✅，FX 20/20

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
