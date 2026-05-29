import React, { useState, useEffect, useRef, useMemo } from 'react';

interface Horse { id: number; name: string; number: number; color: string; dark: string; position: number; baseSpeed: number; fatigue: number; kick: number; finished: boolean; lane: number; boost: number; }
interface FinishedHorse { id: number; name: string; number: number; color: string; rank: number; }
interface Particle { id: number; x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; fire?: boolean; }
type GameState = 'start' | 'countdown' | 'racing' | 'finish';

const HD = [
  { name: '불꽃', n: 1, c: '#ef4444', d: '#991b1b' },
  { name: '번개', n: 2, c: '#3b82f6', d: '#1e3a8a' },
  { name: '질풍', n: 3, c: '#22c55e', d: '#14532d' },
  { name: '황금', n: 4, c: '#eab308', d: '#713f12' },
  { name: '자주', n: 5, c: '#a855f7', d: '#581c87' },
  { name: '벚꽃', n: 6, c: '#ec4899', d: '#831843' },
  { name: '태양', n: 7, c: '#f97316', d: '#7c2d12' },
  { name: '하늘', n: 8, c: '#06b6d4', d: '#164e63' },
];

const CX = 500, CY = 300, RX = 340, RY = 170, TW = 80;

const trackPos = (progress: number, lane: number) => {
  const a = (progress / 100) * Math.PI * 2 - Math.PI / 2;
  const lo = (lane - 3.5) * (TW / 10);
  const rx = RX + lo, ry = RY + lo * 0.48;
  const x = CX + rx * Math.cos(a);
  const y = CY + ry * Math.sin(a);
  const tang = Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) * 180 / Math.PI;
  return { x, y, tang };
};


