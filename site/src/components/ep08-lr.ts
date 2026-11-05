/**
 * EP08 互動元件（LearningRateLab、SigmoidSoftmaxDemo）用到的計算與數字格式。
 * 沒有用到 React，方便單獨測試。
 *
 * 梯度下降照本集的 Python 寫法用 float64 一步一步實際算（p − lr × 梯度），
 * 不用「每步乘 1 − 2η」的公式直接算，所以每一步的數字和 NumPy 完全一樣。
 */
import { fmtFixed, fmtTrim, sciParts } from './ep04-calc.ts';

export { fmtFixed, fmtTrim };

const minus = (s: string) => s.replace('-', '−');

// ---------- 兩個碗 ----------

export type BowlKey = 'round' | 'narrow';

export type Bowl = {
	key: BowlKey;
	/** f(x, y) = a·x² + 3y² 的 a */
	a: number;
	/** 出發點 */
	start: readonly [number, number];
	/** 走幾步（本集的表與圖：碗 x² + 3y² 走 30 步，又長又窄的碗走 20 步） */
	steps: number;
	label: string;
	/** 式子：x² + 3y² */
	formula: string;
	/** x 方向的乘數：1 − 2η、1 − 0.2η */
	xFactorName: string;
	/** x 方向的乘數裡 η 前面的係數（彎曲程度）：2、0.2 */
	xCurv: string;
	/** 出發點的寫法 */
	startText: string;
	/** 等高線的高度 */
	levels: number[];
};

/** y 方向的彎曲程度：兩個碗都是 3y²，斜率 6y */
export const Y_CURV = 6;

export const BOWLS: Record<BowlKey, Bowl> = {
	round: {
		key: 'round',
		a: 1,
		start: [1, 2],
		steps: 30,
		label: '碗 x² + 3y²',
		formula: 'x² + 3y²',
		xFactorName: '1 − 2η',
		xCurv: '2',
		startText: '(1, 2)',
		levels: [0.5, 2, 5, 9, 13, 20, 30, 45],
	},
	narrow: {
		key: 'narrow',
		a: 0.1,
		start: [10, 1],
		steps: 20,
		label: '又長又窄的碗 0.1x² + 3y²',
		formula: '0.1x² + 3y²',
		xFactorName: '1 − 0.2η',
		xCurv: '0.2',
		startText: '(10, 1)',
		levels: [0.5, 2, 5, 9, 13, 20],
	},
};

export const BOWL_ORDER: BowlKey[] = ['round', 'narrow'];

/** 高度：照 Python 的 p[0] ** 2 + 3 * p[1] ** 2（又長又窄的碗是 0.1 * p[0] ** 2 + …） */
export const height = (b: Bowl, x: number, y: number) => b.a * (x * x) + 3 * (y * y);

// ---------- 學習率 ----------

/** 學習率的預設值（本集比較的幾個） */
export const LR_PRESETS = [0.01, 0.1, 0.25, 0.3, 0.34];
/** 上限 1/3：剛好在上限時 y 每步乘 −1 */
export const LR_THIRD = 1 / 3;
export const LR_MIN = 0.001;
export const LR_MAX = 0.4;
/** 拖動、輸入時吸附到 0.001 */
export const LR_GRID = 0.001;
/** 方向鍵一次 0.01，Page Up／Page Down 一次 0.05 */
export const LR_KEY_STEP = 0.01;
export const LR_PAGE_STEP = 0.05;
/** 拖到離 1/3 這麼近時，吸到剛好 1/3 */
const THIRD_MAGNET = 0.002;
export const LR_DEFAULT = 0.1;

const clampLr = (v: number) => Math.min(LR_MAX, Math.max(LR_MIN, v));

/** 吸附到 0.001 的格子（整數除以 1000，不留浮點尾巴） */
export const snapLr = (v: number) => clampLr(Math.round(v * 1000) / 1000);

/** 拖動：吸附到 0.001；離 1/3 很近時吸到 1/3 */
export function snapLrDrag(v: number): number {
	if (Math.abs(v - LR_THIRD) < THIRD_MAGNET) return LR_THIRD;
	return snapLr(v);
}

/** 方向鍵：先走到 step 的格子上，再一次走一格（1/3 往右是 0.34、往左是 0.33） */
export function stepLr(v: number, dir: 1 | -1, step = LR_KEY_STEP): number {
	const k = Math.round(1 / step);
	const n = v * k;
	const next = dir > 0 ? Math.floor(n + 1e-9) + 1 : Math.ceil(n - 1e-9) - 1;
	return clampLr(Math.round((next / k) * 1000) / 1000);
}

