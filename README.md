# 🏇 Horse Racing

8마리(또는 그 이상)의 명마가 타원 트랙을 도는 **관전형 경마 시뮬레이션**. 이름·마리 수·속도·바퀴 수를 직접 정하고, 카운트다운 → 레이스 → 시상대까지 한 판을 즐깁니다.

React 19 + TypeScript(CRA) 기반이며, 렌더링을 **Canvas 2D + OffscreenCanvas + Web Worker** 로 처리해 말이 많아도 60fps를 노립니다.

---

## ✨ 주요 특징

### 1. SVG → Canvas + Web Worker 렌더링 (성능 핵심)
원래 SVG DOM 렌더링(매 프레임 수십 개 노드 diff로 프레임 드랍)을 Canvas로 전환했습니다.

- **Web Worker + OffscreenCanvas**: 물리·카메라·드로잉을 워커 스레드에서 실행. `canvas.transferControlToOffscreen()` 으로 캔버스를 워커에 위임 → 메인 스레드(React UI)와 렌더링이 경쟁하지 않음.
- **CRA(webpack 5) 네이티브 번들링**: `new Worker(new URL('./game/worker.ts', import.meta.url))` — 별도 로더/Blob 트릭 없이 워커 청크 자동 분리.
- **메인 스레드 폴백**: `OffscreenCanvas` 미지원(Safari 16.4 미만 등) 시 자동으로 메인 스레드 렌더로 폴백.
- **StrictMode 안전**: 캔버스 노드 동일성 가드로 OffscreenCanvas 1회 전송 규칙과 React StrictMode 더블 마운트의 충돌을 회피.

### 2. 직접 정하는 레이스 설정
시작 전에 경기 조건을 자유롭게 구성합니다.

- **출전마 이름 입력**: 줄·구분자로 여러 마리를 한 번에 입력. 최소 인원(기본 8마리) 미만이면 시작 버튼이 잠깁니다.
- **출전마 미리보기 페이징**: 입력한 말을 12마리씩 카드로 페이지 단위 미리보기 — 인원이 많아도 한눈에 관리.
- **바퀴 수 선택**: `MIN_LAPS ~ MAX_LAPS` 범위에서 버튼으로 선택(멀티랩 지원).
- **속도 배율**: 🐢 느림 · 🏇 보통 · 🐎 빠름 · ⚡ 매우 빠름.

### 3. 선두 추적 카메라 & 관전 연출
정적인 부감이 아니라, 영화처럼 선두권을 따라다니는 카메라로 박진감을 더합니다.

- **선두권(top4) 평균 추적**: 패닝·회전·줌을 각각 `lerp`로 부드럽게 보간해 카메라가 튀지 않음.
- **멀티랩 대응**: 트랙 좌표를 한 바퀴마다 wrap 처리해 여러 바퀴에서도 선두를 계속 추적, 추월로 한 바퀴 차이가 나도 줌이 안정적.
- **한 판의 흐름**: 시작 설정 → 카운트다운 → 레이스 → 시상대까지 매끄럽게 연결. 실시간 순위 사이드바(10명씩 페이징)와 미니맵으로 진행 상황을 동시에 확인.

### 4. "재미"를 위해 튜닝한 밸런스 엔진
순수 시뮬이 아니라 **아케이드식 보정**으로 접전·역전을 연출합니다 (수치는 수천 회 시뮬레이션으로 검증).

- **러버밴딩**: 뒤처질수록 빨라지는 추격 보정.
- **하위 30% 부스터**: 후미권일수록 강하고 자주 발동하는 추격 부스터 — **쿨다운(강제 OFF)** 으로 켜졌다/꺼졌다가 분명. 발동창은 레이스 4%~99%.
- **거리 기준 스태미나/막판 스퍼트**: "결승선까지 남은 거리"로 판정 → 멀티랩이어도 마지막 바퀴 전체가 처지지 않고 **막판에만** 변수.
- **공정성**: 레인/말별 우승 분포가 통계적으로 균등(조작 없음). 실력(타고난 속도)과 운·보정의 비중을 튜닝으로 조절.

---

## 🚀 실행

```bash
npm install
npm start        # http://localhost:3000
npm run build    # 프로덕션 빌드
```

> 워커/캔버스 동작은 실제 브라우저에서 확인하세요.

---

## 🗂 구조

```
src/
├── horse-racing.tsx     # React UI (시작/카운트다운/레이스/결과, 설정, 사이드바, 미니맵)
└── game/
    ├── types.ts         # 공유 타입·상수, trackPos(타원 좌표), horseDef, 설정 상수
    ├── engine.ts        # 물리·순위·부스터·파티클 (GameEngine)
    ├── camera.ts        # 선두 추적 패닝/회전/줌 (Camera)
    ├── renderer.ts      # Canvas 2D 드로잉 (트랙/말 실루엣/파티클/이름표)
    └── worker.ts        # Web Worker 엔트리 (engine+camera+renderer → OffscreenCanvas)
```

설계 명세는 [`CANVAS_MIGRATION.md`](./CANVAS_MIGRATION.md) 참고.

---

## 🛠 기술 스택

React 19 · TypeScript · Web Worker / OffscreenCanvas · Canvas 2D · Tailwind CSS · Create React App
