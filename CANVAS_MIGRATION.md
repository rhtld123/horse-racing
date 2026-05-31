# Canvas 전환 작업 명세서

## 목표
현재 SVG 기반 렌더링을 Canvas(+ OffscreenCanvas/Web Worker)로 전환하여 60fps 끊김 없는 애니메이션 달성.

## 현재 문제
- SVG 엘리먼트가 DOM 노드 → React가 매 프레임 ~90개 diff → 메인 스레드 블로킹
- 타이머, UI 업데이트가 같은 스레드에서 렌더링과 경쟁
- `requestAnimationFrame` 콜백 내에서 `setState` → React 재렌더 → SVG DOM 업데이트 체인이 프레임 드랍 유발

## 전환 아키텍처

```
┌─ Main Thread ──────────────────────┐     ┌─ Worker Thread ────────────┐
│                                     │     │                            │
│  React UI (HUD, 순위, 결과 오버레이)  │     │  game.worker.ts            │
│  ├─ 타이머 표시                      │     │  ├─ 물리 엔진 (말 위치)      │
│  ├─ 실시간 순위 사이드바             │     │  ├─ 파티클 시스템            │
│  ├─ 미니맵 (작은 SVG, 변경 적음)     │     │  ├─ 카메라 계산             │
│  └─ 시작/카운트다운/결과 화면        │     │  ├─ 부스터/러버밴딩 로직     │
│                                     │     │  └─ OffscreenCanvas 렌더링  │
│  <canvas> (ref로 연결)              │◄────│      ├─ 트랙 그리기          │
│                                     │     │      ├─ 말 그리기            │
│  Worker ↔ Main 메시지:              │     │      └─ 파티클 그리기        │
│  ├─ Main→Worker: 'start','reset'    │     │                            │
│  └─ Worker→Main: 매 프레임 상태     │     └────────────────────────────┘
│     { horses[], rankings, elapsed } │
└─────────────────────────────────────┘
```

## 파일 구조

```
src/
├── horse-racing.tsx          # React 컴포넌트 (UI만 담당)
├── game/
│   ├── worker.ts             # Web Worker 엔트리
│   ├── engine.ts             # 게임 로직 (물리, 부스터, 러버밴딩)
│   ├── renderer.ts           # Canvas 2D 드로잉 (트랙, 말, 파티클)
│   ├── camera.ts             # 카메라 추적/회전/줌 로직
│   └── types.ts              # 공유 타입/상수
```

## 단계별 구현

### 1단계: types.ts - 공유 타입 추출
현재 `horse-racing.tsx` 상단의 타입/상수를 분리:

```typescript
// 그대로 옮기기:
export interface Horse { id, name, number, color, dark, position, baseSpeed, fatigue, kick, finished, lane, boost }
export interface FinishedHorse { id, name, number, color, rank }
export interface Particle { id, x, y, vx, vy, life, max, s, fire? }
export const HD = [ {name:'불꽃', n:1, c:'#ef4444', d:'#991b1b'}, ... ]
export const CX=500, CY=300, RX=340, RY=170, TW=80
export const trackPos = (progress, lane) => { ... }  // 현재 코드 그대로
```

Worker↔Main 메시지 타입:
```typescript
export type WorkerMsg =
  | { type: 'start' }
  | { type: 'reset' }

export type MainMsg = {
  type: 'frame'
  horses: Horse[]
  particles: Particle[]
  finished: FinishedHorse[]
  camera: { x: number, y: number, rot: number, zoom: number }
  elapsed: number
}
```

### 2단계: engine.ts - 게임 로직 추출
현재 `animate()` 함수 내 로직을 클래스로 추출:

```typescript
export class GameEngine {
  horses: Horse[] = []
  particles: Particle[] = []
  finished: FinishedHorse[] = []
  frame = 0
  startTime = 0

  init() { /* 현재 init() 내용 */ }

  tick(): boolean { // returns true if race done
    // 현재 animate() 내 물리 로직:
    // - 순위 계산 (ranks 배열)
    // - 말 위치 업데이트 (in-place for문)
    //   - 스태미나, 킥, 러버밴딩, 부스터
    //   - 최소 속도 0.02 보장
    //   - 골인 처리
    // - 파티클 업데이트/생성
  }
}
```

