/**
 * test_render_v3.js — 设置 NODE_PATH 后运行渲染测试
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const SKILL_DIR = 'D:/qclaw/skills/html-ppt-to-video';
const NODE_MODULES = path.join(SKILL_DIR, 'node_modules');
const CONFIG = 'D:/qclaw/workspace/video-output/config.json';
const OUTPUT = 'D:/qclaw/workspace/video-output/final_v3.mp4';

console.log('=== 渲染测试 v3 (with NODE_PATH) ===');
console.log('NODE_PATH:', NODE_MODULES);
console.log('');

// 设置环境变量
const env = Object.assign({}, process.env, {
  NODE_PATH: NODE_MODULES + (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : '')
});

try {
  // 先测试 puppeteer 是否可解析
  console.log('[1/3] 测试 puppeteer 解析...');
  const testResult = execSync('node -e "console.log(require.resolve(\'puppeteer\'))"', {
    encoding: 'utf8',
    env,
    cwd: SKILL_DIR
  });
  console.log('  ✓ puppeteer:', testResult.trim());
} catch (e) {
  console.error('  ✗ puppeteer 解析失败:', e.message);
  process.exit(1);
}

console.log('');
console.log('[2/3] 运行 render_per_scene.js...');
console.log('  配置:', CONFIG);
console.log('  输出:', OUTPUT);
console.log('');

try {
  const renderCmd = `node render_per_scene.js --config "${CONFIG}" --output "${OUTPUT}"`;
  console.log('  命令:', renderCmd);
  console.log('');
  
  execSync(renderCmd, {
    encoding: 'utf8',
    env,
    cwd: SKILL_DIR,
    stdio: 'inherit',  // 直接输出到控制台
    timeout: 300000  // 5 分钟超时
  });
  
  console.log('');
  console.log('✓ 渲染完成！');
  console.log('  输出文件:', OUTPUT);
  
} catch (e) {
  console.error('');
  console.error('✗ 渲染失败:');
  if (e.stdout) console.error(e.stdout);
  if (e.stderr) console.error(e.stderr);
  console.error('  错误:', e.message);
  process.exit(1);
}
