/**
 * EP02 互動元件用到的計算（和 Python／NumPy 的行為一致）：
 * Σ 和 for 迴圈的逐步對照（含「數學從 1 數、Python 從 0 數」的差一錯誤），
 * 以及連乘下溢 vs log 加總。
 * 沒有用到 React，方便單獨測試。
 */

// ---------- Σ 與 for 迴圈 ----------

/** 數學寫成 x₁…x₅，Python 是 x[0]…x[4] */
export const SIGMA_X = [3, 1, 4, 1, 5];

/**
 * correct：range(a - 1, b)
 * skipFirst：range(a, b)：把數學的上下標直接抄進 range，開頭沒有減 1
 * shifted：range(a, b + 1)：記得 range 不含尾而加 1，卻忘了 Python 從 0 數
 */
export type LoopMode = 'correct' | 'skipFirst' | 'shifted';

export type LoopStep = {
	i: number; // Python 的索引
	value: number | null; // x[i]；null 表示超出範圍（IndexError）
	total: number | null; // 這一步之後的 total；IndexError 時是 null
};

export type LoopPlan = {
	start: number; // range(start, stop)
	stop: number;
	steps: LoopStep[];
	terms: number[]; // Σ 要加的數學下標 a, a+1, …, b
	expected: number; // Σ_{i=a}^{b} x_i
	result: number | null; // 迴圈跑完的 total；IndexError 時是 null
	error: string | null; // Python 的錯誤訊息
	partial: number; // 出錯之前已經加到的 total
	sliceValue: number; // x[start:stop].sum()（切片超出範圍不會報錯）
	added: number[]; // 程式實際加到的數學下標（i + 1）
	missing: number[]; // Σ 要加、程式卻沒加的數學下標
	extra: number[]; // 程式加了、但不在 Σ 範圍裡的數學下標（存在的元素）
	badIndex: number | null; // 造成 IndexError 的 Python 索引
};

export function rangeArgs(a: number, b: number, mode: LoopMode): [number, number] {
	if (mode === 'correct') return [a - 1, b];
	if (mode === 'skipFirst') return [a, b];
	return [a, b + 1];
}

/** 和 Python 的切片一樣：超出範圍的部分直接忽略 */
export function sliceSum(xs: number[], start: number, stop: number): number {
	const lo = Math.min(Math.max(start, 0), xs.length);
	const hi = Math.min(Math.max(stop, 0), xs.length);
	let s = 0;
	for (let k = lo; k < hi; k++) s += xs[k];
	return s;
}

/** 照 Python 的行為，跑一次 total = 0; for i in range(start, stop): total += x[i] */
export function sigmaLoop(a: number, b: number, mode: LoopMode, xs: number[] = SIGMA_X): LoopPlan {
	const [start, stop] = rangeArgs(a, b, mode);
	const steps: LoopStep[] = [];
	let total = 0;
	let error: string | null = null;
	let badIndex: number | null = null;
	for (let i = start; i < stop; i++) {
		if (i < 0 || i >= xs.length) {
			// 這裡只會遇到 i >= len（負的索引在 Python 是「從後面數」，不會用到）
			error = `IndexError: index ${i} is out of bounds for axis 0 with size ${xs.length}`;
			badIndex = i;
			steps.push({ i, value: null, total: null });
			break;
		}
		total += xs[i];
		steps.push({ i, value: xs[i], total });
	}
	const terms: number[] = [];
	for (let k = a; k <= b; k++) terms.push(k);
	const added = steps.filter((s) => s.value !== null).map((s) => s.i + 1);
	return {
		start,
		stop,
		steps,
		terms,
		expected: sliceSum(xs, a - 1, b),
		result: error ? null : total,
		error,
		partial: total,
		sliceValue: sliceSum(xs, start, stop),
		added,
		missing: terms.filter((k) => !added.includes(k)),
		extra: added.filter((k) => k < a || k > b),
		badIndex,
	};
}

// ---------- 連乘下溢 vs log 加總 ----------

/** float64 能存的最小正數（2 的 −1074 次方，約 4.9e-324） */
export const FLOAT64_MIN = Number.MIN_VALUE;
/** float32 能存的最小正數（2 的 −149 次方，約 1.4e-45） */
export const FLOAT32_MIN = Math.fround(2 ** -149);

