#!/usr/bin/env node
/**
 * fetch_webpage.js — 获取任意网页内容（四级静默回退）
 *
 * ⚠️ 核心约束：全程静默，禁止打开任何用户可见的浏览器窗口
 *
 * 四级回退策略：
 *   L1: HTTP 直接获取（最快）— 适合静态页面 + 微信公众号文章（已验证有效）
 *   L2: web_fetch（OpenClaw Agent 内置工具）— 需在 Agent 上下文中调用
 *   L3: 无头浏览器（Puppeteer headless）— 仅 L1/L2 失败时使用
 *   L4: online-search（搜索摘要兜底）— 最后手段
 *
 * Usage:
 *   node fetch_webpage.js <URL> [--output file.json] [--browser] [--timeout 30000] [--level L1|L2|L3|L4]
 *   node fetch_webpage.js <URL>  (outputs JSON to stdout)
 *
 * Output format:
 *   {
 *     "url": "...",
 *     "title": "...",
 *     "content": "纯文本正文",
 *     "html": "HTML正文（可选）",
 *     "author": "作者（可选）",
 *     "date": "发布日期（可选）",
 *     "images": ["图片URL列表"],
 *     "source": "http|web_fetch|browser-headless|search",
 *     "fetchedAt": "ISO时间戳"
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  maxContentLength: 100000,
  minContentLength: 200,
};

// ═══════════════════════════════════════════════════════════
// 查找系统 Chrome/Edge（仅用于无头模式）
// ═══════════════════════════════════════════════════════════

function findChromeExecutable() {
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════
// URL 类型检测
// ═══════════════════════════════════════════════════════════

const URL_PATTERNS = {
  wechat: /mp\.weixin\.qq\.com\/s/,
  zhihu: /zhihu\.com/,
  bilibili: /bilibili\.com/,
  douyin: /douyin\.com/,
  toutiao: /toutiao\.com/,
  jianshu: /jianshu\.com/,
  csdn: /csdn\.net/,
  juejin: /juejin\.cn/,
  weibo: /weibo\.com/,
  twitter: /twitter\.com|x\.com/,
  youtube: /youtube\.com/,
  medium: /medium\.com/,
  substack: /substack\.com/,
  github: /github\.com/,
};

function detectUrlType(url) {
  for (const [name, pattern] of Object.entries(URL_PATTERNS)) {
    if (pattern.test(url)) return name;
  }
  return 'generic';
}

/**
 * 判断URL是否可能需要浏览器渲染（但不直接跳过L1，因为微信文章L1已验证有效）
 */
function isDynamicSite(url) {
  const type = detectUrlType(url);
  return ['zhihu', 'douyin', 'weibo', 'twitter', 'youtube', 'medium', 'substack'].includes(type);
}

// ═══════════════════════════════════════════════════════════
// L1: HTTP 直接获取
// ═══════════════════════════════════════════════════════════

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const proto = urlObj.protocol === 'https:' ? https : http;

    const req = proto.get(url, {
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(options.headers || {}),
      },
      timeout: options.timeout || CONFIG.timeout,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, options).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('utf-8'));
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTP timeout')); });
  });
}

// ═══════════════════════════════════════════════════════════
// HTML -> 纯文本提取
// ═══════════════════════════════════════════════════════════

