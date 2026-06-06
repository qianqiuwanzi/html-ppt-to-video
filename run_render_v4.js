const { execSync } = require('child_process');
const path = require('path');

const SKILL_DIR = 'D:\\qclaw\\skills\\html-ppt-to-video';
const CONFIG = 'D:\\qclaw\\workspace\\video-output\\config.json';
const OUTPUT = 'D:\\qclaw\\workspace\\video-output\\final_v4.mp4';

const cmd = `set NODE_PATH=${SKILL_DIR}\\node_modules && cd ${SKILL_DIR} && node render_per_scene.js --config "${CONFIG}" --output "${OUTPUT}"`;

console.log('启动渲染（3个Bug已修复）...');
console.log('命令:', cmd.substring(0, 120) + '...');

try {
  const out = execSync(`cmd /c "${cmd}"`, { encoding: 'utf8', shell: 'cmd.exe', stdio: 'inherit', timeout: 600000 });
  console.log('\n✓ 渲染完成！');
  console.log('输出:', OUTPUT);
} catch (e) {
  console.error('\n✗ 渲染失败:', e.message);
  process.exit(1);
}
