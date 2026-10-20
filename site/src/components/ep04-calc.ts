/**
 * EP04 互動元件（SecantTangentDemo、FiniteDiffErrorDemo）用到的計算、數字格式與畫圖的幾何。
 * 沒有用到 React，方便單獨測試。
 *
 * 所有數字都照本集的 Python 寫法用 float64 實際算：
 * 割線斜率是 (f(x₀ + h) − f(x₀)) / h，前向差分、中央差分也一樣，不先化簡公式，
 * 所以捨入誤差也和 Python 一樣出現在最後幾位（例如 x³ 在 2、h = 0.001 是 12.006000999997823）。
 */

// ---------- 數字格式：和 Python 的 f"{x:.6f}"、f"{x:.1e}" 一樣 ----------

/** 負號用數學的「−」（U+2212） */
const minus = (s: string) => s.replace('-', '−');

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

/**
 * |v| × 10^d 四捨五入成整數（d 可以是負的）。用 float64 的精確值計算，
 * 剛好在正中間時取偶數，和 Python 的格式化一樣。
 */
function roundScaled(absV: number, d: number): bigint {
	const { mant, exp } = toDyadic(absV);
	let num = mant;
	let den = BigInt(1);
	if (exp >= 0) num *= BigInt(2) ** BigInt(exp);
	else den = BigInt(2) ** BigInt(-exp);
	if (d >= 0) num *= BigInt(10) ** BigInt(d);
	else den *= BigInt(10) ** BigInt(-d);
	const q = num / den;
	const r2 = (num % den) * BigInt(2);
	if (r2 > den || (r2 === den && q % BigInt(2) === BigInt(1))) return q + BigInt(1);
	return q;
}

/**
 * 固定小數位數，和 Python 的 f"{v:.{digits}f}" 一樣（剛好在正中間時取偶數）。
 * 負號用「−」，而且不顯示「−0.000」。
 */
export function fmtFixed(v: number, digits: number): string {
	if (!Number.isFinite(v)) return String(v);
	const q = roundScaled(Math.abs(v), digits);
	let s = q.toString();
	if (digits > 0) {
		s = s.padStart(digits + 1, '0');
		s = `${s.slice(0, -digits)}.${s.slice(-digits)}`;
	}
	return q === BigInt(0) || v >= 0 ? s : `−${s}`;
}

/** 固定小數位數後去掉尾巴的 0：9.006001000 → 9.006001、9.000 → 9 */
export function fmtTrim(v: number, digits: number): string {
	let s = fmtFixed(v, digits);
	if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
	return s;
}

/**
 * 科學記號，有效數字 sig 位：回傳尾數與 10 的次方，和 Python 的 f"{v:.{sig - 1}e}" 一樣。
 * 例如 6.6e-09 → { mant: '6.6', exp: -9 }；0 → { mant: '0.0', exp: 0 }。
 */
export function sciParts(v: number, sig: number): { mant: string; exp: number } {
	const a = Math.abs(v);
	if (a === 0) return { mant: (0).toFixed(sig - 1), exp: 0 };
	let e = Math.floor(Math.log10(a));
	let q = roundScaled(a, sig - 1 - e);
	// log10 估的次方可能差 1；四捨五入後也可能進位成 10.0
	if (q.toString().length > sig) {
		e += 1;
		q = roundScaled(a, sig - 1 - e);
	} else if (q.toString().length < sig) {
		e -= 1;
		q = roundScaled(a, sig - 1 - e);
	}
	const s = q.toString();
	const mant = sig > 1 ? `${s[0]}.${s.slice(1)}` : s;
	return { mant: v < 0 ? `−${mant}` : mant, exp: e };
}

/** Python 的寫法：6.6e-09（測試用；畫面上改用 6.6 × 10⁻⁹） */
export function pySci(v: number, sig: number): string {
	const { mant, exp } = sciParts(v, sig);
	const sign = exp < 0 ? '-' : '+';
	return `${mant.replace('−', '-')}e${sign}${String(Math.abs(exp)).padStart(2, '0')}`;
}

