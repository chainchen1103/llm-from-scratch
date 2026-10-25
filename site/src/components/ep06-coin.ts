/**
 * EP06 互動元件（CoinFlipDemo、LikelihoodDemo）用到的計算與數字格式。
 * 沒有用到 React，方便單獨測試。
 *
 * 丟硬幣：用固定 seed 的偽亂數產生器 mulberry32，同一個 seed 每次丟出來的結果都一樣。
 * 它和 NumPy 的 default_rng 是不同的產生器，所以數字和文中的 Python 不一樣。
 *
 * 概似函數照本集的寫法用 float64 算：L(p) = p^k (1 − p)^(n−k)，log L(p) = k ln p + (n − k) ln(1 − p)。
 * p^k 與 ln 用 ep05-chain.ts 的精確版本，和 Python 的 ** 與 np.log 一樣（瀏覽器的 Math.pow、Math.log 最後一位偶爾不同）；
 * 0 × ln 0 當成 0（和本集 prob.py 的 log_likelihood 一樣）。
 */
import { fmtFixed, sciParts } from './ep04-calc.ts';
import { lnExact, powExact } from './ep05-chain.ts';

export { fmtFixed, sciParts };

/** 整數加千分位：100000 → 100,000 */
export const fmtInt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------- 偽亂數產生器 ----------

/**
 * mulberry32：32 位元整數的狀態，每次加一個固定的奇數再打散，回傳 0 到 1（不含 1）的數。
 * 同一個 seed，產生的數列永遠一樣。
 */
export function mulberry32(seed: number): () => number {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ---------- 丟硬幣：頻率靠近機率 ----------

export const COIN_N_MIN = 1;
export const COIN_N_MAX = 100_000;
/** 滑桿停的地方：1、2、5、10、20、50⋯⋯十萬（對數刻度上大約等距） */
export const COIN_STOPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];
export const COIN_N_DEFAULT = 10;
export const COIN_SEEDS = [0, 1, 2, 3];
/** 表格列出的次數（和本集 Python 印出的一樣，少了一百萬） */
export const COIN_TABLE_NS = [10, 20, 100, 1000, 10_000, 100_000];
/** 比例與距離的小數位數：滑桿停的次數都整除 100,000，所以比例寫成 5 位小數剛好沒有四捨五入 */
export const RATIO_DIGITS = 5;

export type CoinRun = {
	seed: number;
	/** 第 i 次（從 0 數）：1 是正面、0 是反面 */
	flips: Uint8Array;
	/** 累積和：cum[m] 是前 m 次裡正面的次數（cum[0] = 0） */
	cum: Int32Array;
};

/** 用 seed 丟 nMax 次（亂數小於 0.5 是正面），先算好累積和，之後查任何 n 都只要一步 */
export function coinRun(seed: number, nMax = COIN_N_MAX): CoinRun {
	const rand = mulberry32(seed);
	const flips = new Uint8Array(nMax);
	const cum = new Int32Array(nMax + 1);
	for (let i = 0; i < nMax; i++) {
		const f = rand() < 0.5 ? 1 : 0;
		flips[i] = f;
		cum[i + 1] = cum[i] + f;
	}
	return { seed, flips, cum };
}

export const clampCoinN = (v: number) => Math.max(COIN_N_MIN, Math.min(COIN_N_MAX, Math.round(v)));

/** 最接近 n 的滑桿位置（在對數刻度上比） */
export function nearestStop(n: number): number {
	let best = 0;
	for (let i = 1; i < COIN_STOPS.length; i++) {
		if (Math.abs(Math.log(COIN_STOPS[i] / n)) < Math.abs(Math.log(COIN_STOPS[best] / n)) - 1e-12) best = i;
	}
	return best;
}

/** 這一次比上一次離 0.5 更近、更遠，還是一樣（第 1 次沒有上一次） */
export type Trend = 'first' | 'closer' | 'farther' | 'same';

