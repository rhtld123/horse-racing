// Web Worker 엔트리: 물리(engine) + 카메라(camera) + OffscreenCanvas 렌더(renderer)를
// 메인 스레드와 분리해 실행. UI 갱신용 스냅샷만 메인으로 postMessage.
//
// 주의: DedicatedWorker 에는 requestAnimationFrame 이 없는 환경이 많아
// feature-detect 후 setTimeout 으로 폴백한다.

import { GameEngine } from './engine';
import { Camera } from './camera';
import { Renderer } from './renderer';
import type { HorseSnapshot, MainMsg, WorkerMsg } from './types';

let engine = new GameEngine();
let camera = new Camera();
let renderer = new Renderer();
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let cw = 1000, ch = 600, dpr = 1;
let running = false;

// no-restricted-globals 회피 + 워커 전역 타입 정리
const wself = globalThis as unknown as {
  requestAnimationFrame?: (cb: (t: number) => void) => number;
  postMessage: (msg: MainMsg) => void;
  onmessage: ((e: MessageEvent) => void) | null;
};

const schedule = (cb: (t: number) => void) => {
  if (typeof wself.requestAnimationFrame === 'function') wself.requestAnimationFrame(cb);
  else setTimeout(() => cb(performance.now()), 1000 / 60);
};

const snapshot = (): HorseSnapshot[] =>
  engine.horses.map(h => ({ id: h.id, name: h.name, number: h.number, color: h.color, position: h.position, finished: h.finished }));

const post = (type: 'frame' | 'done') => {
  wself.postMessage({ type, horses: snapshot(), finished: engine.finished.map(f => ({ ...f })) });
};

const applySize = () => {
  if (!canvas) return;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
};

const frame = () => {
  if (!running) return;
  const done = engine.tick();
  camera.update(engine.horses);
  if (ctx) renderer.drawFrame(ctx, cw, ch, dpr, engine, camera);
  if (done) { running = false; post('done'); return; }
  if (engine.frame % 3 === 0) post('frame');
  schedule(frame);
};

wself.onmessage = (e: MessageEvent) => {
  const d = e.data as WorkerMsg;
  switch (d.type) {
    case 'init':
      canvas = d.canvas;
      cw = d.cw; ch = d.ch; dpr = d.dpr;
      ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      applySize();
      renderer = new Renderer();
      break;
    case 'resize':
      cw = d.cw; ch = d.ch; dpr = d.dpr;
      applySize();
      break;
    case 'start':
      engine = new GameEngine();
      camera = new Camera();
      engine.init(d.config);
      camera.reset(d.config.horses.length);
      running = true;
      post('frame');
      schedule(frame);
      break;
    case 'reset':
      running = false;
      break;
  }
};

export {};