/** h 這種「本來就是短小數」的數字：0.001、−0.5、2 */
export const fmtShort = (v: number) => minus(fmtTrim(v, 6));

/** 前面一樣的字數（逐字比較兩個格式化過的數字） */
export function commonPrefix(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return i;
}

/** 兩個寫成同樣小數位數的數字，前面有幾位數字一樣（不算小數點） */
export function sameDigits(a: string, b: string): number {
	return a.slice(0, commonPrefix(a, b)).replace(/[^0-9]/g, '').length;
}

// ---------- 割線與切線 ----------

export type FnKey = 'square' | 'cube' | 'exp';

export type View = { xMin: number; xMax: number; yMin: number; yMax: number };

export type FnDef = {
	key: FnKey;
	/** 按鈕上的名字（純文字，給 aria 用）：x²、x³、eˣ */
	label: string;
	f: (x: number) => number;
	/** 導數 f'(x)（照公式算） */
	df: (x: number) => number;
	/** 導數的公式（純文字）：2x、3x²、eˣ */
	dfText: string;
	x0Default: number;
	x0Min: number;
	x0Max: number;
	view: View;
	xTicks: number[];
	yTicks: number[];
	/** 格線的間隔 */
	xGrid: number;
	yGrid: number;
};

/**
 * x³，回傳最接近真正答案的 float64（和 Python 的 x ** 3 一樣）。
 *
 * 為什麼不直接寫 x ** 3 或 x * x * x：x * x * x 捨入兩次；瀏覽器的 ** 和 Python 的 ** 用不同的程式庫，
 * 最後一位有時會差一點點（例如 (−2 − 0.12) ** 3，瀏覽器是 −9.528128000000002，Python 是 −9.528128）。
 * x = m × 2^k（m 是整數），x³ = m³ × 2^(3k) 用 BigInt 精確算出來，最後才捨入一次。
 */
export function cube(x: number): number {
	if (x === 0 || !Number.isFinite(x)) return x * x * x;
	const { mant, exp } = toDyadic(Math.abs(x));
	const v = Number(mant * mant * mant) * 2 ** (3 * exp); // Number(BigInt) 捨入到最接近的 float64；乘 2 的次方沒有誤差
	return x < 0 ? -v : v;
}

/** h 的選項（正負號另外選）；拖動 Q 時 h 吸附到 0.01 */
export const H_CHOICES = [2, 1, 0.5, 0.1, 0.01, 0.001];
export const H_MAX = 2;
export const H_DRAG_STEP = 0.01;
export const X0_STEP = 0.1;

/**
 * 三個函數，和本集的 Python 一樣：x ** 2、x ** 3、np.exp(x)；導數照公式：2 * x、3 * x ** 2、np.exp(x)。
 * 座標範圍：x₀ 在範圍內、h 在 −2 到 2 之間時，P、Q 都在圖裡。
 */
export const FUNCS: Record<FnKey, FnDef> = {
	square: {
		key: 'square',
		label: 'x²',
		f: (x) => x * x, // 只捨入一次，和 Python 的 x ** 2 一樣
		df: (x) => 2 * x,
		dfText: '2x',
		x0Default: 3,
		x0Min: -3,
		x0Max: 3,
		view: { xMin: -5.5, xMax: 5.5, yMin: -4, yMax: 27 },
		xTicks: [-4, -2, 2, 4],
		yTicks: [10, 20],
		xGrid: 1,
		yGrid: 5,
	},
	cube: {
		key: 'cube',
		label: 'x³',
		f: cube,
		df: (x) => 3 * (x * x),
		dfText: '3x²',
		x0Default: 2,
		x0Min: -2,
		x0Max: 2,
		view: { xMin: -4.5, xMax: 4.5, yMin: -70, yMax: 70 },
		xTicks: [-4, -2, 2, 4],
		yTicks: [-60, -30, 30, 60],
		xGrid: 1,
		yGrid: 10,
	},
	exp: {
		key: 'exp',
		label: 'eˣ',
		f: (x) => Math.exp(x),
		df: (x) => Math.exp(x),
		dfText: 'eˣ',
		x0Default: 1,
		x0Min: -2,
		x0Max: 1,
		view: { xMin: -4.5, xMax: 3.5, yMin: -2.5, yMax: 21 },
		xTicks: [-4, -2, 2],
		yTicks: [10, 20],
		xGrid: 1,
		yGrid: 2,
	},
};

