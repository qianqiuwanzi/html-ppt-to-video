// 修复 render_per_scene.js：把 async IIFE 文案生成改为同步 execSync
var fs = require('fs');
var p = 'D:/qclaw/skills/html-ppt-to-video/render_per_scene.js';
var c = fs.readFileSync(p, 'utf8');

// 找 async block 的起点和终点
var oldStart = '// ========== [v1.1.0] 口播文案生成（自然语言生成模式）==========';
var oldStartIdx = c.indexOf(oldStart);
if (oldStartIdx < 0) {
  console.log('❌ 未找到文案生成块起点');
  process.exit(1);
}

// 找 async block 的终点 })();
var afterOld = c.indexOf('})();', oldStartIdx);
if (afterOld < 0) {
  console.log('❌ 未找到 })();');
  process.exit(1);
}
afterOld += '})();'.length;

var oldBlock = c.substring(oldStartIdx, afterOld);
console.log('找到旧文案生成块，长度:', oldBlock.length, '字节');

// 新的同步块（使用 execSync 调用子进程）
var newNarrBlock = `// ========== [v1.1.0] 口播文案生成（自然语言模式）==========
// 旧方案：模板拼接 narration（机械、不口语）
// 新方案：generate_spoken_script.js → AI生成整篇口播稿 → 按场景拆分 → narration
//
// 优先级：generate_spoken_script.js（有API Key时AI生成） > generate_narration.js（模板拼接） > 已有 narration
(function() {
  console.log('[0/5] 生成口播文案 (v1.1.0 自然语言模式)...');

  var nCount = 0;
  for (var si = 0; si < config.scenes.length; si++) {
    if (config.scenes[si].data && config.scenes[si].data.narration && config.scenes[si].data.narration.trim()) nCount++;
  }

  // 方案1：generate_spoken_script.js（AI自然语言生成，有 OPENAI_API_KEY 时）
  if (process.env.OPENAI_API_KEY && nCount < config.scenes.length * 0.5) {
    console.log('  [方案1] generate_spoken_script.js（AI生成整篇口播稿）...');
    try {
      var tmpOut = path.join(path.dirname(configPath), '.spoken_tmp.json');
      execSync('node "' + __dirname + '/generate_spoken_script.js" --config "' + configPath + '" --output "' + tmpOut + '"',
        { stdio: 'inherit', cwd: __dirname, shell: true }
      );
      if (fs.existsSync(tmpOut)) {
        var result = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
        fs.unlinkSync(tmpOut);
        if (result.sceneScripts) {
          for (var i = 0; i < config.scenes.length; i++) {
            if (result.sceneScripts[i]) {
              if (!config.scenes[i].data) config.scenes[i].data = {};
              config.scenes[i].data.narration = result.sceneScripts[i];
            }
          }
          config._fullScript = result.fullScript;
          config._scriptStats = result.stats;
          var fn = config.scenes.filter(function(s){ return s.data && s.data.narration && s.data.narration.trim(); }).length;
          console.log('  ✓ 口播稿已写入 narration: ' + fn + '/' + config.scenes.length + ' 场景');
          console.log('  ✓ 质量: ' + result.stats.quality + ' | 长句' + result.stats.longSentences + '句 | '
            + (result.stats.hasInteraction ? '有' : '无') + '互动结尾');
        }
      }
    } catch(e) {
      console.warn('  ⚠ AI生成失败: ' + e.message + ' → 回退到方案2');
    }
  }

  // 方案2：generate_narration.js（模板拼接，填充未填 narration 的场景）
  var n2c = 0;
  for (var sj = 0; sj < config.scenes.length; sj++) {
    if (config.scenes[sj].data && config.scenes[sj].data.narration && config.scenes[sj].data.narration.trim()) n2c++;
  }
  if (n2c < config.scenes.length) {
    console.log('  [方案2] generate_narration.js（模板拼接，' + n2c + '/' + config.scenes.length + '已有文案）...');
    try {
      var narPath = path.join(__dirname, 'generate_narration.js');
      if (fs.existsSync(narPath)) {
        var { generateNarration } = require(narPath);
        var nr = generateNarration(config, { voice: voice, speed: speed });
        if (nr.scenes) {
          for (var k = 0; k < nr.scenes.length; k++) {
            if (nr.scenes[k] && nr.scenes[k].data && nr.scenes[k].data.narration) {
              if (!config.scenes[k].data) config.scenes[k].data = {};
              config.scenes[k].data.narration = nr.scenes[k].data.narration;
            }
          }
        }
      }
    } catch(e2) {
      console.warn('  ⚠ 模板拼接失败: ' + e2.message);
    }
  }

  var fN = config.scenes.filter(function(s){ return s.data && s.data.narration && s.data.narration.trim(); }).length;
  console.log('  ✓ 口播文案完成: ' + fN + '/' + config.scenes.length + ' 场景');
  if (fN === 0) console.warn('  ⚠ 所有场景无口播文案，配音将使用 data.title');
})();
`;

// 执行替换
c = c.substring(0, oldStartIdx) + newNarrBlock + c.substring(afterOld);

fs.writeFileSync(p, c, 'utf8');
console.log('✅ render_per_scene.js 文案生成块已替换为同步版本');
console.log('替换前:', oldBlock.length, '字节 → 替换后:', newNarrBlock.length, '字节');