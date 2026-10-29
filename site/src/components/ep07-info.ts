/**
 * EP07 互動元件（SurpriseEntropyDemo、PerplexityDemo）用到的計算與數字格式。
 * 沒有用到 React，方便單獨測試。
 *
 * 數字照本集的 Python 寫法用 float64 實際算：
 * - 機率都是「整數 ÷ 1000」，和 Python 的字面值一樣（0.293，不是 0.29300000000000004）；
 * - ln 用 EP05 的 lnExact；log₂ 和 e 的次方這裡用同樣的方法（BigInt 定點數算到 200 位二進位再捨入），
 *   都是最接近真正答案的 float64。NumPy 的 np.log、np.exp 為了快，最後一位偶爾差 1
 *   （和 CPU 有關），四捨五入到畫面上的位數以後都一樣；
 * - np.sum、np.mean 照 NumPy 的加法順序（少於 8 個從頭加到尾），np.mean 是加總再除以個數。
 * 畫面上的數字四捨五入到固定位數，和 Python 的格式化一致（剛好在正中間時取偶數）。
 */
import { fmtFixed, sciParts } from './ep04-calc.ts';
import { lnExact } from './ep05-chain.ts';
import { npSum } from './ep06-table.ts';

export { fmtFixed, lnExact, npSum, sciParts };

// ---------- 精確計算：整數 × 2 的次方 ----------

const B0 = BigInt(0);
const B1 = BigInt(1);

/** 把 float64 寫成 mant × 2^exp（mant 是整數）；乘以 2 不會有誤差 */
function toDyadic(absV: number): { mant: bigint; exp: number } {
	let m = absV;
	let exp = 0;
	while (!Number.isInteger(m)) {
		m *= 2;
		exp -= 1;
	}
	return { mant: BigInt(m), exp };
}

const bitLength = (a: bigint) => (a === B0 ? 0 : a.toString(2).length);

/**
 * n × 2^e 捨入成最接近的 float64（剛好在正中間時取偶數）。
 * n 太長時先截到 64 位，截掉的部分只要不是 0 就在最低位補 1（sticky bit），再交給 Number() 捨入。
 * 本集的數字都在 10⁻⁶ 到 10⁶ 之間，不會碰到次正規數。
 */
function roundDyadic(n: bigint, e: number): number {
	if (n === B0) return 0;
	const neg = n < B0;
	let a = neg ? -n : n;
	const extra = bitLength(a) - 64;
	if (extra > 0) {
		const shift = BigInt(extra);
		const dropped = a & ((B1 << shift) - B1);
		a >>= shift;
		if (dropped !== B0) a |= B1;
		e += extra;
	}
	let v = Number(a);
	while (e > 1000) {
		v *= 2 ** 1000;
		e -= 1000;
	}
	while (e < -1000) {
		v *= 2 ** -1000;
		e += 1000;
	}
	v *= 2 ** e;
	return neg ? -v : v;
}

/** 定點數：P 位二進位小數 */
const P = 200;
const BP = BigInt(P);
const ONE = B1 << BP;

/** 2 · atanh(s) = 2(s + s³/3 + s⁵/5 + …)，s 是定點數（|s| ≤ 1/3） */
function twoAtanh(s: bigint): bigint {
	const s2 = (s * s) >> BP;
	let term = s;
	let sum = s;
	for (let j = 3; ; j += 2) {
		term = (term * s2) >> BP;
		const t = term / BigInt(j);
		if (t === B0) break;
		sum += t;
	}
	return sum * BigInt(2);
}

/** ln 2 = 2 · atanh(1/3)（定點數） */
const LN2 = twoAtanh(ONE / BigInt(3));

/** ln v 的定點數（v > 0）：v = m × 2^k，m 在 √½ 到 √2 之間，ln v = k · ln 2 + 2 · atanh((m − 1)/(m + 1)) */
function lnFixed(v: number): bigint {
	const { mant, exp } = toDyadic(v);
	const len = bitLength(mant);
	let k = exp + len - 1;
	let m = mant << BigInt(P - (len - 1)); // m / 2^P 在 1 到 2 之間
	if (m * m > ONE * ONE * BigInt(2)) {
		m >>= B1; // m 比 √2 大：除以 2（m 的最低位都是 0，不會損失）
		k += 1;
	}
	const s = ((m - ONE) << BP) / (m + ONE);
	return BigInt(k) * LN2 + twoAtanh(s);
}

