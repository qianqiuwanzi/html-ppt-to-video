/**
 * run_render_with_node_path.js — 用 cmd /c 设置 NODE_PATH 后运行渲染
 */

'use strict';

const { execSync, spawn } = require('child_process');
const path = require('path');

const SKILL_DIR = 'D:/qclaw/skills/html-ppt-to-video';
const NODE_MODULES = 'D:/qclaw/skills/html-ppt-to-video/node_modules';
const CONFIG = 'D:/qclaw/workspace/video-output/config.json';
const OUTPUT = 'D:/qclaw/workspace/video-output/final_v3.mp4';

console.log('=== 运行渲染 (with NODE_PATH) ===');
console.log('');

// 构造 cmd /c 命令
// 注意：需要把路径中的 / 换成 \\
const nodeModulesWin = NODE_MODULES.replace(/\//g, '\\\\');
const skillDirWin = SKILL_DIR.replace(/\//g, '\\\\');

const cmd = `cmd /c "set NODE_PATH=${nodeModulesWin} && cd ${skillDirWin} && node render_per_scene.js --config ${CONFIG.replace(/\//g, '\\')} --output ${OUTPUT.replace(/\//g, '\\')}"`;

console.log('命令:', cmd);
console.log('');

try {
  const result = execSync(cmd, {
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 600000  // 10 分钟超时
  });
  
  console.log('');
  console.log('✓ 渲染完成！');
  console.log('  输出:', OUTPUT);
  
} catch (e) {
  console.error('');
  console.error('✗ 渲染失败:');
  if (e.stdout) console.error(e.stdout);
  if (e.stderr) console.error(e.stderr);
  console.error('  错误:', e.message);
  process.exit(1);
}