**현재 로직 그대로 보존** (line 100~188의 animate 내부):
- `maxPos` 계산, `allDone` 체크
- `ranks` 배열 생성 (posArr → idxByPos → ranks)
- 말 for문 (stam, kick, rubber, boost, bm, spd)
- 파티클 업데이트 (splice), 먼지(3프레임마다), 불꽃(부스트 중)

### 3단계: camera.ts - 카메라 로직 추출
현재 line 145~163의 카메라 코드:

```typescript
export class Camera {
  x: number; y: number; rot: number; zoom: number;

  update(horses: Horse[]) {
    // top4 평균 → camP → trackPos → lerp (.03)
    // 회전: diff wrapping → lerp (.025)
    // 줌: spread 기반 → lerp (.01)
  }
}
```

### 4단계: renderer.ts - Canvas 드로잉
SVG를 Canvas 2D API로 변환. 핵심 매핑:

| SVG | Canvas 2D |
|-----|-----------|
| `<ellipse cx cy rx ry fill>` | `ctx.ellipse()` + `ctx.fill()` |
| `<rect x y w h fill>` | `ctx.fillRect()` |
| `<line x1 y1 x2 y2 stroke>` | `ctx.moveTo()` + `ctx.lineTo()` + `ctx.stroke()` |
| `<path d="...">` | `ctx.beginPath()` + path commands |
| `<circle cx cy r fill>` | `ctx.arc()` + `ctx.fill()` |
| `<text>` | `ctx.fillText()` |
| `transform="translate() rotate() scale()"` | `ctx.translate()` + `ctx.rotate()` + `ctx.scale()` |

```typescript
export class Renderer {
  ctx: OffscreenCanvasRenderingContext2D

  drawFrame(horses: Horse[], particles: Particle[], camera: Camera) {
    ctx.save()
    ctx.clearRect(0, 0, 1000, 600)

    // 카메라 트랜스폼 (현재 SVG <g> transform과 동일)
    ctx.translate(500, 300)
    ctx.scale(camera.zoom, camera.zoom)
    ctx.rotate(camera.rot * Math.PI / 180)
    ctx.translate(-camera.x, -camera.y)

    this.drawStaticTrack()  // 잔디, 트랙, 펜스, 결승선 (캐시 가능)
    this.drawParticles(particles)
    this.drawHorses(horses)

    ctx.restore()
  }

  // 정적 트랙은 별도 OffscreenCanvas에 한번 그려두고 drawImage로 복사
  private trackCache: OffscreenCanvas | null = null
  drawStaticTrack() {
    if (!this.trackCache) {
      this.trackCache = new OffscreenCanvas(2000, 1200)
      const tc = this.trackCache.getContext('2d')!
      // 잔디, 트랙 ellipse, 펜스, 결승선 등 한번 그리기
    }
    ctx.drawImage(this.trackCache, -500, -300)
  }
}
```

**말 실루엣 Canvas 변환** (현재 HorseSide 컴포넌트 → drawHorse 함수):

현재 SVG 말 구조 (line 32~61):
```
shadow (ellipse) → tail (path) → back legs (2 lines) → body (ellipse)
→ front legs (2 lines) → neck (path) → head (path) → eye (circles)
→ nostril → ear (path) → mane (path) → jockey body (ellipse)
→ jockey helmet (circle) → number (text)
```

Canvas로 변환 시 동일한 순서로 `ctx.beginPath()` + path 명령 사용.
갤럽 애니메이션 로직(phase → by, fr, fl, br, bl)은 동일하게 유지.