/** 數字框輸入：不是數字就不理；超出範圍就夾住 */
export function parseLr(raw: string): number | null {
	const s = raw.trim();
	if (s === '') return null;
	const v = Number(s);
	if (!Number.isFinite(v)) return null;
	return snapLr(v);
}

export const isThird = (lr: number) => lr === LR_THIRD;

/** 學習率的寫法：0.1、0.34、1/3 */
export const lrText = (lr: number) => (isThird(lr) ? '1/3' : fmtTrim(lr, 3));

/** 數字框裡的值 */
export const lrInput = (lr: number) => (isThird(lr) ? fmtFixed(lr, 3) : fmtTrim(lr, 3));

/** 比 1/3 大、小，還是剛好（0.333 比 1/3 小一點點） */
export function vsThird(lr: number): 'below' | 'at' | 'above' {
	if (isThird(lr)) return 'at';
	return lr < LR_THIRD ? 'below' : 'above';
}

// ---------- 每一步乘的數 ----------

/** x 每步乘 1 − 2aη（a = 1 是 1 − 2η，a = 0.1 是 1 − 0.2η） */
export const xFactor = (b: Bowl, lr: number) => 1 - 2 * b.a * lr;
/** y 每步乘 1 − 6η */
export const yFactor = (lr: number) => 1 - Y_CURV * lr;

export type FactorKind = 'shrink' | 'flip' | 'stuck' | 'grow' | 'growFlip';

/** 每步乘同一個數 m：|m| < 1 收斂（m < 0 每步換邊）、m = −1 原地跳、|m| > 1 發散 */
export function factorKind(m: number): FactorKind {
	const am = Math.abs(m);
	if (Math.abs(am - 1) < 1e-12) return 'stuck';
	if (am < 1) return m < 0 ? 'flip' : 'shrink';
	return m < 0 ? 'growFlip' : 'grow';
}

export const FACTOR_LABEL: Record<FactorKind, string> = {
	shrink: '收斂',
	flip: '收斂，每步換邊',
	stuck: '原地跳，不收斂',
	grow: '發散',
	growFlip: '發散，每步換邊',
};

export const isDiverge = (k: FactorKind) => k === 'grow' || k === 'growFlip';

/**
 * 乘數的寫法：0.8、−1.04、0.9998（η 在 0.001 的格子上時，1 − 2η、1 − 6η、1 − 0.2η 最多 4 位小數，
 * 四捨五入到 4 位就是精確值）；η = 1/3 時 1/3、14/15 寫成 ≈ 0.3333、≈ 0.9333。
 */
export function factorText(m: number, lr: number): { text: string; approx: boolean } {
	const text = fmtTrim(m, 4);
	const approx = isThird(lr) && Number(text.replace('−', '-')) !== m;
	return { text, approx };
}

// ---------- 梯度下降的路徑 ----------

export type Run = {
	xs: number[];
	ys: number[];
	hs: number[];
};

/** 從出發點走 steps 步：p ← p − η × 梯度，梯度是 (2a·x, 6y) */
export function runGD(b: Bowl, lr: number, steps = b.steps): Run {
	let x = b.start[0];
	let y = b.start[1];
	const xs = [x];
	const ys = [y];
	const hs = [height(b, x, y)];
	for (let t = 0; t < steps; t++) {
		const gx = 2 * b.a * x;
		const gy = Y_CURV * y;
		x = x - lr * gx;
		y = y - lr * gy;
		xs.push(x);
		ys.push(y);
		hs.push(height(b, x, y));
	}
	return { xs, ys, hs };
}

export type RunKind = 'converge' | 'stuck' | 'diverge';

/** 整條路徑：兩個方向都收斂才收斂；有一個方向 |乘數| > 1 就發散 */
export function runKind(b: Bowl, lr: number): RunKind {
	const ks = [factorKind(xFactor(b, lr)), factorKind(yFactor(lr))];
	if (ks.some(isDiverge)) return 'diverge';
	if (ks.includes('stuck')) return 'stuck';
	return 'converge';
}

