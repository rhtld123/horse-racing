// Canvas 2D 드로잉: 정적 트랙 + 말 실루엣 + 파티클
// 기존 SVG(staticTrack / HorseSide / particles)를 Canvas 2D API로 1:1 변환
// 메인 스레드 & Worker(OffscreenCanvas) 양쪽에서 동작하도록 컨텍스트 타입을 union 으로 둠

import { CX, CY, RX, RY, TW, trackPos } from './types';
import type { Horse, Particle, CameraState } from './types';
import type { GameEngine } from './engine';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Cache = HTMLCanvasElement | OffscreenCanvas;

export class Renderer {
  private cache: Cache | null = null;

  // 한 프레임 전체 렌더 (디바이스 픽셀 기준 cw/ch, dpr)
  drawFrame(ctx: Ctx, cw: number, ch: number, dpr: number, engine: GameEngine, camera: CameraState) {
    // 디바이스 픽셀 → 논리 픽셀 기준으로 리셋
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // 레터박스 영역 배경 (SVG style background 와 동일)
    ctx.fillStyle = '#1a4a10';
    ctx.fillRect(0, 0, cw, ch);

    // viewBox "0 0 1000 600" 를 컨테이너에 맞춰 letterbox (preserveAspectRatio xMidYMid meet)
    const scale = Math.min(cw / 1000, ch / 600);
    const ox = (cw - 1000 * scale) / 2;
    const oy = (ch - 600 * scale) / 2;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(0, 0, 1000, 600);
    ctx.clip();
    ctx.fillStyle = '#1a4a10';
    ctx.fillRect(0, 0, 1000, 600);

    // 카메라 트랜스폼 (기존 SVG <g> transform 동일)
    ctx.translate(500, 300);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.rotate(camera.rot * Math.PI / 180);
    ctx.translate(-camera.x, -camera.y);

    // 정적 트랙 (월드 좌표 캐시 → drawImage)
    const cache = this.getCache();
    ctx.drawImage(cache as CanvasImageSource, -500, -300);

    // 파티클
    this.drawParticles(ctx, engine.particles);

    // 말 (선두 계산)
    const laneCount = engine.horses.length;
    let leadId = 0, leadPos = -1;
    for (const h of engine.horses) { if (h.position > leadPos) { leadPos = h.position; leadId = h.id; } }
    for (const h of engine.horses) this.drawHorse(ctx, h, engine.frame, leadId, laneCount);

    ctx.restore();
  }

  // 정적 트랙을 월드 좌표 그대로 한 번만 캐시 (2000x1200, 원점 = 월드 -500,-300)
  private getCache(): Cache {
    if (this.cache) return this.cache;
    let c: Cache;
    if (typeof document !== 'undefined') {
      const el = document.createElement('canvas');
      el.width = 2000; el.height = 1200;
      c = el;
    } else {
      c = new OffscreenCanvas(2000, 1200);
    }
    const cctx = (c as HTMLCanvasElement).getContext('2d') as Ctx;
    cctx.translate(500, 300);
    this.drawStatic(cctx);
    this.cache = c;
    return c;
  }

