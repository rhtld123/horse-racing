// 카메라 추적/회전/줌 로직
// 기존 horse-racing.tsx animate() 내 카메라 코드를 변경 없이 클래스로 추출

import { Horse, CameraState, trackPos, CX, CY, RY } from './types';

export class Camera implements CameraState {
  x = CX;
  y = CY - RY;
  rot = 0;
  zoom = 2.5;
  laneCount = 8;

  // 레이스 시작 위치로 리셋 (마리 수에 따라 중앙 레인 추적)
  reset(laneCount: number = 8) {
    this.laneCount = laneCount;
    const s = trackPos(0, (laneCount - 1) / 2, laneCount);
    this.x = s.x;
    this.y = s.y;
    this.rot = -s.tang;
    this.zoom = 2.5;
  }

  // 선두권(top4) 평균을 따라 패닝/회전/줌 (lerp .03 / .025 / .01)
  update(horses: Horse[]) {
    const laneCount = horses.length || this.laneCount;
    let top4Sum = 0, top4Cnt = 0;
    const positions = horses.filter(h => !h.finished).map(h => h.position).sort((a, b) => b - a);
    for (let i = 0; i < Math.min(4, positions.length); i++) { top4Sum += positions[i]; top4Cnt++; }
    if (top4Cnt === 0) { top4Sum = 100; top4Cnt = 1; }
    const camP = Math.min(top4Sum / top4Cnt + 3, 100);
    const ct = trackPos(camP, (laneCount - 1) / 2, laneCount);
    this.x += (ct.x - this.x) * .03;
    this.y += (ct.y - this.y) * .03;
    let diff = -ct.tang - this.rot;
    diff = ((diff + 540) % 360) - 180;
    this.rot += diff * .025;
    const spread = positions.length >= 2 ? positions[0] - positions[positions.length - 1] : 0;
    const tz = spread > 25 ? 1.8 : spread > 15 ? 2.2 : spread > 8 ? 2.6 : 3.0;
    this.zoom += (tz - this.zoom) * .01;
  }
}