export type CoinStat = {
	n: number;
	/** 前 n 次裡的正面次數 */
	k: number;
	/** 正面的比例 k / n（和 Python 的 k / n 一樣） */
	ratio: number;
	/** 和 0.5 的距離 |k / n − 0.5| */
	dist: number;
	/** 比例、距離，固定 5 位小數 */
	ratioText: string;
	distText: string;
	/** 5 位小數剛好等於 k / n（沒有四捨五入） */
	exact: boolean;
	/** 第 n 次是正面（1）還是反面（0） */
	last: number;
	/** 第 n − 1 次時的比例（n = 1 時是 null） */
	prevRatioText: string | null;
	trend: Trend;
};

/**
 * 前 n 次的統計。離 0.5 的距離是 |2k − n| / (2n)，比較兩次的遠近用整數相乘，不受捨入誤差影響。
 */
export function coinStat(run: CoinRun, n: number): CoinStat {
	const k = run.cum[n];
	const ratio = k / n;
	const dist = Math.abs(ratio - 0.5);
	let trend: Trend = 'first';
	let prevRatioText: string | null = null;
	if (n >= 2) {
		const k0 = run.cum[n - 1];
		const now = Math.abs(2 * k - n) * (n - 1);
		const before = Math.abs(2 * k0 - (n - 1)) * n;
		trend = now < before ? 'closer' : now > before ? 'farther' : 'same';
		prevRatioText = fmtFixed(k0 / (n - 1), RATIO_DIGITS);
	}
	return {
		n,
		k,
		ratio,
		dist,
		ratioText: fmtFixed(ratio, RATIO_DIGITS),
		distText: fmtFixed(dist, RATIO_DIGITS),
		exact: (k * 10 ** RATIO_DIGITS) % n === 0,
		last: run.flips[n - 1],
		prevRatioText,
		trend,
	};
}

/**
 * 畫折線用的次數：200 以內每一次都畫（對數刻度上前面很寬），之後每次乘 1.005 取一個點
 * （比例每一次最多變 1/m，點和點之間的變化小於 0.5%，看不出差別）。
 */
export function coinCurveNs(nMax = COIN_N_MAX): number[] {
	const out: number[] = [];
	for (let m = 1; m <= Math.min(200, nMax); m++) out.push(m);
	let x = 200;
	while (x < nMax) {
		x *= 1.005;
		const m = Math.min(nMax, Math.round(x));
		if (m > out[out.length - 1]) out.push(m);
	}
	if (out[out.length - 1] !== nMax) out.push(nMax);
	return out;
}

/** 前 count 次的結果（畫成一排正、反） */
export const firstFlips = (run: CoinRun, count: number) => Array.from(run.flips.subarray(0, count));

// ---------- 概似函數：丟 n 次、k 次正面的某一串 ----------

export const LK_N_MIN = 1;
export const LK_N_MAX = 30;
export const LK_N_DEFAULT = 10;
export const LK_K_DEFAULT = 7;
/** 本集的資料：正正反正正正反正正反 */
export const DOC_FLIPS = [1, 1, 0, 1, 1, 1, 0, 1, 1, 0];
export const P_STEP = 0.01;
export const P_DEFAULT = 0.5;

/** 吸附到 0.01 並限制在 0 到 1；用「整數 ÷ 100」得到和 Python 字面值一樣的 float64（0.29，不是 0.29000000000000004） */
export const snapP = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100))) / 100;

/** p 的格點編號：0.37 → 37 */
export const pIndex = (p: number) => Math.round(p * 100);

export const clampLkN = (v: number) => Math.max(LK_N_MIN, Math.min(LK_N_MAX, Math.round(v)));
export const clampLkK = (v: number, n: number) => Math.max(0, Math.min(n, Math.round(v)));

/**
 * n 次裡 k 次正面，照比例平均分散：第 i 次（從 0 數）是正面，若且唯若 ⌈(i + 1)k / n⌉ > ⌈ik / n⌉。
 * n = 10、k = 7 時直接用本集的那一串。
 */
export function spreadFlips(n: number, k: number): number[] {
	if (n === DOC_FLIPS.length && k === countHeads(DOC_FLIPS)) return [...DOC_FLIPS];
	const ceilDiv = (a: number) => Math.floor((a + n - 1) / n);
	return Array.from({ length: n }, (_, i) => (ceilDiv((i + 1) * k) > ceilDiv(i * k) ? 1 : 0));
}