/** 每一步的機率 p 限制在 0.01 到 0.5：p 大於 0.5 時，連乘會卡在一個極小的數、不會剛好變成 0 */
export const P_MIN = 0.01;
export const P_MAX = 0.5;
/** token 數的上限（p = 0.5 時 float64 第 1075 個才變 0，留足空間） */
export const MAX_N = 5000;

export type SeqState = {
	n: number;
	f64: number; // float64 直接連乘（JS 的 number 就是 float64）
	f32: number; // float32 直接連乘（每一步用 Math.fround 存回 float32）
	sumLn: number; // 一個一個加上 ln p
	nLnP: number; // n × ln p
	log10: number; // 真正的機率是 10 的幾次方：n × log₁₀ p
	zero64: number | null; // float64 在第幾個 token 變成 0（還沒變就是 null）
	zero32: number | null;
	before64: number | null; // float64 變成 0 的前一個 token 時的值
	before32: number | null;
};

const initial = (): SeqState => ({ n: 0, f64: 1, f32: 1, sumLn: 0, nLnP: 0, log10: 0, zero64: null, zero32: null, before64: null, before32: null });

/**
 * 從 1 開始，一步一步乘上 p，回傳每個 checkpoint（token 數，遞增）的狀態。
 * 和 Python 的 `prob = 1.0; for _ in range(n): prob *= p` 是同樣的運算，所以結果一模一樣。
 */
export function simulateSeq(p: number, checkpoints: number[]): SeqState[] {
	const lnP = Math.log(p);
	const log10P = Math.log10(p);
	const p32 = Math.fround(p);
	const s = initial();
	const out: SeqState[] = [];
	const targets = [...checkpoints].sort((x, y) => x - y);
	let t = 0;
	while (t < targets.length && targets[t] <= 0) {
		out.push({ ...s });
		t++;
	}
	for (let n = 1; t < targets.length; n++) {
		const prev64 = s.f64;
		const prev32 = s.f32;
		s.f64 = s.f64 * p;
		s.f32 = Math.fround(s.f32 * p32);
		s.sumLn += lnP;
		s.n = n;
		s.nLnP = n * lnP;
		s.log10 = n * log10P;
		if (s.f64 === 0 && s.zero64 === null) {
			s.zero64 = n;
			s.before64 = prev64;
		}
		if (s.f32 === 0 && s.zero32 === null) {
			s.zero32 = n;
			s.before32 = prev32;
		}
		while (t < targets.length && targets[t] === n) {
			out.push({ ...s });
			t++;
		}
	}
	return out;
}

/** 第幾個 token 會變成 0（float64 和 float32） */
export function firstZero(p: number): { f64: number; f32: number } {
	let f64 = 1;
	let f32 = 1;
	const p32 = Math.fround(p);
	let z64 = 0;
	let z32 = 0;
	for (let n = 1; n <= MAX_N && (!z64 || !z32); n++) {
		f64 *= p;
		f32 = Math.fround(f32 * p32);
		if (!z64 && f64 === 0) z64 = n;
		if (!z32 && f32 === 0) z32 = n;
	}
	return { f64: z64, f32: z32 };
}

// ---------- 數字格式 ----------

/** 四捨五入到 k 位小數（科學記號）；剛好在正中間時取偶數（和 NumPy 一樣），JS 內建的是往大的取 */
function toExpHalfEven(v: number, k: number): string {
	const s = v.toExponential(k);
	const full = v.toExponential(100);
	const [fm] = full.split('e');
	const rest = fm.replace('.', '').slice(k + 1);
	const tie = /^50*$/.test(rest);
	if (!tie) return s;
	// 正中間：JS 一律進位；捨去後最後一位是偶數的話，改用捨去的寫法
	const truncated = fm.slice(0, k === 0 ? 1 : k + 2);
	const last = Number(truncated[truncated.length - 1]);
	return last % 2 === 0 ? `${truncated}e${full.split('e')[1]}` : s;
}

