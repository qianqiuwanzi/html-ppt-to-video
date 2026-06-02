# html-ppt-to-video

> Convert html-ppt presentations to hyperframes videos — 把交互式 HTML 幻灯片自动转成 MP4 视频

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/qianqiuwanzi/html-ppt-to-video?style=social)](https://github.com/qianqiuwanzi/html-ppt-to-video)

---

## ✨ 功能亮点

- 🎨 **36 主题自动匹配** — 根据内容关键词智能选择主题（科技/商务/创意/教育/暗黑）
- 📐 **31 种布局** — cover / toc / bullets / comparison / process-steps / cta 等
- 🎬 **27 种 CSS 动画** — fadeIn / slideUp / zoomIn / bounce 等（自动转 GSAP timeline）
- ✨ **20 种 Canvas FX** — particle-field / matrix-rain / ripple 等（通过 `data-fx` 属性触发）
- 🤖 **自动主题选择** — 无需手动指定，根据场景内容自动匹配最佳主题
- 🎥 **Hyperframes 渲染** — 输出专业级 MP4 视频（1080p / 4K 可选）

---

## 📦 安装

### 前提条件

- [Node.js](https://nodejs.org/) ≥ 18.0
- [Python](https://python.org/) ≥ 3.8
- [Hyperframes CLI](https://hyperframes.io/)（可选，用于最终渲染）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/qianqiuwanzi/html-ppt-to-video.git
cd html-ppt-to-video

# 安装 Node.js 依赖
npm install

# 安装 Python 依赖
pip install -r requirements.txt
```

---

## 🚀 快速开始

### 1. 准备配置文件（`config.json`）

```json
{
  "title": "AI 工具评测报告",
  "scenes": [
    {
      "layout": "cover",
      "data": {
        "title": "AI 工具评测",
        "keyword": "AI",
        "speaker": "大卫",
        "date": "2026-06"
      }
    },
    {
      "layout": "bullets",
      "data": {
        "title": "核心功能",
        "items": ["智能配音", "自动字幕", "一键成片"]
      }
    },
    {
      "layout": "cta",
      "data": {
        "title": "立即体验",
        "subtitle": "关注公众号获取更多教程",
        "button": "点击关注"
      }
    }
  ]
}
```

### 2. 生成 HTML 演示文稿

```bash
node converters/generate.js --config config.json --output output/
```

输出：`output/index.html`（可在浏览器中预览）

### 3. 渲染 MP4 视频

```bash
# 使用 Hyperframes CLI
hyperframes render output/ --output final.mp4 --resolution 1920x1080 --fps 30

# 或使用 post_production.py（带后处理）
python scripts/post_production.py --input output/ --output final.mp4 --music bgm.mp3
```

---

## 📖 配置说明

### `config.json` 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 演示文稿标题 |
| `theme` | string | ❌ | 指定主题（如 `tokyo-night`/`cyberpunk-neon`），不填则自动选择 |
| `resolution` | string | ❌ | 输出分辨率（`1920x1080`/`1080x1920`/`3840x2160`） |
| `scenes` | array | ✅ | 场景列表（见下方） |

### `scenes[]` 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `layout` | string | ✅ | 布局名称（31 种可选） |
| `data` | object | ✅ | 布局数据（每种布局不同，见示例） |
| `fx` | string | ❌ | Canvas FX 名称（20 种可选） |
| `animation` | string | ❌ | 入场动画（27 种可选） |
| `duration` | number | ❌ | 场景时长（秒），默认 5 |

---

## 🎨 主题列表（36 种）

### 科技未来感
- `cyberpunk-neon` — 赛博朋克霓虹
- `tokyo-night` — 东京之夜
- `matrix-green` — 黑客帝国绿
- `neon-glow` — 霓虹发光

### 商务专业
- `corporate-blue` — 商务蓝
- `minimalist-white` — 极简白
- `dark-elegant` — 暗黑优雅
- `golden-executive` — 金色高管

### 创意活泼
- `sunset-gradient` — 日落渐变
- `ocean-breeze` — 海洋微风
- `forest-green` — 森林绿
- `candy-pop` — 糖果流行

（完整列表见 `converters/convert_theme.js`）

---

## 📐 布局示例（31 种）

### 基础布局

**cover** — 封面
```json
{
  "layout": "cover",
  "data": {
    "title": "主标题",
    "keyword": "关键词",
    "speaker": "演讲者",
    "date": "日期"
  }
}
```

**bullets** — 要点列表
```json
{
  "layout": "bullets",
  "data": {
    "title": "标题",
    "items": ["要点1", "要点2", "要点3"]
  }
}
```

**two-column** — 两栏
```json
{
  "layout": "two-column",
  "data": {
    "title": "标题",
    "left": "左栏内容",
    "right": "右栏内容"
  }
}
```

### 数据可视化

**chart-bar** — 柱状图
```json
{
  "layout": "chart-bar",
  "data": {
    "title": "销售数据",
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "data": [120, 180, 240, 310]
  }
}
```

**kpi-grid** — KPI 网格
```json
{
  "layout": "kpi-grid",
  "data": {
    "kpis": [
      { "num": "10,000+", "label": "用户", "desc": "累计注册" },
      { "num": "98%", "label": "满意度", "desc": "用户好评" }
    ]
  }
}
```

（更多布局示例见 `examples/` 目录）

---

## 🎬 动画列表（27 种）

| 动画名称 | 效果 |
|---------|------|
| `fadeIn` | 淡入 |
| `fadeInUp` | 向上淡入 |
| `fadeInDown` | 向下淡入 |
| `slideUp` | 向上滑入 |
| `slideLeft` | 向左滑入 |
| `slideRight` | 向右滑入 |
| `zoomIn` | 缩放淡入 |
| `bounce` | 弹跳 |
| `rotateIn` | 旋转淡入 |
| `typewriter` | 打字机 |
| `glitch` | 故障效果 |

（完整列表见 `converters/convert_animations.js`）

---

## ✨ Canvas FX 列表（20 种）

| FX 名称 | 效果 |
|---------|------|
| `particle-field` | 粒子场 |
| `matrix-rain` | 矩阵雨 |
| `ripple` | 涟漪 |
| `network-nodes` | 网络节点 |
| `fireworks` | 烟花 |
| `snowfall` | 下雪 |
| `rain` | 下雨 |
| `lightning` | 闪电 |
| `constellation` | 星座 |
| `waveform` | 波形 |

（完整列表见 `converters/map_fx.js`）

---

## 🏗️ 技术架构

```
config.json
    ↓
parse_input.js（解析配置）
    ↓
generate.js（生成 HTML + 自动主题选择）
    ↓
converters/
    ├── convert_theme.js（主题 CSS 变量）
    ├── convert_layout.js（布局生成器）
    ├── convert_animations.js（动画映射）
    ├── map_fx.js（FX 映射）
    └── select_theme.js（自动主题选择）
    ↓
index.html（交互式演示文稿）
    ↓
Hyperframes CLI（渲染 MP4）
    ↓
post_production.py（后处理：配音/字幕/背景音乐）
    ↓
final.mp4（最终视频）
```

---

## 📂 目录结构

```
html-ppt-to-video/
├── converters/              # 转换器模块
│   ├── convert_theme.js    # 主题转换器
│   ├── convert_layout.js   # 布局转换器
│   ├── convert_animations.js # 动画转换器
│   ├── map_fx.js           # FX 映射器
│   ├── select_theme.js     # 自动主题选择
│   └── generate.js         # 主生成器
├── scripts/                # 辅助脚本
│   ├── parse_input.js      # 配置解析
│   └── post_production.py  # 后处理（配音/字幕）
├── references/             # 参考资料
│   └── test-config.json    # 测试配置
├── examples/               # 示例配置
│   ├── basic.json          # 基础示例
│   └── advanced.json      # 高级示例
├── SKILL.md                # 技能文档
├── README.md               # 本文件
└── .gitignore              # Git 忽略规则
```

---

## 🧪 测试

```bash
# 运行测试配置
node converters/generate.js --config references/test-config.json --output test-output/

# 验证输出
ls test-output/
# 应该看到 index.html
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

贡献步骤：

1. Fork 本仓库
2. 创建分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送到分支 (`git push origin feature/xxx`)
5. 创建 Pull Request

---

## 📄 许可证

[MIT License](LICENSE)

---

## 🙏 致谢

- [html-ppt](https://github.com/xxx/html-ppt) — 原始 HTML 幻灯片框架
- [Hyperframes](https://hyperframes.io/) — 视频渲染引擎
- [GSAP](https://gsap.com/) — 动画库

---

## 📧 联系方式

- 作者：大卫
- GitHub：[qianqiuwanzi](https://github.com/qianqiuwanzi)

---

**⭐ 如果这个项目对你有帮助，请给我一个 Star！**
