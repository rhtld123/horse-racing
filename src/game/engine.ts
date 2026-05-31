// 게임 로직: 말 물리(스태미나/킥/러버밴딩/부스터) + 파티클 시스템
// 기존 horse-racing.tsx animate() 내부 로직을 변경 없이 클래스로 추출

import { Horse, FinishedHorse, Particle, HD, trackPos, SPEED_SCALE, RaceConfig } from './types';

export class GameEngine {
  horses: Horse[] = [];
  particles: Particle[] = [];
  finished: FinishedHorse[] = [];
  frame = 0;
  private pid = 0;

  // config 미지정 시 기본 8마리(HD) 사용
  init(config?: RaceConfig) {
    const list = config?.horses ?? HD.map(h => ({ name: h.name, color: h.c, dark: h.d, number: h.n }));
    const scale = config?.speedScale ?? SPEED_SCALE;
    this.horses = list.map((h, i) => ({
      id: i, name: h.name, number: h.number, color: h.color, dark: h.dark,
      position: 0, baseSpeed: (.032 + Math.random() * .035) * scale,
      fatigue: .2 + Math.random() * .4, kick: .85 + Math.random() * .6,
      finished: false, lane: i, boost: 0,
    }));
    this.particles = [];
    this.finished = [];
    this.pid = 0;
    this.frame = 0;
  }

  reset() {
    this.horses = [];
    this.particles = [];
    this.finished = [];
  }

  // 한 프레임 진행. 모든 말이 골인하면 true 반환
  tick(): boolean {
    this.frame++;
    const horses = this.horses;
    const laneCount = horses.length;

    // 순위 계산 (in-place, 배열 복사 최소화)
    let maxPos = 0, allDone = true;
    for (let i = 0; i < horses.length; i++) {
      if (horses[i].position > maxPos) maxPos = horses[i].position;
      if (!horses[i].finished) allDone = false;
    }
    if (allDone) return true;

    // 순위 배열 한 번만 만들기
    const ranks: number[] = new Array(horses.length);
    const posArr = horses.map(h => h.finished ? -1 : h.position);
    const idxByPos = posArr.map((_, i) => i).sort((a, b) => posArr[b] - posArr[a]);
    let r = 0;
    for (const idx of idxByPos) { ranks[idx] = horses[idx].finished ? -1 : r++; }

    // 말 업데이트 (in-place)
    for (let i = 0; i < horses.length; i++) {
      const h = horses[i];
      if (h.finished) continue;
      const p = h.position / 100;
      const v = .82 + Math.random() * .36;
      const stam = p > .7 ? 1 - (p - .7) * h.fatigue : 1;
      const k = p > .75 ? h.kick : 1;
      const rubber = 1 + (maxPos - h.position) * 0.012;
      const rank = ranks[i];
      let boost = Math.max(0, h.boost - 1);
      if (boost === 0 && rank >= 4 && p > .1 && p < .95) {
        const tier = rank - 4;
        if (Math.random() < .003 + tier * .003) boost = 55 + tier * 15 + Math.floor(Math.random() * 25);
      }
      const bm = boost > 0 ? 1.85 + Math.max(0, rank - 4) * 0.06 : 1;
      h.position = h.position + Math.max(0.02, h.baseSpeed * v * stam * k * rubber * bm);
      h.boost = boost;
      if (h.position >= 100) {
        h.position = 100; h.finished = true;
        if (!this.finished.some(f => f.id === h.id))
          this.finished.push({ id: h.id, name: h.name, number: h.number, color: h.color, rank: this.finished.length + 1 });
      }
    }

    // 파티클: 매 3프레임마다 먼지, 부스트는 매 프레임
    const pts = this.particles;
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      p.s *= p.fire ? .92 : .95;
      if (p.life <= 0) { pts.splice(i, 1); }
    }
    if (this.frame % 3 === 0) {
      for (const h of horses) {
        if (h.finished) continue;
        const tp = trackPos(h.position - .5, h.lane, laneCount);
        const trad = (tp.tang + 180) * Math.PI / 180;
        pts.push({ id: this.pid++, x: tp.x + Math.cos(trad) * 5 + (Math.random() - .5) * 6, y: tp.y + Math.sin(trad) * 3 + (Math.random() - .5) * 4, vx: Math.cos(trad) * .5, vy: Math.sin(trad) * .2 - .2, life: 18, max: 26, s: 2 });
      }
    }
    for (const h of horses) {
      if (!h.boost || h.finished) continue;
      const tp = trackPos(h.position - .5, h.lane, laneCount);
      const trad = (tp.tang + 180) * Math.PI / 180;
      pts.push({ id: this.pid++, x: tp.x + Math.cos(trad) * 3 + (Math.random() - .5) * 6, y: tp.y + Math.sin(trad) * 2 + (Math.random() - .5) * 4, vx: Math.cos(trad) * .7, vy: Math.sin(trad) * .3 - .3, life: 14, max: 20, s: 2, fire: true });
    }
    if (pts.length > 80) pts.splice(0, pts.length - 80);

    return false;
  }
}
