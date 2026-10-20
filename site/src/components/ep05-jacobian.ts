/**
 * EP05 互動元件（JacobianWarpDemo、MultiplyOrderCostDemo）用到的計算、數字格式與畫圖的幾何。
 * 沒有用到 React，方便單獨測試。數字格式（fmtFixed、科學記號）與標籤擺放沿用 EP04 的 ep04-calc.ts，
 * 兩軸同比例的座標圖沿用 ep04-grad.ts 的 viewFrame。
 *
 * JacobianWarpDemo：本集工具三的 F(x, y) = (x² − y, xy)，Jacobian J = [[2x, −1], [y, x]]。
 * p 吸附到 0.1 的格點；正方形邊界的點和本集 square_outline 的取法一樣（每邊 50 個、最後接回起點）。
 *
 * MultiplyOrderCostDemo：寬度 d、層數 L 的乘法次數。最大是 47 × 4096³ + 4096² ≈ 3.2 × 10¹²，
 * 比 2⁵³ ≈ 9 × 10¹⁵ 小得多，JS 的 number 也是精確的整數；這裡仍用 BigInt 算，數字一定精確。
 */
import { fmtFixed, sciParts } from './ep04-calc.ts';

export { fmtFixed, fmtTrim, placeLabel, plotFrame, pointBox, polylineBoxes, segmentBoxes, sciParts, spotBox, textWidth } from './ep04-calc.ts';
export type { Box, Frame, Spot, View } from './ep04-calc.ts';
export { overlapCost, polylinePath, viewFrame, type ViewFrame } from './ep04-grad.ts';

export type Vec = [number, number];
/** 2 × 2 矩陣，一列一列寫：[[第 1 列], [第 2 列]] */
export type Mat = [[number, number], [number, number]];

// ---------- JacobianWarpDemo：F(x, y) = (x² − y, xy) ----------

/** F(x, y) = (x² − y, xy)：和 Python 的 x ** 2 - y、x * y 同樣的運算 */
export const F = (v: Vec): Vec => [v[0] * v[0] - v[1] + 0, v[0] * v[1] + 0];

/** J = [[∂(x² − y)/∂x, ∂(x² − y)/∂y], [∂(xy)/∂x, ∂(xy)/∂y]] = [[2x, −1], [y, x]] */
export const jacobian = (v: Vec): Mat => [
	[2 * v[0] + 0, -1],
	[v[1] + 0, v[0] + 0],
];

/** p 吸附到 0.1 的格點 */
export const P_STEP = 0.1;
/** p 的範圍：x、y 都是 −2.5 到 2.5 */
export const P_LIM = 2.5;
export const P_START: Vec = [1, 2];
/** 左圖（輸入平面）兩軸都從 −3 畫到 3：p 在範圍內時，邊長 1 的正方形也放得進去 */
export const IN_HALF = 3;
/** 正方形邊長的選項 */
export const SIDES = [1, 0.4, 0.1, 0.05];
export const SIDE_START = 1;
/** 正方形每邊取幾個點（和本集 square_outline 的 n = 50 一樣，共 200 點、最後接回起點） */
export const OUTLINE_N = 50;

export const WARP_PRESETS: { p: Vec; label: string; aria: string }[] = [
	{ p: [1, 2], label: '(1, 2)', aria: 'p = (1, 2)，本集的例子' },
	{ p: [-1.5, 1], label: '(−1.5, 1)', aria: 'p = (−1.5, 1)' },
	{ p: [2, -0.5], label: '(2, −0.5)', aria: 'p = (2, −0.5)' },
	{ p: [1, -2], label: '(1, −2)', aria: 'p = (1, −2)，J 的兩欄在同一條直線上' },
];

/** 吸附到 0.1 的格點，再限制在 −lim 到 lim 之間；用「整數 ÷ 10」得到最接近那個小數的 float64（不會出現 −0） */
export function snapTenth(v: number, lim = P_LIM): number {
	const k = Math.round(v * 10);
	const kl = Math.round(lim * 10);
	return Math.min(kl, Math.max(-kl, k)) / 10 + 0;
}

export const snapP = (v: Vec): Vec => [snapTenth(v[0]), snapTenth(v[1])];

export const vecEq = (u: Vec, v: Vec) => u[0] === v[0] && u[1] === v[1];

