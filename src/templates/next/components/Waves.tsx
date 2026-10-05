'use client';

/* Soft line waves behind the Simple hero. They sit low in the hero, under the headline, never
 * across it. One still frame when the reader asks for less motion, and the loop stops while the
 * hero is off screen. Drawn in UsageLedger's own accent. */
import { useEffect, useRef } from 'react';

export default function Waves() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t = 0;
    let raf = 0;
    let visible = true;
    const size = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
    };
    const draw = () => {
      const W = c.width;
      const H = c.height;
      const dpr = window.devicePixelRatio || 1;
      x.clearRect(0, 0, W, H);
      const lines = 26;
      for (let i = 0; i < lines; i++) {
        const a = i / lines;
        x.beginPath();
        x.strokeStyle = `rgba(${Math.round(194 - a * 30)},${Math.round(87 + a * 40)},${Math.round(26 + a * 50)},${0.05 + 0.12 * (1 - Math.abs(a - 0.5) * 2)})`;
        x.lineWidth = dpr;
        for (let px = 0; px <= W; px += 8 * dpr) {
          const u = px / W;
          const y = H * (0.84 + 0.05 * Math.sin(u * 3.2 + t + a * 1.4) * Math.cos(u * 1.3 - t * 0.6) + (a - 0.5) * 0.22 * Math.sin(u * 2 + t * 0.4));
          if (px) x.lineTo(px, y);
          else x.moveTo(px, y);
        }
        x.stroke();
      }
      if (!reduce && visible) {
        t += 0.006;
        raf = requestAnimationFrame(draw);
      }
    };
    size();
    draw();
    const onResize = () => {
      size();
      if (reduce || !visible) draw();
    };
    window.addEventListener('resize', onResize);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was && !reduce) raf = requestAnimationFrame(draw);
    });
    io.observe(c);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      io.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="sv-waves" aria-hidden="true" />;
}
