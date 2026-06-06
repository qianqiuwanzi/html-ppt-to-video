#!/usr/bin/env node
/**
 * diversity_assigner.js — 多样性分配器 (v0.8.1)
 *
 * 核心规则：
 * - 保留 generate_script.js 分配的原始布局（不重新分配）
 * - 为每个场景分配一种动画、一种 FX
 * - 视频时长 > 30s：使用全部 27 种动画、20 种 FX（如场景数不足则部分不使用）
 * - 视频时长 <= 30s：使用一半（向上取整）
 * - v0.8.0 移除 explodeScenes()：不再拆分场景，避免内容重复
 * - v0.8.1 保留原始布局：不再随机重新分配布局，避免数据不匹配
 */

'use strict';

const ALL_ANIMATIONS = [
  'fade-up', 'fade-down', 'fade-left', 'fade-right', 'rise-in', 'drop-in',
  'zoom-pop', 'blur-in', 'glitch-in', 'bounce-in',
  'stagger-list', 'card-flip-3d', 'cube-rotate-3d', 'page-turn-3d', 'perspective-zoom',
  'kenburns', 'typewriter', 'neon-glow', 'shimmer-sweep', 'gradient-flow',
  'path-draw', 'confetti-burst', 'spotlight', 'ripple-reveal',
  'morph-shape', 'marquee-scroll', 'parallax-tilt'
];

const ALL_FX = [
  'particle-burst', 'matrix-rain', 'bokeh', 'aurora',
  'gradient-wave', 'pulse-ring', 'trail', 'lightning',
  'firework', 'spiral',
  'neon-grid', 'snow-fall', 'smoke-drift', 'star-field',
  'ripple-expand', 'laser-sweep', 'dna-helix', 'wave-ocean',
  'pixel-rain', 'geo-pulse'
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 核心分配器 (v0.8.1)
 * 保留原始布局，只分配动画和 FX
 */
function assignDiversity(scenes, totalDuration) {
  let scenesWorking = scenes.map(s => ({ ...s, data: s.data ? JSON.parse(JSON.stringify(s.data)) : {} }));
  const sceneCount = scenesWorking.length;
  if (sceneCount === 0) return { scenes: [], stats: {} };

  const useAll = totalDuration > 30;

  // v0.8.1: 不再重新分配布局，保留 generate_script.js 分配的原始布局
  console.log(`  [diversity] 保留原始布局: ${scenesWorking.map(s => s.layout).filter(Boolean).join(', ')}`);

  // 2. 动画分配（均匀分配，尽量多用不同动画）
  const availAnims = shuffle([...ALL_ANIMATIONS]);
  for (let i = 0; i < sceneCount; i++) {
    let pick = availAnims[i % availAnims.length];
    // parallax-tilt 只在场景数 >= 10 时使用
    if (pick === 'parallax-tilt' && sceneCount < 10) {
      pick = availAnims[(i + 1) % availAnims.length];
    }
    if (!scenesWorking[i].data) scenesWorking[i].data = {};
    scenesWorking[i].data.animation = pick;
  }

  // 3. FX 分配（均匀分配，尽量多用不同 FX）
  const availFx = shuffle([...ALL_FX]);
  for (let i = 0; i < sceneCount; i++) {
    scenesWorking[i].fx = availFx[i % availFx.length];
  }

  // Stats
  const usedLayoutSet = new Set(scenesWorking.map(s => s.layout).filter(Boolean));
  const usedAnimSet = new Set(scenesWorking.map(s => s.data && s.data.animation).filter(Boolean));
  const usedFxSet = new Set(scenesWorking.map(s => s.fx).filter(Boolean));
  const targetAnims = useAll ? ALL_ANIMATIONS.length : Math.ceil(ALL_ANIMATIONS.length / 2);
  const targetFx = useAll ? ALL_FX.length : Math.ceil(ALL_FX.length / 2);

  return {
    scenes: scenesWorking,
    stats: {
      totalDuration,
      mode: useAll ? 'full' : 'half',
      originalSceneCount: sceneCount,
      explodedSceneCount: sceneCount, // v0.8.0: 不再拆分
      layouts: { used: usedLayoutSet.size, target: usedLayoutSet.size }, // v0.8.1: 布局不重新分配
      animations: { used: usedAnimSet.size, target: targetAnims },
      fx: { used: usedFxSet.size, target: targetFx },
    }
  };
}

// CLI
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  const configArg = args.find(a => a.startsWith('--config=')) || args.find(a => !a.startsWith('--'));
  const apply = args.includes('--apply');

  if (!configArg) {
    console.error('用法: node diversity_assigner.js [--config=]config.json [--apply]');
    process.exit(1);
  }

  const configPath = configArg.replace('--config=', '');
  if (!fs.existsSync(configPath)) {
    console.error(`✗ 配置文件不存在: ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const totalConfigDuration = config.scenes.reduce((a, s) => a + (s.duration || 0), 0);
  const result = assignDiversity(config.scenes, totalConfigDuration);

  config.scenes = result.scenes;

  if (apply) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✓ 配置已更新: ${configPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  console.log(`\n多样性分配 (v0.8.1):`);
  console.log(`  模式: ${result.stats.mode} (${totalConfigDuration}s)`);
  console.log(`  场景: ${result.stats.originalSceneCount} (未拆分)`);
  console.log(`  布局: ${result.stats.layouts.used} (保留原始)`);
  console.log(`  动画: ${result.stats.animations.used}/${result.stats.animations.target}${result.stats.animations.used < result.stats.animations.target ? ' ⚠ 场景数不足' : ''}`);
  console.log(`  FX:   ${result.stats.fx.used}/${result.stats.fx.target}${result.stats.fx.used < result.stats.fx.target ? ' ⚠ 场景数不足' : ''}`);
  if (result.stats.animations.used < result.stats.animations.target) {
    console.log(`\n  ⚠ 提示: 场景数 (${result.stats.originalSceneCount}) < 动画数 (${result.stats.animations.target})`);
    console.log(`    部分动画未使用是正常现象，增加场景数可提升多样性`);
  }
}


module.exports={ assignDiversity };
