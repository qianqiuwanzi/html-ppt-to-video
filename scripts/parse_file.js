#!/usr/bin/env node
/**
 * parse_file.js — 文件输入解析器 v1.0.0
 *
 * 支持文件类型: .docx, .pptx, .txt, .md, .pdf
 * 提取纯文本内容后，输出可被 parse_input.js 消费的格式
 *
 * Usage:
 *   node parse_file.js --file document.docx [--output content.txt]
 *   node parse_file.js --file slides.pptx --stdout
 *
 * 输出：提取的纯文本内容（控制台或文件）
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ========== CLI ==========
const args = process.argv.slice(2);
let filePath = null, outputPath = null, toStdout = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') filePath = args[++i];
  else if (args[i] === '--output') outputPath = args[++i];
  else if (args[i] === '--stdout') toStdout = true;
}

if (!filePath) {
  console.error('用法: node parse_file.js --file <文件路径> [--output content.txt] [--stdout]');
  console.error('支持格式: .docx, .pptx, .txt, .md, .pdf');
  process.exit(1);
}

// ========== 文本提取引擎 ==========

/**
 * 提取 .txt 或 .md 文件文本
 */
function extractTextFromPlainText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * 提取 .docx 文件文本（使用 mammoth）
 */
async function extractTextFromDocx(filePath) {
  try {
    const mammoth = require('mammoth');
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (e) {
    console.warn('  ⚠ mammoth 解析失败: ' + e.message);
    // 回退：从 zip 中提取 document.xml
    try {
      const JSZip = require('jszip');
      const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
      const docXml = await zip.file('word/document.xml').async('string');
      // 简单提取文本标签内容
      const texts = docXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
      return texts.map(t => t.replace(/<[^>]+>/g, '')).join('').replace(/\s+/g, ' ');
    } catch (e2) {
      throw new Error('DOCX 解析失败: ' + e2.message);
    }
  }
}

/**
 * 提取 .pptx 文件文本
 */
async function extractTextFromPptx(filePath) {
  try {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
      .sort();

    let fullText = '';
    for (const slideFile of slideFiles) {
      const xml = await zip.file(slideFile).async('string');
      const texts = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
      const slideText = texts.map(t => t.replace(/<[^>]+>/g, '')).join('');
      if (slideText.trim()) {
        fullText += slideText.trim() + '\n\n';
      }
    }

    if (!fullText.trim()) {
      throw new Error('未从 PPTX 中提取到文本');
    }
    return fullText.trim();
  } catch (e) {
    throw new Error('PPTX 解析失败: ' + e.message);
  }
}

/**
 * 提取 .pdf 文件文本（使用 pdf-parse）
 */
async function extractTextFromPdf(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (e) {
    throw new Error('PDF 解析失败: ' + e.message);
  }
}

// ========== 主流程 ==========

async function main() {
  if (!fs.existsSync(filePath)) {
    console.error('文件不存在: ' + filePath);
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase();
  let text = '';

  console.log('📄 文件解析器 v1.0.0');
  console.log('  文件: ' + filePath);
  console.log('  格式: ' + ext);
  console.log('');

  switch (ext) {
    case '.txt':
    case '.md':
    case '.markdown':
      text = extractTextFromPlainText(filePath);
      console.log('  ✓ 纯文本读取完成: ' + text.length + ' 字符');
      break;

    case '.docx':
      text = await extractTextFromDocx(filePath);
      console.log('  ✓ DOCX 解析完成: ' + text.length + ' 字符');
      break;

    case '.pptx':
      text = await extractTextFromPptx(filePath);
      console.log('  ✓ PPTX 解析完成: ' + text.length + ' 字符');
      break;

    case '.pdf':
      text = await extractTextFromPdf(filePath);
      console.log('  ✓ PDF 解析完成: ' + text.length + ' 字符');
      break;

    default:
      console.error('不支持的文件格式: ' + ext);
      console.error('支持格式: .docx, .pptx, .txt, .md, .md, .pdf');
      process.exit(1);
  }

  if (!text || !text.trim()) {
    console.error('文件内容为空');
    process.exit(1);
  }

  // 输出
  if (toStdout) {
    process.stdout.write(text);
  } else if (outputPath) {
    fs.writeFileSync(outputPath, text, 'utf8');
    console.log('  ✅ 文本已保存: ' + outputPath);
  } else {
    // 默认：输出到同名 .txt 文件
    const outFile = filePath + '.txt';
    fs.writeFileSync(outFile, text, 'utf8');
    console.log('  ✅ 文本已保存: ' + outFile);
  }
}

main().catch(err => {
  console.error('❌ 解析失败: ' + err.message);
  process.exit(1);
});