/**
 * 以 center 為中心、邊長 side 的正方形邊界：四個角是 center + (±a, ±a)（a 是邊長的一半），
 * 從左下角開始逆時針排；每條邊用 np.linspace(0, 1, n, endpoint=False) 取 n 個點，最後接回起點，共 4n + 1 個點。
 */
export function squareOutline(center: Vec, side: number, n = OUTLINE_N): Vec[] {
	const a = side / 2;
	const [cx, cy] = center;
	const corners: Vec[] = [
		[cx - a, cy - a],
		[cx + a, cy - a],
		[cx + a, cy + a],
		[cx - a, cy + a],
	];
	const step = 1 / n;
	const pts: Vec[] = [];
	for (let k = 0; k < 4; k++) {
		const c0 = corners[k];
		const c1 = corners[(k + 1) % 4];
		const dx = c1[0] - c0[0];
		const dy = c1[1] - c0[1];
		for (let i = 0; i < n; i++) {
			const t = i * step;
			pts.push([c0[0] + t * dx, c0[1] + t * dy]);
		}
	}
	pts.push(pts[0]);
	return pts;
}

export type Warp = {
	p: Vec;
	side: number;
	fp: Vec;
	J: Mat;
	/** 正方形邊界上的點 q */
	outline: Vec[];
	/** F(q)：F 把正方形邊界變成的形狀 */
	curve: Vec[];
	/** F(p) + J (q − p)：Jacobian 預測的平行四邊形 */
	para: Vec[];
	/** 每個 q 的 F(q) 和 F(p) + J (q − p) 的距離 */
	errs: number[];
	/** 最大距離 */
	maxErr: number;
	/** 最大距離在哪一個點（一樣大時取第一個：左下角） */
	worst: number;
	/** 最大距離 ÷ 邊長 */
	ratio: number;
	/** J 的兩欄在同一條直線上（平行四邊形被壓扁成一條線段） */
	flat: boolean;
};

/**
 * 和 NumPy 的寫法一樣：curve = F(outline)，para = F(p)[:, None] + J @ (outline − p[:, None])，
 * 距離 np.linalg.norm(curve − para, axis=0)（每一點 √(dx² + dy²)）。
 */
export function warpInfo(p: Vec, side: number): Warp {
	const fp = F(p);
	const J = jacobian(p);
	const outline = squareOutline(p, side);
	const curve: Vec[] = [];
	const para: Vec[] = [];
	const errs: number[] = [];
	let maxErr = 0;
	for (const q of outline) {
		const c = F(q);
		const d0 = q[0] - p[0];
		const d1 = q[1] - p[1];
		const l: Vec = [fp[0] + (J[0][0] * d0 + J[0][1] * d1), fp[1] + (J[1][0] * d0 + J[1][1] * d1)];
		const ex = c[0] - l[0];
		const ey = c[1] - l[1];
		const e = Math.sqrt(ex * ex + ey * ey);
		curve.push(c);
		para.push(l);
		errs.push(e);
		if (e > maxErr) maxErr = e;
	}
	const worst = errs.findIndex((e) => e >= maxErr * (1 - 1e-9));
	// 兩欄在同一條直線上：2x · x − (−1) · y = 2x² + y = 0。x = i / 10、y = j / 10，換成整數 i² + 5j = 0 判斷，沒有捨入誤差
	const i = Math.round(p[0] * 10);
	const j = Math.round(p[1] * 10);
	return { p, side, fp, J, outline, curve, para, errs, maxErr, worst, ratio: maxErr / side, flat: i * i + 5 * j === 0 };
}

/** 一串點裡，離 center 最遠的距離（x、y 各自算，取大的）：決定右圖要放大多少 */
export function extentAround(center: Vec, ...lists: Vec[][]): number {
	let m = 0;
	for (const pts of lists) for (const [x, y] of pts) m = Math.max(m, Math.abs(x - center[0]), Math.abs(y - center[1]));
	return m;
}

/** 右圖的範圍取這些「好看的數」× 10 的次方：拖動 p 時範圍只在這些數之間跳，格線不會一直變 */
const NICE_HALF = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/** m × 10^e，用「整數 ÷ 10 的次方」得到最接近那個小數的 float64（例如 0.12，不是 0.12000000000000001） */
function scaled(m10: number, e: number): number {
	// m10 是 m × 10 的整數
	const k = e - 1;
	return k >= 0 ? m10 * 10 ** k : m10 / 10 ** -k;
}

