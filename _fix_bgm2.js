// 临时修复脚本：替换 pickRealBGM 函数
var fs = require('fs');
var p = 'D:/qclaw/skills/html-ppt-to-video/generate_content_pack.js';
var c = fs.readFileSync(p, 'utf8');

// 旧的 pickRealBGM 函数（错误路径）
var oldFunc = `function pickRealBGM(config) {
  const bgmStyle = config.bgmStyle || 'tech-corporate';
  const bgmMood = config.bgmMood || 'ambient';

  // bgm-library 技能实际路径（Windows: %USERPROFILE%\\.qclaw\\skills）
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const bgmBase = path.join(home, '.qclaw', 'skills', 'bgm-library', 'bgm');

  const styleDirMap = {
    'tech-corporate': 'tech-corporate',
    'social-media': 'social-media',
    'startup': 'startup',
  };
  const dir = styleDirMap[bgmStyle] || 'tech-corporate';
  const targetDir = path.join(bgmBase, dir);

  if (!fs.existsSync(targetDir)) {
    return { name: bgmStyle, file: '(bgm-library 目录未找到: ' + targetDir + ')', mood: bgmMood };
  }

  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.mp3'));
  if (files.length === 0) {
    return { name: bgmStyle, file: '(该风格无 mp3 文件)', mood: bgmMood };
  }

  const moodFiles = files.filter(f => f.toLowerCase().includes(bgmMood.toLowerCase()));
  const chosen = moodFiles.length > 0 ? moodFiles : files;
  const picked = chosen[Math.floor(Math.random() * chosen.length)];

  return {
    name: bgmStyle,
    file: picked,
    mood: bgmMood,
    fullPath: path.join(targetDir, picked),
  };
}`;

// 新的 pickRealBGM 函数（正确路径）
var newFunc = `function pickRealBGM(config) {
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
}`;

if (c.includes(oldFunc)) {
  c = c.replace(oldFunc, newFunc);
  fs.writeFileSync(p, c, 'utf8');
  console.log('✅ pickRealBGM 路径已修复');
} else {
  console.log('⚠ 未找到旧函数，请手动检查');
  // 打印当前 pickRealBGM 内容的前500字符
  var idx = c.indexOf('function pickRealBGM');
  if (idx >= 0) console.log(c.substring(idx, idx + 600));
}
