/**
 * EP05 互動元件（ChainMachinesDemo、VanishingGradientDemo）用到的計算與數字格式。
 * 沒有用到 React，方便單獨測試。
 *
 * 數字照本集的 Python 寫法用 float64 實際算，而且和 Python／NumPy 逐位相同：
 * - x ** 2 寫成 x * x（只捨入一次，和 Python 一樣）；
 * - u ** 3、r ** n 用 BigInt 精確算完才捨入一次（瀏覽器的 ** 最後一位有時和 Python 不同，
 *   例如 0.55 ** 4，瀏覽器是 0.09150625000000004，Python 是 0.09150625000000003）；
 * - np.log 也用 BigInt 算到 200 位二進位再捨入（瀏覽器的 Math.log 偶爾差最後一位，
 *   中央差分要除以很小的 2h，最後一位的差別會被放大到小數點後第 11 位）。
 */
import { fmtFixed, fmtTrim, sciParts } from './ep04-calc.ts';

export { fmtFixed, fmtTrim, sciParts };

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
 * n 太長時先截到 64 位，截掉的部分只要不是 0 就在最低位補 1（sticky bit），再交給 Number() 捨入，
 * 結果和直接捨入一樣。本集的數字都在 10⁻³¹ 到 10¹⁸ 之間，不會碰到次正規數。
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
	// 2 ** e 太大或太小時分兩次乘，避免中間變成 0 或 Infinity
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

/** b 的 n 次方（n 是非負整數），回傳最接近真正答案的 float64，和 Python 的 b ** n 一樣 */
export function powExact(b: number, n: number): number {
	if (n === 0) return 1;
	if (b === 0 || !Number.isFinite(b)) return b ** n;
	const { mant, exp } = toDyadic(Math.abs(b));
	const v = roundDyadic(mant ** BigInt(n), exp * n);
	return b < 0 && n % 2 === 1 ? -v : v;
}

// ---------- 精確的自然對數 ----------

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

/**
 * 自然對數 ln v（v > 0），回傳最接近真正答案的 float64，和 np.log 一樣。
 * v = m × 2^k，m 在 √½ 到 √2 之間；ln v = k · ln 2 + ln m，ln m = 2 · atanh((m − 1)/(m + 1))。
 */
export function lnExact(v: number): number {
	if (!(v > 0) || !Number.isFinite(v)) return Math.log(v);
	if (v === 1) return 0;
	const { mant, exp } = toDyadic(v);
	const len = bitLength(mant);
	let k = exp + len - 1;
	let m = mant << BigInt(P - (len - 1)); // m / 2^P 在 1 到 2 之間
	if (m * m > ONE * ONE * BigInt(2)) {
		m >>= B1; // m 比 √2 大：除以 2（m 的最低位都是 0，不會損失）
		k += 1;
	}
	const s = ((m - ONE) << BP) / (m + ONE);
	return roundDyadic(BigInt(k) * LN2 + twoAtanh(s), -P);
}

// ---------- 數字格式 ----------

/**
 * 四捨五入到 digits 位小數、去掉尾巴的 0，並說明是不是「剛好」（四捨五入前後一樣，只差 float64 的捨入）。
 * 例如 2.6900000000000004 → { text: '2.69', exact: true }；2.0794415416798357 → { text: '2.079', exact: false }。
 */
export function numText(v: number, digits: number): { text: string; exact: boolean } {
	const text = fmtTrim(v, digits);
	const back = Number(text.replace('−', '-'));
	return { text, exact: Math.abs(back - v) <= 1e-9 * Math.max(1, Math.abs(v)) };
}

/** 有效數字 sig 位（去掉尾巴的 0）：0.05137397… → 0.05137、0.125 → 0.125、1 → 1 */
export function sigText(v: number, sig: number): { text: string; exact: boolean } {
	if (v === 0) return { text: '0', exact: true };
	const e = Math.floor(Math.log10(Math.abs(v)));
	return numText(v, Math.max(0, sig - 1 - e));
}

/** 乘法裡的負數加括號：−0.5 → (−0.5) */
export const paren = (s: string) => (s.startsWith('−') ? `(${s})` : s);

// ---------- 三台機器：y = ln((x² + 1)³) ----------

export const X_MIN = -2;
export const X_MAX = 2;
export const X_STEP = 0.1;
export const X_DEFAULT = 1;
/** 數值導數的 h（EP04 的 numerical_derivative 預設值） */
export const ND_H = 1e-5;

/** 吸附到 0.1 的倍數並限制在 −2 到 2；用「整數 ÷ 10」得到和 Python 字面值一樣的 float64（1.3，不是 1.3000000000000003） */
export function snapX(v: number): number {
	const k = Math.max(Math.round(X_MIN * 10), Math.min(Math.round(X_MAX * 10), Math.round(v * 10)));
	return k / 10 + 0;
}

/** 整個函數，和本集的 Python 一樣：np.log((t ** 2 + 1) ** 3) */
export const chainF = (t: number) => lnExact(powExact(t * t + 1, 3));