export const FN_ORDER: FnKey[] = ['square', 'cube', 'exp'];

export type Secant = {
	x0: number;
	h: number;
	/** Q 的 x：x₀ + h（和 Python 一樣直接相加） */
	xq: number;
	fx0: number;
	fxq: number;
	/** 上升：f(x₀ + h) − f(x₀) */
	rise: number;
	/** 割線斜率 (f(x₀ + h) − f(x₀)) / h */
	slope: number;
	/** 導數 f'(x₀) */
	deriv: number;
	/** 割線斜率 − 導數 */
	diff: number;
};

export function secant(fn: FnDef, x0: number, h: number): Secant {
	const xq = x0 + h;
	const fx0 = fn.f(x0);
	const fxq = fn.f(xq);
	const rise = fxq - fx0;
	const slope = rise / h;
	const deriv = fn.df(x0);
	return { x0, h, xq, fx0, fxq, rise, slope, deriv, diff: slope - deriv };
}

/** 吸附到 step 的倍數；用「整數 ÷ 10 的次方」得到最接近那個小數的 float64（例如 0.37，不是 0.37000000000000005） */
export function snapTo(v: number, step: number): number {
	const k = Math.round(1 / step);
	return Math.round(v * k) / k + 0;
}

/** 限制 x₀ 在函數的範圍內，並吸附到 0.1 */
export const clampX0 = (fn: FnDef, x: number) => Math.min(fn.x0Max, Math.max(fn.x0Min, snapTo(x, X0_STEP)));

/**
 * 拖動 Q 到 x：h = x − x₀ 吸附到 0.01，0.01 ≤ |h| ≤ 2（h 不能是 0）。
 * 拖到 P 的正上方時，保留原本的正負號。
 */
export function dragH(x0: number, x: number, prevSign: 1 | -1): number {
	let h = snapTo(x - x0, H_DRAG_STEP);
	if (h === 0) h = prevSign * H_DRAG_STEP;
	return Math.max(-H_MAX, Math.min(H_MAX, h));
}

/** 切線的透明度：開關打開時是 1；否則 |h| ≥ 0.5 時看不到，|h| ≤ 0.05 時完全顯示，中間照 log|h| 淡入 */
export function tangentOpacity(h: number, always: boolean): number {
	if (always) return 1;
	const a = Math.abs(h);
	const hi = Math.log10(0.5);
	const lo = Math.log10(0.05);
	const t = (hi - Math.log10(a)) / (hi - lo);
	return Math.min(1, Math.max(0, t));
}

/** 顯示 f 值要幾位小數：割線斜率顯示 6 位，h 越小分子要越多位，除以 h 之後才夠 6 位 */
export const fDigits = (h: number) => 6 + Math.max(0, Math.ceil(-Math.log10(Math.abs(h)) - 1e-9));

/** 曲線上取點（數學座標） */
export function curvePoints(fn: FnDef, count = 240): [number, number][] {
	const { xMin, xMax } = fn.view;
	return Array.from({ length: count + 1 }, (_, i) => {
		const x = xMin + ((xMax - xMin) * i) / count;
		return [x, fn.f(x)];
	});
}

/**
 * 通過 (px, py)、斜率 m 的直線，切到 view 的範圍裡（數學座標）。回傳兩個端點；碰不到範圍時回傳 null。
 * （Liang–Barsky：沿著直線參數 t 走，x、y 各自限制在範圍內）
 */
