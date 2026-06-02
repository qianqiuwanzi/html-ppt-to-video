#!/usr/bin/env node
/**
 * convert_layout.js — Layout generators for html-ppt-to-video
 *
 * Each layout function takes (data) and returns { html, gsap }
 * - html: string of HTML content for the scene
 * - gsap: array of GSAP timeline call strings
 *
 * gsap strings use placeholders: startTime, SCENE_DUR
 * These are replaced by generate.js at assembly time.
 *
 * 31 layouts total:
 *   Original 11: cover, toc, bullets, two-column, three-column,
 *                big-quote, stat-highlight, kpi-grid, comparison, process-steps, cta
 *   New 20:      data-table, chart-bar, chart-line, chart-pie, chart-radar,
 *                code, diff, terminal, flow-diagram, arch-diagram,
 *                mindmap, timeline, roadmap, gantt, pros-cons,
 *                image-hero, fullscreen-stat, highlight-box, numbered-list, icon-grid
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// LAYOUT GENERATORS
// ═══════════════════════════════════════════════════════════

const LAYOUT_GENERATORS = {

  // ─── Original 11 Layouts ─────────────────────────────

  cover: (data) => {
    const id = data.id || 's1';
    const kicker = data.kicker || '';
    const title = data.title || 'Untitled';
    const subtitle = data.subtitle || '';
    const tags = data.tags || [];
    const tagHTML = tags.map(t => '<span class="tag">' + t + '</span>').join('\n    ');
    return {
      html: '<div id="' + id + '" class="scene s-cover">' +
        '<p id="' + id + '-kicker" class="kicker">' + kicker + '</p>' +
        '<h1 id="' + id + '-title">' + title + '</h1>' +
        (subtitle ? '<p id="' + id + '-sub" class="sub">' + subtitle + '</p>' : '') +
        (tags.length ? '<div id="' + id + '-tags" class="tags">\n    ' + tagHTML + '\n  </div>' : '') +
        '</div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        kicker ? "tl.from('#" + id + "-kicker',{y:30,opacity:0,duration:0.6,ease:'power3.out'},startTime+0.3)" : null,
        "tl.from('#" + id + "-title',{y:60,opacity:0,duration:0.8,ease:'expo.out'},startTime+0.5)",
        subtitle ? "tl.from('#" + id + "-sub',{y:30,opacity:0,duration:0.6,ease:'power3.out'},startTime+0.8)" : null,
        tags.length ? "tl.from('#" + id + "-tags .tag',{y:20,opacity:0,duration:0.5,stagger:0.12,ease:'power2.out'},startTime+1.0)" : null,
      ].filter(Boolean),
    };
  },

  toc: (data) => {
    const id = data.id || 's-toc';
    const kicker = data.kicker || '';
    const title = data.title || '目录';
    const items = (data.items || []).map((item, i) =>
      '<div class="toc-item"><div class="toc-num">' + String(i + 1).padStart(2, '0') + '</div><div class="toc-text"><strong>' + (item.title || item) + '</strong>' +
      (item.desc ? '<br><span style="color:var(--text-dim);font-size:26px">' + item.desc + '</span>' : '') +
      '</div></div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        '<h2 class="sec-title">' + title + '</h2>' +
        '<div class="toc-grid">' + items + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        kicker ? "tl.from('#" + id + " .kicker',{y:20,opacity:0,duration:0.5},startTime+0.3)" : null,
        "tl.from('#" + id + " .sec-title',{y:30,opacity:0,duration:0.6},startTime+0.4)",
        "tl.from('#" + id + " .toc-item',{x:-30,opacity:0,duration:0.5,stagger:0.15,ease:'power3.out'},startTime+0.6)",
      ].filter(Boolean),
    };
  },

  bullets: (data) => {
    const id = data.id || 's-bullets';
    const kicker = data.kicker || '';
    const title = data.title || '';
    const items = (data.items || []).map(item =>
      '<li>' + (typeof item === 'string' ? item : item.text || '') + '</li>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        (title ? '<h2 class="sec-title">' + title + '</h2>' : '') +
        '<ul class="content-ul">' + items + '</ul></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        kicker ? "tl.from('#" + id + " .kicker',{y:20,opacity:0,duration:0.5},startTime+0.3)" : null,
        title ? "tl.from('#" + id + " .sec-title',{y:30,opacity:0,duration:0.6},startTime+0.4)" : null,
        "tl.from('#" + id + " .content-ul li',{x:-30,opacity:0,duration:0.4,stagger:0.12,ease:'power3.out'},startTime+0.6)",
      ].filter(Boolean),
    };
  },

  'two-column': (data) => {
    const id = data.id || 's-twocol';
    const kicker = data.kicker || '';
    const title = data.title || '';
    const left = data.left || {};
    const right = data.right || {};
    const leftItems = (left.items || []).map(i => '<li>' + i + '</li>').join('');
    const rightItems = (right.items || []).map(i => '<li>' + i + '</li>').join('');
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        (title ? '<h2 class="sec-title">' + title + '</h2>' : '') +
        '<div class="two-col-grid"><div class="col"><h3>' + (left.title || 'Column 1') + '</h3><ul>' + leftItems + '</ul></div>' +
        '<div class="col"><h3>' + (right.title || 'Column 2') + '</h3><ul>' + rightItems + '</ul></div></div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .col',{x:function(i){return i===0?-40:40},opacity:0,duration:0.6,stagger:0.2,ease:'power3.out'},startTime+0.4)",
      ],
    };
  },

  'three-column': (data) => {
    const id = data.id || 's-threecol';
    const kicker = data.kicker || '';
    const title = data.title || '';
    const cols = (data.cols || []).map((c, i) =>
      '<div class="col-item"><h3>' + (c.title || '') + '</h3>' +
      '<ul>' + (c.items || []).map(item => '<li>' + item + '</li>').join('') + '</ul></div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        (title ? '<h2 class="sec-title">' + title + '</h2>' : '') +
        '<div class="three-col-grid">' + cols + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .col-item',{y:30,opacity:0,duration:0.5,stagger:0.15,ease:'power3.out'},startTime+0.4)",
      ],
    };
  },

  'big-quote': (data) => {
    const id = data.id || 's-quote';
    const q = data.quote || '...';
    const author = data.author || '';
    const role = data.role || '';
    return {
      html: '<div id="' + id + '" class="scene"><div class="quote-wrap"><blockquote class="big-quote-text">' + q + '</blockquote>' +
        (author ? '<cite class="quote-author">' + author + (role ? ' <span class="quote-role">' + role + '</span>' : '') + '</cite>' : '') +
        '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .big-quote-text',{scale:0.9,opacity:0,duration:0.8,ease:'expo.out'},startTime+0.3)",
        author ? "tl.from('#" + id + " cite',{y:20,opacity:0,duration:0.6},startTime+0.8)" : null,
      ].filter(Boolean),
    };
  },

  'stat-highlight': (data) => {
    const id = data.id || 's-stat';
    const big = data.big || data.value || '0';
    const label = data.label || '';
    const desc = data.desc || '';
    const kicker = data.kicker || '';
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        '<div class="big-num">' + big + '</div>' +
        '<h2 class="sec-title">' + label + '</h2>' +
        (desc ? '<p style="font-size:34px;color:var(--text-dim);margin-top:12px;line-height:1.4">' + desc + '</p>' : '') +
        '</div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .big-num',{scale:0.5,opacity:0,duration:1.0,ease:'back.out(1.7)'},startTime+0.3)",
        "tl.from('#" + id + " .sec-title',{y:30,opacity:0,duration:0.6},startTime+0.7)",
      ],
    };
  },

  'kpi-grid': (data) => {
    const id = data.id || 's-kpi';
    const kpis = (data.kpis || []).map(k =>
      '<div class="kpi-card"><div class="kpi-num">' + (k.value || 0) + '</div><div class="kpi-label">' + (k.label || '') + '</div>' +
      (k.delta ? '<div class="kpi-delta">' + k.delta + '</div>' : '') + '</div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="kpi-grid">' + kpis + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .kpi-card',{scale:0.8,opacity:0,duration:0.5,stagger:0.1,ease:'back.out(1.5)'},startTime+0.3)",
      ],
    };
  },

  comparison: (data) => {
    const id = data.id || 's-cmp';
    const kicker = data.kicker || '';
    const title = data.title || '';
    const cols = (data.cols || []).map(c =>
      '<div class="compare-card' + (c.highlight ? ' bordered' : '') + '">' +
        '<div class="mode-name">' + (c.name || '') + '</div>' +
        '<div class="mode-use">' + (c.use || '') + '</div>' +
        '<div class="mode-save">' + (c.save || '') + '</div>' +
        (c.bad ? '<div class="bad-line">' + c.bad + '</div>' : '') +
      '</div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        (title ? '<h2 class="sec-title">' + title + '</h2>' : '') +
        '<div class="compare-grid">' + cols + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .compare-card',{scale:0.9,opacity:0,duration:0.5,stagger:0.15,ease:'back.out(1.5)'},startTime+0.4)",
      ],
    };
  },

  'process-steps': (data) => {
    const id = data.id || 's-steps';
    const kicker = data.kicker || '';
    const title = data.title || '';
    const steps = (data.steps || []).map((step, i) =>
      '<div class="step-item"><div class="step-num">' + (i + 1) + '</div><div class="step-text">' + (typeof step === 'string' ? step : step.text || '') + '</div></div>' +
      (i < (data.steps || []).length - 1 ? '<div class="step-arrow">&#8595;</div>' : '')
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        (title ? '<h2 class="sec-title">' + title + '</h2>' : '') +
        '<div class="step-flow">' + steps + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .step-item',{x:-30,opacity:0,duration:0.5,stagger:0.2,ease:'power3.out'},startTime+0.4)",
        "tl.from('#" + id + " .step-arrow',{scale:0,opacity:0,duration:0.3,stagger:0.2},startTime+0.6)",
      ],
    };
  },

  cta: (data) => {
    const id = data.id || 's-cta';
    const title = data.title || '开始行动';
    const url = data.url || '';
    const subtitle = data.subtitle || '';
    return {
      html: '<div id="' + id + '" class="scene s-cta">' +
        '<h2>' + title + '</h2>' +
        (url ? '<div class="cta-url">' + url + '</div>' : '') +
        (subtitle ? '<p class="cta-sub">' + subtitle + '</p>' : '') +
        '</div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " h2',{y:50,opacity:0,duration:0.8,ease:'expo.out'},startTime+0.3)",
        url ? "tl.from('#" + id + " .cta-url',{scale:0.8,opacity:0,duration:0.6,ease:'back.out(1.7)'},startTime+0.6)" : null,
        subtitle ? "tl.from('#" + id + " .cta-sub',{y:20,opacity:0,duration:0.5},startTime+0.9)" : null,
      ].filter(Boolean),
    };
  },

  // ─── New 20 Layouts ────────────────────────────────────

  'data-table': (data) => {
    const id = data.id || 's-table';
    const headers = (data.headers || []).map(h => '<th>' + h + '</th>').join('');
    const rows = (data.rows || []).map(r =>
      '<tr>' + (Array.isArray(r) ? r : (r.cells || [])).map(c => '<td>' + c + '</td>').join('') + '</tr>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene"><table class="data-table"><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " tbody tr',{x:-20,opacity:0,duration:0.3,stagger:0.05},startTime+0.6)",
      ],
    };
  },

  'chart-bar': (data) => {
    const id = data.id || 's-chart';
    const bars = (data.bars || []).map(b => {
      const pct = Math.min(100, b.value || 0);
      return '<div class="bar-row"><span class="bar-label">' + (b.label || '') + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><span class="bar-value">' + (b.value || 0) + '%</span></div>';
    }).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="chart-bars">' + bars + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .bar-fill',{scaleX:0,duration:0.8,stagger:0.1,ease:'power2.out',transformOrigin:'left'},startTime+0.4)",
      ],
    };
  },

  'chart-line': (data) => {
    const id = data.id || 's-line';
    const pts = data.points || [];
    const W = Math.max(400, pts.length * 120 + 60), H = 220;
    const circles = pts.map((p, i) => {
      const cx = i * 120 + 60, cy = H / 2 - (p.y || 0) * 1.5;
      return '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="var(--accent)"/>' +
        (p.label ? '<text x="' + cx + '" y="' + (cy + 25) + '" text-anchor="middle" class="chart-label">' + p.label + '</text>' : '') +
        (p.value ? '<text x="' + cx + '" y="' + (cy - 18) + '" text-anchor="middle" class="chart-val">' + p.value + '</text>' : '');
    }).join('');
    const poly = pts.map((p, i) => (i * 120 + 60) + ',' + (H / 2 - (p.y || 0) * 1.5)).join(' ');
    return {
      html: '<div id="' + id + '" class="scene"><svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg"><polyline points="' + poly + '" fill="none" stroke="var(--accent)" stroke-width="3"/>' + circles + '</svg></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " polyline',{strokeDashoffset:2000,strokeDasharray:2000,duration:1.5,ease:'power2.inOut'},startTime+0.3)",
        "tl.from('#" + id + " circle',{scale:0,opacity:0,duration:0.3,stagger:0.1},startTime+0.6)",
      ],
    };
  },

  'chart-pie': (data) => {
    const id = data.id || 's-pie';
    const slices = data.slices || [];
    const COLORS = ['var(--accent)', 'var(--accent2)', 'var(--good)', 'var(--warn)', 'var(--accent3)', 'var(--bad)'];
    const cx = 160, cy = 120, r = 90;
    let offset = 0;
    const paths = slices.map((s, i) => {
      const pct = (s.value || 0) / 100 * 360;
      const sa = (offset - 90) * Math.PI / 180, ea = (offset + pct - 90) * Math.PI / 180;
      const x1 = (cx + r * Math.cos(sa)).toFixed(1), y1 = (cy + r * Math.sin(sa)).toFixed(1);
      const x2 = (cx + r * Math.cos(ea)).toFixed(1), y2 = (cy + r * Math.sin(ea)).toFixed(1);
      const mx = (cx + r / 2 * Math.cos((offset + pct / 2 - 90) * Math.PI / 180)).toFixed(1);
      const my = (cy + r / 2 * Math.sin((offset + pct / 2 - 90) * Math.PI / 180)).toFixed(1);
      offset += pct;
      return '<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + (pct > 180 ? 1 : 0) + ',1 ' + x2 + ',' + y2 + ' Z" fill="' + COLORS[i % COLORS.length] + '" opacity="0.85"/>' +
        '<text x="' + mx + '" y="' + my + '" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="var(--bg)">' + (s.label || '') + '</text>';
    }).join('');
    const legend = slices.map((s, i) =>
      '<span class="legend-item"><span class="legend-dot" style="background:' + COLORS[i % COLORS.length] + '"></span>' + (s.label || '') + '</span>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene"><svg viewBox="0 0 320 240" class="chart-svg">' + paths + '</svg><div class="pie-legend">' + legend + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " path',{scale:0,opacity:0,duration:0.5,stagger:0.2,transformOrigin:'" + cx + "px " + cy + "px'},startTime+0.3)",
      ],
    };
  },

  'chart-radar': (data) => {
    const id = data.id || 's-radar';
    const labels = data.labels || [], vals = data.values || [];
    const cx = 200, cy = 130, r = 95, N = labels.length;
    if (N === 0) return { html: '<div id="' + id + '" class="scene"></div>', gsap: [] };
    const grid = [1, 2, 3].map(level => {
      const pts = labels.map((_, i) => {
        const a = (i * 360 / N - 90) * Math.PI / 180;
        return (cx + r * level / 3 * Math.cos(a)).toFixed(1) + ',' + (cy + r * level / 3 * Math.sin(a)).toFixed(1);
      });
      return '<polygon points="' + pts.join(' ') + '" fill="none" stroke="var(--border)" stroke-width="1"/>';
    }).join('');
    const axes = labels.map((l, i) => {
      const a = (i * 360 / N - 90) * Math.PI / 180;
      const lx = (cx + (r + 18) * Math.cos(a)).toFixed(1), ly = (cy + (r + 18) * Math.sin(a)).toFixed(1);
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + r * Math.cos(a)).toFixed(1) + '" y2="' + (cy + r * Math.sin(a)).toFixed(1) + '" stroke="var(--border)" stroke-width="1"/>' +
        '<text x="' + lx + '" y="' + ly + '" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="var(--text-dim)">' + l + '</text>';
    }).join('');
    const dPts = vals.map((v, i) => {
      const a = (i * 360 / N - 90) * Math.PI / 180;
      return (cx + r * (v / 100) * Math.cos(a)).toFixed(1) + ',' + (cy + r * (v / 100) * Math.sin(a)).toFixed(1);
    }).join(' ');
    const dots = vals.map((v, i) => {
      const a = (i * 360 / N - 90) * Math.PI / 180;
      return '<circle cx="' + (cx + r * v / 100 * Math.cos(a)).toFixed(1) + '" cy="' + (cy + r * v / 100 * Math.sin(a)).toFixed(1) + '" r="5" fill="var(--accent)"/>';
    }).join('');
    return {
      html: '<div id="' + id + '" class="scene"><svg viewBox="60 20 280 220" class="chart-svg">' + grid + axes +
        '<polygon points="' + dPts + '" fill="var(--accent)" opacity="0.25" stroke="var(--accent)" stroke-width="2"/>' + dots + '</svg></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " polygon',{scale:0,opacity:0,duration:0.8,transformOrigin:'" + cx + "px " + cy + "px'},startTime+0.3)",
        "tl.from('#" + id + " circle',{scale:0,opacity:0,duration:0.3,stagger:0.1},startTime+0.6)",
      ],
    };
  },

  code: (data) => {
    const id = data.id || 's-code';
    const lang = data.lang || 'javascript';
    const code = (data.code || '// code here').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return {
      html: '<div id="' + id + '" class="scene"><div class="code-block"><div class="code-header"><span class="code-lang">' + lang + '</span></div><pre class="code-content"><code>' + code + '</code></pre></div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .code-block',{y:30,opacity:0,duration:0.5,ease:'power3.out'},startTime+0.3)",
      ],
    };
  },

  diff: (data) => {
    const id = data.id || 's-diff';
    const ls = (data.lines || []).map(l => {
      const cls = l.type === '+' ? 'diff-add' : l.type === '-' ? 'diff-del' : l.type === '@@' ? 'diff-meta' : 'diff-context';
      return '<div class="' + cls + '">' + (l.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
    }).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="diff-block">' + ls + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .diff-block',{y:20,opacity:0,duration:0.4},startTime+0.3)",
      ],
    };
  },

  terminal: (data) => {
    const id = data.id || 's-terminal';
    const cmds = (data.commands || []).map(c => '<div class="term-line"><span class="term-prompt">$</span><span class="term-cmd">' + (c || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span></div>').join('');
    const output = data.output ? '<div class="term-output">' + (data.output || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' : '';
    return {
      html: '<div id="' + id + '" class="scene"><div class="terminal-win"><div class="term-bar"><span>' + (data.title || 'Terminal') + '</span></div><div class="term-body">' + cmds + output + '</div></div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        ...(data.commands ? ["tl.from('#" + id + " .term-line',{x:-20,opacity:0,duration:0.2,stagger:0.15,ease:'power3.out'},startTime+0.3)"] : []),
        ...(output ? ["tl.from('#" + id + " .term-output',{opacity:0,duration:0.3},startTime+1.0)"] : []),
      ],
    };
  },

  'flow-diagram': (data) => {
    const id = data.id || 's-flow';
    const nodes = data.nodes || [];
    const nHTML = nodes.map((n, i) =>
      '<div class="flow-node" style="left:' + (i % 3 * 35 + 5) + '%;top:' + (Math.floor(i / 3) * 40 + 10) + '%"><div class="flow-node-inner">' + n + '</div></div>'
    ).join('');
    const arrows = nodes.slice(0, -1).map((_, i) =>
      '<div class="flow-arrow" style="left:' + (i % 3 * 35 + 22) + '%;top:' + (Math.floor(i / 3) * 40 + 30) + '%">&#8594;</div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="flow-container">' + nHTML + arrows + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .flow-node',{scale:0,opacity:0,duration:0.4,stagger:0.1,ease:'back.out(1.7)'},startTime+0.3)",
      ],
    };
  },

  'arch-diagram': (data) => {
    const id = data.id || 's-arch';
    const layers = (data.layers || []).map(l =>
      '<div class="arch-layer"><div class="arch-layer-label">' + (l.name || '') + '</div><div class="arch-layer-items">' +
      (l.items || []).map(item => '<div class="arch-item">' + item + '</div>').join('') + '</div></div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="arch-diagram">' + layers + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .arch-layer',{y:30,opacity:0,duration:0.5,stagger:0.2,ease:'power3.out'},startTime+0.3)",
      ],
    };
  },

  mindmap: (data) => {
    const id = data.id || 's-mind';
    const root = data.root || 'Topic', branches = data.branches || [], N = branches.length || 1;
    const bHTML = branches.map((b, i) => {
      const angle = i * 360 / N - 90;
      const bLabel = typeof b === 'string' ? b : (b.label || '');
      const children = (typeof b === 'object' ? (b.children || []) : []).map(c => '<div class="mm-child">' + c + '</div>').join('');
      return '<div class="mm-branch" style="transform:rotate(' + angle + 'deg)"><div class="mm-node">' + bLabel + '</div>' + children + '</div>';
    }).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="mindmap"><div class="mm-root">' + root + '</div>' + bHTML + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .mm-root',{scale:0,opacity:0,duration:0.6,ease:'back.out(1.7)'},startTime+0.3)",
        "tl.from('#" + id + " .mm-branch',{scale:0,opacity:0,duration:0.4,stagger:0.1},startTime+0.5)",
      ],
    };
  },

  timeline: (data) => {
    const id = data.id || 's-timeline';
    const items = (data.items || []).map(item =>
      '<div class="tl-item"><div class="tl-dot"></div><div class="tl-content">' +
      '<div class="tl-time">' + (item.time || '') + '</div>' +
      '<div class="tl-text">' + (typeof item === 'string' ? item : item.text || '') + '</div></div></div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="timeline">' + items + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .tl-item',{x:-40,opacity:0,duration:0.5,stagger:0.2,ease:'power3.out'},startTime+0.3)",
      ],
    };
  },

  roadmap: (data) => {
    const id = data.id || 's-roadmap';
    const phases = (data.phases || []).map((p, i) =>
      '<div class="rm-phase"><div class="rm-phase-label">' + (p.label || 'Phase ' + (i + 1)) + '</div>' +
      '<div class="rm-items">' + (p.items || []).map(item => '<div class="rm-item">' + item + '</div>').join('') + '</div></div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="roadmap">' + phases + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .rm-phase',{y:30,opacity:0,duration:0.5,stagger:0.25,ease:'power3.out'},startTime+0.3)",
      ],
    };
  },

  gantt: (data) => {
    const id = data.id || 's-gantt';
    const tasks = (data.tasks || []).map(t => {
      const name = typeof t === 'string' ? t : (t.name || t);
      return '<div class="gantt-row"><span class="gantt-task-name">' + name + '</span><div class="gantt-bar-wrap"><div class="gantt-bar" style="left:' + (t.start || 0) + '%;width:' + (t.width || 20) + '%"></div></div></div>';
    }).join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="gantt-chart">' + tasks + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .gantt-bar',{scaleX:0,duration:0.8,stagger:0.1,ease:'power2.out',transformOrigin:'left'},startTime+0.4)",
      ],
    };
  },

  'pros-cons': (data) => {
    const id = data.id || 's-pc';
    const pros = (data.pros || []).map(p => '<li class="pro-item"><span class="pc-icon">&#10003;</span>' + p + '</li>').join('');
    const cons = (data.cons || []).map(c => '<li class="con-item"><span class="pc-icon">&#10007;</span>' + c + '</li>').join('');
    return {
      html: '<div id="' + id + '" class="scene"><div class="pros-cons-grid"><div class="pros-col"><h3>' + (data.prosLabel || 'Pros') + '</h3><ul>' + pros + '</ul></div><div class="cons-col"><h3>' + (data.consLabel || 'Cons') + '</h3><ul>' + cons + '</ul></div></div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .pros-col',{x:-50,opacity:0,duration:0.6,ease:'power3.out'},startTime+0.3)",
        "tl.from('#" + id + " .cons-col',{x:50,opacity:0,duration:0.6,ease:'power3.out'},startTime+0.3)",
      ],
    };
  },

  'image-hero': (data) => {
    const id = data.id || 's-img';
    const src = data.src || '', caption = data.caption || '', overlay = data.overlay || '';
    return {
      html: '<div id="' + id + '" class="scene" style="position:relative;width:100%;height:100%;overflow:hidden">' +
        (src ? '<img class="hero-img" src="' + src + '" alt="hero" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"/>' : '') +
        '<div class="hero-overlay" style="position:absolute;inset:0;background:linear-gradient(transparent 40%,rgba(0,0,0,0.7));display:flex;align-items:center;justify-content:center">' +
        (overlay ? '<div class="hero-text" style="color:#fff;text-align:center;font-size:48px;font-weight:700;padding:20px">' + overlay + '</div>' : '') +
        '</div>' +
        (caption ? '<p class="hero-caption" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.8);font-size:28px">' + caption + '</p>' : '') + '</div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        ...(src ? ["tl.from('#" + id + " img',{scale:1.1,opacity:0,duration:1.2,ease:'power2.out'},startTime+0.2)"] : []),
        ...(overlay ? ["tl.from('#" + id + " .hero-text',{y:40,opacity:0,duration:0.7},startTime+0.6)"] : []),
      ],
    };
  },

  'fullscreen-stat': (data) => {
    const id = data.id || 's-fs';
    const big = data.big || data.value || '0', label = data.label || '', sub = data.sub || '';
    return {
      html: '<div id="' + id + '" class="scene" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;width:100%;height:100%;background:var(--bg)">' +
        '<div class="fs-big-num" style="font-size:140px;font-weight:900;color:var(--accent);line-height:1;margin:0">' + big + '</div>' +
        (label ? '<div class="fs-label" style="font-size:44px;color:var(--text);margin-top:16px">' + label + '</div>' : '') +
        (sub ? '<div class="fs-sub" style="font-size:30px;color:var(--text-dim);margin-top:8px">' + sub + '</div>' : '') + '</div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .fs-big-num',{scale:0.5,opacity:0,duration:1.0,ease:'back.out(1.7)'},startTime+0.4)",
        ...(label ? ["tl.from('#" + id + " .fs-label',{y:30,opacity:0,duration:0.6},startTime+0.7)"] : []),
        ...(sub ? ["tl.from('#" + id + " .fs-sub',{y:20,opacity:0,duration:0.5},startTime+1.0)"] : []),
      ],
    };
  },

  'highlight-box': (data) => {
    const id = data.id || 's-hl';
    const title = data.title || '', text = data.text || '', type = data.type || 'info';
    const icons = { info: '&#8505;', warning: '&#9888;', success: '&#9989;', error: '&#10060;' };
    return {
      html: '<div id="' + id + '" class="scene"><div class="hl-box hl-' + type + '" style="display:flex;gap:20px;align-items:flex-start;padding:32px;background:var(--surface);border-radius:16px;border-left:5px solid var(--accent)">' +
        (icons[type] ? '<div class="hl-icon" style="font-size:44px;line-height:1">' + icons[type] + '</div>' : '') +
        '<div class="hl-content">' + (title ? '<h3 class="hl-title" style="margin:0 0 10px;font-size:36px;font-weight:700">' + title + '</h3>' : '') +
        (text ? '<p class="hl-text" style="margin:0;font-size:30px;color:var(--text-dim);line-height:1.5">' + text + '</p>' : '') + '</div></div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .hl-box',{y:20,opacity:0,scale:0.95,duration:0.5,ease:'power3.out'},startTime+0.3)",
      ],
    };
  },

  'numbered-list': (data) => {
    const id = data.id || 's-nl';
    const kicker = data.kicker || '', title = data.title || '';
    const items = (data.items || []).map((item, i) =>
      '<div class="nl-item" style="display:flex;gap:20px;align-items:flex-start;margin-bottom:16px"><div class="nl-num" style="font-size:44px;font-weight:900;color:var(--accent);min-width:48px;line-height:1">' + String(i + 1).padStart(2, '0') + '</div><div class="nl-text" style="font-size:34px;padding-top:6px;line-height:1.4">' + (typeof item === 'string' ? item : item.text || '') + '</div></div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        (title ? '<h2 class="sec-title">' + title + '</h2>' : '') +
        '<div class="num-list">' + items + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .nl-item',{x:-40,opacity:0,duration:0.5,stagger:0.18,ease:'power3.out'},startTime+0.5)",
      ],
    };
  },

  'icon-grid': (data) => {
    const id = data.id || 's-icons';
    const kicker = data.kicker || '', title = data.title || '';
    const items = (data.items || []).map(item =>
      '<div class="icon-card" style="background:var(--surface);border-radius:16px;padding:24px;text-align:center;border:1px solid var(--border)"><div class="icon-emoji" style="font-size:56px;margin-bottom:10px">' + (item.icon || '&#128279;') + '</div><div class="icon-label" style="font-weight:700;font-size:30px;margin-bottom:6px">' + (item.label || '') + '</div>' + (item.desc ? '<div class="icon-desc" style="font-size:24px;color:var(--text-dim)">' + item.desc + '</div>' : '') + '</div>'
    ).join('');
    return {
      html: '<div id="' + id + '" class="scene">' +
        (kicker ? '<p class="kicker">' + kicker + '</p>' : '') +
        (title ? '<h2 class="sec-title">' + title + '</h2>' : '') +
        '<div class="icon-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:20px">' + items + '</div></div>',
      gsap: [
        "tl.to('#" + id + "',{opacity:1,duration:0.3},startTime+0.2)",
        "tl.from('#" + id + " .icon-card',{scale:0.8,opacity:0,duration:0.4,stagger:0.1,ease:'back.out(1.5)'},startTime+0.5)",
      ],
    };
  },

};

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

const AVAILABLE_LAYOUTS = Object.keys(LAYOUT_GENERATORS);

function main() {
  const args = process.argv.slice(2);
  const layoutName = args[0];

  if (!layoutName || layoutName === '--list') {
    console.log('Available layouts (' + AVAILABLE_LAYOUTS.length + '):');
    AVAILABLE_LAYOUTS.forEach(l => console.log('  - ' + l));
    console.log('\nUsage: node convert_layout.js <layout-name> [--data \'<json>\']');
    return;
  }

  if (!LAYOUT_GENERATORS[layoutName]) {
    console.error('Unknown layout: ' + layoutName);
    console.error('Available: ' + AVAILABLE_LAYOUTS.join(', '));
    process.exit(1);
  }

  let data = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) {
      try { data = JSON.parse(args[++i]); } catch(e) { console.error('Invalid JSON data'); process.exit(1); }
    }
  }

  const result = LAYOUT_GENERATORS[layoutName](data);
  console.log(JSON.stringify({ layout: layoutName, ...result }, null, 2));
}

module.exports = { LAYOUT_GENERATORS, AVAILABLE_LAYOUTS };

if (require.main === module) main();
