/**
 * patch_generate.js — 向 generate.js 注入 durationOverride 支持
 * 用法: node patch_generate.js
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'converters', 'generate.js');
let content = fs.readFileSync(file, 'utf8');

// Patch 1: 函数签名 + 变量
const before1 = "function generateSingleSceneHTML(scene, theme, width = 1080, height = 1920) {\n  const W = width, H = height;";
const after1 = "function generateSingleSceneHTML(scene, theme, width = 1080, height = 1920, opts) {\n  const W = width, H = height;\n  opts = opts || {};\n  const sceneDuration = scene.duration || 8;\n  const effectiveDuration = opts.durationOverride || sceneDuration;";
if (content.includes(before1)) {
  content = content.replace(before1, after1);
  console.log('✅ sceneDuration+effectiveDuration');
} else {
  console.error('❌ patch 1 failed');
}

// Patch 2: gsapLines replace
const before2 = "gsapLines.push(line.replace(/startTime/g, '0').replace(/SCENE_DUR/g, String(scene.duration)))";
const after2 = "gsapLines.push(line.replace(/startTime/g, '0').replace(/SCENE_DUR/g, String(effectiveDuration)))";
if (content.includes(before2)) {
  content = content.replace(before2, after2);
  console.log('✅ effectiveDuration in gsap');
} else {
  console.error('❌ patch 2 failed');
}

// Patch 3: exit animation — use raw string from file
const search3 = "(scene.duration - 0.4)";
const replace3 = "(effectiveDuration - 0.4)";
const idx3 = content.indexOf(search3);
if (idx3 >= 0) {
  content = content.replace(search3, replace3);
  console.log('✅ exit animation');
} else {
  console.error('❌ patch 3 failed — string not found');
}

// Patch 4: FX generateFXCode
const before4 = "const fxCode = generateFXCode(fxName, 0, scene.duration);";
const after4 = "const fxCode = generateFXCode(fxName, 0, effectiveDuration);";
if (content.includes(before4)) {
  content = content.replace(before4, after4);
  console.log('✅ FX');
} else {
  console.error('❌ patch 4 failed');
}

// Patch 5: __hf.duration
const marker5 = "'  window.__hf = { duration: ' + scene.duration + ', seek: function(t) { tl.play(); tl.seek(t); tl.pause(); } };'";
if (content.includes(marker5)) {
  content = content.replace(marker5, "'  window.__hf = { duration: ' + effectiveDuration + ', seek: function(t) { tl.play(); tl.seek(t); tl.pause(); } };'");
  console.log('✅ __hf');
} else {
  console.error('❌ patch 5 failed');
}

// Patch 6: return
const before6 = "return { html: lines.join('\\n'), duration: scene.duration };";
const after6 = "return { html: lines.join('\\n'), duration: effectiveDuration };";
if (content.includes(before6)) {
  content = content.replace(before6, after6);
  console.log('✅ return');
} else {
  console.error('❌ patch 6 failed');
}

// Verify all patches
const checks = [
  [/const sceneDuration = scene\.duration \|\| 8;/, 'sceneDuration'],
  [/const effectiveDuration = opts\.durationOverride \|\| sceneDuration;/, 'effectiveDuration'],
  [/String\(effectiveDuration\)/, 'effectiveDuration in gsap'],
  [/generateFXCode\(fxName, 0, effectiveDuration\)/, 'FX'],
  [/duration: ' \+ effectiveDuration/, '__hf'],
  [/duration: effectiveDuration \}/, 'return'],
  [/effectiveDuration - 0\.4/, 'exit animation'],
];

let ok = true;
for (const [re, label] of checks) {
  if (!re.test(content)) {
    console.error('❌ Verify failed: ' + label);
    ok = false;
  } else {
    console.log('✅ verify: ' + label);
  }
}

if (ok) {
  fs.writeFileSync(file, content, 'utf8');
  console.log('\n✅ generate.js patched!');
} else {
  console.error('\n❌ Patches incomplete — not writing');
  process.exit(1);
}