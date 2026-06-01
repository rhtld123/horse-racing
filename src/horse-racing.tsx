import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HD, GameState, HorseSnapshot, FinishedHorse, MainMsg, RaceConfig, horseDef, MIN_HORSES, DEFAULT_HORSES, SPEED_SCALE, MIN_LAPS, MAX_LAPS, DEFAULT_LAPS } from './game/types';
import { GameEngine } from './game/engine';
import { Camera } from './game/camera';
import { Renderer } from './game/renderer';

// 쉼표/줄바꿈으로 구분된 이름 문자열 → 이름 배열 (공백 제거, 빈 항목 제외)
const parseNames = (s: string): string[] =>
  s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);

// 리더보드 / 출전마 카드 한 페이지당 표시 마리 수
const LB_PAGE_SIZE = 10;
const ENTRY_PAGE_SIZE = 12;

// 경주 속도 프리셋 (배율; SPEED_SCALE=0.75 가 '보통' 기본값)
const SPEED_PRESETS: { label: string; value: number }[] = [
  { label: '🐢 느림', value: 0.5 },
  { label: '🏇 보통', value: SPEED_SCALE },
  { label: '🐎 빠름', value: 1.0 },
  { label: '⚡ 매우 빠름', value: 1.5 },
];

// 설정(config) → 시작 시점 UI 시드 스냅샷
const seedSnapshots = (cfg: RaceConfig): HorseSnapshot[] =>
  cfg.horses.map((h, i) => ({ id: i, name: h.name, number: h.number, color: h.color, position: 0, finished: false }));

const toSnapshot = (h: { id: number; name: string; number: number; color: string; position: number; finished: boolean }): HorseSnapshot =>
  ({ id: h.id, name: h.name, number: h.number, color: h.color, position: h.position, finished: h.finished });

// ─── Horse side silhouette (시작 화면 카드 미리보기 전용 SVG) ───
const HorseSide = ({ c, dk, num, phase, sc }: { c: string; dk: string; num: number; phase: number; sc: number }) => {
  const t = phase * Math.PI * 2;
  const by = -Math.abs(Math.sin(t)) * 3;
  const S = 13, L = 4;
  const fr = { x: 9 + Math.sin(t) * S, y: 6 + by + 13 - Math.abs(Math.sin(t)) * L };
  const fl = { x: 6 + Math.sin(t + .5) * S * .9, y: 6 + by + 13 - Math.abs(Math.sin(t + .5)) * L * .8 };
  const br = { x: -7 + Math.sin(t + Math.PI) * S, y: 6 + by + 13 - Math.abs(Math.sin(t + Math.PI)) * L };
  const bl = { x: -4 + Math.sin(t + Math.PI + .5) * S * .9, y: 6 + by + 13 - Math.abs(Math.sin(t + Math.PI + .5)) * L * .8 };
  const ts = Math.sin(t * .5) * 4;
  return (
    <g transform={`scale(${sc})`}>
      <ellipse cx={0} cy={20} rx={13} ry={2.5} fill="#000" opacity={.1} />
      <path d={`M-14,${by - 1}C${-19 + ts},${by - 5} ${-22 + ts},${by - 9} ${-19 + ts},${by - 14}`} fill="none" stroke={dk} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={-7} y1={6 + by} x2={br.x} y2={br.y} stroke={dk} strokeWidth={3} strokeLinecap="round" />
      <line x1={-4} y1={6 + by} x2={bl.x} y2={bl.y} stroke={dk} strokeWidth={2.5} strokeLinecap="round" opacity={.5} />
      <ellipse cx={0} cy={by} rx={15} ry={7} fill={c} stroke={dk} strokeWidth={.8} />
      <line x1={9} y1={6 + by} x2={fr.x} y2={fr.y} stroke={dk} strokeWidth={3} strokeLinecap="round" />
      <line x1={6} y1={6 + by} x2={fl.x} y2={fl.y} stroke={dk} strokeWidth={2.5} strokeLinecap="round" opacity={.5} />
      <path d={`M11,${by - 4}Q15,${by - 13} 19,${by - 15}L23,${by - 14} 18,${by - 9} 12,${by}Z`} fill={c} stroke={dk} strokeWidth={.4} />
      <path d={`M19,${by - 15}Q23,${by - 19} 29,${by - 16}Q31,${by - 14} 29,${by - 12}L23,${by - 12}Q20,${by - 13} 19,${by - 15}Z`} fill={c} stroke={dk} strokeWidth={.4} />
      <circle cx={27} cy={by - 14.5} r={1.3} fill="#fff" /><circle cx={27.4} cy={by - 14.5} r={.6} fill="#222" />
      <circle cx={30} cy={by - 13} r={.6} fill={dk} />
      <path d={`M21,${by - 17}L20,${by - 22} 23,${by - 18}`} fill={c} stroke={dk} strokeWidth={.6} />
      <path d={`M13,${by - 6}Q15,${by - 12} 18,${by - 14}`} fill="none" stroke={dk} strokeWidth={2.5} strokeLinecap="round" opacity={.5} />
      <ellipse cx={2} cy={by - 9} rx={5} ry={4.5} fill="white" stroke={dk} strokeWidth={.5} />
      <circle cx={5} cy={by - 14} r={3.2} fill={c} stroke={dk} strokeWidth={.5} />
      <text x={2} y={by - 8} fontSize={6.5} fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill={dk}>{num}</text>
    </g>
  );
};