/** 以 2 為底的 log（v > 0），回傳最接近真正答案的 float64，和 np.log2 一樣；2 的次方剛好是整數 */
export function log2Exact(v: number): number {
	if (!(v > 0) || !Number.isFinite(v)) return Math.log2(v);
	if (v === 1) return 0;
	return roundDyadic((lnFixed(v) << BP) / LN2, -P);
}

/** e 的 x 次方，回傳最接近真正答案的 float64，和 np.exp 一樣 */
export function expExact(x: number): number {
	if (x === 0) return 1;
	if (!Number.isFinite(x) || Math.abs(x) > 700) return Math.exp(x);
	const { mant, exp } = toDyadic(Math.abs(x));
	// x 的定點數（本集的 x 小數部分不超過 P 位，這一步沒有誤差）
	let xf = exp >= -P ? mant << BigInt(P + exp) : mant >> BigInt(-P - exp);
	if (x < 0) xf = -xf;
	// x = k · ln 2 + r，|r| ≤ ln 2 / 2
	const k = Math.round(x / Math.LN2);
	const r = xf - BigInt(k) * LN2;
	// e^r = 1 + r + r²/2! + r³/3! + …
	let term = ONE;
	let sum = ONE;
	for (let j = 1; ; j++) {
		term = (term * r) >> BP;
		term /= BigInt(j);
		if (term === B0) break;
		sum += term;
	}
	return roundDyadic(sum, k - P);
}

// ---------- 數字格式 ----------

/** 整數加千分位：151936 → 151,936 */
export const fmtInt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 固定小數位數，整數部分加千分位：151935.99999999997 → 151,936.00 */
export function fmtFixedComma(v: number, digits: number): string {
	const s = fmtFixed(v, digits);
	const neg = s.startsWith('−');
	const [a, b] = (neg ? s.slice(1) : s).split('.');
	const out = b === undefined ? fmtInt(Number(a)) : `${fmtInt(Number(a))}.${b}`;
	return neg ? `−${out}` : out;
}

/** 很小的數改用科學記號：mant × 10^exp */
export type NumText = { kind: 'plain'; text: string } | { kind: 'sci'; mant: string; exp: number } | { kind: 'inf' };

/** 給螢幕閱讀器、測試用的純文字：6.58 × 10⁻⁶ → '6.58e-06'；∞ → 'inf' */
export function numPlain(t: NumText): string {
	if (t.kind === 'inf') return 'inf';
	if (t.kind === 'plain') return t.text.replace('−', '-');
	return `${t.mant.replace('−', '-')}e${t.exp < 0 ? '-' : '+'}${String(Math.abs(t.exp)).padStart(2, '0')}`;
}

/** 念出來的寫法：6.58 乘 10 的負 6 次方、無限大 */
export const numSpoken = (t: NumText) =>
	t.kind === 'inf' ? '無限大' : t.kind === 'plain' ? t.text : `${t.mant} 乘 10 的 ${t.exp < 0 ? `負 ${-t.exp}` : t.exp} 次方`;

// ======================= 驚訝程度與熵（4 個 token） =======================

export type Unit = 'bit' | 'nat';

export const TOKENS4 = ['冷', '熱', '晴', '暖'];
/** 機率的格點：0.001（機率＝整數 ÷ 1000，4 個整數加起來一直是 1000） */
export const UNITS = 1000;
/** 文中的例子：冷 1/2、熱 1/4、晴 1/8、暖 1/8 */
export const P4_UNITS = [500, 250, 125, 125];

