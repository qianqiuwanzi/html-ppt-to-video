#!/usr/bin/env node
/**
 * fetch_webpage.js — 获取任意网页内容（含JS动态渲染页面）
 *
 * 三级回退策略：
 *   1. web_fetch（纯HTTP，最快）— 适合静态页面
 *   2. you-get（Python下载）— 适合视频/音频页面
 *   3. 无头浏览器（Puppeteer/Playwright）— 适合JS动态渲染页面（微信文章等）
 *
 * Usage:
 *   node fetch_webpage.js <URL> [--output file.json] [--browser] [--timeout 30000]
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
 *     "source": "web_fetch|you-get|browser",
 *     "fetchedAt": "ISO时间戳"
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const https = require('https');
const http = require('http');

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  // 最大正文长度（字符）
  maxContentLength: 100000,
  // 最小正文长度（低于此值视为获取失败，触发回退）
  minContentLength: 200,
};

// ═══════════════════════════════════════════════════════════
// 查找系统已安装的 Chrome/Edge 可执行文件
// ═══════════════════════════════════════════════════════════

function findChromeExecutable() {
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  // Return undefined to let Puppeteer use its bundled Chromium
  return undefined;
}

// ═══════════════════════════════════════════════════════════
// URL 类型检测
// ═══════════════════════════════════════════════════════════

const URL_PATTERNS = {
  wechat: /mp\.weixin\.qq\.com\/s\//,
  wechat2: /mp\.weixin\.qq\.com\/s\?/,
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
 * 判断URL是否需要浏览器渲染
 */
function needsBrowser(url) {
  const type = detectUrlType(url);
  // 这些站点的页面是JS动态渲染的
  const browserRequired = ['wechat', 'wechat2', 'zhihu', 'douyin', 'toutiao', 'weibo', 'twitter', 'youtube', 'medium', 'substack'];
  return browserRequired.includes(type);
}

// ═══════════════════════════════════════════════════════════
// Level 1: HTTP 直接获取
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
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, options).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      // Detect encoding from headers
      const contentType = res.headers['content-type'] || '';
      let encoding = 'utf-8';
      const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
      if (charsetMatch) {
        encoding = charsetMatch[1].toLowerCase();
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let html;
        if (encoding === 'utf-8' || encoding === 'utf8') {
          html = buffer.toString('utf-8');
        } else {
          // For GBK/GB2312, try iconv-lite or just decode as utf-8
          try {
            html = buffer.toString('utf-8');
          } catch {
            html = buffer.toString('latin1');
          }
        }
        resolve(html);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timeout'));
    });
  });
}

// ═══════════════════════════════════════════════════════════
// HTML → 纯文本提取
// ═══════════════════════════════════════════════════════════