export const countHeads = (seq: number[]) => seq.reduce((s, f) => s + f, 0);

const sameSeq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * 換一種順序（正面次數不變）：用 mulberry32(round) 洗牌（Fisher–Yates）。
 * 洗出來和原本一樣時換下一個 round；全部正面或全部反面時只有一種順序，原樣回傳。
 */
export function shuffleFlips(seq: number[], round: number): { seq: number[]; round: number } {
	const k = countHeads(seq);
	if (k === 0 || k === seq.length) return { seq: [...seq], round };
	for (let r = round; ; r++) {
		const rand = mulberry32(1000 + r);
		const out = [...seq];
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		if (!sameSeq(out, seq)) return { seq: out, round: r };
	}
}

/** 排法數 C(n, k)：n 次裡選 k 次是正面（n ≤ 30，結果是剛好的整數） */
export function binom(n: number, k: number): number {
	const m = Math.min(k, n - k);
	let c = 1;
	for (let i = 1; i <= m; i++) c = (c * (n - m + i)) / i;
	return Math.round(c);
}

/** L(p) = p^k (1 − p)^(n−k)：和 Python 的 p ** k * (1 - p) ** (n - k) 一樣 */
export const likelihood = (p: number, k: number, n: number) => powExact(p, k) * powExact(1 - p, n - k);

/**
 * log L(p) = k ln p + (n − k) ln(1 − p)，0 × ln 0 當成 0：
 * p = 1 而且全部正面是 0；p = 1 卻有反面是 −∞（ln 0）；p = 0 對稱。
 */
export function logLikelihood(p: number, k: number, n: number): number {
	let s = 0;
	if (k > 0) s += k * lnExact(p);
	if (n - k > 0) s += (n - k) * lnExact(1 - p);
	return s + 0;
}

/** p̂ = k / n */
export const pHat = (k: number, n: number) => k / n;

/** p̂ 剛好落在 0.01 的格點上（滑桿可以停在山頂） */
export const hatOnGrid = (k: number, n: number) => (100 * k) % n === 0;

/** 最接近 p̂ 的格點 */
export const hatSnap = (k: number, n: number) => snapP(k / n);

/**
 * 目前的 p 在山頂的哪一邊：d/dp log L = k/p − (n − k)/(1 − p)，正負號和 k − np 一樣；
 * p = i/100 時就是 100k − n·i 的正負號（整數，沒有捨入誤差）。1 = 上坡（往右 L 變大），0 = 山頂，−1 = 下坡。
 */
export function slopeSide(p: number, k: number, n: number): -1 | 0 | 1 {
	const d = 100 * k - n * pIndex(p);
	return d > 0 ? 1 : d < 0 ? -1 : 0;
}

// ---------- 數字的寫法 ----------

export type NumText = { kind: 'plain'; text: string } | { kind: 'sci'; mant: string; exp: number } | { kind: 'neginf' };

/** 10⁻⁴ 以下改用科學記號 */
export const SCI_BELOW = 1e-4;
export const LIK_DIGITS = 10;
export const LIK_SIG = 6;
export const LOG_DIGITS = 10;

/**
 * L 的寫法：0 與 1 照寫；10⁻⁴ 以上固定 10 位小數（0.0022235661），更小的用科學記號、有效數字 6 位（7.50141 × 10⁻⁵）。
 * 和 Python 的 f"{v:.10f}"、f"{v:.5e}" 一樣（剛好在正中間時取偶數）。
 */
export function likText(v: number): NumText {
	if (v === 0) return { kind: 'plain', text: '0' };
	if (v === 1) return { kind: 'plain', text: '1' };
	if (v >= SCI_BELOW) return { kind: 'plain', text: fmtFixed(v, LIK_DIGITS) };
	return { kind: 'sci', ...sciParts(v, LIK_SIG) };
}