### 5단계: worker.ts - Web Worker
```typescript
const engine = new GameEngine()
const camera = new Camera()
let renderer: Renderer
let running = false

self.onmessage = (e: MessageEvent<WorkerMsg>) => {
  if (e.data.type === 'start') {
    engine.init()
    running = true
    loop()
  }
  if (e.data.type === 'reset') {
    running = false
  }
}

function loop() {
  if (!running) return
  const done = engine.tick()
  camera.update(engine.horses)

  // OffscreenCanvas에 그리기
  renderer.drawFrame(engine.horses, engine.particles, camera)

  // UI 데이터만 메인 스레드로 전송 (DOM 업데이트용)
  self.postMessage({
    type: 'frame',
    horses: engine.horses.map(h => ({...h})),  // structured clone용 복사
    finished: [...engine.finished],
    camera: { x: camera.x, y: camera.y, rot: camera.rot, zoom: camera.zoom },
    elapsed: (performance.now() - engine.startTime) / 1000,
  } satisfies MainMsg)

  if (done) { running = false; return }
  requestAnimationFrame(loop)
}
```

### 6단계: horse-racing.tsx 수정
기존 SVG 렌더링 + animate 로직 제거, Canvas + Worker 연결:

```typescript
const HorseRacing = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const [horses, setHorses] = useState<Horse[]>([])
  const [finished, setFinished] = useState<FinishedHorse[]>([])
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current!
    const offscreen = canvas.transferControlToOffscreen()
    const worker = new Worker(new URL('./game/worker.ts', import.meta.url))
    worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen])

    worker.onmessage = (e: MessageEvent<MainMsg>) => {
      if (e.data.type === 'frame') {
        setHorses(e.data.horses)
        setFinished(e.data.finished)
        setElapsed(e.data.elapsed)
      }
    }
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  // UI는 React로 (HUD, 순위, 결과 오버레이)
  // 레이스 화면은 <canvas>만
  return (
    <div>
      <canvas ref={canvasRef} width={1000} height={600} />
      {/* 순위 사이드바, 타이머 등 HTML/CSS 오버레이 */}
    </div>
  )
}
```

## 주의사항

- **CRA + Web Worker**: `react-scripts`는 Worker import를 기본 지원하지 않음.
  - 방법 1: `worker-loader` 또는 `comlink-loader` 설치
  - 방법 2: Blob URL로 인라인 Worker 생성
  - 방법 3: `craco` 또는 `react-app-rewired`로 webpack 설정 오버라이드
  - **추천**: 방법 2 (의존성 최소)

- **OffscreenCanvas 호환성**: Chrome/Edge/Firefox 지원, Safari 16.4+. 미지원 시 메인 스레드 Canvas 폴백.

- **Worker → Main 데이터 전송**: `postMessage`는 structured clone 사용. Horse 객체 8개 + Particle 80개 정도는 overhead 무시 가능.

- **타이머**: Worker에서 `performance.now()` 사용. Worker의 시간은 메인 스레드와 동일 origin time.

## 보존할 게임 로직 (변경 없이 옮기기)

| 항목 | 현재 위치 (horse-racing.tsx) |
|------|---------------------------|
| 말 초기화 | line 91 (init 함수) |
| 물리 엔진 | line 100~143 (animate 내부) |
| 카메라 추적 | line 145~163 |
| 파티클 시스템 | line 166~188 |
| 말 실루엣 | line 32~61 (HorseSide 컴포넌트) |
| 정적 트랙 | line 201~236 (staticTrack useMemo) |
| 트랙 좌표 계산 | line 21~29 (trackPos 함수) |
| 순위 정렬 | line 389~395 (finishRank Map) |

## 기존 기능 체크리스트

전환 후 반드시 동작 확인:
- [ ] 8마리 말 갤럽 애니메이션 (다리, 꼬리, 바운스)
- [ ] 구간 카메라 (회전+줌+패닝, lerp .03/.025/.01)
- [ ] 부스터 (5~8등, 🔥 파티클, 노란 글로우)
- [ ] 러버밴딩 (gap * 0.012)
- [ ] 먼지 파티클 + 부스트 불꽃 파티클
- [ ] 카운트다운 (3-2-1-GO)
- [ ] 실시간 순위 사이드바 (골인 순서 기반)
- [ ] 결과 오버레이 (시상대 + 전체 순위)
- [ ] 미니맵 (카메라 위치 표시)
- [ ] 타이머 (performance.now 기반)
- [ ] 스태미나/킥/최소속도(0.02) 시스템
- [ ] 컨페티 (결과 화면)
