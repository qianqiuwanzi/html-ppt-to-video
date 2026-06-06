/**
 * fix_puppeteer_path.js — 修复 puppeteer 安装路径
 * 从 lib\node_modules\ 移动到 node_modules\
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = 'D:/qclaw/skills/html-ppt-to-video';
const WRONG_DIR = path.join(SKILL_DIR, 'lib', 'node_modules');
const CORRECT_DIR = path.join(SKILL_DIR, 'node_modules');

console.log('=== 修复 puppeteer 路径 ===');
console.log('错误位置:', WRONG_DIR);
console.log('正确位置:', CORRECT_DIR);
console.log('');

// 1. 检查错误位置是否存在
if (!fs.existsSync(WRONG_DIR)) {
  console.error('✗ 错误位置不存在:', WRONG_DIR);
  console.error('  请先运行: cd D:/qclaw/skills/html-ppt-to-video/lib && npm install puppeteer');
  process.exit(1);
}

// 2. 创建正确位置
if (!fs.existsSync(CORRECT_DIR)) {
  fs.mkdirSync(CORRECT_DIR, { recursive: true });
  console.log('✓ 创建目录:', CORRECT_DIR);
} else {
  console.log('✓ 目录已存在:', CORRECT_DIR);
}

// 3. 移动 puppeteer 目录
const puppeteerWrong = path.join(WRONG_DIR, 'puppeteer');
const puppeteerCorrect = path.join(CORRECT_DIR, 'puppeteer');

if (fs.existsSync(puppeteerWrong)) {
  if (fs.existsSync(puppeteerCorrect)) {
    console.log('  目标已存在，先删除...');
    fs.rmSync(puppeteerCorrect, { recursive: true, force: true });
  }
  
  try {
    fs.cpSync(puppeteerWrong, puppeteerCorrect, { recursive: true });
    console.log('✓ 复制 puppeteer:');
    console.log('  ', puppeteerWrong);
    console.log('  →', puppeteerCorrect);
    
    // 删除旧目录
    fs.rmSync(puppeteerWrong, { recursive: true, force: true });
    console.log('✓ 删除旧目录:', puppeteerWrong);
  } catch (e) {
    console.error('✗ 复制失败:', e.message);
    process.exit(1);
  }
} else {
  console.log('! puppeteer 在错误位置不存在，跳过');
}

// 4. 移动其他依赖（@puppeteer 命名空间包）
const packages = fs.readdirSync(WRONG_DIR).filter(p => {
  return fs.statSync(path.join(WRONG_DIR, p)).isDirectory();
});

console.log('');
console.log('发现包:', packages.length);

for (const pkg of packages) {
  const src = path.join(WRONG_DIR, pkg);
  const dst = path.join(CORRECT_DIR, pkg);
  
  if (fs.existsSync(dst)) {
    console.log(`  跳过 ${pkg} (已存在)`);
    continue;
  }
  
  try {
    fs.cpSync(src, dst, { recursive: true });
    console.log(`✓ 复制 ${pkg}`);
    
    // 删除旧目录
    fs.rmSync(src, { recursive: true, force: true });
  } catch (e) {
    console.error(`✗ 复制 ${pkg} 失败:`, e.message);
  }
}

// 5. 验证
console.log('');
console.log('=== 验证 ===');

try {
  // 临时修改 NODE_PATH 让它找到正确位置
  const puppeteerPath = require.resolve('puppeteer', {
    paths: [CORRECT_DIR, SKILL_DIR]
  });
  console.log('✓ puppeteer 可解析:', puppeteerPath);
} catch (e) {
  console.error('✗ puppeteer 仍无法解析:', e.message);
  console.error('  尝试设置 NODE_PATH...');
  
  // 设置 NODE_PATH 并重新验证
  process.env.NODE_PATH = CORRECT_DIR;
  require('module').Module._initPaths();
  
  try {
    const puppeteerPath = require.resolve('puppeteer');
    console.log('✓ puppeteer 可解析 (via NODE_PATH):', puppeteerPath);
  } catch (e2) {
    console.error('✗ 仍然失败:', e2.message);
  }
}

console.log('');
console.log('=== 完成 ===');
console.log('如果验证通过，请重新运行 render_per_scene.js');