function extractFromHtml(html, url) {
  let title = '';
  let content = '';
  let author = '';
  let date = '';
  const images = [];

  // --- Title ---
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) title = decodeEntities(titleMatch[1].trim());

  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  if (ogTitleMatch) title = decodeEntities(ogTitleMatch[1]);

  // --- Author ---
  const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']*)["']/i);
  if (authorMatch) author = decodeEntities(authorMatch[1]);

  // --- Date ---
  const dateMatch = html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*itemprop=["']datePublished["'][^>]*content=["']([^"']*)["']/i);
  if (dateMatch) date = dateMatch[1];

  // --- Content extraction (order matters: most specific first) ---
  let articleHtml = '';

  // WeChat: js_content div (supports both id="js_content" and id='js_content')
  if (/mp\.weixin\.qq\.com/.test(url)) {
    // Try multiple patterns for robustness
    const wxPatterns = [
      /<div[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<div[^>]*class="rich_media_tool)/i,
      /<div[^>]*id='js_content'[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<div[^>]*class="rich_media_tool")/i,
      /<div[^>]*id="js_content"[^>]*>([\s\S]{100,}?)<\/div>/i,
      /<div[^>]*class="rich_media_content"[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>/i,
    ];
    for (const pat of wxPatterns) {
      const m = html.match(pat);
      if (m && m[1].length > 100) { articleHtml = m[1]; break; }
    }
    // WeChat author from js_name
    const wxAuthor = html.match(/<a[^>]*id="js_name"[^>]*>([^<]*)<\/a>/i);
    if (wxAuthor) author = wxAuthor[1].trim();
    // WeChat title from var
    if (!title) {
      const wxTitle = html.match(/var\s+msg_title\s*=\s*"([^"]*)"/);
      if (wxTitle) title = wxTitle[1];
    }
  }

  // Article tag
  if (!articleHtml) {
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) articleHtml = articleMatch[1];
  }

  // Common content divs
  if (!articleHtml) {
    const patterns = [
      /<div[^>]*class=["'][^"']*rich_media_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*article-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*content-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*markdown-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id=["']article-content["'][^>]*>([\s\S]*?)<\/div>/i,
    ];
    for (const pat of patterns) {
      const match = html.match(pat);
      if (match && match[1].length > 100) { articleHtml = match[1]; break; }
    }
  }

  // Fallback: body
  if (!articleHtml) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    articleHtml = bodyMatch ? bodyMatch[1] : html;
  }

  // --- Images ---
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let imgMatch;
  while ((imgMatch = imgRe.exec(articleHtml)) !== null) {
    let src = imgMatch[1];
    if (src.startsWith('//')) src = 'https:' + src;
    else if (src.startsWith('/')) {
      try { const u = new URL(url); src = u.origin + src; } catch {}
    }
    if (src.startsWith('http')) images.push(src);
  }

  content = htmlToText(articleHtml);
  return { title, content, author, date, images, html: articleHtml };
}

function htmlToText(html) {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<\/(p|div|h[1-6]|li|br|blockquote|tr|dt|dd|figcaption|summary|details|section|article|aside|header|footer|nav|main)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(parseInt(code)); })
    .replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
}

// ═══════════════════════════════════════════════════════════
// L2: web_fetch (OpenClaw Agent 内置工具)
// ═══════════════════════════════════════════════════════════
// 注意：web_fetch 是 OpenClaw Agent 内置工具，无法在 Node.js 中直接调用。
// 当作为 CLI 使用时跳过此级别；当作为 Agent 调用时，Agent 应在 L1 失败后
// 使用 web_fetch 工具获取内容，然后传入 --input 参数跳过 L1。
//
// Agent 调用建议流程：
//   1. node fetch_webpage.js <URL>  (尝试 L1)
//   2. 如果失败，用 web_fetch 工具获取 markdown，然后通过 --input stdin 传入
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// L3: 无头浏览器（Puppeteer headless only）
// ⚠️ 绝对禁止打开可见窗口！强制 headless: 'new'
// ═══════════════════════════════════════════════════════════