/** 中央差分，和 EP04 的 nd 一樣：(f(x + h) − f(x − h)) / (2h) */
export const centralDiff = (f: (t: number) => number, x: number, h = ND_H) => (f(x + h) - f(x - h)) / (2 * h);

export type Chain = {
	x: number;
	/** 第 1 台的輸出 u = x² + 1 */
	u: number;
	/** 第 2 台的輸出 v = u³ */
	v: number;
	/** 第 3 台的輸出 y = ln v */
	y: number;
	/** 三個局部導數：2x、3u²、1/v（各自在自己的輸入那一點算） */
	local: [number, number, number];
	/** 局部導數相乘 = dy/dx（和 np.prod(local) 一樣，從左乘到右） */
	prod: number;
	/** 錯誤版本：外層的導數都在 x 算：2x、3x²、1/x（x = 0 時 1/x 算不出來，是 null） */
	wrongLocal: [number, number, number | null];
	/** 錯誤版本的乘積（x = 0 時算不出來，是 null） */
	wrongProd: number | null;
	/** 數值導數（中央差分，h = 1e-5） */
	nd: number;
};

export function chain(x: number): Chain {
	const u = x * x + 1;
	const v = powExact(u, 3);
	const y = lnExact(v);
	const local: [number, number, number] = [2 * x, 3 * (u * u), 1 / v];
	const prod = local[0] * local[1] * local[2];
	const w3 = x === 0 ? null : 1 / x;
	const wrongLocal: [number, number, number | null] = [2 * x, 3 * (x * x), w3];
	const wrongProd = w3 === null ? null : wrongLocal[0] * wrongLocal[1] * w3;
	return { x, u, v, y, local, prod, wrongLocal, wrongProd, nd: centralDiff(chainF, x) };
}

/** 機器上顯示的數字（位數固定；四捨五入過的另外標出來，畫面上用「≈」） */
export type ChainText = {
	x: string;
	u: string;
	/** v 最多六位小數，畫面上取三位（四捨五入過的用 ≈） */
	v: { text: string; exact: boolean };
	y: { text: string; exact: boolean };
	local: { text: string; exact: boolean }[];
	prod: { text: string; exact: boolean };
	wrongLocal: ({ text: string; exact: boolean } | null)[];
	wrongProd: { text: string; exact: boolean } | null;
};

/**
 * x 一位小數；u = x² + 1 最多兩位（剛好，不用四捨五入）；v = u³ 與 y 三位。
 * 局部導數：2x 一位、3u² 最多四位（剛好）、1/v 四位有效數字；乘積四位小數。
 */
export function chainText(c: Chain): ChainText {
	const wl = c.wrongLocal;
	return {
		x: fmtTrim(c.x, 1),
		u: fmtTrim(c.u, 2),
		v: numText(c.v, 3),
		y: numText(c.y, 3),
		local: [numText(c.local[0], 1), numText(c.local[1], 4), sigText(c.local[2], 4)],
		prod: numText(c.prod, 4),
		wrongLocal: [numText(wl[0], 1), numText(wl[1], 2), wl[2] === null ? null : sigText(wl[2], 4)],
		wrongProd: c.wrongProd === null ? null : numText(c.wrongProd, 4),
	};
}

/** 比對用的長位數：小數點後 12 位 */
export const CMP_DIGITS = 12;

/**
 * 錯誤版本和正確答案差幾倍（倍數取 3 位有效數字）。
 * - 'sign'：正負號都錯了
 * - 'times'：錯誤版本是正確答案的 ratio 倍（ratio 可能小於 1）
 * x = 0 時錯誤版本算不出來，回傳 null。
 */
export type WrongCompare = { kind: 'sign' } | { kind: 'times'; ratio: number; text: string; exact: boolean };

export function wrongCompare(c: Chain): WrongCompare | null {
	if (c.wrongProd === null || c.prod === 0) return null;
	if (Math.sign(c.wrongProd) !== Math.sign(c.prod)) return { kind: 'sign' };
	const ratio = c.wrongProd / c.prod;
	return { kind: 'times', ratio, ...sigText(ratio, 3) };
}

// ---------- 很多層一路相乘：梯度消失與爆炸 ----------

export const R_MIN = 0.5;
export const R_MAX = 1.5;
export const R_STEP = 0.05;
export const R_DEFAULT = 0.9;
export const N_MIN = 1;
export const N_MAX = 100;
export const N_DEFAULT = 50;
/** 對數刻度的範圍：10⁻²⁰ 到 10¹⁰ */
export const LOG_MIN = -20;
export const LOG_MAX = 10;
/** 交替相乘的兩個數 */
export const ALT: [number, number] = [0.5, 1.5];

/** 吸附到 0.05 的倍數並限制在 0.5 到 1.5；用「整數 ÷ 20」得到和 Python 字面值一樣的 float64（0.85，不是 0.8500000000000001） */
export function snapR(v: number): number {
	const k = Math.max(Math.round(R_MIN * 20), Math.min(Math.round(R_MAX * 20), Math.round(v * 20)));
	return k / 20;
}

