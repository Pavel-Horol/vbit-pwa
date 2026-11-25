// REQ-MIC-2: детектор онсетов — моментов, когда начинается слог. Чистый TS: сюда приходят
// сэмплы микрофона со временем AudioContext, наружу — времена онсетов.
//
// Как работает: сигнал фильтруется в полосу 300–3000 Гц (там энергия гласных), из него
// вырезаются частоты тиков метронома. Громкость считается кусками по 4 мс в дБ. Онсет — резкий
// рост громкости (≥ riseDb за 20 мс), если после него звук заметно громче фона (адаптивный
// порог: фон — 10-й процентиль громкости за последние 3 с). После онсета 50 мс новых нет.

export type Onset = {
  /** Секунды AudioContext (или файла) — начало подъёма громкости. */
  time: number;
  /** Громкость сразу после онсета, дБ относительно полной шкалы (фильтрованный сигнал). */
  level: number;
};

/**
 * В окне [start, end] онсет засчитывается, только если звук громче `minLevel` дБ.
 * Так прячутся щелчки метронома, которые микрофон слышит из динамика (решение этапа 4).
 */
export type Mask = { start: number; end: number; minLevel: number };

export type OnsetOptions = {
  hopMs: number;
  lowHz: number;
  highHz: number;
  /** Частоты тиков (voices.ts): 420 (и 3-я гармоника треугольника 1260), 650, 950, 1400. */
  notchHz: number[];
  notchQ: number;
  riseMs: number;
  riseDb: number;
  floorWindowS: number;
  floorPercentile: number;
  floorMarginDb: number;
  refractoryMs: number;
  /** Сколько смотреть вперёд за пиком громкости. */
  peakMs: number;
  masks: Mask[];
};

export const CLICK_TONES_HZ = [420, 650, 950, 1260, 1400];

export const DEFAULT_ONSET_OPTIONS: OnsetOptions = {
  hopMs: 4,
  lowHz: 300,
  highHz: 3000,
  notchHz: CLICK_TONES_HZ,
  notchQ: 6,
  riseMs: 20,
  riseDb: 9,
  floorWindowS: 3,
  floorPercentile: 0.1,
  floorMarginDb: 12,
  refractoryMs: 50,
  peakMs: 24,
  masks: [],
};

// --- биквады (RBJ Audio EQ Cookbook), транспонированная форма II ---

type Biquad = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  z1: number;
  z2: number;
};

function biquad(type: 'lp' | 'hp' | 'notch', f: number, q: number, sr: number): Biquad {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  let b0: number, b1: number, b2: number;
  if (type === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [1, -2 * cos, 1];
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
    z1: 0,
    z2: 0,
  };
}

function run(f: Biquad, x: number): number {
  const y = f.b0 * x + f.z1;
  f.z1 = f.b1 * x - f.a1 * y + f.z2;
  f.z2 = f.b2 * x - f.a2 * y;
  return y;
}

const db = (energy: number) => 10 * Math.log10(energy + 1e-12);

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? -120;
}

export type OnsetDetector = {
  /** Сэмплы подряд; `time` — время первого из них. Возвращает найденные к этому моменту онсеты. */
  push(samples: Float32Array, time: number): Onset[];
  /** Маски можно добавлять на ходу (щелчки планируются заранее). */
  mask(m: Mask): void;
  /** Конец записи: досчитать последние ~30 мс. */
  flush(): Onset[];
};