/** 第一個跑出畫面的步數（沒有就是 null） */
export function exitStep(r: Run, x0: number, x1: number, y0: number, y1: number): number | null {
	for (let t = 0; t < r.xs.length; t++) {
		const x = r.xs[t];
		const y = r.ys[t];
		if (!(x >= x0 && x <= x1 && y >= y0 && y <= y1)) return t;
	}
	return null;
}

// ---------- 數字格式 ----------

/** 一個數的寫法：一般小數、科學記號 mant × 10^exp、無限大、算不出來 */
export type NumText = { kind: 'plain'; text: string } | { kind: 'sci'; mant: string; exp: number } | { kind: 'inf'; neg: boolean } | { kind: 'nan' };

function special(v: number): NumText | null {
	if (Number.isNaN(v)) return { kind: 'nan' };
	if (!Number.isFinite(v)) return { kind: 'inf', neg: v < 0 };
	return null;
}

/**
 * 高度：3 位有效數字（尾巴的 0 保留，位數固定）。四捨五入後的次方在 −3 到 2 之間寫成小數
 * （13.0、2.56、0.717、0.00153），其他寫成科學記號（1.53 × 10⁻⁶、7.03 × 10⁹）。
 */
export function heightText(v: number): NumText {
	const s = special(v);
	if (s) return s;
	if (v === 0) return { kind: 'plain', text: '0' };
	const { mant, exp } = sciParts(v, 3);
	if (exp >= -3 && exp <= 2) return { kind: 'plain', text: fmtFixed(v, 2 - exp) };
	return { kind: 'sci', mant, exp };
}

/**
 * 座標：3 位小數（0.800、−1.600、2.901、0.012，和本集 np.round(…, 3) 的輸出一樣）；
 * 很小（四捨五入到 3 位有效數字後小於 0.01）或很大（1000 以上）時寫成 3 位有效數字的科學記號。
 */
export function coordText(v: number): NumText {
	const s = special(v);
	if (s) return s;
	if (v === 0) return { kind: 'plain', text: '0' };
	const { mant, exp } = sciParts(v, 3);
	if (exp >= -2 && exp <= 2) return { kind: 'plain', text: fmtFixed(v, 3) };
	return { kind: 'sci', mant, exp };
}

/** 給螢幕閱讀器念的 */
export function numSpoken(t: NumText): string {
	if (t.kind === 'nan') return '算不出來';
	if (t.kind === 'inf') return t.neg ? '負無限大' : '無限大';
	if (t.kind === 'plain') return t.text;
	return `${t.mant} 乘 10 的 ${t.exp < 0 ? `負 ${-t.exp}` : t.exp} 次方`;
}

/** 純文字（測試、估寬度用）：1.53 × 10^−6 */
export function numPlain(t: NumText): string {
	if (t.kind === 'nan') return '—';
	if (t.kind === 'inf') return t.neg ? '−∞' : '∞';
	if (t.kind === 'plain') return t.text;
	return `${t.mant} × 10^${minus(String(t.exp))}`;
}

// ---------- 高度的對數圖 ----------

/** log10(高度)，夾在 [lo, hi]；0 夾在 lo，無限大夾在 hi */
export function log10Clamp(v: number, lo: number, hi: number): number {
	if (Number.isNaN(v) || v === Infinity) return hi;
	if (v <= 0) return lo;
	return Math.min(hi, Math.max(lo, Math.log10(v)));
}

/**
 * 對數圖的縱軸：涵蓋所有畫出來的高度（log10 取整數，上下各留一點），
 * 刻度每 1、2 或 5 格（10 的次方）標一個數字。
 */
export function logAxis(series: number[][]): { lo: number; hi: number; labels: number[] } {
	let mn = Infinity;
	let mx = -Infinity;
	for (const hs of series)
		for (const h of hs) {
			if (!(h > 0) || !Number.isFinite(h)) continue;
			const l = Math.log10(h);
			if (l < mn) mn = l;
			if (l > mx) mx = l;
		}
	if (!Number.isFinite(mn)) return { lo: -1, hi: 2, labels: [-1, 0, 1, 2] };
	let lo = Math.floor(mn);
	let hi = Math.ceil(mx);
	if (hi - lo < 3) {
		lo = Math.min(lo, hi - 3);
	}
	const span = hi - lo;
	const every = span > 12 ? 5 : span > 6 ? 2 : 1;
	const labels: number[] = [];
	for (let k = Math.ceil(lo / every) * every; k <= hi; k += every) labels.push(k + 0);
	return { lo, hi, labels };
}

