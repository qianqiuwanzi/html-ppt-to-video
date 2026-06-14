#!/usr/bin/env node
/**
 * convert_theme.js — Extract CSS custom properties from html-ppt theme → :root block for hyperframes
 *
 * Usage: node convert_theme.js <theme-name> [--html-ppt-dir <path>] [--output json|css]
 *
 * Example: node convert_theme.js tokyo-night
 *          node convert_theme.js tokyo-night --html-ppt-dir "C:\Users\qianq\.qclaw\skills\html-ppt-skill"
 */

const fs = require('fs');
const path = require('path');

// Default html-ppt skill directory
// Priority: 1. --html-ppt-dir argument  2. env HTML_PPT_SKILL_DIR  3. auto-detect from script path
function getDefaultSkillDir() {
  // If --html-ppt-dir is provided via env, use it
  if (process.env.HTML_PPT_SKILL_DIR) {
    return process.env.HTML_PPT_SKILL_DIR;
  }
  // Fallback: auto-detect skill directory from script path (converters/..)
  const scriptDir = path.dirname(path.resolve(__filename));
  const skillDir = path.resolve(scriptDir, '..');
  return skillDir;
}

const DEFAULT_SKILL_DIR = getDefaultSkillDir();

// Token mapping: html-ppt tokens → hyperframes tokens
// Some tokens map 1:1, others need renaming or grouping
const TOKEN_MAP = {
  '--bg':           '--bg',
  '--bg-soft':      '--bg-soft',
  '--surface':      '--surface',
  '--surface-2':    '--surface-2',
  '--border':       '--border',
  '--border-strong':'--border-strong',
  '--text-1':       '--text',
  '--text-2':       '--text-dim',
  '--text-3':       '--text-muted',
  '--accent':       '--accent',
  '--accent-2':     '--accent2',
  '--accent-3':     '--accent3',
  '--good':         '--good',
  '--warn':         '--warn',
  '--bad':          '--bad',
  '--grad':         '--grad',
  '--grad-soft':    '--grad-soft',
  '--radius':       '--radius',
  '--radius-sm':    '--radius-sm',
  '--radius-lg':    '--radius-lg',
  '--shadow':       '--shadow',
  '--shadow-lg':    '--shadow-lg',
  '--font-sans':    '--font-sans',
  '--font-serif':   '--font-serif',
  '--font-mono':    '--font-mono',
};

// Hyperframes cannot resolve var(--font-xxx) as font-family.
// Post-process: replace CSS variable references with concrete font names.
const FONT_MAP = {
  'var(--font-sans)':  'Inter',
  'var(--font-serif)': 'EB Garamond',
  'var(--font-mono)':  'JetBrains Mono',
};

function replaceFontVars(cssText) {
  let out = cssText;
  for (const [v, f] of Object.entries(FONT_MAP)) {
    out = out.split(v).join(`'${f}'`);
  }
  return out;
}

function parseThemeCSS(cssText) {
  const tokens = {};
  // Match :root { ... } block
  const rootMatch = cssText.match(/:root\s*\{([^}]+)\}/s);
  if (!rootMatch) return tokens;

  const body = rootMatch[1];
  // Parse each --token: value;
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    tokens[m[1].trim()] = m[2].trim();
  }
  return tokens;
}

function convertTokens(hpTokens) {
  const hfTokens = {};
  for (const [hpKey, hfKey] of Object.entries(TOKEN_MAP)) {
    if (hpTokens[hpKey]) {
      hfTokens[hfKey] = hpTokens[hpKey];
    }
  }
  // Carry over any unmapped tokens as-is
  for (const [key, val] of Object.entries(hpTokens)) {
    if (!TOKEN_MAP[key] && !hfTokens[key]) {
      hfTokens[key] = val;
    }
  }
  return hfTokens;
}

function toCSSBlock(tokens) {
  const lines = Object.entries(tokens)
    .map(([k, v]) => `  ${k}:${v}`)
    .join(';\n');
  return `:root {\n${lines};\n}`;
}

function main() {
  const args = process.argv.slice(2);
  const themeName = args[0];
  if (!themeName) {
    console.error('Usage: node convert_theme.js <theme-name> [--html-ppt-dir <path>] [--output json|css]');
    process.exit(1);
  }

  let skillDir = DEFAULT_SKILL_DIR;
  let outputFmt = 'css';

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--html-ppt-dir' && args[i + 1]) {
      skillDir = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFmt = args[++i];
    }
  }

  const themePath = path.join(skillDir, 'assets', 'themes', `${themeName}.css`);
  if (!fs.existsSync(themePath)) {
    console.error(`Theme file not found: ${themePath}`);
    console.error(`Available themes: ${fs.readdirSync(path.join(skillDir, 'assets', 'themes')).filter(f => f.endsWith('.css')).map(f => f.replace('.css', '')).join(', ')}`);
    process.exit(1);
  }

  const cssText = fs.readFileSync(themePath, 'utf-8');
  const hpTokens = parseThemeCSS(cssText);
  const hfTokens = convertTokens(hpTokens);

  if (outputFmt === 'json') {
    console.log(JSON.stringify({ theme: themeName, tokens: hfTokens }, null, 2));
  } else {
    console.log(`/* Converted from html-ppt theme: ${themeName} */`);
    console.log(toCSSBlock(hfTokens));
  }
}

// Export for programmatic use
module.exports = { parseThemeCSS, convertTokens, toCSSBlock, TOKEN_MAP, replaceFontVars };

if (require.main === module) main();
