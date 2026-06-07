#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_webpage_browser.py — 用 Playwright 无头浏览器获取 JS 渲染网页

⚠️ 全程静默，禁止打开任何用户可见的浏览器窗口

用法:
  python fetch_webpage_browser.py <URL> [--timeout 20]

输出: JSON 到 stdout
  {
    "title": "...",
    "content": "纯文本正文",
    "author": "...",
    "date": "...",
    "images": ["..."],
    "source": "playwright-headless"
  }
"""

import sys
import json
import argparse
import os
from playwright.sync_api import sync_playwright


def fetch_with_playwright(url, timeout=20):
    """用 Playwright 无头浏览器获取网页内容"""
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-background-networking',
                '--disable-sync',
                '--mute-audio',
                '--no-startup-window',  # 防止闪窗口
            ]
        )
        try:
            page = browser.new_page(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
            )
            page.set_viewport_size({'width': 1920, 'height': 1080})
            page.goto(url, timeout=timeout * 1000, wait_until='networkidle')

            # 额外等待动态内容加载
            page.wait_for_timeout(2000)

            result = page.evaluate('''() => {
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

                // Content selectors (order: most specific first)
                const selectors = [
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
                    'main',
                ];
                let article = null;
                for (const sel of selectors) {
                    article = document.querySelector(sel);
                    if (article && article.innerText.length > 100) break;
                    article = null;
                }
                if (!article) article = document.body;

                // Images
                article.querySelectorAll('img').forEach(img => {
                    let src = img.dataset.src || img.dataset.original || img.src;
                    if (src && src.startsWith('http')) data.images.push(src);
                });

                data.content = (article.innerText || '').trim();
                return data;
            }''')

            result['source'] = 'playwright-headless'
            return result

        finally:
            browser.close()


def main():
    # 强制 UTF-8 输出
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')
    if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
        sys.stderr.reconfigure(encoding='utf-8')

    parser = argparse.ArgumentParser(description='Playwright headless webpage fetcher')
    parser.add_argument('url', help='URL to fetch')
    parser.add_argument('--timeout', '-t', type=int, default=20, help='Timeout in seconds (default: 20)')
    args = parser.parse_args()

    try:
        result = fetch_with_playwright(args.url, timeout=args.timeout)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e), 'source': 'playwright-headless'}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