export function clipLine(px: number, py: number, m: number, v: View): [[number, number], [number, number]] | null {
	const len = Math.hypot(1, m);
	const dx = 1 / len;
	const dy = m / len;
	let t0 = -Infinity;
	let t1 = Infinity;
	const limit = (p: number, d: number, lo: number, hi: number) => {
		if (Math.abs(d) < 1e-12) return p >= lo && p <= hi;
		const a = (lo - p) / d;
		const b = (hi - p) / d;
		t0 = Math.max(t0, Math.min(a, b));
		t1 = Math.min(t1, Math.max(a, b));
		return true;
	};
	if (!limit(px, dx, v.xMin, v.xMax) || !limit(py, dy, v.yMin, v.yMax) || t0 > t1) return null;
	return [
		[px + t0 * dx, py + t0 * dy],
		[px + t1 * dx, py + t1 * dy],
	];
}

// ---------- h 與數值導數的誤差（弄壞它 2：eˣ 在 x = 1，真值 e） ----------

export const FD_X = 1;
/** 真值 e（和 Python 的 np.e、math.e 是同一個 float64） */
export const FD_TRUE = Math.E;
/** h 的範圍：10⁻¹⁵ 到 10⁻¹ */
export const FD_K_MIN = -15;
export const FD_K_MAX = -1;
/** 誤差軸的範圍：10⁻¹⁶ 到 10⁰ */
export const FD_E_MIN = -16;
export const FD_E_MAX = 0;

/** h = 10^k，用和 Python 字面值 1e-8 一樣的 float64 */
export const decadeH = (k: number) => Number(`1e${k}`);

export const forwardDiff = (h: number, x = FD_X) => (Math.exp(x + h) - Math.exp(x)) / h;
export const centralDiff = (h: number, x = FD_X) => (Math.exp(x + h) - Math.exp(x - h)) / (2 * h);

export type FdPoint = { k: number; h: number; fw: number; ce: number; fwErr: number; ceErr: number };

export function fdPoint(k: number, h = 10 ** k): FdPoint {
	const fw = forwardDiff(h);
	const ce = centralDiff(h);
	return { k, h, fw, ce, fwErr: Math.abs(fw - FD_TRUE), ceErr: Math.abs(ce - FD_TRUE) };
}

/**
 * 畫線用的點：10 的次方從 −15 到 −1，每 0.1 一個（和弄壞它 2 的 np.logspace(-15, -1, 141) 一樣密）。
 * 整數次方的點直接用字面值 1e-8（和滑桿選的點完全相同），畫出來的點才會剛好落在線上。
 */
export function fdCurve(perDecade = 10): FdPoint[] {
	const n = (FD_K_MAX - FD_K_MIN) * perDecade;
	return Array.from({ length: n + 1 }, (_, i) => {
		const k = FD_K_MIN + i / perDecade;
		return i % perDecade === 0 ? fdPoint(Math.round(k), decadeH(Math.round(k))) : fdPoint(k);
	});
}

/** 滑桿上的格點：10⁻¹⁵、10⁻¹⁴、…、10⁻¹ */
export const fdDecades = (): FdPoint[] => Array.from({ length: FD_K_MAX - FD_K_MIN + 1 }, (_, i) => fdPoint(FD_K_MIN + i, decadeH(FD_K_MIN + i)));

/** 格點裡誤差最小的那一個（V 字的谷底） */
export function bestDecade(points: FdPoint[], which: 'fw' | 'ce'): FdPoint {
	const key = which === 'fw' ? 'fwErr' : 'ceErr';
	return points.reduce((best, p) => (p[key] < best[key] ? p : best));
}

/** 誤差的 log10；誤差剛好是 0 時（算出來和 e 一模一樣）回傳 null */
export const logErr = (e: number) => (e > 0 ? Math.log10(e) : null);

// ---------- 畫圖的幾何（畫面座標，y 往下） ----------

export type Pads = { l: number; r: number; t: number; b: number };

export type Frame = {
	width: number;
	height: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
	sx: (x: number) => number;
	sy: (y: number) => number;
	/** 畫面的 x → 數學的 x */
	fromX: (px: number) => number;
};

