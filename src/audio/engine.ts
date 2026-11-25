// REQ-AUD: аудио-движок. Время — только AudioContext.currentTime; lookahead-планировщик.
// Логика расписания — в core/timeline.ts (чистая и покрыта тестами), здесь только Web Audio.
import { createClock, schedule, type Clock } from '@/core/timeline';
import type { Bar, Mix, TimelineEvent } from '@/core/types';
import { allowSleep, keepAwake } from '@/platform/wakeLock';
import { onAppHidden } from '@/platform/lifecycle';
import { playChime, playTick } from './voices';

export const SCHEDULER_INTERVAL_MS = 25;
export const LOOKAHEAD_S = 0.12;
const START_DELAY_S = 0.15;

export type PlayOptions = {
  getBar: (i: number) => Bar;
  /** Читаются на каждом шаге планировщика — изменения действуют со следующей доли. */
  bpm: () => number;
  mix: () => Mix;
  /** REQ-AUD-5: упреждение подсветки и калибровка вывода, мс. */
  timing: () => { leadMs: number; outputOffsetMs: number };
  onEvent: (e: TimelineEvent) => void;
  onStop?: () => void;
};

type Session = {
  opts: PlayOptions;
  bars: Map<number, Bar>;
  clock: Clock;
  queue: TimelineEvent[];
  /** Начало проигрывания: отсчёт и первые такты — для слушателей, подключившихся позже. */
  history: TimelineEvent[];
  timer: ReturnType<typeof setInterval>;
  raf: number;
};

let ctx: AudioContext | null = null;
let current: Session | null = null;
const scheduledListeners = new Set<(e: TimelineEvent) => void>();

const HISTORY_MAX = 256;

/**
 * REQ-MIC: все запланированные события (маски щелчков, запись проверки). `replay` — сначала
 * отдать уже запланированные в текущем проигрывании (микрофон включается после старта).
 */
export function onScheduled(fn: (e: TimelineEvent) => void, replay = false): () => void {
  if (replay) current?.history.forEach(fn);
  scheduledListeners.add(fn);
  return () => scheduledListeners.delete(fn);
}

/** Текущее время AudioContext; null — звук ещё не включали. */
export const audioNow = (): number | null => ctx?.currentTime ?? null;

/** REQ-AUD-6: создавать/возобновлять только из обработчика жеста пользователя. */
export function unlockAudio(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state !== 'running') void ctx.resume();
  return ctx;
}

export const isPlaying = () => current !== null;

/** REQ-AUD-2: такты мемоизируются на время проигрывания. */
export function barAt(i: number): Bar | undefined {
  if (!current) return undefined;
  const { bars, opts } = current;
  let bar = bars.get(i);
  if (!bar) {
    bar = opts.getBar(i);
    bars.set(i, bar);
  }
  return bar;
}

function tick() {
  const s = current;
  if (!s || !ctx) return;
  const r = schedule(
    s.clock,
    ctx.currentTime + LOOKAHEAD_S,
    s.opts.bpm(),
    (i) => barAt(i)!,
    s.opts.mix(),
  );
  s.clock = r.clock;
  for (const e of r.events) {
    playTick(ctx, e.kind, e.time, e.gain);
    s.queue.push(e);
    if (s.history.length < HISTORY_MAX) s.history.push(e);
    for (const fn of scheduledListeners) fn(e);
  }
}

function frame() {
  const s = current;
  if (!s || !ctx) return;
  const { leadMs, outputOffsetMs } = s.opts.timing();
  const shift = -leadMs / 1000 + outputOffsetMs / 1000;
  const now = ctx.currentTime;
  while (s.queue.length && now >= s.queue[0]!.time + shift) s.opts.onEvent(s.queue.shift()!);
  s.raf = requestAnimationFrame(frame);
}

/** REQ-AUD-3: синглтон — новый старт останавливает текущий и вызывает его onStop. */
export function play(opts: PlayOptions) {
  stop();
  const c = unlockAudio();
  const session: Session = {
    opts,
    bars: new Map(),
    clock: createClock(c.currentTime + START_DELAY_S),
    queue: [],
    history: [],
    timer: setInterval(tick, SCHEDULER_INTERVAL_MS),
    raf: 0,
  };
  current = session;
  tick();
  session.raf = requestAnimationFrame(frame);
  void keepAwake(); // REQ-AUD-7
}

export function stop() {
  const s = current;
  if (!s) return;
  current = null;
  clearInterval(s.timer);
  cancelAnimationFrame(s.raf);
  void allowSleep();
  s.opts.onStop?.();
}

export function chime() {
  try {
    playChime(unlockAudio());
  } catch {
    // без звука сигнал не критичен
  }
}

// REQ-AUD-8: приложение ушло в фон — стоп.
// REQ-AUD-7: возврат во время игры — повторный wake lock (браузер снимает его при скрытии).
if (typeof document !== 'undefined') {
  onAppHidden(stop);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current) void keepAwake();
  });
}
