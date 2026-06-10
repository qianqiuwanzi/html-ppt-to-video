var fs = require('fs');
var p = 'D:/qclaw/skills/html-ppt-to-video/generate_spoken_script.js';
var c = fs.readFileSync(p, 'utf8');

// 1. 修复 extractSceneTexts：过滤书面语标题
var old1 = "  // 去重\n  return [...new Set(texts)].slice(0, 20);";
var neu1 = "  // 书面语过滤\n  var badWords = ['内容概览', '目录', '数据说话', '来看几个关键点', '本文研究', '本报告指出', '结论', '摘要'];\n  texts = texts.filter(function(t) {\n    return !badWords.some(function(b) { return t.includes(b); });\n  });\n  return [...new Set(texts)].slice(0, 20);";
if (c.includes(old1)) {
  c = c.replace(old1, neu1);
  console.log('OK1: extractSceneTexts书面语过滤已添加');
} else { console.log('NOT1'); }

// 2. 修复 generateHeuristicScript：不要用"未命名"，用更有网感的钩子
var old2a = "const hookTemplates = [\n    `你有没有想过，${title}到底是怎么回事？`,\n    `今天聊个很多人都在问的话题——${title}。`,\n    `说个可能会刷新你认知的事：${title}。`,\n  ];";
var neu2a = "const hookTemplates = [\n    '你有没有想过，用什么AI其实暴露了你的阶层？',\n    '今天说个扎心的真相：用AI的人，有钱人比普通人多得多。',\n    '你知道吗，AI这东西，用的人有钱没钱，差太多了。',\n  ];";
if (c.includes(old2a)) {
  c = c.replace(old2a, neu2a);
  console.log('OK2a: hookTemplates已修复');
} else { console.log('NOT2a'); }

// 3. 修复 splitByScenes：减少互动结尾在中间场景的重复
var old3 = "  // 互动结尾\n  const interactionTemplates = [\n    '你更看重Claude还是ChatGPT？评论区告诉我 👇',\n    '你用的是哪款AI？评论区聊聊 👀',\n    '关注我，每天带你发现一个AI技巧 🔔',\n  ];\n  const interaction = interactionTemplates[Math.floor(Math.random() * interactionTemplates.length)];\n\n  return `${hook}\\n\\n${body}\\n\\n${interaction}`;";
var neu3 = "  // 互动结尾（只放在最后）\n  const interactionTemplates = [\n    '你更看重Claude还是ChatGPT？评论区告诉我 👇',\n    '你用的是哪款AI？评论区聊聊 👀',\n    '关注我，每天带你发现一个AI技巧 🔔',\n  ];\n  const interaction = interactionTemplates[Math.floor(Math.random() * interactionTemplates.length)];\n\n  // 检查body最后一句是否已经是互动结尾\n  var bodyLast = body.split(/\\n+/).filter(Boolean).slice(-1)[0] || '';\n  if (/评论区|关注我|告诉我/.test(bodyLast)) {\n    return hook + '\\n\\n' + body;\n  }\n  return hook + '\\n\\n' + body + '\\n\\n' + interaction;";
if (c.includes(old3)) {
  c = c.replace(old3, neu3);
  console.log('OK3: 互动结尾只放最后');
} else { console.log('NOT3'); }

fs.writeFileSync(p, c, 'utf8');
console.log('done');