const HorseRacing: React.FC = () => {
  const [gs, setGs] = useState<GameState>('start');
  const [cd, setCd] = useState(3);
  const [horses, setHorses] = useState<HorseSnapshot[]>([]);
  const [finished, setFinished] = useState<FinishedHorse[]>([]);

  // 경기 설정: 쉼표로 구분한 이름 문자열 → 파싱한 개수 = 말 마리 수 (색상/번호 자동)
  const [nameInput, setNameInput] = useState(() => Array.from({ length: DEFAULT_HORSES }, (_, i) => horseDef(i).name).join(', '));
  const [speed, setSpeed] = useState(SPEED_SCALE); // 경주 속도 배율 (기본 = 코드 상수)
  const [laps, setLaps] = useState(DEFAULT_LAPS);  // 바퀴 수
  const [lbPage, setLbPage] = useState(0);         // 리더보드 페이지
  const [entryPage, setEntryPage] = useState(0);   // 출전마 카드 페이지
  const configRef = useRef<RaceConfig>({ horses: [] });

  // Canvas / Worker
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const attachedRef = useRef<HTMLCanvasElement | null>(null); // 전송 완료한 canvas 노드 (StrictMode 가드)

  // 메인 스레드 폴백용 (OffscreenCanvas 미지원 시)
  const engineRef = useRef<GameEngine>(new GameEngine());
  const cameraRef = useRef<Camera>(new Camera());
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number | null>(null);

  // 타이밍
  const t0 = useRef(0);
  const tEnd = useRef(0);
  const cdT = useRef<ReturnType<typeof setInterval> | null>(null);

  const confetti = useMemo(() => Array.from({ length: 80 }, (_, i) => ({
    x: ((i * 17 + 3) % 100), delay: (i * .37) % 4, dur: 2.5 + (i * .23) % 3,
    color: HD[i % 8].c, w: 5 + (i * 1.3) % 8, h: 8 + (i * 1.7) % 12,
  })), []);

  // 워커/래프/옵저버 정리 (사용자 reset 또는 라우트 이탈 시)
  const stop = () => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    attachedRef.current = null;
  };

  useEffect(() => () => { if (cdT.current) clearInterval(cdT.current); stop(); }, []);

  // 이름 문자열 파싱 → 경기 설정 (이름 개수 = 마리 수, 색상/번호는 인덱스 순서 자동)
  const buildConfig = (): RaceConfig => ({
    speedScale: speed,
    laps,
    horses: parseNames(nameInput).map((nm, i) => {
      const def = horseDef(i);
      return { name: nm.slice(0, 8) || def.name, color: def.color, dark: def.dark, number: def.number };
    }),
  });

  const startCd = () => {
    const cfg = buildConfig();
    configRef.current = cfg;
    setHorses(seedSnapshots(cfg)); setFinished([]); setLbPage(0);
    setCd(3); setGs('countdown');
    let c = 3;
    cdT.current = setInterval(() => {
      c--;
      if (c > 0) setCd(c);
      else {
        clearInterval(cdT.current!); cdT.current = null; setCd(0);
        setTimeout(() => { setGs('racing'); }, 600);
      }
    }, 700);
  };

  // ─── 레이스 시작: Worker + OffscreenCanvas (미지원 시 메인 스레드 폴백) ───
  // StrictMode 안전: 같은 canvas 노드에는 한 번만 부착하고, 파괴적 cleanup 없음(정리는 stop()/reset()).
  useEffect(() => {
    if (gs !== 'racing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (attachedRef.current === canvas) return;
    attachedRef.current = canvas;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth || 1000;
    const ch = canvas.clientHeight || 600;

    setHorses(seedSnapshots(configRef.current));
    setFinished([]);

    const supportsWorker = typeof Worker !== 'undefined'
      && typeof canvas.transferControlToOffscreen === 'function'
      && typeof OffscreenCanvas !== 'undefined';

    // 메인 스레드 폴백 루프 (Phase 1 로직)
    const startMain = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const engine = engineRef.current, camera = cameraRef.current;
      if (!rendererRef.current) rendererRef.current = new Renderer();
      const renderer = rendererRef.current;
      engine.init(configRef.current); camera.reset(configRef.current.horses.length);
      const ldpr = window.devicePixelRatio || 1;
      const loop = () => {
        const done = engine.tick();
        camera.update(engine.horses);
        const w = canvas.clientWidth || 1000, h = canvas.clientHeight || 600;
        const dw = Math.round(w * ldpr), dh = Math.round(h * ldpr);
        if (canvas.width !== dw || canvas.height !== dh) { canvas.width = dw; canvas.height = dh; }
        renderer.drawFrame(ctx, w, h, ldpr, engine, camera);
        if (engine.frame % 3 === 0 || done) {
          setHorses(engine.horses.map(toSnapshot));
          setFinished(engine.finished.map(f => ({ ...f })));
        }
        if (done) { tEnd.current = performance.now(); setGs('finish'); return; }
        rafRef.current = requestAnimationFrame(loop);
      };
      t0.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    };

    if (!supportsWorker) { startMain(); return; }

    let worker: Worker;
    try {
      worker = new Worker(new URL('./game/worker.ts', import.meta.url));
    } catch {
      attachedRef.current = canvas; startMain(); return;
    }
    workerRef.current = worker;

    let offscreen: OffscreenCanvas;
    try {
      offscreen = canvas.transferControlToOffscreen();
    } catch {
      worker.terminate(); workerRef.current = null;
      startMain(); return;
    }

    worker.postMessage({ type: 'init', canvas: offscreen, cw, ch, dpr }, [offscreen]);
    worker.onmessage = (ev: MessageEvent<MainMsg>) => {
      const d = ev.data;
      if (d.type === 'frame') { setHorses(d.horses); setFinished(d.finished); }
      else if (d.type === 'done') {
        setHorses(d.horses); setFinished(d.finished);
        tEnd.current = performance.now(); setGs('finish');
      }
    };

    const ro = new ResizeObserver(() => {
      const w = canvas.clientWidth || 1000, h = canvas.clientHeight || 600;
      worker.postMessage({ type: 'resize', cw: w, ch: h, dpr: window.devicePixelRatio || 1 });
    });
    ro.observe(canvas);
    roRef.current = ro;

    t0.current = performance.now();
    worker.postMessage({ type: 'start', config: configRef.current });
  }, [gs]);

  const reset = () => { stop(); engineRef.current.reset(); setHorses([]); setFinished([]); setGs('start'); };
  const elapsed = () => Math.max(0, ((gs === 'finish' ? tEnd.current : performance.now()) - t0.current) / 1000);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}.${Math.floor((s * 100) % 100).toString().padStart(2, '0')}`;

  // ─── MINI MAP (작은 SVG, 저빈도 갱신) ───
  const renderMiniMap = () => (
    <svg viewBox="0 0 160 110" className="w-40 h-28">
      <rect width="160" height="110" rx="8" fill="#000" opacity={.55} />
      <ellipse cx={80} cy={55} rx={62} ry={35} fill="#1a4a10" />
      <ellipse cx={80} cy={55} rx={56} ry={30} fill="#8b7355" opacity={.6} />
      <ellipse cx={80} cy={55} rx={44} ry={22} fill="#1a5a10" />
      <ellipse cx={80} cy={55} rx={56} ry={30} fill="none" stroke="white" strokeWidth={.5} opacity={.3} />
      <line x1={80} y1={55 - 30} x2={80} y2={55 - 22} stroke="white" strokeWidth={2} opacity={.5} />
      {/* Camera cone (현재 바퀴 내 위치로 표시 → position % 100) */}
      {(() => {
        const avgPos = horses.length > 0 ? [...horses].sort((a, b) => b.position - a.position).slice(0, 4).reduce((s, h) => s + h.position, 0) / 4 : 0;
        const ca = ((avgPos % 100) / 100) * Math.PI * 2 - Math.PI / 2;
        const cx2 = 80 + 50 * Math.cos(ca);
        const cy2 = 55 + 27 * Math.sin(ca);
        return <circle cx={cx2} cy={cy2} r={4} fill="yellow" opacity={.5} />;
      })()}
      {horses.map(h => {
        const a = ((h.position % 100) / 100) * Math.PI * 2 - Math.PI / 2;
        return <circle key={h.id} cx={80 + 50 * Math.cos(a)} cy={55 + 27 * Math.sin(a)} r={2.5} fill={h.color} stroke="white" strokeWidth={.4} />;
      })}
      <text x={80} y={105} fontSize={7} textAnchor="middle" fill="white" opacity={.5}>TRACK MAP</text>
    </svg>
  );

  // ─── START ───
  // 출전마 미리보기 페이징
  const entryNames = parseNames(nameInput);
  const entryTotalPages = Math.max(1, Math.ceil(entryNames.length / ENTRY_PAGE_SIZE));
  const entryCurPage = Math.min(entryPage, entryTotalPages - 1);
  const entryItems = entryNames.slice(entryCurPage * ENTRY_PAGE_SIZE, entryCurPage * ENTRY_PAGE_SIZE + ENTRY_PAGE_SIZE);
  if (gs === 'start') return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 overflow-hidden relative">
      <style>{`
        @keyframes spotlight{0%,100%{opacity:.12}50%{opacity:.25}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(239,68,68,.5)}50%{box-shadow:0 0 50px rgba(239,68,68,.9),0 0 80px rgba(239,68,68,.3)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-yellow-300 rounded-full blur-[120px]" style={{ animation: 'spotlight 4s ease-in-out infinite' }} />
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-yellow-300 rounded-full blur-[120px]" style={{ animation: 'spotlight 4s ease-in-out infinite 2s' }} />
      <div className="relative z-10 max-w-3xl w-full">
        <div className="text-center mb-10" style={{ animation: 'float 3s ease-in-out infinite' }}>
          <div className="text-[120px] leading-none mb-2">🏇</div>
          <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-400 to-yellow-400 tracking-tight">HORSE RACING</h1>
          <p className="text-lg text-gray-400 mt-3">명마들이 펼치는 숨 막히는 레이스</p>
        </div>
        {/* 말 이름: 쉼표로 구분 → 입력한 개수만큼 출전 (색상 자동) */}
        <div className="mb-6">
          <label className="block text-gray-300 font-semibold mb-2 text-center">말 이름 (쉼표로 구분)</label>
          <textarea
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            rows={2}
            placeholder="불꽃, 번개, 질풍"
            className="w-full bg-gray-800/80 border border-gray-700 focus:border-yellow-400 rounded-xl px-4 py-3 text-white text-center outline-none resize-none"
          />
          <div className="text-center text-sm mt-2">
            {entryNames.length >= MIN_HORSES
              ? <span className="text-gray-400">출전 말 <span className="text-yellow-400 font-bold">{entryNames.length}</span>마리</span>
              : <span className="text-red-400">최소 {MIN_HORSES}마리 이상 입력하세요</span>}
          </div>
        </div>
        {entryTotalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mb-3 text-sm text-gray-300">
            <button onClick={() => setEntryPage(p => Math.max(0, p - 1))} disabled={entryCurPage <= 0} className="w-7 h-7 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">‹</button>
            <span className="font-mono">{entryCurPage + 1} / {entryTotalPages}</span>
            <button onClick={() => setEntryPage(p => Math.min(entryTotalPages - 1, p + 1))} disabled={entryCurPage >= entryTotalPages - 1} className="w-7 h-7 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">›</button>
          </div>
        )}
        <div className="grid grid-cols-4 gap-3 mb-10">
          {entryItems.map((nm, i) => {
            const gi = entryCurPage * ENTRY_PAGE_SIZE + i;
            const h = horseDef(gi);
            return (
              <div key={gi} className="bg-gray-800/80 backdrop-blur rounded-xl p-3 border border-gray-700 transition-all" style={{ animation: `cardIn .4s ease-out ${i * .03}s both` }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg shrink-0" style={{ backgroundColor: h.color }}>{h.number}</div>
                  <span className="text-white font-semibold text-sm truncate">{nm.slice(0, 8)}</span>
                </div>
                <svg viewBox="-35 -30 70 55" className="w-full h-16"><HorseSide c={h.color} dk={h.dark} num={h.number} phase={.15} sc={1} /></svg>
              </div>
            );
          })}
        </div>
        {/* 바퀴 수 선택 */}
        <div className="mb-6">
          <div className="text-gray-300 font-semibold mb-2 text-center">바퀴 수</div>
          <div className="flex justify-center gap-2 flex-wrap">
            {Array.from({ length: MAX_LAPS - MIN_LAPS + 1 }, (_, i) => MIN_LAPS + i).map(l => (
              <button key={l} onClick={() => setLaps(l)} className={`px-4 py-2 rounded-full font-semibold text-sm border transition-all ${laps === l ? 'bg-yellow-400 text-gray-900 border-yellow-400' : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:border-gray-500'}`}>{l}바퀴</button>
            ))}
          </div>
        </div>
        {/* 경주 속도 선택 */}
        <div className="mb-8">
          <div className="text-gray-300 font-semibold mb-2 text-center">경주 속도</div>
          <div className="flex justify-center gap-2 flex-wrap">
            {SPEED_PRESETS.map(p => (
              <button key={p.value} onClick={() => setSpeed(p.value)} className={`px-4 py-2 rounded-full font-semibold text-sm border transition-all ${speed === p.value ? 'bg-yellow-400 text-gray-900 border-yellow-400' : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:border-gray-500'}`}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="text-center"><button onClick={startCd} disabled={entryNames.length < MIN_HORSES} className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 text-white font-black text-3xl px-16 py-5 rounded-full transition-all duration-300 transform hover:scale-110 active:scale-95" style={{ animation: 'glow 2s ease-in-out infinite' }}>START RACE 🏁</button></div>
      </div>
    </div>
  );

  // ─── COUNTDOWN ───
  if (gs === 'countdown') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center overflow-hidden">
      <style>{`@keyframes countPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.3);opacity:1}100%{transform:scale(1);opacity:1}}@keyframes ringEx{0%{transform:scale(.5);opacity:1}100%{transform:scale(3);opacity:0}}`}</style>
      <div className="relative" key={cd}>
        <div className="absolute inset-0 flex items-center justify-center"><div className="w-40 h-40 rounded-full border-4 border-red-500" style={{ animation: 'ringEx .7s ease-out forwards' }} /></div>
        <div style={{ animation: 'countPop .6s cubic-bezier(.17,.67,.35,1.2)' }} className="text-center">
          <div className="text-[220px] font-black leading-none" style={{ color: cd > 0 ? '#fff' : '#fbbf24', textShadow: cd > 0 ? '0 0 80px rgba(239,68,68,.8)' : '0 0 80px rgba(251,191,36,.8)' }}>{cd > 0 ? cd : 'GO!'}</div>
          <div className="text-2xl text-gray-400 mt-2 font-light tracking-widest">{cd === 3 ? '준비...' : cd === 2 ? '자리에...' : cd === 1 ? '출발!' : ''}</div>
        </div>
      </div>
    </div>
  );

  // ─── RACING / FINISH ───
  // 진행률은 전체 거리(100*바퀴) 기준으로 환산해 0~100%
  const avg = horses.length > 0 ? horses.reduce((s, h) => s + h.position, 0) / horses.length / laps : 0;
  const maxPos = horses.length > 0 ? Math.max(...horses.map(h => h.position)) : 0;
  const curLap = Math.min(laps, Math.floor(maxPos / 100) + 1);
  const finishRank = new Map(finished.map(f => [f.id, f.rank]));
  const leaderboard = [...horses].sort((a, b) => {
    const ar = finishRank.get(a.id), br = finishRank.get(b.id);
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1; if (br != null) return 1;
    return b.position - a.position;
  });
  const el = elapsed();
  // 리더보드 페이징
  const lbTotalPages = Math.max(1, Math.ceil(leaderboard.length / LB_PAGE_SIZE));
  const lbCurPage = Math.min(lbPage, lbTotalPages - 1);
  const lbItems = leaderboard.slice(lbCurPage * LB_PAGE_SIZE, lbCurPage * LB_PAGE_SIZE + LB_PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col relative overflow-hidden">
      <style>{`
        @keyframes confettiFall{0%{transform:translateY(-5vh) rotate(0deg);opacity:1}100%{transform:translateY(105vh) rotate(1080deg);opacity:0}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes scaleIn{from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
      `}</style>

      {gs === 'finish' && confetti.map((c, i) => <div key={i} className="fixed pointer-events-none z-50" style={{ left: `${c.x}%`, top: '-30px', width: c.w, height: c.h, backgroundColor: c.color, borderRadius: 2, animation: `confettiFall ${c.dur}s linear ${c.delay}s infinite` }} />)}

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/95 border-b border-gray-700/50 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"><span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE</div>
          <span className="text-white font-bold">{gs === 'finish' ? '🏆 경주 종료!' : '🏁 경주 진행중'}</span>
        </div>
        <div className="text-green-400 font-mono font-bold text-lg tracking-wider">{fmt(el)}</div>
        <span className="text-yellow-400 font-semibold text-sm">{laps > 1 ? `🏁 ${curLap} / ${laps} 바퀴` : '제 1 경주'}</span>
      </div>

      {/* Main */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="w-full h-full block" style={{ background: '#1a4a10' }} />
          <div className="absolute bottom-3 left-3 z-10">{renderMiniMap()}</div>
        </div>

        {/* Sidebar */}
        <div className="w-52 bg-gray-900/95 border-l border-gray-700/50 p-3 flex flex-col gap-2 z-10 overflow-hidden shrink-0">
          <div className="flex items-center justify-between gap-1">
            <h3 className="text-white font-bold text-sm flex items-center gap-1.5">📊 실시간 순위</h3>
            {lbTotalPages > 1 && (
              <div className="flex items-center gap-1 text-[10px] text-gray-300 shrink-0">
                <button onClick={() => setLbPage(p => Math.max(0, p - 1))} disabled={lbCurPage <= 0} className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">‹</button>
                <span className="font-mono w-8 text-center">{lbCurPage + 1}/{lbTotalPages}</span>
                <button onClick={() => setLbPage(p => Math.min(lbTotalPages - 1, p + 1))} disabled={lbCurPage >= lbTotalPages - 1} className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">›</button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
            {lbItems.map((h, i) => {
              const gi = lbCurPage * LB_PAGE_SIZE + i; // 전체 순위 인덱스
              return (
                <div key={h.id} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${gi === 0 ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-gray-800/60'}`}>
                  <span className="text-white font-bold w-5 text-center text-xs">{gi === 0 ? '🥇' : gi === 1 ? '🥈' : gi === 2 ? '🥉' : `${gi + 1}`}</span>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: h.color }}>{h.number}</div>
                  <span className="text-white text-xs font-medium flex-1 truncate">{h.name}</span>
                  <span className="text-gray-400 text-[10px] font-mono">{h.finished ? '✅' : `${Math.round(h.position / laps)}%`}</span>
                </div>
              );
            })}
          </div>
          <div className="pt-2 border-t border-gray-700/50">
            <div className="text-gray-400 text-[10px] mb-1">PROGRESS</div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-75" style={{ width: `${Math.min(100, avg)}%`, background: 'linear-gradient(90deg,#22c55e,#eab308,#ef4444)' }} /></div>
            <div className="text-right text-gray-500 text-[10px] mt-0.5">{Math.round(avg)}%</div>
          </div>
        </div>
      </div>

      {/* Finish overlay */}
      {gs === 'finish' && finished.length > 0 && (
        <div className="fixed inset-0 z-30 bg-black/60 flex items-center justify-center p-4" style={{ animation: 'fadeIn .8s ease-out' }}>
          <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-600/50 max-h-[90vh] flex flex-col" style={{ animation: 'scaleIn .6s cubic-bezier(.17,.67,.35,1.2) .3s both' }}>
            <h2 className="text-center text-3xl font-black text-white mb-4 shrink-0">🏆 경주 결과</h2>
            <div className="flex justify-center items-end gap-3 mb-4 h-36 shrink-0">
              {finished[1] && <div className="flex flex-col items-center w-24"><div className="text-2xl mb-1">🥈</div><div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg" style={{ backgroundColor: finished[1].color }}>{finished[1].number}</div><div className="text-white text-sm font-semibold mt-1">{finished[1].name}</div><div className="bg-gray-500 w-full mt-1 rounded-t-lg" style={{ height: 44 }} /></div>}
              {finished[0] && <div className="flex flex-col items-center w-28"><div className="text-3xl mb-1">🏆</div><div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-yellow-500/40" style={{ backgroundColor: finished[0].color }}>{finished[0].number}</div><div className="text-yellow-400 text-base font-bold mt-1">{finished[0].name}</div><div className="bg-yellow-500 w-full mt-1 rounded-t-lg" style={{ height: 60 }} /></div>}
              {finished[2] && <div className="flex flex-col items-center w-24"><div className="text-xl mb-1">🥉</div><div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: finished[2].color }}>{finished[2].number}</div><div className="text-white text-sm font-semibold mt-1">{finished[2].name}</div><div className="bg-orange-700 w-full mt-1 rounded-t-lg" style={{ height: 30 }} /></div>}
            </div>
            <div className="space-y-1.5 mb-4 overflow-y-auto flex-1 min-h-0 pr-1">
              {finished.map((h, i) => <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${i < 3 ? 'bg-gray-700/60' : 'bg-gray-800/40'}`}><span className="w-6 text-center font-bold text-sm" style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : i === 2 ? '#f97316' : '#6b7280' }}>{i + 1}위</span><div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: h.color }}>{h.number}</div><span className="text-white text-sm font-medium">{h.name}</span></div>)}
            </div>
            <div className="text-center text-gray-400 text-sm mb-3 mt-1 shrink-0">경주 기록: <span className="text-green-400 font-mono font-bold">{fmt(el)}</span></div>
            <button onClick={reset} className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-3 rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 text-lg shrink-0">다시 하기 🔄</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HorseRacing;