export type Preset4 = { key: string; label: string; units: number[] };
export const PRESETS4: Preset4[] = [
	{ key: 'doc', label: '文中的例子：½、¼、⅛、⅛', units: P4_UNITS },
	{ key: 'uniform', label: '均勻：各 0.25', units: [250, 250, 250, 250] },
	{ key: 'skew', label: '偏一邊：0.97、0.01、0.01、0.01', units: [970, 10, 10, 10] },
	{ key: 'sure', label: '一定發生：1、0、0、0', units: [1000, 0, 0, 0] },
];

/** 機率（3 位小數）、驚訝程度（3 位小數）、熵與每一項 p × (−log p)（4 位小數） */
export const P_DIGITS = 3;
export const SURP_DIGITS = 3;
export const H_DIGITS = 4;

export const prob = (u: number) => u / UNITS;

/** 驚訝程度 −log₂ p（bit）或 −ln p（nat）；p = 0 是 ∞ */
export function surprisal(u: number, unit: Unit): number {
	if (u <= 0) return Infinity;
	const p = prob(u);
	return -(unit === 'bit' ? log2Exact(p) : lnExact(p)) + 0;
}

/** 熵的每一項 p × (−log p)；p = 0 的項當成 0、不算進熵（回傳 null） */
export function entropyTerms(units: number[], unit: Unit): (number | null)[] {
	return units.map((u) => (u > 0 ? prob(u) * surprisal(u, unit) : null));
}

/**
 * 熵 H(p) = Σ p × (−log p)：和本集的 np.sum(p * -np.log2(p)) 一樣（先跳過 p = 0 的項，弄壞它 5）。
 * 一定發生時只剩一項 1 × 0 = 0。
 */
export function entropy(units: number[], unit: Unit): number {
	const terms = entropyTerms(units, unit).filter((t): t is number => t !== null);
	return npSum(terms) + 0;
}

/** K 種結果時熵最大是 log K（均勻分佈）：log₂ 4 = 2 bit，ln 4 = 1.3863 nat */
export const maxEntropy = (unit: Unit, k = 4) => (unit === 'bit' ? log2Exact(k) : lnExact(k));

/** 1000、500、250、125：機率是 ½ 的次方，−log₂ p 剛好是整數題數 */
export function questions(u: number): number | null {
	const map: Record<number, number> = { 1000: 0, 500: 1, 250: 2, 125: 3 };
	return u in map ? map[u] : null;
}

/** 4 個機率都一樣 */
export const isUniform = (units: number[]) => units.every((u) => u === units[0]);

/** 第 i 個是 1、其他都是 0：回傳 i，否則 −1 */
export const sureIndex = (units: number[]) => units.findIndex((u) => u === UNITS);

/**
 * 把第 i 個改成 v（整數，0 到 1000），其他幾個照 base 裡原本的比例分剩下的 1000 − v：
 * 先照比例算、無條件捨去，差的幾個 0.001 依小數部分由大到小補（一樣大時先補前面的）。
 * 原本其他幾個都是 0 時平分。結果的和一定是 1000。
 * base 是開始拖（或開始輸入）那一刻的機率，拖來拖去比例都不會走樣。
 */
export function redistribute(base: number[], i: number, v: number): number[] {
	const n = base.length;
	const target = Math.max(0, Math.min(UNITS, Math.round(v)));
	const rest = UNITS - target;
	const others = base.map((u, j) => (j === i ? 0 : Math.max(0, u)));
	const otherSum = others.reduce((s, u) => s + u, 0);
	const weights = otherSum > 0 ? others : base.map((_, j) => (j === i ? 0 : 1));
	const wSum = weights.reduce((s, w) => s + w, 0);
	const out = base.map(() => 0);
	out[i] = target;
	const fracs: { j: number; f: number }[] = [];
	let used = 0;
	for (let j = 0; j < n; j++) {
		if (j === i) continue;
		const exact = (rest * weights[j]) / wSum;
		const fl = Math.floor((rest * weights[j]) / wSum + 1e-9);
		out[j] = fl;
		used += fl;
		fracs.push({ j, f: weights[j] > 0 ? exact - fl : -1 });
	}
	fracs.sort((a, b) => b.f - a.f || a.j - b.j);
	for (let k = 0; k < rest - used; k++) out[fracs[k % fracs.length].j] += 1;
	return out;
}