/** 大於等於 v 的最小「好看的數」 */
export function niceHalf(v: number): number {
	let e = Math.floor(Math.log10(v));
	for (let tries = 0; tries < 3; tries++) {
		for (const m of NICE_HALF) {
			const h = scaled(Math.round(m * 10), e);
			if (h >= v * (1 - 1e-12)) return h;
		}
		e += 1;
	}
	return v;
}

/** 右圖往四邊各畫多少：最遠的點再留一點空間 */
export const OUT_MARGIN = 1.15;
export const outHalf = (w: Warp) => niceHalf(extentAround(w.fp, w.curve, w.para) * OUT_MARGIN);

export type Ticks = { step: number; decimals: number; values: number[] };

/** 格線的間隔：1、2、5 × 10 的次方裡，讓 lo 到 hi 之間大約有 5 格的那一個 */
export function niceTicks(lo: number, hi: number, target = 5): Ticks {
	const span = hi - lo;
	let best = { m: 1, e: 0, cost: Infinity };
	const e0 = Math.floor(Math.log10(span / target));
	for (let e = e0 - 1; e <= e0 + 1; e++) {
		for (const m of [1, 2, 5]) {
			const step = m * 10 ** e;
			const cost = Math.abs(span / step - target);
			if (cost < best.cost - 1e-9) best = { m, e, cost };
		}
	}
	const decimals = Math.max(0, -best.e);
	// 第 k 條格線在 k × m × 10^e：小數部分用「整數 ÷ 10 的次方」算
	const at = (k: number) => (best.e >= 0 ? k * best.m * 10 ** best.e : (k * best.m) / 10 ** -best.e);
	const values: number[] = [];
	const step = at(1);
	for (let k = Math.ceil(lo / step - 1e-9); at(k) <= hi + 1e-9 * step; k++) values.push(at(k) + 0);
	return { step, decimals, values };
}

// ---------- 數字格式 ----------

/** 沒有尾巴的短小數：x、y 是 0.1 的倍數，2x、x² − y、xy 最多 2 位小數。去掉尾巴的 0，−0 寫成 0 */
export function fmtShort(v: number, digits = 2): string {
	let s = fmtFixed(v, digits);
	if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
	return s === '−0' ? '0' : s;
}

/** 給 <input> 用的寫法：負號用一般的「-」 */
export const fmtInput = (v: number) => fmtShort(v, 1).replace('−', '-');

/** 乘法、減法裡的負數加括號：−0.5 → (−0.5) */
export const paren = (s: string) => (s.startsWith('−') ? `(${s})` : s);

/**
 * 有效數字 sig 位的一般小數（不用科學記號）：0.35355… → 0.354、0.00088388… → 0.000884。
 * 和 Python 的 f"{v:.{d}f}"（d = sig − 1 − 10 的次方）一樣。
 */
export function fmtSig(v: number, sig = 3): string {
	if (v === 0) return '0';
	const { exp } = sciParts(v, sig);
	return fmtFixed(v, Math.max(0, sig - 1 - exp));
}

// ---------- MultiplyOrderCostDemo：兩種乘法順序的成本 ----------

export const WIDTH_CHOICES = [2, 8, 64, 256, 896, 4096];
export const WIDTH_MIN = 2;
export const WIDTH_MAX = 4096;
export const WIDTH_START = 896;
export const DEPTH_MIN = 1;
export const DEPTH_MAX = 48;
export const DEPTH_START = 24;

export const clampWidth = (v: number) => Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(v)));
export const clampDepth = (v: number) => Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, Math.round(v)));

export type Cost = {
	d: number;
	L: number;
	/** 一列 × 矩陣：(1, d) @ (d, d) 是 1 × d × d = d² 次乘法 */
	d2: bigint;
	/** 矩陣 × 矩陣：(d, d) @ (d, d) 是 d × d × d = d³ 次乘法 */
	d3: bigint;
	/** 從輸入端：(L − 1) 次矩陣 × 矩陣，最後一次一列 × 矩陣 */
	fromIn: bigint;
	/** 從輸出端：L 次一列 × 矩陣 */
	fromOut: bigint;
	/** 粗估：每層各乘一次 L × d³、L × d² */
	roughIn: bigint;
	roughOut: bigint;
	/** fromIn / fromOut（和 Python 的 start_in / start_out 一樣：兩個整數相除） */
	ratio: number;
	/** 剛好整除 */
	ratioExact: boolean;
};