export function createOnsetDetector(
  sampleRate: number,
  options: Partial<OnsetOptions> = {},
): OnsetDetector {
  const o = { ...DEFAULT_ONSET_OPTIONS, ...options };
  const filters = [
    biquad('hp', o.lowHz, Math.SQRT1_2, sampleRate),
    biquad('hp', o.lowHz, Math.SQRT1_2, sampleRate),
    biquad('lp', o.highHz, Math.SQRT1_2, sampleRate),
    ...o.notchHz.map((f) => biquad('notch', f, o.notchQ, sampleRate)),
  ];
  const hop = Math.max(1, Math.round((sampleRate * o.hopMs) / 1000));
  const hopS = hop / sampleRate;
  const riseHops = Math.max(1, Math.round(o.riseMs / o.hopMs));
  const peakHops = Math.max(2, Math.round(o.peakMs / o.hopMs));
  const floorHops = Math.round(o.floorWindowS / hopS);
  const floorEvery = Math.max(1, Math.round(0.1 / hopS));
  const masks: Mask[] = [...o.masks];

  // громкость и время начала каждого куска; хранится не больше 2 окон фона
  let L: number[] = [];
  let T: number[] = [];
  let acc = 0;
  let accN = 0;
  let hopStart = 0;
  let hopsSeen = 0;
  let floor = -120;
  let lastOnset = -Infinity;
  let nextTime = 0;

  const rise = (i: number) => {
    let min = Infinity;
    for (let k = Math.max(0, i - riseHops); k < i; k++) min = Math.min(min, L[k]!);
    return L[i]! - min;
  };

  /** Начало подъёма: первый кусок выше минимума на 3 дБ; внутри куска — по доле энергии. */
  function riseStart(c: number): number {
    let base = c - 1;
    for (let k = Math.max(0, c - riseHops); k < c; k++) if (L[k]! <= L[base]!) base = k;
    let m = base + 1;
    while (m < c && L[m]! < L[base]! + 3) m++;
    const next = L[m + 1] ?? L[m]!;
    const frac = Math.min(1, Math.pow(10, (L[m]! - next) / 10));
    return T[m]! + hopS * (1 - frac);
  }

  function evaluate(): Onset | null {
    const c = L.length - 1 - peakHops;
    if (c < riseHops + 2) return null;
    const r = rise(c);
    if (r < o.riseDb) return null;
    for (let k = c - 2; k <= c + 2; k++) {
      if (k === c) continue;
      const rk = rise(k);
      if (k < c ? rk > r : rk >= r) return null; // не пик подъёма
    }
    // громкость после онсета — средняя энергия за peakMs: короткий щелчок «весит» меньше гласной
    let energy = 0;
    for (let k = c; k <= c + peakHops; k++) energy += Math.pow(10, L[k]! / 10);
    const peak = db(energy / (peakHops + 1));
    if (peak < floor + o.floorMarginDb) return null;
    const time = riseStart(c);
    if ((time - lastOnset) * 1000 < o.refractoryMs) return null;
    while (masks.length && masks[0]!.end < time - 1) masks.shift();
    if (masks.some((m) => time >= m.start && time <= m.end && peak < m.minLevel)) return null;
    lastOnset = time;
    return { time, level: peak };
  }

  function addHop(level: number, start: number): Onset | null {
    L.push(level);
    T.push(start);
    hopsSeen++;
    if (L.length > 2 * floorHops + 64) {
      L = L.slice(-floorHops - 32);
      T = T.slice(-floorHops - 32);
    }
    if (hopsSeen % floorEvery === 0 || hopsSeen < floorEvery)
      floor = percentile(L.slice(-floorHops), o.floorPercentile);
    return evaluate();
  }

  function push(samples: Float32Array, time: number): Onset[] {
    const out: Onset[] = [];
    nextTime = time + samples.length / sampleRate;
    for (let i = 0; i < samples.length; i++) {
      let x = samples[i]!;
      for (const f of filters) x = run(f, x);
      if (accN === 0) hopStart = time + i / sampleRate;
      acc += x * x;
      if (++accN === hop) {
        const on = addHop(db(acc / hop), hopStart);
        if (on) out.push(on);
        acc = 0;
        accN = 0;
      }
    }
    return out;
  }

  return {
    push,
    mask(m) {
      masks.push(m);
      masks.sort((a, b) => a.end - b.end);
    },
    flush: () => push(new Float32Array(hop * (peakHops + 3)), nextTime),
  };
}

/** Весь буфер разом (тесты, проверка детектора на записях). */
export function detectOnsets(
  samples: Float32Array,
  sampleRate: number,
  startTime = 0,
  options: Partial<OnsetOptions> = {},
): Onset[] {
  const d = createOnsetDetector(sampleRate, options);
  return [...d.push(samples, startTime), ...d.flush()];
}