  private drawParticles(ctx: Ctx, pts: Particle[]) {
    for (const p of pts) {
      ctx.globalAlpha = (p.life / p.max) * (p.fire ? .7 : .45);
      ctx.fillStyle = p.fire ? (p.life / p.max > .5 ? '#fbbf24' : '#f97316') : '#c4a060';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0, p.s), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 말 1마리 (위치/회전/부스트 글로우/실루엣/이모지)
  private drawHorse(ctx: Ctx, h: Horse, frame: number, leadId: number, laneCount: number) {
    const { x, y, tang } = trackPos(h.position, h.lane, laneCount);
    const phase = (frame * (.03 + h.baseSpeed * .3) + h.id * .3) % 1;
    const boosting = h.boost > 0;
    // 마리 수가 많으면 말/라벨 크기 축소 (겹침 완화). 약 8마리 이하는 0.55 유지
    const sc = Math.max(0.3, Math.min(0.55, 6 / laneCount));
    const k = sc / 0.55; // 라벨/아이콘 비례 계수

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tang * Math.PI / 180);

    if (boosting) {
      ctx.globalAlpha = .18;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22 * k, 14 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const ph = h.finished ? .25 : boosting ? (phase * 1.5) % 1 : phase;
    ctx.save();
    ctx.scale(sc, sc);
    this.drawSilhouette(ctx, h.color, h.dark, h.number, ph);
    ctx.restore();

    if (h.id === leadId && !h.finished && !boosting) {
      ctx.font = `${8 * k}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('👑', 0, -16 * k);
    }
    if (boosting) {
      ctx.font = `${9 * k}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('🔥', 0, -16 * k);
    }

    // 이름표 (말 위, 항상 표시). 마리 수가 많으면 말과 함께 크기 축소(k)
    if (h.name) {
      ctx.font = `bold ${7 * k}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(h.name).width;
      this.roundRect(ctx, -tw / 2 - 3 * k, -32 * k, tw + 6 * k, 10 * k, 3 * k, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = '#ffffff';
      ctx.fillText(h.name, 0, -27 * k);
    }

    ctx.restore();
  }

  // 말 측면 실루엣 (기존 HorseSide SVG 요소 순서 그대로 변환)
  private drawSilhouette(ctx: Ctx, c: string, dk: string, num: number, phase: number) {
    const t = phase * Math.PI * 2;
    const by = -Math.abs(Math.sin(t)) * 3;
    const S = 13, L = 4;
    const fr = { x: 9 + Math.sin(t) * S, y: 6 + by + 13 - Math.abs(Math.sin(t)) * L };
    const fl = { x: 6 + Math.sin(t + .5) * S * .9, y: 6 + by + 13 - Math.abs(Math.sin(t + .5)) * L * .8 };
    const br = { x: -7 + Math.sin(t + Math.PI) * S, y: 6 + by + 13 - Math.abs(Math.sin(t + Math.PI)) * L };
    const bl = { x: -4 + Math.sin(t + Math.PI + .5) * S * .9, y: 6 + by + 13 - Math.abs(Math.sin(t + Math.PI + .5)) * L * .8 };
    const ts = Math.sin(t * .5) * 4;

    ctx.lineCap = 'round';

    // shadow
    ctx.globalAlpha = .1; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 20, 13, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // tail
    ctx.strokeStyle = dk; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-14, by - 1);
    ctx.bezierCurveTo(-19 + ts, by - 5, -22 + ts, by - 9, -19 + ts, by - 14); ctx.stroke();

    // back legs
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-7, 6 + by); ctx.lineTo(br.x, br.y); ctx.stroke();
    ctx.globalAlpha = .5; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-4, 6 + by); ctx.lineTo(bl.x, bl.y); ctx.stroke();
    ctx.globalAlpha = 1;

    // body
    ctx.fillStyle = c; ctx.strokeStyle = dk; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.ellipse(0, by, 15, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // front legs
    ctx.strokeStyle = dk; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(9, 6 + by); ctx.lineTo(fr.x, fr.y); ctx.stroke();
    ctx.globalAlpha = .5; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(6, 6 + by); ctx.lineTo(fl.x, fl.y); ctx.stroke();
    ctx.globalAlpha = 1;

    // neck
    ctx.fillStyle = c; ctx.strokeStyle = dk; ctx.lineWidth = .4;
    ctx.beginPath(); ctx.moveTo(11, by - 4);
    ctx.quadraticCurveTo(15, by - 13, 19, by - 15);
    ctx.lineTo(23, by - 14); ctx.lineTo(18, by - 9); ctx.lineTo(12, by);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // head
    ctx.beginPath(); ctx.moveTo(19, by - 15);
    ctx.quadraticCurveTo(23, by - 19, 29, by - 16);
    ctx.quadraticCurveTo(31, by - 14, 29, by - 12);
    ctx.lineTo(23, by - 12);
    ctx.quadraticCurveTo(20, by - 13, 19, by - 15);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // eye + pupil + nostril
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(27, by - 14.5, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(27.4, by - 14.5, .6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(30, by - 13, .6, 0, Math.PI * 2); ctx.fill();

    // ear (open path, filled + stroked)
    ctx.fillStyle = c; ctx.strokeStyle = dk; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(21, by - 17); ctx.lineTo(20, by - 22); ctx.lineTo(23, by - 18);
    ctx.fill(); ctx.stroke();

    // mane (stroke only)
    ctx.strokeStyle = dk; ctx.lineWidth = 2.5; ctx.globalAlpha = .5;
    ctx.beginPath(); ctx.moveTo(13, by - 6); ctx.quadraticCurveTo(15, by - 12, 18, by - 14); ctx.stroke();
    ctx.globalAlpha = 1;

    // jockey body + helmet
    ctx.fillStyle = '#fff'; ctx.strokeStyle = dk; ctx.lineWidth = .5;
    ctx.beginPath(); ctx.ellipse(2, by - 9, 5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(5, by - 14, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // number
    ctx.fillStyle = dk; ctx.font = 'bold 6.5px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 2, by - 8);
  }

  // 정적 트랙 (기존 staticTrack useMemo 의 SVG 요소들을 그대로 변환)
  private drawStatic(ctx: Ctx) {
    const fillEll = (cx: number, cy: number, rx: number, ry: number, fill: string) => {
      ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    };
    const strokeEll = (cx: number, cy: number, rx: number, ry: number, stroke: string, sw: number, alpha?: number, dash?: number[]) => {
      ctx.save();
      if (alpha != null) ctx.globalAlpha = alpha;
      ctx.strokeStyle = stroke; ctx.lineWidth = sw;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    };

    // 잔디 / 외곽
    ctx.fillStyle = '#2a6a18'; ctx.fillRect(-500, -500, 2500, 2000);
    fillEll(CX, CY, RX + TW / 2 + 50, RY + TW / 2 + 50, '#1e5a12');

    // 관중석
    this.roundRect(ctx, CX - 180, CY - RY + TW / 2 + 10, 360, 35, 4, '#4a4a5a');
    this.roundRect(ctx, CX - 175, CY - RY + TW / 2 + 14, 350, 26, 3, '#6a6a7a');
    ctx.globalAlpha = .3; ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 15; i++) ctx.fillRect(CX - 170 + i * 23, CY - RY + TW / 2 + 17, 5, 4);
    ctx.globalAlpha = 1;

    // 트랙 본체
    fillEll(CX, CY, RX + TW / 2 + 15, RY + TW / 2 + 15, '#1a5010');
    fillEll(CX, CY, RX + TW / 2, RY + TW / 2, '#8b7355');
    fillEll(CX, CY, RX - TW / 2, RY - TW / 2, '#226a16');
    strokeEll(CX, CY, RX + TW / 2, RY + TW / 2, '#fff', 2, .5);
    strokeEll(CX, CY, RX - TW / 2 + 2, RY - TW / 2 + 2, '#fff', 2.5, .45, [10, 5]);

    // 펜스 기둥
    const orx = RX + TW / 2 + 6, ory = RY + TW / 2 + 6;
    ctx.globalAlpha = .5; ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const fx = CX + orx * Math.cos(a), fy = CY + ory * Math.sin(a);
      const rdeg = Math.atan2(ory * Math.cos(a), -orx * Math.sin(a)) * 180 / Math.PI;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate((rdeg + 90) * Math.PI / 180);
      ctx.fillRect(-1, 0, 2, 8);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    strokeEll(CX, CY, RX + TW / 2 + 6, RY + TW / 2 + 6, '#fff', 1.5, .35);

    // 결승선 (체크무늬)
    const fy1 = CY - RY - TW / 2 - 14, fy2 = CY - RY + TW / 2 + 14, rows = 10, rh = (fy2 - fy1) / rows;
    ctx.globalAlpha = .7; ctx.fillStyle = '#fff'; ctx.fillRect(CX - 12, fy1, 24, fy2 - fy1);
    ctx.globalAlpha = .8;
    for (let i = 0; i < rows; i++) { ctx.fillStyle = i % 2 === 0 ? '#222' : '#fff'; ctx.fillRect(CX - 10, fy1 + i * rh, 10, rh / 2); }
    for (let i = 0; i < rows; i++) { ctx.fillStyle = i % 2 === 0 ? '#222' : '#fff'; ctx.fillRect(CX, fy1 + i * rh + rh / 2, 10, rh / 2); }
    ctx.globalAlpha = 1;

    // 거리 마커 (25/50/75%)
    [25, 50, 75].forEach(pct => {
      const a = (pct / 100) * Math.PI * 2 - Math.PI / 2;
      const mx = CX + (RX + TW / 2 + 22) * Math.cos(a), my = CY + (RY + TW / 2 + 22) * Math.sin(a);
      ctx.globalAlpha = .8; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#333'; ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${pct}%`, mx, my + 1);
    });
  }

  private roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    const anyCtx = ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
    if (typeof anyCtx.roundRect === 'function') {
      anyCtx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
    }
    ctx.fill();
  }
}