/** 拖動長條時吸附到 0.01：y 方向的比例（0 到 1）→ 整數（0 到 1000） */
export const snapDrag4 = (p: number) => Math.max(0, Math.min(100, Math.round(p * 100))) * 10;

/** 輸入框的字 → 整數（0 到 1000）；不是數字時回傳 null */
export function parseUnits(raw: string, min = 0): number | null {
	const t = raw.trim();
	if (t === '') return null;
	const v = Number(t);
	if (!Number.isFinite(v)) return null;
	return Math.max(min, Math.min(UNITS, Math.round(v * UNITS)));
}

/**
 * 數字框按方向鍵：跳到下一個 0.01 的倍數（0.125 → 0.13 或 0.12），限制在 min 到 1 之間。
 * 自己算，不交給瀏覽器：最小值 0.001 不在 0.01 的格子上，瀏覽器會跳到 0.011、0.021⋯⋯
 */
export function stepUnits(u: number, dir: 1 | -1, min = 0): number {
	const g = 10;
	const next = dir > 0 ? Math.floor(u / g) * g + g : Math.ceil(u / g) * g - g;
	return Math.max(min, Math.min(UNITS, next));
}

/** 輸入框裡的寫法：0.5、0.125、0（和 Python 的 repr 一樣） */
export const unitsInput = (u: number) => String(prob(u));

export const pText = (u: number) => fmtFixed(prob(u), P_DIGITS);

/** 驚訝程度的寫法：3 位小數；p = 0 是 ∞ */
export function surpText(u: number, unit: Unit): NumText {
	if (u <= 0) return { kind: 'inf' };
	return { kind: 'plain', text: fmtFixed(surprisal(u, unit), SURP_DIGITS) };
}

export const hText = (v: number) => fmtFixed(v, H_DIGITS);

/** 4 位小數的字 → 整數（萬分之幾），用來比較「顯示的每一項加起來」和「顯示的熵」 */
const tenThousandths = (s: string) => Number(s.replace('.', ''));

export type EntropyView = {
	unit: Unit;
	/** 每一項 p × (−log p)；p = 0 是 null */
	terms: (number | null)[];
	termTexts: (string | null)[];
	h: number;
	hText: string;
	max: number;
	maxText: string;
	/** 離最大值還差多少 */
	gap: number;
	gapText: string;
	/** 顯示的每一項加起來剛好等於顯示的熵（否則算式寫「≈」） */
	sumMatches: boolean;
};

export function entropyView(units: number[], unit: Unit): EntropyView {
	const terms = entropyTerms(units, unit);
	const termTexts = terms.map((t) => (t === null ? null : hText(t)));
	const h = entropy(units, unit);
	const max = maxEntropy(unit);
	const hT = hText(h);
	const sumShown = termTexts.reduce((s, t) => s + (t === null ? 0 : tenThousandths(t)), 0);
	return {
		unit,
		terms,
		termTexts,
		h,
		hText: hT,
		max,
		maxText: hText(max),
		gap: max - h,
		gapText: hText(max - h),
		sumMatches: sumShown === tenThousandths(hT),
	};
}

// ======================= 困惑度：一串正確 token 的機率 =======================

export const SENT_TOKENS = ['今天', '天', '氣', '很', '冷'];
/** 示範句每一步正確 token 的機率（整數 ÷ 1000）：0.01、0.2、0.9、0.3、0.293 */
export const SENT_UNITS = [10, 200, 900, 300, 293];
/** 只有最後一步「冷」0.293 是 EP00 的實測 */
export const MEASURED_INDEX = 4;
export const MEASURED_UNITS = 293;
/** 每一格的範圍：0.001 到 1 */
export const PP_MIN_UNITS = 1;

export const isMeasured = (i: number, u: number) => i === MEASURED_INDEX && u === MEASURED_UNITS;