// ─── Horse side silhouette ───
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
  const [, setTk] = useState(0);
  const hr = useRef<Horse[]>([]);
  const pr = useRef<Particle[]>([]);
  const fr = useRef<FinishedHorse[]>([]);
  const ar = useRef<number | null>(null);
  const pid = useRef(0);
  const t0 = useRef(0);
  const tEnd = useRef(0);
  const fm = useRef(0);
  const camPX = useRef(CX);
  const camPY = useRef(CY - RY);
  const camRot = useRef(0);
  const camZm = useRef(2.5);
  const cdT = useRef<ReturnType<typeof setInterval> | null>(null);
  const camGRef = useRef<SVGGElement>(null);

  const confetti = useMemo(() => Array.from({ length: 80 }, (_, i) => ({
    x: ((i * 17 + 3) % 100), delay: (i * .37) % 4, dur: 2.5 + (i * .23) % 3,
    color: HD[i % 8].c, w: 5 + (i * 1.3) % 8, h: 8 + (i * 1.7) % 12,
  })), []);

  useEffect(() => () => { if (cdT.current) clearInterval(cdT.current); if (ar.current) cancelAnimationFrame(ar.current); }, []);

  const init = () => {
    hr.current = HD.map((h, i) => ({ id: i, name: h.name, number: h.n, color: h.c, dark: h.d, position: 0, baseSpeed: .032 + Math.random() * .035, fatigue: .2 + Math.random() * .4, kick: .85 + Math.random() * .6, finished: false, lane: i, boost: 0 }));
    pr.current = []; fr.current = []; pid.current = 0; fm.current = 0;
    const s = trackPos(0, 3.5);
    camPX.current = s.x; camPY.current = s.y; camRot.current = -s.tang; camZm.current = 2.5;
  };

  const startCd = () => { init(); setCd(3); setGs('countdown'); let c = 3; cdT.current = setInterval(() => { c--; if (c > 0) setCd(c); else { clearInterval(cdT.current!); cdT.current = null; setCd(0); setTimeout(() => { t0.current = performance.now(); setGs('racing'); }, 600); } }, 700); };

  useEffect(() => {
    if (gs !== 'racing') return;
    const animate = () => {
      fm.current++;
      const horses = hr.current;

      // 순위 계산 (in-place, 배열 복사 최소화)
      let maxPos = 0, allDone = true;
      for (let i = 0; i < horses.length; i++) {
        if (horses[i].position > maxPos) maxPos = horses[i].position;
        if (!horses[i].finished) allDone = false;
      }
      if (allDone) { tEnd.current = performance.now(); setGs('finish'); return; }

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
          if (!fr.current.some(f => f.id === h.id))
            fr.current.push({ id: h.id, name: h.name, number: h.number, color: h.color, rank: fr.current.length + 1 });
        }
      }

      // 카메라: top4 평균 (정렬 없이 상위 4개 추출)
      let top4Sum = 0, top4Cnt = 0;
      const positions = horses.filter(h => !h.finished).map(h => h.position).sort((a, b) => b - a);
      for (let i = 0; i < Math.min(4, positions.length); i++) { top4Sum += positions[i]; top4Cnt++; }
      if (top4Cnt === 0) { top4Sum = 100; top4Cnt = 1; }
      const camP = Math.min(top4Sum / top4Cnt + 3, 100);
      const ct = trackPos(camP, 3.5);
      camPX.current += (ct.x - camPX.current) * .03;
      camPY.current += (ct.y - camPY.current) * .03;
      let diff = -ct.tang - camRot.current;
      diff = ((diff + 540) % 360) - 180;
      camRot.current += diff * .025;
      const spread = positions.length >= 2 ? positions[0] - positions[positions.length - 1] : 0;
      const tz = spread > 25 ? 1.8 : spread > 15 ? 2.2 : spread > 8 ? 2.6 : 3.0;
      camZm.current += (tz - camZm.current) * .01;

      if (camGRef.current) {
        camGRef.current.setAttribute('transform',
          `translate(500,300) scale(${camZm.current}) rotate(${camRot.current}) translate(${-camPX.current},${-camPY.current})`);
      }

      // 파티클: 매 3프레임마다 먼지, 부스트는 매 프레임
      const pts = pr.current;
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        p.s *= p.fire ? .92 : .95;
        if (p.life <= 0) { pts.splice(i, 1); }
      }
      if (fm.current % 3 === 0) {
        for (const h of horses) {
          if (h.finished) continue;
          const tp = trackPos(h.position - .5, h.lane);
          const trad = (tp.tang + 180) * Math.PI / 180;
          pts.push({ id: pid.current++, x: tp.x + Math.cos(trad) * 5 + (Math.random() - .5) * 6, y: tp.y + Math.sin(trad) * 3 + (Math.random() - .5) * 4, vx: Math.cos(trad) * .5, vy: Math.sin(trad) * .2 - .2, life: 18, max: 26, s: 2 });
        }
      }
      for (const h of horses) {
        if (!h.boost || h.finished) continue;
        const tp = trackPos(h.position - .5, h.lane);
        const trad = (tp.tang + 180) * Math.PI / 180;
        pts.push({ id: pid.current++, x: tp.x + Math.cos(trad) * 3 + (Math.random() - .5) * 6, y: tp.y + Math.sin(trad) * 2 + (Math.random() - .5) * 4, vx: Math.cos(trad) * .7, vy: Math.sin(trad) * .3 - .3, life: 14, max: 20, s: 2, fire: true });
      }
      if (pts.length > 80) pts.splice(0, pts.length - 80);

      setTk(t => t + 1);
      ar.current = requestAnimationFrame(animate);
    };
    ar.current = requestAnimationFrame(animate);
    return () => { if (ar.current) cancelAnimationFrame(ar.current); };
  }, [gs]);

  const reset = () => { setGs('start'); hr.current = []; pr.current = []; fr.current = []; };
  const elapsed = () => Math.max(0, ((gs === 'finish' ? tEnd.current : performance.now()) - t0.current) / 1000);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}.${Math.floor((s * 100) % 100).toString().padStart(2, '0')}`;

  // ─── 정적 트랙 요소 (한 번만 생성) ───
  const staticTrack = useMemo(() => {
    const fencePosts = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      const orx = RX + TW / 2 + 6, ory = RY + TW / 2 + 6;
      return { x: CX + orx * Math.cos(a), y: CY + ory * Math.sin(a), r: Math.atan2(ory * Math.cos(a), -orx * Math.sin(a)) * 180 / Math.PI };
    });
    const markers = [25, 50, 75].map(pct => {
      const a = (pct / 100) * Math.PI * 2 - Math.PI / 2;
      return { x: CX + (RX + TW / 2 + 22) * Math.cos(a), y: CY + (RY + TW / 2 + 22) * Math.sin(a), label: `${pct}%` };
    });
    const fy1 = CY - RY - TW / 2 - 14, fy2 = CY - RY + TW / 2 + 14, rows = 10, rh = (fy2 - fy1) / rows;

    return (
      <g>
        <rect x={-500} y={-500} width={2500} height={2000} fill="#2a6a18" />
        <ellipse cx={CX} cy={CY} rx={RX + TW / 2 + 50} ry={RY + TW / 2 + 50} fill="#1e5a12" />
        <rect x={CX - 180} y={CY - RY + TW / 2 + 10} width={360} height={35} rx={4} fill="#4a4a5a" />
        <rect x={CX - 175} y={CY - RY + TW / 2 + 14} width={350} height={26} rx={3} fill="#6a6a7a" />
        {Array.from({ length: 15 }).map((_, i) => <rect key={i} x={CX - 170 + i * 23} y={CY - RY + TW / 2 + 17} width={5} height={4} fill="#ffe066" opacity={.3} rx={.5} />)}
        <ellipse cx={CX} cy={CY} rx={RX + TW / 2 + 15} ry={RY + TW / 2 + 15} fill="#1a5010" />
        <ellipse cx={CX} cy={CY} rx={RX + TW / 2} ry={RY + TW / 2} fill="#8b7355" />
        <ellipse cx={CX} cy={CY} rx={RX - TW / 2} ry={RY - TW / 2} fill="#226a16" />
        <ellipse cx={CX} cy={CY} rx={RX + TW / 2} ry={RY + TW / 2} fill="none" stroke="white" strokeWidth={2} opacity={.5} />
        <ellipse cx={CX} cy={CY} rx={RX - TW / 2 + 2} ry={RY - TW / 2 + 2} fill="none" stroke="white" strokeWidth={2.5} strokeDasharray="10 5" opacity={.45} />
        {fencePosts.map((fp, i) => <rect key={i} x={fp.x - 1} y={fp.y} width={2} height={8} fill="white" opacity={.5} transform={`rotate(${fp.r + 90},${fp.x},${fp.y})`} />)}
        <ellipse cx={CX} cy={CY} rx={RX + TW / 2 + 6} ry={RY + TW / 2 + 6} fill="none" stroke="white" strokeWidth={1.5} opacity={.35} />
        <g>
          <rect x={CX - 12} y={fy1} width={24} height={fy2 - fy1} fill="white" opacity={.7} />
          {Array.from({ length: rows }).map((_, i) => <rect key={i} x={CX - 10} y={fy1 + i * rh} width={10} height={rh / 2} fill={i % 2 === 0 ? '#222' : 'white'} opacity={.8} />)}
          {Array.from({ length: rows }).map((_, i) => <rect key={`b${i}`} x={CX} y={fy1 + i * rh + rh / 2} width={10} height={rh / 2} fill={i % 2 === 0 ? '#222' : 'white'} opacity={.8} />)}
        </g>
        {markers.map((m, i) => <g key={i}><circle cx={m.x} cy={m.y} r={10} fill="white" opacity={.8} /><text x={m.x} y={m.y + 1} fontSize={7} fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="#333">{m.label}</text></g>)}
      </g>
    );
  }, []);

  // ─── TRACK VIEW ───
  const renderTrack = () => {
    const horses = hr.current;
    let leadId = 0, leadPos = -1;
    for (const h of horses) { if (h.position > leadPos) { leadPos = h.position; leadId = h.id; } }

    return (
      <svg viewBox="0 0 1000 600" className="w-full h-full" style={{ background: '#1a4a10' }}>
        <g ref={camGRef} transform={`translate(500,300) scale(${camZm.current}) rotate(${camRot.current}) translate(${-camPX.current},${-camPY.current})`}>
          {staticTrack}

          {/* Particles */}
          {pr.current.map(p => <circle key={p.id} cx={p.x} cy={p.y} r={p.s} fill={p.fire ? (p.life / p.max > .5 ? '#fbbf24' : '#f97316') : '#c4a060'} opacity={p.life / p.max * (p.fire ? .7 : .45)} />)}

          {/* Horses */}
          {horses.map(h => {
            const { x, y, tang } = trackPos(h.position, h.lane);
            const phase = (fm.current * (.03 + h.baseSpeed * .3) + h.id * .3) % 1;
            const boosting = h.boost > 0;
            return (
              <g key={h.id} transform={`translate(${x},${y}) rotate(${tang})`}>
                {boosting && <ellipse cx={0} cy={0} rx={22} ry={14} fill="#fbbf24" opacity={.18} />}
                <HorseSide c={h.color} dk={h.dark} num={h.number} phase={h.finished ? .25 : boosting ? (phase * 1.5) % 1 : phase} sc={.55} />
                {h.id === leadId && !h.finished && !boosting && <text x={0} y={-18} fontSize={8} textAnchor="middle">👑</text>}
                {boosting && <text x={0} y={-18} fontSize={9} textAnchor="middle">🔥</text>}
              </g>
            );
          })}
        </g>
      </svg>
    );
  };

  // ─── MINI MAP ───
  const renderMiniMap = () => (
    <svg viewBox="0 0 160 110" className="w-40 h-28">
      <rect width="160" height="110" rx="8" fill="#000" opacity={.55} />
      <ellipse cx={80} cy={55} rx={62} ry={35} fill="#1a4a10" />
      <ellipse cx={80} cy={55} rx={56} ry={30} fill="#8b7355" opacity={.6} />
      <ellipse cx={80} cy={55} rx={44} ry={22} fill="#1a5a10" />
      <ellipse cx={80} cy={55} rx={56} ry={30} fill="none" stroke="white" strokeWidth={.5} opacity={.3} />
      <line x1={80} y1={55 - 30} x2={80} y2={55 - 22} stroke="white" strokeWidth={2} opacity={.5} />
      {/* Camera cone */}
      {(() => {
        const ca = (Math.min(hr.current.length > 0 ? [...hr.current].sort((a, b) => b.position - a.position).slice(0, 4).reduce((s, h) => s + h.position, 0) / 4 : 0, 100) / 100) * Math.PI * 2 - Math.PI / 2;
        const cx2 = 80 + 50 * Math.cos(ca);
        const cy2 = 55 + 27 * Math.sin(ca);
        return <circle cx={cx2} cy={cy2} r={4} fill="yellow" opacity={.5} />;
      })()}
      {hr.current.map(h => {
        const a = (Math.min(h.position, 100) / 100) * Math.PI * 2 - Math.PI / 2;
        return <circle key={h.id} cx={80 + 50 * Math.cos(a)} cy={55 + 27 * Math.sin(a)} r={2.5} fill={h.color} stroke="white" strokeWidth={.4} />;
      })}
      <text x={80} y={105} fontSize={7} textAnchor="middle" fill="white" opacity={.5}>TRACK MAP</text>
    </svg>
  );

  // ─── START ───
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
          <p className="text-lg text-gray-400 mt-3">8마리의 명마가 펼치는 숨 막히는 레이스</p>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-10">
          {HD.map((h, i) => (
            <div key={h.n} className="bg-gray-800/80 backdrop-blur rounded-xl p-3 border border-gray-700 hover:border-gray-500 hover:scale-105 transition-all" style={{ animation: `cardIn .5s ease-out ${i * .08}s both` }}>
              <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg" style={{ backgroundColor: h.c }}>{h.n}</div><span className="text-white font-semibold text-sm">{h.name}</span></div>
              <svg viewBox="-35 -30 70 55" className="w-full h-16"><HorseSide c={h.c} dk={h.d} num={h.n} phase={.15} sc={1} /></svg>
            </div>
          ))}
        </div>
        <div className="text-center"><button onClick={startCd} className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-black text-3xl px-16 py-5 rounded-full transition-all duration-300 transform hover:scale-110 active:scale-95" style={{ animation: 'glow 2s ease-in-out infinite' }}>START RACE 🏁</button></div>
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
  const horses = hr.current;
  const avg = horses.length > 0 ? horses.reduce((s, h) => s + h.position, 0) / horses.length : 0;
  const finishRank = new Map(fr.current.map(f => [f.id, f.rank]));
  const leaderboard = [...horses].sort((a, b) => {
    const ar = finishRank.get(a.id), br = finishRank.get(b.id);
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1; if (br != null) return 1;
    return b.position - a.position;
  });
  const el = elapsed();

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
        <span className="text-yellow-400 font-semibold text-sm">제 1 경주</span>
      </div>

      {/* Main */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          {renderTrack()}
          <div className="absolute bottom-3 left-3 z-10">{renderMiniMap()}</div>
        </div>

        {/* Sidebar */}
        <div className="w-52 bg-gray-900/95 border-l border-gray-700/50 p-3 flex flex-col gap-2 z-10 overflow-y-auto shrink-0">
          <h3 className="text-white font-bold text-sm flex items-center gap-1.5 mb-1">📊 실시간 순위</h3>
          {leaderboard.map((h, i) => (
            <div key={h.id} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${i === 0 ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-gray-800/60'}`}>
              <span className="text-white font-bold w-5 text-center text-xs">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</span>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: h.color }}>{h.number}</div>
              <span className="text-white text-xs font-medium flex-1 truncate">{h.name}</span>
              <span className="text-gray-400 text-[10px] font-mono">{h.finished ? '✅' : `${Math.round(h.position)}%`}</span>
            </div>
          ))}
          <div className="mt-auto pt-2 border-t border-gray-700/50">
            <div className="text-gray-400 text-[10px] mb-1">PROGRESS</div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-75" style={{ width: `${Math.min(100, avg)}%`, background: 'linear-gradient(90deg,#22c55e,#eab308,#ef4444)' }} /></div>
            <div className="text-right text-gray-500 text-[10px] mt-0.5">{Math.round(avg)}%</div>
          </div>
        </div>
      </div>

      {/* Finish overlay */}
      {gs === 'finish' && fr.current.length > 0 && (
        <div className="fixed inset-0 z-30 bg-black/60 flex items-center justify-center p-4" style={{ animation: 'fadeIn .8s ease-out' }}>
          <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl max-w-xl w-full p-8 shadow-2xl border border-gray-600/50" style={{ animation: 'scaleIn .6s cubic-bezier(.17,.67,.35,1.2) .3s both' }}>
            <h2 className="text-center text-3xl font-black text-white mb-6">🏆 경주 결과</h2>
            <div className="flex justify-center items-end gap-3 mb-6 h-36">
              {fr.current[1] && <div className="flex flex-col items-center w-24"><div className="text-2xl mb-1">🥈</div><div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg" style={{ backgroundColor: fr.current[1].color }}>{fr.current[1].number}</div><div className="text-white text-sm font-semibold mt-1">{fr.current[1].name}</div><div className="bg-gray-500 w-full mt-1 rounded-t-lg" style={{ height: 44 }} /></div>}
              {fr.current[0] && <div className="flex flex-col items-center w-28"><div className="text-3xl mb-1">🏆</div><div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-yellow-500/40" style={{ backgroundColor: fr.current[0].color }}>{fr.current[0].number}</div><div className="text-yellow-400 text-base font-bold mt-1">{fr.current[0].name}</div><div className="bg-yellow-500 w-full mt-1 rounded-t-lg" style={{ height: 60 }} /></div>}
              {fr.current[2] && <div className="flex flex-col items-center w-24"><div className="text-xl mb-1">🥉</div><div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: fr.current[2].color }}>{fr.current[2].number}</div><div className="text-white text-sm font-semibold mt-1">{fr.current[2].name}</div><div className="bg-orange-700 w-full mt-1 rounded-t-lg" style={{ height: 30 }} /></div>}
            </div>
            <div className="space-y-1.5 mb-6">
              {fr.current.map((h, i) => <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${i < 3 ? 'bg-gray-700/60' : 'bg-gray-800/40'}`}><span className="w-6 text-center font-bold text-sm" style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : i === 2 ? '#f97316' : '#6b7280' }}>{i + 1}위</span><div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: h.color }}>{h.number}</div><span className="text-white text-sm font-medium">{h.name}</span></div>)}
            </div>
            <div className="text-center text-gray-400 text-sm mb-4">경주 기록: <span className="text-green-400 font-mono font-bold">{fmt(el)}</span></div>
            <button onClick={reset} className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-3 rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 text-lg">다시 하기 🔄</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HorseRacing;
