// 공유 타입 / 상수 / 트랙 좌표 계산
// horse-racing.tsx 에서 분리 (Canvas 전환 1단계, 추후 Web Worker 공유용)

export interface Horse {
  id: number;
  name: string;
  number: number;
  color: string;
  dark: string;
  position: number;
  baseSpeed: number;
  fatigue: number;
  kick: number;
  finished: boolean;
  lane: number;
  boost: number;
}

export interface FinishedHorse {
  id: number;
  name: string;
  number: number;
  color: string;
  rank: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s: number;
  fire?: boolean;
}

export type GameState = 'start' | 'countdown' | 'racing' | 'finish';

// Worker → Main UI 갱신용 경량 스냅샷 (순위/미니맵/진행도 표시)
export interface HorseSnapshot {
  id: number;
  name: string;
  number: number;
  color: string;
  position: number;
  finished: boolean;
}

// 경기 설정용 말 정의 (이름/색상/번호)
export interface HorseConfig {
  name: string;
  color: string;
  dark: string;
  number: number;
}

// 한 경기 설정 (말 목록 = 마리 수, 속도 배율, 바퀴 수)
export interface RaceConfig {
  horses: HorseConfig[];
  speedScale?: number; // 미지정 시 SPEED_SCALE 사용
  laps?: number;       // 미지정 시 1바퀴
}

// Main → Worker 메시지
export type WorkerMsg =
  | { type: 'init'; canvas: OffscreenCanvas; cw: number; ch: number; dpr: number }
  | { type: 'start'; config: RaceConfig }
  | { type: 'reset' }
  | { type: 'resize'; cw: number; ch: number; dpr: number };

// Worker → Main 메시지
export type MainMsg =
  | { type: 'frame'; horses: HorseSnapshot[]; finished: FinishedHorse[] }
  | { type: 'done'; horses: HorseSnapshot[]; finished: FinishedHorse[] };

// 카메라 좌표 스냅샷 (Worker → Main 전송용으로도 사용)
export interface CameraState {
  x: number;
  y: number;
  rot: number;
  zoom: number;
}

// 말 데이터 (이름/번호/색상)
export const HD = [
  { name: '불꽃', n: 1, c: '#ef4444', d: '#991b1b' },
  { name: '번개', n: 2, c: '#3b82f6', d: '#1e3a8a' },
  { name: '질풍', n: 3, c: '#22c55e', d: '#14532d' },
  { name: '황금', n: 4, c: '#eab308', d: '#713f12' },
  { name: '자주', n: 5, c: '#a855f7', d: '#581c87' },
  { name: '벚꽃', n: 6, c: '#ec4899', d: '#831843' },
  { name: '태양', n: 7, c: '#f97316', d: '#7c2d12' },
  { name: '하늘', n: 8, c: '#06b6d4', d: '#164e63' },
];

// 경주 전체 속도 배율 (1 = 원래 속도, 작을수록 느림). 0.75 = 약 25% 느리게
export const SPEED_SCALE = 0.75;

// 말 마리 수: 코드 기본값 + 최소값 (상한 없음 — 많을수록 레인 겹치고 렉 가능)
export const DEFAULT_HORSES = 8;
export const MIN_HORSES = 2;

// 바퀴 수 범위
export const DEFAULT_LAPS = 1;
export const MIN_LAPS = 1;
export const MAX_LAPS = 5;

// 인덱스별 말 정의 (0~7 은 팔레트 HD, 8+ 는 HSL 골든앵글 자동 생성색)
export const horseDef = (i: number): HorseConfig => {
  if (i < HD.length) return { name: HD[i].name, color: HD[i].c, dark: HD[i].d, number: i + 1 };
  const hue = Math.round((i * 137.508) % 360);
  return { name: `${i + 1}번마`, color: `hsl(${hue}, 70%, 55%)`, dark: `hsl(${hue}, 70%, 30%)`, number: i + 1 };
};

// 트랙 기하 상수 (타원 트랙)
export const CX = 500;
export const CY = 300;
export const RX = 340;
export const RY = 170;
export const TW = 80;

// 진행도(0~100) + 레인 → 월드 좌표 + 접선 각도(deg)
// laneCount 로 레인 중앙 정렬 (기본 8마리 기준 center=3.5)
export const trackPos = (progress: number, lane: number, laneCount: number = 8) => {
  const a = (progress / 100) * Math.PI * 2 - Math.PI / 2;
  // 레인 간격: 마리 수가 많아도 트랙 폭(TW) 안에 들어오도록 압축 (8마리 이하는 기존과 동일)
  const usableSpread = TW - 20; // 말 폭 고려한 양쪽 여백
  const spacing = laneCount > 1 ? Math.min(TW / 10, usableSpread / (laneCount - 1)) : 0;
  const lo = (lane - (laneCount - 1) / 2) * spacing;
  const rx = RX + lo, ry = RY + lo * 0.48;
  const x = CX + rx * Math.cos(a);
  const y = CY + ry * Math.sin(a);
  const tang = Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) * 180 / Math.PI;
  return { x, y, tang };
};