/**
 * 最短、能還原的十進位寫法（科學記號字串）。
 * float64：JS 內建就是最短寫法（和 Python 的 repr 同一套規則）。
 * float32：從 1 位有效數字開始試，找最少位數、存回 float32 還是同一個數的寫法；
 * 優先用四捨五入（最接近）的那個；它還原不回來時，再試最後一位加減 1
 * （2 的次方附近，上下兩邊的間距不一樣，可能只有比較遠的那一邊還原得回來）。
 */
function shortest(v: number, f32: boolean): string {
	if (!f32) return v.toExponential();
	for (let k = 0; k < 9; k++) {
		const [m, e] = toExpHalfEven(v, k).split('e');
		const base = BigInt(m.replace('.', ''));
		const exp = Number(e) - k; // 數值 = 整數 × 10^exp
		const ok = [base, base + 1n, base - 1n]
			.filter((d) => d > 0n)
			.map((d) => ({ d, x: Number(`${d}e${exp}`) }))
			.filter((c) => Math.fround(c.x) === v);
		if (ok.length === 0) continue;
		const ds = ok[0].d.toString().replace(/0+$/, '') || '0';
		const realExp = exp + ok[0].d.toString().length - 1;
		return `${ds[0]}${ds.length > 1 ? `.${ds.slice(1)}` : ''}e${realExp < 0 ? '-' : '+'}${Math.abs(realExp)}`;
	}
	return v.toExponential(8);
}

/**
 * 和 Python 的 print(float)、NumPy 的 print(np.float32) 一樣的寫法：
 * 0.0、1.0、0.125、1.0000000000000006e-10、5e-324、1e-45。
 * （只處理這個元件用到的 0 到 1 之間的數）
 */
export function pyFloat(v: number, f32 = false): string {
	if (v === 0) return '0.0';
	if (!Number.isFinite(v)) return Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
	const s = shortest(Math.abs(v), f32);
	const [mant, expStr] = s.split('e');
	const exp = Number(expStr);
	const digits = mant.replace('.', '');
	const sign = v < 0 ? '-' : '';
	// Python：十進位指數小於 -4 時用科學記號；NumPy 的 float32：數值小於 1e-4 時用科學記號
	const sci = f32 ? Math.abs(v) < 1e-4 : exp < -4;
	if (sci || exp >= 16) {
		const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
		const e = Math.abs(exp) < 10 ? `0${Math.abs(exp)}` : `${Math.abs(exp)}`;
		return `${sign}${m}e${exp < 0 ? '-' : '+'}${e}`;
	}
	if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
	const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
	const frac = digits.slice(exp + 1);
	return `${sign}${intPart}.${frac || '0'}`;
}

/** 表格用的短寫法：3 位有效數字，例如 1e-300、9.88e-324、0.125、1.0 */
export function shortFloat(v: number): string {
	if (v === 0) return '0.0';
	const a = Math.abs(v);
	if (a < 1e-4) return v.toExponential(2).replace(/\.?0+e/, 'e');
	const r = Number(v.toPrecision(3));
	return Number.isInteger(r) ? r.toFixed(1) : String(r);
}

/** 固定小數位數，負號用一般的減號（和程式輸出一樣） */
export const fixed = (v: number, digits: number) => (Object.is(v, -0) || Math.abs(v) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : v.toFixed(digits));

/** 10 的 L 次方寫成「m × 10^e」：m 取 3 位有效數字（1 ≤ m < 10） */
export function pow10Parts(L: number): { m: string; e: number } {
	if (L === 0) return { m: '1', e: 0 };
	let e = Math.floor(L);
	let m = Number((10 ** (L - e)).toPrecision(3));
	if (m >= 10) {
		m /= 10;
		e += 1;
	}
	return { m: String(Number(m.toPrecision(3))), e };
}

// ---------- 刻度（10 的幾次方） ----------

const NICE = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

/**
 * 刻度的範圍：從 10⁰ 到 10^(−span)。至少涵蓋 float64 的下限（約 10⁻³²⁴），
 * 真正的機率超出範圍時自動拉長。回傳範圍和刻度間距。
 */
export function scaleDomain(log10: number): { span: number; step: number } {
	const need = Math.max(400, Math.abs(log10) * 1.12);
	const step = NICE.find((s) => need / s <= 5) ?? 20000;
	return { span: Math.ceil(need / step) * step, step };
}