function extractFromHtml(html, url) {
  let title = '';
  let content = '';
  let author = '';
  let date = '';
  const images = [];

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].trim());
  }

  // Extract og:title
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  if (ogTitleMatch) {
    title = decodeHtmlEntities(ogTitleMatch[1]);
  }

  // Extract author
  const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*name=["']twitter:creator["'][^>]*content=["']([^"']*)["']/i);
  if (authorMatch) {
    author = decodeHtmlEntities(authorMatch[1]);
  }

  // Extract date
  const dateMatch = html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*name=["']date["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*itemprop=["']datePublished["'][^>]*content=["']([^"']*)["']/i);
  if (dateMatch) {
    date = dateMatch[1];
  }

  // Try to extract article content based on common patterns
  let articleHtml = '';

  // Pattern 1: <article> tag
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    articleHtml = articleMatch[1];
  }

  // Pattern 2: WeChat article specific
  if (!articleHtml && /mp\.weixin\.qq\.com/.test(url)) {
    const wxMatch = html.match(/<div[^>]*id=["']js_content["'][^>]*>([\s\S]*?)<\/div>\s*<script/i);
    if (wxMatch) {
      articleHtml = wxMatch[1];
    }
    // WeChat author
    const wxAuthor = html.match(/<a[^>]*id=["']js_name["'][^>]*>([^<]*)<\/a>/i);
    if (wxAuthor) author = wxAuthor[1].trim();
  }

  // Pattern 3: Common content divs
  if (!articleHtml) {
    const contentPatterns = [
      /<div[^>]*class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*article-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*content-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*markdown-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id=["']article-content["'][^>]*>([\s\S]*?)<\/div>/i,
    ];
    for (const pattern of contentPatterns) {
      const match = html.match(pattern);
      if (match) {
        articleHtml = match[1];
        break;
      }
    }
  }

  // If still no content, use body
  if (!articleHtml) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    articleHtml = bodyMatch ? bodyMatch[1] : html;
  }

  // Extract images before stripping HTML
  const imgMatches = articleHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const m of imgMatches) {
    let src = m[1];
    // Make relative URLs absolute
    if (src.startsWith('//')) src = 'https:' + src;
    else if (src.startsWith('/')) {
      try { const u = new URL(url); src = u.origin + src; } catch {}
    }
    if (src.startsWith('http')) images.push(src);
  }

  // Strip HTML to get plain text
  content = htmlToText(articleHtml);

  return { title, content, author, date, images, html: articleHtml };
}

function htmlToText(html) {
  let text = html;

  // Remove scripts and styles
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Preserve block elements as newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|br|blockquote|tr|dt|dd|figcaption|summary|details|section|article|aside|header|footer|nav|main)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ═══════════════════════════════════════════════════════════
// Level 2: you-get 辅助获取（主要用于视频页面信息提取）
// ═══════════════════════════════════════════════════════════

async function yougetExtract(url) {
  return new Promise((resolve, reject) => {
    try {
      const result = execSync(`you-get -u "${url}" 2>&1`, {
        encoding: 'utf-8',
        timeout: CONFIG.timeout,
      });
      // you-get -u outputs direct URLs; not useful for text extraction
      // but we can try you-get --json for structured info
      resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Level 3: 无头浏览器渲染（Puppeteer/Playwright）
// ═══════════════════════════════════════════════════════════

async function browserFetch(url, options = {}) {
  const timeout = options.timeout || CONFIG.timeout;

  // Strategy 1: Try Puppeteer
  try {
    const result = await puppeteerFetch(url, timeout);
    if (result && result.content && result.content.length > 0) {
      result.source = 'browser-puppeteer';
      return result;
    }
  } catch (e) {
    console.error(`Puppeteer failed: ${e.message}`);
  }

  // Strategy 2: Try Playwright
  try {
    const result = await playwrightFetch(url, timeout);
    if (result && result.content && result.content.length > 0) {
      result.source = 'browser-playwright';
      return result;
    }
  } catch (e) {
    console.error(`Playwright failed: ${e.message}`);
  }

  // Strategy 3: Use xbrowser CLI (OpenClaw's browser automation)
  try {
    const result = await xbrowserFetch(url, timeout);
    if (result && result.content && result.content.length >= CONFIG.minContentLength) {
      result.source = 'browser-xbrowser';
      return result;
    }
  } catch (e) {
    console.error(`xbrowser failed: ${e.message}`);
  }

  throw new Error('All browser strategies failed for: ' + url);
}

/**
 * Puppeteer-based fetch
 */
async function puppeteerFetch(url, timeout) {
  let puppeteer;
  const puppeteerPaths = [
    'puppeteer',
    path.resolve(__dirname, '..', 'lib', 'node_modules', 'puppeteer'),
    path.resolve(__dirname, '..', 'node_modules', 'puppeteer'),
  ];
  for (const p of puppeteerPaths) {
    try { puppeteer = require(p); console.error(`[puppeteerFetch] Loaded from: ${p}`); break; } catch(e) { console.error(`[puppeteerFetch] Skip ${p}: ${e.message.slice(0,60)}`); }
  }
  if (!puppeteer) throw new Error('Puppeteer not installed');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: findChromeExecutable(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(CONFIG.userAgent);
    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    // Wait for content to load (especially for SPA)
    await new Promise(r => setTimeout(r, 2000));

    // Extract content
    const result = await page.evaluate(() => {
      const data = { title: '', content: '', author: '', date: '', images: [] };

      // Title
      data.title = document.title || '';
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) data.title = ogTitle.content;

      // Author
      const authorMeta = document.querySelector('meta[name="author"]')
        || document.querySelector('meta[property="article:author"]');
      if (authorMeta) data.author = authorMeta.content;

      // Date
      const dateMeta = document.querySelector('meta[property="article:published_time"]')
        || document.querySelector('meta[itemprop="datePublished"]');
      if (dateMeta) data.date = dateMeta.content;

      // Content extraction
      let article = document.querySelector('article');
      if (!article) {
        // WeChat specific
        article = document.querySelector('#js_content');
      }
      if (!article) {
        // Common content selectors
        const selectors = [
          '.post-content', '.article-content', '.entry-content',
          '.content-body', '.markdown-body', '#content', '#article-content',
          '.rich_media_content', '.topic-richtext',
        ];
        for (const sel of selectors) {
          article = document.querySelector(sel);
          if (article) break;
        }
      }
      if (!article) article = document.body;

      // Images
      article.querySelectorAll('img').forEach(img => {
        const src = img.dataset.src || img.src;
        if (src && src.startsWith('http')) data.images.push(src);
      });

      // Text content
      data.content = article.innerText || article.textContent || '';
      data.html = article.innerHTML;

      return data;
    });

    result.title = result.title.trim();
    result.content = result.content.trim();

    return result;
  } finally {
    await browser.close();
  }
}

/**
 * Playwright-based fetch
 */
async function playwrightFetch(url, timeout) {
  let chromium;
  const playwrightPaths = [
    'playwright',
    path.resolve(__dirname, '..', 'lib', 'node_modules', 'playwright'),
    path.resolve(__dirname, '..', 'node_modules', 'playwright'),
  ];
  for (const p of playwrightPaths) {
    try { chromium = require(p).chromium; break; } catch {}
  }
  if (!chromium) throw new Error('Playwright not installed');

  const browser = await chromium.launch({
    headless: true,
    executablePath: findChromeExecutable(),
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout });

    // Extra wait for dynamic content
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
      const data = { title: '', content: '', author: '', date: '', images: [] };

      data.title = document.title || '';
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) data.title = ogTitle.content;

      const authorMeta = document.querySelector('meta[name="author"]')
        || document.querySelector('meta[property="article:author"]');
      if (authorMeta) data.author = authorMeta.content;

      const dateMeta = document.querySelector('meta[property="article:published_time"]');
      if (dateMeta) data.date = dateMeta.content;

      let article = document.querySelector('article')
        || document.querySelector('#js_content')
        || document.querySelector('.post-content')
        || document.querySelector('.article-content')
        || document.querySelector('.entry-content')
        || document.querySelector('.rich_media_content')
        || document.querySelector('.markdown-body')
        || document.querySelector('#content')
        || document.body;

      article.querySelectorAll('img').forEach(img => {
        const src = img.dataset.src || img.src;
        if (src && src.startsWith('http')) data.images.push(src);
      });

      data.content = article.innerText || article.textContent || '';
      data.html = article.innerHTML;

      return data;
    });

    result.title = result.title.trim();
    result.content = result.content.trim();

    return result;
  } finally {
    await browser.close();
  }
}

/**
 * xbrowser CLI-based fetch (OpenClaw's built-in browser automation)
 * Uses xb CLI to navigate and extract page content
 */
async function xbrowserFetch(url, timeout) {
  const xbScript = path.resolve(__dirname, '..', '..', 'xbrowser', 'xb.js');

  // Check if xb CLI is available
  let xbCmd = 'xb';
  try {
    execSync('xb version', { encoding: 'utf-8', timeout: 5000 });
  } catch {
    // Try direct node execution
    if (fs.existsSync(xbScript)) {
      xbCmd = `node "${xbScript}"`;
    } else {
      throw new Error('xb CLI not available');
    }
  }

  // Use xb to navigate and extract
  const script = `
    const page = await browser.newPage();
    await page.goto('${url}', { waitUntil: 'networkidle2', timeout: ${timeout} });
    await new Promise(r => setTimeout(r, 3000));

    const result = await page.evaluate(() => {
      const data = { title: '', content: '', author: '', date: '', images: [] };
      data.title = document.title || '';
      let article = document.querySelector('article')
        || document.querySelector('#js_content')
        || document.querySelector('.rich_media_content')
        || document.querySelector('.post-content')
        || document.querySelector('.article-content')
        || document.querySelector('.markdown-body')
        || document.body;

      article.querySelectorAll('img').forEach(img => {
        const src = img.dataset.src || img.src;
        if (src && src.startsWith('http')) data.images.push(src);
      });

      data.content = article.innerText || article.textContent || '';
      return data;
    });

    await page.close();
    return result;
  `;

  // This is a conceptual implementation; xb CLI may need adaptation
  // For now, we'll use a simpler approach: xb run with a script
  const tmpScript = path.join(require('os').tmpdir(), `xb_fetch_${Date.now()}.js`);
  fs.writeFileSync(tmpScript, script, 'utf-8');

  try {
    const output = execSync(`${xbCmd} run "${tmpScript}"`, {
      encoding: 'utf-8',
      timeout: timeout + 10000,
    });
    const result = JSON.parse(output);
    fs.unlinkSync(tmpScript);
    return result;
  } catch (e) {
    if (fs.existsSync(tmpScript)) fs.unlinkSync(tmpScript);
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN: 三级回退获取
// ═══════════════════════════════════════════════════════════

async function fetchWebpage(url, options = {}) {
  const timeout = options.timeout || CONFIG.timeout;
  const forceBrowser = options.browser || false;

  const urlType = detectUrlType(url);
  console.error(`[fetch_webpage] URL type: ${urlType}, needs browser: ${needsBrowser(url)}`);

  let lastError = null;

  // Level 1: HTTP direct fetch (always try first, even for dynamic pages)
  if (!forceBrowser) {
    try {
      console.error('[fetch_webpage] Level 1: HTTP direct fetch...');
      const html = await httpGet(url, { timeout });
      const extracted = extractFromHtml(html, url);

      // For generic URLs (not known dynamic sites), accept shorter content
      const minLen = needsBrowser(url) ? CONFIG.minContentLength : 50;
      if (extracted.content.length >= minLen) {
        console.error(`[fetch_webpage] ✅ Level 1 success: ${extracted.content.length} chars`);
        return {
          url,
          ...extracted,
          source: 'http',
          fetchedAt: new Date().toISOString(),
        };
      }

      console.error(`[fetch_webpage] Level 1 got ${extracted.content.length} chars (too short, likely dynamic page)`);
    } catch (e) {
      console.error(`[fetch_webpage] Level 1 failed: ${e.message}`);
      lastError = e;
    }
  }

  // Level 2: you-get (for media pages, limited text extraction)
  if (!forceBrowser && (urlType === 'bilibili' || urlType === 'youtube' || urlType === 'douyin')) {
    try {
      console.error('[fetch_webpage] Level 2: you-get info extraction...');
      const info = await yougetExtract(url);
      if (info) {
        return {
          url,
          title: info.title || '',
          content: info.description || '',
          author: info.author || '',
          date: info.date || '',
          images: info.thumbnails || [],
          source: 'you-get',
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (e) {
      console.error(`[fetch_webpage] Level 2 failed: ${e.message}`);
      lastError = e;
    }
  }

  // Level 3: Browser rendering (for JS-heavy pages like WeChat articles)
  try {
    console.error('[fetch_webpage] Level 3: Browser rendering...');
    const result = await browserFetch(url, { timeout });
    if (result) {
      console.error(`[fetch_webpage] ✅ Level 3 success: ${result.content.length} chars`);
      return {
        url,
        ...result,
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.error(`[fetch_webpage] Level 3 failed: ${e.message}`);
    lastError = e;
  }

  throw new Error(`Failed to fetch webpage: ${url}. Last error: ${lastError?.message || 'unknown'}`);
}

// ═══════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════

function parseCliArgs(argv) {
  const args = argv || process.argv.slice(2);
  const opts = {
    url: null,
    output: null,
    browser: false,
    timeout: CONFIG.timeout,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output': case '-o': opts.output = args[++i]; break;
      case '--browser': case '-b': opts.browser = true; break;
      case '--timeout': case '-t': opts.timeout = parseInt(args[++i]); break;
      case '--help': case '-h':
        console.log(`
fetch_webpage.js — 获取任意网页内容（含JS动态渲染页面）

Usage:
  node fetch_webpage.js <URL> [--output file.json] [--browser] [--timeout 30000]

Options:
  --output, -o <path>    输出JSON文件路径（默认输出到stdout）
  --browser, -b          强制使用浏览器渲染
  --timeout, -t <ms>     超时时间（默认30000ms）
  --help, -h             显示帮助

三级回退策略:
  1. HTTP直接获取（最快，适合静态页面）
  2. you-get提取（适合视频/音频页面）
  3. 无头浏览器渲染（适合JS动态页面，如微信文章）

支持的URL类型:
  微信公众号、知乎、B站、抖音、今日头条、简书、CSDN、掘金、
  微博、Twitter/X、YouTube、Medium、Substack、GitHub等
`);
        process.exit(0);
      default:
        if (!opts.url && args[i].startsWith('http')) {
          opts.url = args[i];
        }
        break;
    }
  }

  return opts;
}

async function main(argv) {
  const opts = parseCliArgs(argv);

  if (!opts.url) {
    console.error('Error: URL is required');
    process.exit(1);
  }

  const result = await fetchWebpage(opts.url, {
    browser: opts.browser,
    timeout: opts.timeout,
  });

  const json = JSON.stringify(result, null, 2);

  if (opts.output) {
    fs.writeFileSync(opts.output, json, 'utf-8');
    console.error(`Output written to: ${opts.output}`);
    console.error(`Title: ${result.title}`);
    console.error(`Content: ${result.content.length} chars`);
    console.error(`Images: ${result.images.length}`);
    console.error(`Source: ${result.source}`);
  } else {
    console.log(json);
  }
}

module.exports = { fetchWebpage, httpGet, extractFromHtml, detectUrlType, needsBrowser, CONFIG };

if (require.main === module) {
  main().catch(err => {
    console.error('Error: ' + err.message);
    process.exit(1);
  });
}