/** 步數的刻度：每 5 步一個 */
export const stepTicks = (n: number, every = 5) => Array.from({ length: Math.floor(n / every) + 1 }, (_, i) => i * every);

// ---------- 說明的分類 ----------

export type LrCase =
	| 'tiny'
	| 'good'
	| 'best'
	| 'bouncy'
	| 'over'
	| 'third'
	| 'slowNoFlip'
	| 'flipConverge'
	| 'diverge'
	| 'narrowZigzag'
	| 'narrowNoZigzag';

/** 照學習率選一段說明：本集比較過的幾個學習率用本集的說法，其他照乘數的性質 */
export function lrCase(b: Bowl, lr: number): LrCase {
	const ky = factorKind(yFactor(lr));
	if (isThird(lr)) return 'third';
	if (isDiverge(ky)) return lr === 0.34 ? 'over' : 'diverge';
	if (b.key === 'narrow') return ky === 'flip' ? 'narrowZigzag' : 'narrowNoZigzag';
	if (lr === 0.01) return 'tiny';
	if (lr === 0.1) return 'good';
	if (lr === 0.25) return 'best';
	if (lr === 0.3) return 'bouncy';
	return ky === 'flip' ? 'flipConverge' : 'slowNoFlip';
}

// ---------- sigmoid 與兩個類別的 Softmax ----------

export const Z_MIN = -6;
export const Z_MAX = 6;
export const Z_STEP = 0.1;
export const Z_DEFAULT = 2;
/** 本集的表：z = −5、−2、0、2、5 */
export const Z_PRESETS = [-5, -2, 0, 2, 5];

/** 吸附到 0.1 的格子（加 0：不要出現 −0） */
export const snapZ = (v: number) => Math.min(Z_MAX * 10, Math.max(Z_MIN * 10, Math.round(v * 10))) / 10 + 0;

export function stepZ(z: number, dir: 1 | -1, step = Z_STEP): number {
	const k = Math.round(1 / step);
	const n = Math.round(z * 10) / 10;
	return snapZ((Math.round(n * k) + dir) / k);
}

/** 數值穩定的 sigmoid：z ≥ 0 用 1 / (1 + e^(−z))，z < 0 用 e^z / (1 + e^z) */
export function sigmoid(z: number): number {
	if (z >= 0) return 1 / (1 + Math.exp(-z));
	const e = Math.exp(z);
	return e / (1 + e);
}

/** 兩個分數 [z, 0] 的 Softmax：先減掉最大的分數，再取 e 的次方、除以總和（EP01） */
export function softmax2(z: number): [number, number] {
	const m = Math.max(z, 0);
	const e1 = Math.exp(z - m);
	const e0 = Math.exp(0 - m);
	const s = e1 + e0;
	return [e1 / s, e0 / s];
}

export type SigmoidInfo = {
	z: number;
	/** e^z、e^(−z) */
	ez: number;
	enz: number;
	/** σ(z)：「冷」的機率 */
	p: number;
	/** 1 − σ(z)：「熱」的機率 */
	q: number;
	/** Softmax([z, 0]) */
	sm: [number, number];
	/** S 形曲線的斜率 σ(z)(1 − σ(z)) */
	slope: number;
};

export function sigmoidInfo(z: number): SigmoidInfo {
	const p = sigmoid(z);
	const sm = softmax2(z);
	return { z, ez: Math.exp(z), enz: Math.exp(-z), p, q: sm[1], sm, slope: p * (1 - p) };
}

/** 機率：4 位小數（和本集 np.round(…, 4) 一樣，但尾巴的 0 保留：0.5000） */
export const PROB_DIGITS = 4;
export const probText = (v: number) => fmtFixed(v, PROB_DIGITS);

/** z：1 位小數 */
export const zText = (z: number) => fmtFixed(z, 1);

/** e 的次方：4 位有效數字（7.389、0.1353、403.4、0.002479） */
export function expText(v: number): string {
	const { exp } = sciParts(v, 4);
	return fmtFixed(v, Math.max(0, 3 - exp));
}

/** sigmoid 曲線上的點（畫圖用） */
export function sigmoidCurve(n = 240): [number, number][] {
	return Array.from({ length: n + 1 }, (_, i) => {
		const z = Z_MIN + ((Z_MAX - Z_MIN) * i) / n;
		return [z, sigmoid(z)];
	});
}