export type PplStats = {
	/** 每一格的 −ln p（nat） */
	nll: number[];
	/** log 機率加起來 Σ ln p */
	logSum: number;
	/** 平均損失 −mean(ln p)（nat） */
	loss: number;
	/** 困惑度 e^損失 */
	ppl: number;
	/** e^(−損失)：正確 token 機率的幾何平均（連乘再開 n 次方根），約 1/困惑度 */
	geo: number;
};

/**
 * 和本集的 -np.mean(np.log(p))、np.exp(loss) 一樣：
 * np.mean 是 np.sum 再除以個數；幾何平均用 e^(−損失)。
 */
export function pplStats(ps: number[]): PplStats {
	const lns = ps.map((p) => lnExact(p));
	const logSum = npSum(lns);
	const loss = -(logSum / ps.length) + 0;
	return {
		nll: lns.map((v) => -v + 0),
		logSum: logSum + 0,
		loss,
		ppl: expExact(loss),
		geo: expExact(-loss),
	};
}

/** −ln p、log 加總、損失：3 位小數（1.750）；困惑度：2 位小數加千分位（5.76、151,936.00） */
export const NLL_DIGITS = 3;
export const PPL_DIGITS = 2;
export const nllText = (v: number) => fmtFixed(v, NLL_DIGITS);
export const pplText = (v: number) => fmtFixedComma(v, PPL_DIGITS);

/** 機率的寫法：0.001 以上 3 位小數（0.174）；更小的用科學記號、3 位有效數字（6.58 × 10⁻⁶） */
export function probText(v: number): NumText {
	if (v >= 0.001 || v === 0) return { kind: 'plain', text: fmtFixed(v, 3) };
	return { kind: 'sci', ...sciParts(v, 3) };
}

/** 拖動：−ln p 的位置 x → 機率；0.1 以上吸附到 0.01，以下吸附到 0.001（都在 0.001 到 1 之間） */
export function snapNll(x: number): number {
	const p = Math.exp(-Math.max(0, x));
	const u = p >= 0.0995 ? Math.round(p * 100) * 10 : Math.round(p * UNITS);
	return Math.max(PP_MIN_UNITS, Math.min(UNITS, u));
}

// ---------- K 個一樣可能 ----------

export const K_MIN = 1;
/** EP00 的詞彙表大小 */
export const VOCAB = 151_936;
export const K_MAX = VOCAB;
/** 滑桿停的地方（對數刻度上大約等距，加上公平骰子 6 和詞彙表 151,936） */
export const K_STOPS = [1, 2, 3, 4, 6, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, VOCAB];
export const K_DEFAULT = 6;

export const clampK = (v: number) => Math.max(K_MIN, Math.min(K_MAX, Math.round(v)));

/** 最接近 K 的滑桿位置（在對數刻度上比） */
export function nearestKStop(k: number): number {
	let best = 0;
	for (let i = 1; i < K_STOPS.length; i++) {
		if (Math.abs(Math.log(K_STOPS[i] / k)) < Math.abs(Math.log(K_STOPS[best] / k)) - 1e-12) best = i;
	}
	return best;
}

/** 句子有幾格 */
export const SENT_LEN = SENT_TOKENS.length;

/** K 個一樣可能：每一格的機率都是 1/K（和 Python 的 1 / K 一樣） */
export const kProbs = (k: number) => Array.from({ length: SENT_LEN }, () => 1 / k);

// ---------- −ln p 的座標軸 ----------

/** 一般模式畫到 7 nat（0.001 是 6.908）；K 個一樣可能畫到 12 nat（151,936 是 11.931） */
export const nllAxisMax = (kMode: boolean) => (kMode ? 12 : 7);

/** 上面的刻度：−ln p（nat） */
export const nllTicks = (kMode: boolean) => (kMode ? [0, 2, 4, 6, 8, 10, 12] : [0, 1, 2, 3, 4, 5, 6, 7]);

/** 下面的刻度：機率 1、0.1、0.01⋯⋯（位置是 −ln p = k · ln 10）；label 是 10 的次方 */
export function probTicks(kMode: boolean): { x: number; exp: number }[] {
	const n = kMode ? 5 : 3;
	return Array.from({ length: n + 1 }, (_, k) => ({ x: k * Math.LN10, exp: -k }));
}