export const clampN = (n: number) => Math.max(N_MIN, Math.min(N_MAX, Math.round(n)));

/** 每層都乘 r，n 層：r ** n（和 Python 一樣） */
export const rPow = (r: number, n: number) => powExact(r, n);

/** 一半 0.5、一半 1.5 交替的 n 個數：[0.5, 1.5, 0.5, …]（n 是奇數時多一個 0.5） */
export const altFactors = (n: number) => Array.from({ length: n }, (_, i) => ALT[i % 2]);

/** 交替的乘積，從左乘到右（和 np.prod([0.5, 1.5] * 25) 一樣） */
export function altProd(n: number): number {
	let p = 1;
	for (const f of altFactors(n)) p *= f;
	return p;
}

/** 畫線用：第 0 層到第 n 層，每一層連乘結果的 log10（第 0 層是 1） */
export function seriesLog10(r: number, n: number): number[] {
	const lr = Math.log10(r);
	return Array.from({ length: n + 1 }, (_, k) => k * lr);
}

export function altSeriesLog10(n: number): number[] {
	const out = [0];
	let s = 0;
	for (const f of altFactors(n)) {
		s += Math.log10(f);
		out.push(s);
	}
	return out;
}

export type Regime = 'vanish' | 'explode' | 'same';
export const regimeOf = (product: number): Regime => (product < 1 ? 'vanish' : product > 1 ? 'explode' : 'same');

/**
 * 連乘結果的寫法：太小（< 0.001）或太大（≥ 10000）用科學記號，有效數字 3 位；
 * 其他寫成小數：100 以上留一位小數（117.4），其他 3 位有效數字（0.00515）；四捨五入前後一樣的數去掉尾巴的 0（1.5、0.125、1）。
 * 和 Python 的 f"{v:.2e}"、f"{v:.{d}f}" 一樣（剛好在正中間時取偶數）。
 */
export type ProductText = { kind: 'plain'; text: string } | { kind: 'sci'; mant: string; exp: number };

export function productText(v: number): ProductText {
	if (v === 1) return { kind: 'plain', text: '1' };
	const a = Math.abs(v);
	if (a < 1e-3 || a >= 1e4) {
		const { mant, exp } = sciParts(v, 3);
		// 四捨五入後剛好進位到 10000（例如 9999.6 → 1.00e+04）也用科學記號，不會出現矛盾
		return { kind: 'sci', mant, exp };
	}
	const e = Math.floor(Math.log10(a));
	const digits = a >= 100 ? 1 : Math.max(0, 2 - e);
	// 0.000999… 四捨五入成 0.00100：還是 3 位有效數字，可以照用。
	// 剛好的數（例如 1.5¹ = 1.5、0.5³ = 0.125）去掉尾巴的 0，不寫成 1.50
	const { text, exact } = numText(v, digits);
	return { kind: 'plain', text: exact ? text : fmtFixed(v, digits) };
}

/** 測試與螢幕閱讀器用的純文字：8.88 × 10^-16 → '8.88e-16'，plain 照原樣 */
export function productPlain(p: ProductText): string {
	if (p.kind === 'plain') return p.text;
	return `${p.mant.replace('−', '-')}e${p.exp < 0 ? '-' : '+'}${String(Math.abs(p.exp)).padStart(2, '0')}`;
}

/** r 的寫法：0.9、0.85、1、1.5 */
export const fmtR = (r: number) => fmtTrim(r, 2);

/** 最接近的 10 的次方之間的格線：每一大格乘 10 */
export const decades = (lo = LOG_MIN, hi = LOG_MAX) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/** x 軸（層數）的刻度間隔：讓刻度不超過 maxTicks 個 */
export function layerTickStep(n: number, maxTicks: number): number {
	for (const s of [1, 2, 5, 10, 20, 25, 50]) if (n / s <= maxTicks) return s;
	return 50;
}

/**
 * log10 的折線碰到上下邊界（預設 LOG_MIN、LOG_MAX）的地方：回傳第一個超出的位置（層數可以是小數）與方向。
 * 都在範圍內時回傳 null。
 */
export function exitPoint(logs: number[], lo = LOG_MIN, hi = LOG_MAX): { k: number; edge: 'top' | 'bottom' } | null {
	for (let k = 1; k < logs.length; k++) {
		const a = logs[k - 1];
		const b = logs[k];
		if (b > hi) return { k: k - 1 + (hi - a) / (b - a), edge: 'top' };
		if (b < lo) return { k: k - 1 + (lo - a) / (b - a), edge: 'bottom' };
	}
	return null;
}

/** 顯示的文字是不是剛好等於這個數（例如 0.5³ = 0.125 是剛好；0.9⁵⁰ 寫成 0.00515 是四捨五入過的） */
export function productExact(v: number, p: ProductText): boolean {
	const back = p.kind === 'plain' ? Number(p.text.replace('−', '-')) : Number(`${p.mant.replace('−', '-')}e${p.exp}`);
	return Math.abs(back - v) <= 1e-12 * Math.abs(v);
}