/** log L 的寫法：−∞、0 照寫；其他固定 10 位小數（−6.1086430205） */
export function logText(v: number): NumText {
	if (v === -Infinity) return { kind: 'neginf' };
	if (v === 0) return { kind: 'plain', text: '0' };
	return { kind: 'plain', text: fmtFixed(v, LOG_DIGITS) };
}

/** 圖上的短寫法：L 取 3 位有效數字（0.00222、7.50 × 10⁻⁵） */
export function likShort(v: number): NumText {
	if (v === 0) return { kind: 'plain', text: '0' };
	if (v === 1) return { kind: 'plain', text: '1' };
	if (v >= SCI_BELOW) {
		const e = Math.floor(Math.log10(v));
		return { kind: 'plain', text: fmtFixed(v, Math.max(0, 2 - e)) };
	}
	return { kind: 'sci', ...sciParts(v, 3) };
}

/** 圖上的短寫法：log L 取 2 位小數（−6.11） */
export function logShort(v: number): NumText {
	if (v === -Infinity) return { kind: 'neginf' };
	if (v === 0) return { kind: 'plain', text: '0' };
	return { kind: 'plain', text: fmtFixed(v, 2) };
}

/** 文字寫成「整數 × 10 的次方」：0.0022235661 → [22235661, −10]、7.50141 × 10⁻⁵ → [750141, −10] */
function textDecimal(t: NumText): [bigint, number] | null {
	if (t.kind === 'neginf') return null;
	const [a, b = ''] = (t.kind === 'plain' ? t.text : t.mant).replace('−', '-').split('.');
	return [BigInt(a + b), (t.kind === 'sci' ? t.exp : 0) - b.length];
}

/**
 * p = a/b 時，顯示的 L 是不是剛好等於真正的值（不是四捨五入過的），畫面上用「=」，否則用「≈」。
 * 真正的值是分數 a^k (b − a)^(n−k) / b^n，用 BigInt 精確比較，例如
 * L(0.7) = 0.0022235661 剛好（float64 存成 0.0022235660999999998，只是捨入），L(0.3) = 7.50141 × 10⁻⁵ 是四捨五入過的。
 * log L 只有 0 和 −∞ 是剛好的，其他都是「≈」。
 */
export function likTextExact(a: number, b: number, k: number, n: number, t: NumText): boolean {
	const d = textDecimal(t);
	if (!d) return false;
	const [tn, te] = d;
	const A = BigInt(a);
	const B = BigInt(b);
	const num = A ** BigInt(k) * (B - A) ** BigInt(n - k);
	const den = B ** BigInt(n);
	const ten = BigInt(10);
	return te <= 0 ? num * ten ** BigInt(-te) === tn * den : num === tn * ten ** BigInt(te) * den;
}

/** log L 的「=」：只有 0 和 −∞ */
export const logTextExact = (v: number) => v === 0 || v === -Infinity;

/** 純文字（測試、aria 用）：7.50141 × 10⁻⁵ → '7.50141e-05'，−∞ → '-inf' */
export function numPlain(t: NumText): string {
	if (t.kind === 'neginf') return '-inf';
	if (t.kind === 'plain') return t.text.replace('−', '-');
	return `${t.mant.replace('−', '-')}e${t.exp < 0 ? '-' : '+'}${String(Math.abs(t.exp)).padStart(2, '0')}`;
}

/** p 的寫法：固定 2 位小數（0.70） */
export const fmtP = (p: number) => fmtFixed(p, 2);

// ---------- 座標軸 ----------

export type Ticks = {
	/** 刻度的值 */
	values: number[];
	/** 刻度上寫的字（整條軸共用一個 10 的次方時，只寫前面的數字） */
	labels: string[];
	/** 整條軸共用的 10 的次方（軸的名字後面寫「× 10⁻⁶」）；不需要時是 null */
	factorExp: number | null;
	/** 最上面、最下面的刻度 */
	lo: number;
	hi: number;
};

