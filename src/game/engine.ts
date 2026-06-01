// 게임 로직: 말 물리(스태미나/킥/러버밴딩/부스터) + 파티클 시스템
// 기존 horse-racing.tsx animate() 내부 로직을 변경 없이 클래스로 추출

import { Horse, FinishedHorse, Particle, HD, trackPos, SPEED_SCALE, RaceConfig } from './types';

export class GameEngine {
  horses: Horse[] = [];
  particles: Particle[] = [];
  finished: FinishedHorse[] = [];
  frame = 0;
  private pid = 0;
  private total = 100; // 결승 거리 (100 * 바퀴 수)

  // config 미지정 시 기본 8마리(HD) 사용
  init(config?: RaceConfig) {
    const list = config?.horses ?? HD.map(h => ({ name: h.name, color: h.c, dark: h.d, number: h.n }));
    const scale = config?.speedScale ?? SPEED_SCALE;
    this.total = 100 * Math.max(1, Math.floor(config?.laps ?? 1));
    this.horses = list.map((h, i) => ({
      id: i, name: h.name, number: h.number, color: h.color, dark: h.dark,
      position: 0, baseSpeed: (.04 + Math.random() * .02) * scale,
      fatigue: .15 + Math.random() * .25, kick: .8 + Math.random() * .7,
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
    this.total = 100;
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
    const racePhase = maxPos / this.total; // 레이스 전체 진행도(선두 기준)

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
      const remaining = this.total - h.position; // 결승선까지 남은 거리 (한 바퀴=100)
      const v = .9 + Math.random() * .2;
      // 스태미나/막판 스퍼트는 '결승선까지 거리' 기준 → 멀티랩이어도 마지막 바퀴 전체가 아니라 막판에만 발동
      const stam = remaining < 30 ? 1 - ((30 - remaining) / 30) * h.fatigue : 1;
      const k = remaining < 25 ? h.kick : 1;
      // 추격(러버밴딩): 뒤처질수록 더 강하게 따라붙음 (초반 순위가 굳지 않도록)
      const rubber = 1 + (maxPos - h.position) * 0.006;
      const rank = ranks[i];
      // 부스트 상태: 양수=부스터 남은 프레임 / 음수=쿨다운 / 0=대기
      // 끝나면 쿨다운(강제 OFF)으로 즉시 재발동을 막아 켜짐/꺼짐이 분명하게
      // 부스터는 '필드 대비 하위권'일수록 강하고 자주 — 특히 하위 30%에서 드라마틱하게
      // frac: 0=선두, 1=꼴찌 / drama: 하위 30% 구간에서만 0→1 (마리 수 무관)
      const frac = horses.length > 1 ? rank / (horses.length - 1) : 0;
      const drama = Math.max(0, (frac - 0.7) / 0.3);
      let boost = h.boost;
      if (boost > 0) {
        boost -= 1;
        if (boost === 0) boost = -(70 + Math.round(drama * 40)); // 종료 → 쿨다운(강제 OFF)
      } else if (boost < 0) {
        boost += 1; // 쿨다운 회복
      }
      // 발동 구간은 레이스 전체 진행(선두 기준)으로 → 앞·뒤가 동시에 후보 (앞이 먼저 터지는 버그 수정)
      if (boost === 0 && rank >= 1 && racePhase > .04 && remaining > 1) {
        if (Math.random() < .0016 + drama * .02) boost = 70 + Math.round(drama * 150) + Math.floor(Math.random() * 20);
      }
      // 발동하면 세기를 고정(강하게) → 뒤에서 끝까지 치고 올라와 실제 역전까지
      const bm = boost > 0 ? 1.95 : 1;
      h.position = h.position + Math.max(0.02, h.baseSpeed * v * stam * k * rubber * bm);
      h.boost = boost;
      if (h.position >= this.total) {
        h.position = this.total; h.finished = true;
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
      if (h.boost <= 0 || h.finished) continue;
      const tp = trackPos(h.position - .5, h.lane, laneCount);
      const trad = (tp.tang + 180) * Math.PI / 180;
      pts.push({ id: this.pid++, x: tp.x + Math.cos(trad) * 3 + (Math.random() - .5) * 6, y: tp.y + Math.sin(trad) * 2 + (Math.random() - .5) * 4, vx: Math.cos(trad) * .7, vy: Math.sin(trad) * .3 - .3, life: 14, max: 20, s: 2, fire: true });
    }
    if (pts.length > 80) pts.splice(0, pts.length - 80);

    return false;
  }
}
