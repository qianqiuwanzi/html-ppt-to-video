/**
 * canvas-fx.js — Canvas FX runtime for html-ppt-to-video
 *
 * Implements all FX referenced by map_fx.js:
 *   particle-burst, matrix-rain, bokeh, aurora,
 *   gradient-wave, pulse-ring, trail, lightning,
 *   firework, spiral
 *
 * Each FX is an object { init(W,H), draw(ctx, t) }
 * where t ∈ [0, duration] in seconds.
 *
 * Mounted at window.CFX.
 */

(function () {
  'use strict';

  const W = 1080, H = 1920;
  const CX = W / 2, CY = H / 2;

  // ─── Utility ──────────────────────────────────────────
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function hsl(h, s, l, a) {
    return `hsla(${h},${s}%,${l}%,${a || 1})`;
  }

  // ─── particle-burst ──────────────────────────────────
  const ParticleBurst = {
    init(w, h) {
      this.particles = [];
      const n = 160;
      for (let i = 0; i < n; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(1, 6);
        this.particles.push({
          x: CX, y: CY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.5, 1.2),
          age: rand(0, 0.3),
          r: rand(1.5, 4),
          hue: rand(200, 300),
        });
      }
    },
    draw(ctx, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        p.age += 0.016;
        if (p.age > p.life) continue;
        const alpha = Math.max(0, 1 - p.age / p.life) * 0.8;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04; // gravity
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 - p.age / p.life * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = hsl(p.hue, 80, 65, alpha);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // ─── matrix-rain ────────────────────────────────────
  const MatrixRain = {
    init(w, h) {
      this.fontSize = 18;
      this.columns = Math.floor(w / this.fontSize);
      this.drops = [];
      for (let i = 0; i < this.columns; i++) {
        this.drops[i] = randInt(-50, 0);
      }
      this.chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    },
    draw(ctx, t) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = `${this.fontSize}px monospace`;
      for (let i = 0; i < this.columns; i++) {
        const ch = this.chars[randInt(0, this.chars.length - 1)];
        const x = i * this.fontSize;
        const y = this.drops[i] * this.fontSize;
        ctx.fillStyle = `rgba(0,255,70,${rand(0.6, 1)})`;
        ctx.fillText(ch, x, y);
        if (y > H && Math.random() > 0.975) {
          this.drops[i] = 0;
        }
        this.drops[i]++;
      }
    }
  };

  // ─── bokeh ──────────────────────────────────────────
  const Bokeh = {
    init(w, h) {
      this.dots = [];
      for (let i = 0; i < 60; i++) {
        this.dots.push({
          x: rand(0, w), y: rand(0, h),
          r: rand(15, 70),
          hue: rand(180, 320),
          speed: rand(0.15, 0.5),
          phase: rand(0, Math.PI * 2),
        });
      }
    },
    draw(ctx, t) {
      for (const d of this.dots) {
        const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * d.speed + d.phase));
        const alpha = pulse * 0.25;
        const r = d.r * (0.7 + 0.3 * pulse);
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
        grad.addColorStop(0, hsl(d.hue, 70, 65, alpha));
        grad.addColorStop(1, hsl(d.hue, 70, 65, 0));
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }
  };

  // ─── aurora ─────────────────────────────────────────
  const Aurora = {
    init(w, h) {
      this.t = 0;
    },
    draw(ctx, t) {
      const bands = [
        { y: H * 0.25, h: 180, hue: 140, alpha: 0.12 },
        { y: H * 0.35, h: 220, hue: 180, alpha: 0.10 },
        { y: H * 0.55, h: 160, hue: 220, alpha: 0.08 },
      ];
      for (const b of bands) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) {
          const wave = Math.sin(x * 0.004 + t * 0.7) * 40
                   + Math.sin(x * 0.007 + t * 1.1) * 25;
          const y = b.y + wave;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineTo(W, b.y + b.h);
        ctx.lineTo(0, b.y + b.h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        grad.addColorStop(0, hsl(b.hue, 80, 60, b.alpha));
        grad.addColorStop(1, hsl(b.hue, 80, 60, 0));
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }
  };

  // ─── gradient-wave ───────────────────────────────────
  const GradientWave = {
    init(w, h) { this.t = 0; },
    draw(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      const h1 = (t * 20) % 360;
      const h2 = (h1 + 60) % 360;
      const h3 = (h1 + 180) % 360;
      g.addColorStop(0, hsl(h1, 70, 55, 0.18));
      g.addColorStop(0.5, hsl(h2, 70, 55, 0.13));
      g.addColorStop(1, hsl(h3, 70, 55, 0.18));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // wave overlay
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = H / 2 + Math.sin(x * 0.008 + t * 1.2) * 120
                 + Math.cos(x * 0.003 - t * 0.5) * 80;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hsl((t * 30) % 360, 80, 70, 0.2);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  };

  // ─── pulse-ring ─────────────────────────────────────
  const PulseRing = {
    init(w, h) {
      this.rings = [];
      for (let i = 0; i < 5; i++) {
        this.rings.push({ delay: i * 1.8, r: 0 });
      }
    },
    draw(ctx, t) {
      for (const ring of this.rings) {
        const lt = t - ring.delay;
        if (lt < 0 || lt > 3) continue;
        const progress = lt / 3;
        const r = progress * Math.max(W, H) * 0.7;
        const alpha = (1 - progress) * 0.3;
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.strokeStyle = hsl(250, 70, 65, alpha);
        ctx.lineWidth = 2 + (1 - progress) * 4;
        ctx.stroke();
      }
    }
  };

  // ─── trail ──────────────────────────────────────────
  const Trail = {
    init(w, h) {
      this.points = [];
      for (let i = 0; i < 80; i++) {
        this.points.push({ x: CX, y: CY, a: 0 });
      }
    },
    draw(ctx, t) {
      const nx = CX + Math.sin(t * 0.9) * W * 0.3 + Math.cos(t * 0.3) * 100;
      const ny = CY + Math.cos(t * 0.7) * H * 0.25 + Math.sin(t * 0.5) * 80;
      this.points.unshift({ x: nx, y: ny, a: 1 });
      if (this.points.length > 80) this.points.pop();
      for (let i = 0; i < this.points.length; i++) {
        const p = this.points[i];
        p.a = 1 - i / this.points.length;
        if (p.a < 0.01) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + (1 - p.a) * 12, 0, Math.PI * 2);
        ctx.fillStyle = hsl(280 + i * 2, 75, 65, p.a * 0.5);
        ctx.fill();
      }
    }
  };

  // ─── lightning ──────────────────────────────────────
  const Lightning = {
    init(w, h) { this.flashes = []; this.nextFlash = 0; },
    draw(ctx, t) {
      if (t >= this.nextFlash) {
        this.flashes.push({ t: t, x: rand(W * 0.2, W * 0.8), dur: rand(0.08, 0.18) });
        this.nextFlash = t + rand(0.6, 2.5);
      }
      for (let i = this.flashes.length - 1; i >= 0; i--) {
        const f = this.flashes[i];
        const age = t - f.t;
        if (age > f.dur) { this.flashes.splice(i, 1); continue; }
        const alpha = (1 - age / f.dur) * 0.9;
        // Draw lightning bolt
        ctx.beginPath();
        let lx = f.x, ly = 0;
        ctx.moveTo(lx, ly);
        while (ly < H * 0.7) {
          lx += rand(-60, 60);
          ly += rand(20, 80);
          ctx.lineTo(lx, ly);
        }
        ctx.strokeStyle = `rgba(200,210,255,${alpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        // glow
        ctx.shadowColor = `rgba(180,200,255,${alpha * 0.6})`;
        ctx.shadowBlur = 30;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // flash overlay
        ctx.fillStyle = `rgba(180,200,255,${alpha * 0.08})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  };

  // ─── firework ───────────────────────────────────────
  const Firework = {
    init(w, h) { this.fworks = []; this.nextFW = 0; },
    draw(ctx, t) {
      if (t >= this.nextFW) {
        this.fworks.push({
          x: rand(W * 0.15, W * 0.85),
          y: rand(H * 0.1, H * 0.45),
          t: t,
          dur: rand(1.0, 2.0),
          hue: rand(0, 360),
          n: randInt(40, 80),
        });
        this.nextFW = t + rand(0.8, 2.5);
      }
      for (let i = this.fworks.length - 1; i >= 0; i--) {
        const fw = this.fworks[i];
        const age = t - fw.t;
        if (age > fw.dur) { this.fworks.splice(i, 1); continue; }
        const progress = age / fw.dur;
        const n = fw.n;
        for (let j = 0; j < n; j++) {
          const angle = (j / n) * Math.PI * 2;
          const speed = (0.3 + progress * 1.5) * 60;
          const px = fw.x + Math.cos(angle) * speed * age;
          const py = fw.y + Math.sin(angle) * speed * age + age * age * 120; // gravity
          const alpha = (1 - progress) * 0.8;
          const r = 1.5 + (1 - progress) * 2;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fillStyle = hsl(fw.hue + j * 3, 85, 65, alpha);
          ctx.fill();
        }
      }
    }
  };

  // ─── spiral ─────────────────────────────────────────
  const Spiral = {
    init(w, h) { this.t = 0; },
    draw(ctx, t) {
      const n = 200;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 6 + t * 0.5;
        const radius = (i / n) * Math.min(W, H) * 0.4;
        const x = CX + Math.cos(angle) * radius;
        const y = CY + Math.sin(angle) * radius;
        const alpha = (1 - i / n) * 0.5;
        const hue = (i * 1.8 + t * 40) % 360;
        ctx.beginPath();
        ctx.arc(x, y, 2 + (1 - i / n) * 3, 0, Math.PI * 2);
        ctx.fillStyle = hsl(hue, 80, 60, alpha);
        ctx.fill();
      }
    }
  };

  // ─── Mount ──────────────────────────────────────────
  window.CFX = {
    'particle-burst': ParticleBurst,
    'matrix-rain':     MatrixRain,
    'bokeh':           Bokeh,
    'aurora':          Aurora,
    'gradient-wave':   GradientWave,
    'pulse-ring':      PulseRing,
    'trail':           Trail,
    'lightning':       Lightning,
    'firework':        Firework,
    'spiral':          Spiral,
  };

})();