/** 間隔是 1、2、5 × 10 的次方，刻度大約 target 個；回傳 m × 10^e 的 m、e */
function niceStep(span: number, target: number): { m: number; e: number } {
	let best = { m: 1, e: 0, cost: Infinity };
	const e0 = Math.floor(Math.log10(span / target));
	for (let e = e0 - 1; e <= e0 + 1; e++) {
		for (const m of [1, 2, 5]) {
			const cost = Math.abs(span / (m * 10 ** e) - target);
			if (cost < best.cost - 1e-9) best = { m, e, cost };
		}
	}
	return { m: best.m, e: best.e };
}

/** 第 j 個刻度 j × m × 10^e：小數用「整數 ÷ 10 的次方」算，才不會出現 0.30000000000000004 */
const tickAt = (j: number, m: number, e: number) => (e >= 0 ? j * m * 10 ** e : (j * m) / 10 ** -e) + 0;

/**
 * 從 lo 到 hi 的刻度（含兩端外面最近的那一格）。
 * 間隔小於 10⁻⁴ 時（小數超過 4 位），整條軸提出一個 10 的次方，刻度只寫 0、2、4⋯⋯
 */
export function linTicks(lo: number, hi: number, target = 4): Ticks {
	const { m, e } = niceStep(hi - lo, target);
	const j0 = Math.floor(lo / tickAt(1, m, e) + 1e-9);
	const j1 = Math.ceil(hi / tickAt(1, m, e) - 1e-9);
	const values: number[] = [];
	for (let j = j0; j <= j1; j++) values.push(tickAt(j, m, e));
	let factorExp: number | null = null;
	let labels: string[];
	if (e >= -4) {
		const d = Math.max(0, -e);
		labels = values.map((v) => (v === 0 ? '0' : fmtFixed(v, d)));
	} else {
		const top = Math.max(...values.map(Math.abs));
		factorExp = Math.floor(Math.log10(top) + 1e-9);
		const d = Math.max(0, factorExp - e);
		labels = values.map((v) => (v === 0 ? '0' : fmtFixed(v / 10 ** factorExp!, d)));
	}
	return { values, labels, factorExp, lo: values[0], hi: values[values.length - 1] };
}

/** L(p) 的縱軸：0 到最大值再多留 20%（山頂上面可以放字）；L 是機率，最多到 1 */
export function likAxis(k: number, n: number): Ticks {
	const top = likelihood(pHat(k, n), k, n);
	return linTicks(0, Math.min(1, top * 1.2), 4);
}

/** log L(p) 的縱軸：最下面看 p = 0.01 和 0.99 兩端比較低的那個（和本集 plot_likelihood.py 一樣畫 0.01 到 0.99），最上面是最大值 */
export function logAxis(k: number, n: number): Ticks {
	const ends = [logLikelihood(0.01, k, n), logLikelihood(0.99, k, n)];
	const lo = Math.min(...ends);
	const hi = logLikelihood(pHat(k, n), k, n);
	const span = hi - lo;
	// log L 最大是 0（L 最大是 1），刻度不超過 0
	return linTicks(lo - 0.02 * span, Math.min(0, hi + 0.1 * span), 4);
}

/** 畫 L(p) 用的點：p 從 0 到 1 共 count + 1 個（只畫線，用 Math.pow 就夠） */
export function likCurve(k: number, n: number, count = 300): [number, number][] {
	return Array.from({ length: count + 1 }, (_, i) => {
		const p = i / count;
		return [p, Math.pow(p, k) * Math.pow(1 - p, n - k)];
	});
}

/**
 * 畫 log L(p) 用的點：兩端再加幾個很靠近 0 和 1 的點，線才會一路掉到圖外（往 −∞）。
 * 值是 −∞ 的端點不畫；0 × ln 0 當成 0。
 */
export function logCurve(k: number, n: number, count = 300): [number, number][] {
	const ps = [0, 1e-6, 1e-4, 1e-3];
	for (let i = 1; i < count; i++) ps.push(i / count);
	ps.push(1 - 1e-3, 1 - 1e-4, 1 - 1e-6, 1);
	const out: [number, number][] = [];
	for (const p of ps) {
		let s = 0;
		if (k > 0) s += k * Math.log(p);
		if (n - k > 0) s += (n - k) * Math.log(1 - p);
		if (Number.isFinite(s)) out.push([p, s]);
	}
	return out;
}
