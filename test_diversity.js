#!/usr/bin/env node
/**
 * 测试 diversity_assigner v0.7.0
 */

const { assignDiversity } = require('./diversity_assigner.js');

// 模拟 7 个场景，总时长 70s（>30s，应该用完全部）
const testScenes = Array.from({ length: 7 }, (_, i) => ({
  id: 's' + (i + 1),
  duration: 10,
  data: {}
}));

console.log('=== 输入: 7 场景, 70s ===');

const { scenes, stats } = assignDiversity(testScenes, 70);

console.log('\n=== 结果 ===');
console.log('原始场景数:', stats.originalSceneCount);
console.log('爆炸后场景数:', stats.explodedSceneCount);
console.log('布局: %d/%d', stats.layouts.used, stats.layouts.target);
console.log('动画: %d/%d', stats.animations.used, stats.animations.target);
console.log('FX:   %d/%d', stats.fx.used, stats.fx.target);

// 详细检查动画分配
const animMap = {};
scenes.forEach((s, i) => {
  const a = s.data && s.data.animation;
  if (a) {
    if (!animMap[a]) animMap[a] = [];
    animMap[a].push(s.id);
  }
});

console.log('\n=== 动画分配详情 ===');
console.log('唯一动画数:', Object.keys(animMap).length);
console.log('期望: 27');
if (Object.keys(animMap).length < 27) {
  console.log('⚠️  未覆盖的动画:');
  const allAnims = require('./diversity_assigner.js').ALL_ANIMATIONS;
  allAnims.forEach(a => {
    if (!animMap[a]) console.log('  -', a);
  });
}