export function cost(d: number, L: number): Cost {
	const D = BigInt(d);
	const N = BigInt(L);
	const d2 = D * D;
	const d3 = d2 * D;
	const fromIn = (N - BigInt(1)) * d3 + d2;
	const fromOut = N * d2;
	return {
		d,
		L,
		d2,
		d3,
		fromIn,
		fromOut,
		roughIn: N * d3,
		roughOut: N * d2,
		ratio: Number(fromIn) / Number(fromOut),
		ratioExact: fromIn % fromOut === BigInt(0),
	};
}

/** 第 k 次相乘之後（k = 1 … L）累計的乘法次數 */
export function cumulative(d: number, L: number): { k: number; fromIn: number; fromOut: number }[] {
	const D = BigInt(d);
	const d2 = D * D;
	const d3 = d2 * D;
	return Array.from({ length: L }, (_, i) => {
		const k = BigInt(i + 1);
		const fromIn = i + 1 < L ? k * d3 : (k - BigInt(1)) * d3 + d2;
		return { k: i + 1, fromIn: Number(fromIn), fromOut: Number(k * d2) };
	});
}

/** 整數加千分位：17263755264 → 17,263,755,264 */
export const fmtInt = (n: bigint | number | string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 倍數：100 以上取整數、10 到 100 取 1 位小數、10 以下取 2 位小數（剛好整除時不寫小數） */
export function fmtRatio(c: Cost): { text: string; approx: boolean } {
	if (c.ratioExact) return { text: fmtInt(c.fromIn / c.fromOut), approx: false };
	const digits = c.ratio >= 100 ? 0 : c.ratio >= 10 ? 1 : 2;
	return { text: fmtIntText(fmtFixed(c.ratio, digits)), approx: true };
}

/**
 * 中文的大約數：1 萬以上寫成「萬」、1 億以上寫成「億」、1 兆以上寫成「兆」。
 * 10 以上取整數（1,927 萬、165 億），10 以下取 1 位小數（7.2 億、3.2 兆）；1 萬以下不寫（回傳 null）。
 */
export function zhApprox(n: bigint): { text: string; approx: boolean } | null {
	const units: [bigint, string][] = [
		[BigInt('1000000000000'), '兆'],
		[BigInt(100000000), '億'],
		[BigInt(10000), '萬'],
	];
	const write = (u: bigint, name: string) => {
		const v = Number(n) / Number(u);
		const digits = v >= 10 ? 0 : 1;
		let body = fmtFixed(v, digits);
		if (body.endsWith('.0')) body = body.slice(0, -2);
		// 寫出來的位數剛好就是全部（例如 3 萬）時不加「約」
		const exact = (n * BigInt(10) ** BigInt(digits)) % u === BigInt(0);
		return { body, result: { text: `${fmtIntText(body)} ${name}`, approx: !exact } };
	};
	for (let i = 0; i < units.length; i++) {
		const [u, name] = units[i];
		if (n < u) continue;
		const { body, result } = write(u, name);
		// 四捨五入後進位到 10,000（例如 99,998,082 是 9,999.8 萬 → 10,000 萬）：改用大一級的單位，寫成 1 億
		if (i > 0 && Number(body) >= 10000) return write(units[i - 1][0], units[i - 1][1]).result;
		return result;
	}
	return null;
}

/** 數字字串的整數部分加千分位：1926.8 → 1,926.8 */
export const fmtIntText = (s: string) => {
	const [i, f] = s.split('.');
	return f === undefined ? fmtInt(i) : `${fmtInt(i)}.${f}`;
};

/** 科學記號（有效數字 3 位）：1.65 × 10¹⁰；回傳尾數與次方，畫面上用上標 */
export const sci3 = (n: bigint | number) => sciParts(Number(n), 3);

/**
 * 對數刻度的範圍（10 的幾次方到幾次方）：最小值往下取到整數次方、最大值往上取到整數次方，至少 3 格。
 * 次方用數字的位數算（BigInt 轉成字串的長度），不受 log10 的捨入誤差影響。
 */
export function decadeRange(lo: bigint, hi: bigint): [number, number] {
	const a = String(lo).length - 1; // lo ≥ 10^a
	const b = isPow10(hi) ? String(hi).length - 1 : String(hi).length; // hi ≤ 10^b
	return [a, Math.max(b, a + 3)];
}

const isPow10 = (n: bigint) => /^10*$/.test(String(n));