async function browserFetch(url, options = {}) {
  const timeout = options.timeout || CONFIG.timeout;
  let puppeteer;

  // Try to load puppeteer
  const puppeteerPaths = [
    'puppeteer',
    path.resolve(__dirname, '..', 'node_modules', 'puppeteer'),
    path.resolve(__dirname, '..', 'lib', 'node_modules', 'puppeteer'),
  ];
  for (const p of puppeteerPaths) {
    try { puppeteer = require(p); break; } catch {}
  }
  if (!puppeteer) {
    throw new Error('Puppeteer not installed - cannot use headless browser');
  }

  const execPath = findChromeExecutable();

  // ⚠️ 强制无头模式：headless: 'new' + 防闪窗口参数
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-startup-window',   // 防止启动时闪窗口
      '--headless=new',         // 确保 headless 模式（double safety）
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(CONFIG.userAgent);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    // Wait for dynamic content
    await new Promise(function(r) { setTimeout(r, 2000); });

    const result = await page.evaluate(function() {
      var data = { title: '', content: '', author: '', date: '', images: [] };

      data.title = document.title || '';
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) data.title = ogTitle.content;

      var authorMeta = document.querySelector('meta[name="author"]')
        || document.querySelector('meta[property="article:author"]');
      if (authorMeta) data.author = authorMeta.content;

      var dateMeta = document.querySelector('meta[property="article:published_time"]')
        || document.querySelector('meta[itemprop="datePublished"]');
      if (dateMeta) data.date = dateMeta.content;

      // Content selectors (order: most specific first)
      var selectors = [
        '#js_content',
        '.rich_media_content',
        'article',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.content-body',
        '.markdown-body',
        '#content',
        '#article-content',
      ];
      var article = null;
      for (var i = 0; i < selectors.length; i++) {
        article = document.querySelector(selectors[i]);
        if (article && article.innerText.length > 100) break;
        article = null;
      }
      if (!article) article = document.body;

      // Images
      article.querySelectorAll('img').forEach(function(img) {
        var src = img.dataset.src || img.dataset.original || img.src;
        if (src && src.startsWith('http')) data.images.push(src);
      });

      data.content = (article.innerText || article.textContent || '').trim();
      return data;
    });

    result.title = (result.title || '').trim();
    result.content = (result.content || '').trim();

    return result;
  } finally {
    await browser.close();
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN: 四级回退获取
// ═══════════════════════════════════════════════════════════

async function fetchWebpage(url, options = {}) {
  var timeout = options.timeout || CONFIG.timeout;
  var forceBrowser = options.browser || false;
  var forceLevel = options.level || null;

  var urlType = detectUrlType(url);
  console.error('[fetch_webpage] URL type: ' + urlType);

  var lastError = null;

  // ── L1: HTTP 直接获取（始终优先） ──
  if (!forceBrowser && forceLevel !== 'L2' && forceLevel !== 'L3' && forceLevel !== 'L4') {
    try {
      console.error('[fetch_webpage] L1: HTTP direct fetch...');
      var html = await httpGet(url, { timeout: timeout });
      var extracted = extractFromHtml(html, url);

      // 微信文章 L1 已验证有效（2940 字符），阈值 100 字符即可
      var minLen = (urlType === 'wechat') ? 100 : CONFIG.minContentLength;

      if (extracted.content.length >= minLen) {
        console.error('[fetch_webpage] OK L1 success: ' + extracted.content.length + ' chars');
        return {
          url: url,
          title: extracted.title,
          content: extracted.content,
          author: extracted.author,
          date: extracted.date,
          images: extracted.images,
          html: extracted.html,
          source: 'http',
          fetchedAt: new Date().toISOString(),
        };
      }
      console.error('[fetch_webpage] L1 got ' + extracted.content.length + ' chars (below threshold ' + minLen + ')');
    } catch (e) {
      console.error('[fetch_webpage] L1 failed: ' + e.message);
      lastError = e;
    }
  }

  // ── L2: web_fetch（仅 Agent 上下文可用，CLI 跳过） ──
  // Agent 应在 L1 失败后自行调用 web_fetch 工具
  // 然后通过 --input 参数传入已获取的内容
  if (forceLevel === 'L2') {
    throw new Error('L2 (web_fetch) must be called by Agent, not CLI. Use web_fetch tool directly.');
  }

  // ── L3: 无头浏览器（仅 L1 失败时，且 Puppeteer 已安装） ──
  if (!forceBrowser && forceLevel !== 'L4') {
    try {
      console.error('[fetch_webpage] L3: Headless browser...');
      var result = await browserFetch(url, { timeout: timeout });
      if (result && result.content && result.content.length >= CONFIG.minContentLength) {
        console.error('[fetch_webpage] OK L3 success: ' + result.content.length + ' chars');
        return {
          url: url,
          title: result.title,
          content: result.content,
          author: result.author,
          date: result.date,
          images: result.images,
          html: result.html,
          source: 'browser-headless',
          fetchedAt: new Date().toISOString(),
        };
      }
      console.error('[fetch_webpage] L3 got ' + (result ? result.content.length : 0) + ' chars (too short)');
    } catch (e) {
      console.error('[fetch_webpage] L3 failed: ' + e.message);
      lastError = e;
    }
  }

  throw new Error('Failed to fetch webpage: ' + url + '. Last error: ' + (lastError ? lastError.message : 'unknown'));
}

// ═══════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════

function parseCliArgs(argv) {
  var args = argv || process.argv.slice(2);
  var opts = { url: null, output: null, browser: false, timeout: CONFIG.timeout, level: null };

  for (var i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output': case '-o': opts.output = args[++i]; break;
      case '--browser': case '-b': opts.browser = true; break;
      case '--timeout': case '-t': opts.timeout = parseInt(args[++i]); break;
      case '--level': case '-l': opts.level = args[++i]; break;
      case '--help': case '-h':
        console.log([
          'fetch_webpage.js v1.1 - 静默网页内容获取（四级回退）',
          '',
          'Usage:',
          '  node fetch_webpage.js <URL> [--output file.json] [--browser] [--timeout 30000] [--level L1|L2|L3]',
          '',
          'Options:',
          '  --output, -o <path>    输出JSON文件路径（默认stdout）',
          '  --browser, -b          强制使用无头浏览器（L3）',
          '  --timeout, -t <ms>     超时时间（默认30000ms）',
          '  --level, -l <LEVEL>    强制指定级别（L1/L2/L3）',
          '  --help, -h             显示帮助',
          '',
          '回退策略:',
          '  L1  HTTP直接获取（最快，微信文章已验证有效）',
          '  L2  web_fetch（Agent内置工具，需Agent上下文调用）',
          '  L3  无头浏览器（Puppeteer headless:new，禁止可见窗口）',
          '',
          'Agent 调用建议:',
          '  1. node fetch_webpage.js <URL>           (L1 -> L3)',
          '  2. 失败则用 web_fetch 工具获取 markdown',
          '  3. 仍失败则用 online-search 搜索摘要',
          '',
          '支持的URL类型:',
          '  微信公众号、知乎、B站、抖音、今日头条、简书、CSDN、掘金、',
          '  微博、Twitter/X、YouTube、Medium、Substack、GitHub等',
        ].join('\n'));
        process.exit(0);
      default:
        if (!opts.url && args[i].startsWith('http')) opts.url = args[i];
        break;
    }
  }
  return opts;
}

async function main(argv) {
  var opts = parseCliArgs(argv);
  if (!opts.url) {
    console.error('Error: URL is required');
    process.exit(1);
  }

  var result = await fetchWebpage(opts.url, {
    browser: opts.browser,
    timeout: opts.timeout,
    level: opts.level,
  });

  var json = JSON.stringify(result, null, 2);
  if (opts.output) {
    fs.writeFileSync(opts.output, json, 'utf-8');
    console.error('Output: ' + opts.output);
    console.error('Title: ' + result.title);
    console.error('Content: ' + result.content.length + ' chars');
    console.error('Source: ' + result.source);
  } else {
    console.log(json);
  }
}

module.exports = { fetchWebpage, httpGet, extractFromHtml, detectUrlType, CONFIG };

if (require.main === module) {
  main().catch(function(err) {
    console.error('Error: ' + err.message);
    process.exit(1);
  });
}