/** 長方形繪圖區：兩軸各自縮放（不同比例） */
export function plotFrame(width: number, height: number, v: View, pads: Pads): Frame {
	const left = pads.l;
	const right = width - pads.r;
	const top = pads.t;
	const bottom = height - pads.b;
	const kx = (right - left) / (v.xMax - v.xMin);
	const ky = (bottom - top) / (v.yMax - v.yMin);
	return {
		width,
		height,
		left,
		right,
		top,
		bottom,
		sx: (x) => left + (x - v.xMin) * kx,
		sy: (y) => top + (v.yMax - y) * ky,
		fromX: (px) => v.xMin + (px - left) / kx,
	};
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 一串點 → SVG path（畫面座標）；y 超出很多時夾住，避免很大的座標 */
export function toPath(points: [number, number][], f: Frame): string {
	const lo = f.top - 2 * f.height;
	const hi = f.bottom + 2 * f.height;
	return points
		.map(([x, y], i) => {
			const py = Math.min(hi, Math.max(lo, f.sy(y)));
			return `${i === 0 ? 'M' : 'L'}${r2(f.sx(x))} ${r2(py)}`;
		})
		.join(' ');
}

// ---------- 標籤的位置：避開彼此和重要的點 ----------

/** 長方形範圍（畫面座標） */
export type Box = { x0: number; y0: number; x1: number; y1: number };
/** 文字的位置（SVG 的 x、y、text-anchor；垂直方向置中） */
export type Spot = { x: number; y: number; anchor: 'start' | 'middle' | 'end' };

/** 估計文字寬度（px）：中文與全形字約 1 個字高，其他約 0.6 個字高 */
export function textWidth(text: string, px: number): number {
	let w = 0;
	for (const ch of text) w += /[⺀-鿿豈-￯]/.test(ch) ? px : 0.6 * px;
	return w;
}

export function spotBox(s: Spot, w: number, h: number): Box {
	const x0 = s.anchor === 'start' ? s.x : s.anchor === 'end' ? s.x - w : s.x - w / 2;
	return { x0, y0: s.y - h / 2, x1: x0 + w, y1: s.y + h / 2 };
}

export const pointBox = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

/** 線段 p → q：沿線每隔 r px 放一個半徑 r 的小方塊，讓標籤避開這條線 */
export function segmentBoxes(p: [number, number], q: [number, number], r: number): Box[] {
	const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
	const n = Math.max(1, Math.ceil(len / r));
	return Array.from({ length: n + 1 }, (_, i) => pointBox(p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n, r));
}

/** 折線（畫面座標）每一段都變成小方塊 */
export function polylineBoxes(pts: [number, number][], r: number): Box[] {
	const out: Box[] = [];
	for (let i = 1; i < pts.length; i++) out.push(...segmentBoxes(pts[i - 1], pts[i], r));
	return out;
}

const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const inside = (a: Box, b: Box) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;

/**
 * 在完全落在 bounds 裡的候選位置中，選和 avoid 重疊面積最小的；一樣小時選排在前面的。
 * 沒有候選位置在 bounds 裡時用第一個。
 */
export function placeLabel(cands: Spot[], w: number, h: number, avoid: Box[], bounds: Box): { spot: Spot; box: Box } {
	const boxes = cands.map((c) => spotBox(c, w, h));
	let pick = -1;
	let best = Infinity;
	boxes.forEach((b, i) => {
		if (!inside(b, bounds)) return;
		const cost = avoid.reduce((sum, a) => sum + overlapArea(a, b), 0);
		if (cost < best - 1e-9) {
			pick = i;
			best = cost;
		}
	});
	if (pick < 0) pick = 0;
	return { spot: cands[pick], box: boxes[pick] };
}

/** 圍著一個點的 8 個候選位置（右上、左上、右下、左下、右、左、上、下），離點 d px */
export function around(x: number, y: number, d: number): Spot[] {
	const k = d * 0.75;
	return [
		{ x: x + k, y: y - k, anchor: 'start' },
		{ x: x - k, y: y - k, anchor: 'end' },
		{ x: x + k, y: y + k, anchor: 'start' },
		{ x: x - k, y: y + k, anchor: 'end' },
		{ x: x + d, y, anchor: 'start' },
		{ x: x - d, y, anchor: 'end' },
		{ x, y: y - d, anchor: 'middle' },
		{ x, y: y + d, anchor: 'middle' },
	];
}
