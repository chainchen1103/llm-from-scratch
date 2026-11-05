/**
 * EP08 互動元件（LossLandscapeDemo、LogisticTrainer）用到的計算、數字格式與畫圖的幾何。
 * 沒有用到 React，方便單獨測試。
 *
 * 示範資料是本集印出來的 40 天（make_weather_data(40, 0)）：氣溫 5 到 35 度，1 = 冷、0 = 熱。
 * 數字照本集 gd.py 的寫法用 float64 實際算：
 * - sigmoid：e = e^(−|z|)，z ≥ 0 用 1 / (1 + e)、z < 0 用 e / (1 + e)；
 * - 損失：mean(logaddexp(0, z) − y z)，logaddexp 和 NumPy 一樣先減掉比較大的那個；
 * - 梯度：(mean((p − y) x), mean(p − y))；平均照 NumPy 的加法順序（np.sum 的兩兩相加）；
 * - 每一步 (w, b) ← (w, b) − 學習率 × 梯度。
 * 畫面上的數字四捨五入到固定位數，和 Python 的格式化一致（剛好在正中間時取偶數）。
 */
import { fmtFixed, fmtTrim } from './ep04-calc.ts';

export { fmtFixed, fmtTrim };

export type Vec = [number, number];

// ---------- 示範資料：40 天的氣溫與答案 ----------

/** 40 天的氣溫（°C） */
export const TEMP: readonly number[] = [
	31, 24, 20, 13, 14, 6, 7, 5, 10, 30, 25, 33, 20, 23, 35, 27, 24, 21, 22, 33, 13, 30, 25, 5, 17, 31, 22, 6, 28, 27, 31, 10, 7, 31, 5, 21, 7, 14, 19, 18,
];
/** 答案：1 = 冷、0 = 熱 */
export const Y: readonly number[] = [0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1];
export const N_DAYS = TEMP.length;
/** 「冷」的天數 */
export const N_COLD = Y.reduce((s, v) => s + v, 0);

/** 特徵：標準化 (氣溫 − 20) / 10，或直接用氣溫 */
export type Mode = 'std' | 'raw';
export const FEATURES: Record<Mode, readonly number[]> = {
	std: TEMP.map((t) => (t - 20) / 10),
	raw: TEMP.map((t) => t),
};

// ---------- NumPy 的寫法 ----------

/**
 * np.sum 的加法順序（兩兩相加 pairwise summation，和 ep06-table.ts 的 npSum 一樣）：
 * 少於 8 個從頭加到尾；8 到 128 個用 8 個累加器；再多就切兩半。
 */
export function npSum(xs: ArrayLike<number>, lo = 0, n = xs.length): number {
	if (n < 8) {
		let s = -0;
		for (let i = 0; i < n; i++) s += xs[lo + i];
		return s;
	}
	if (n <= 128) {
		let r0 = xs[lo],
			r1 = xs[lo + 1],
			r2 = xs[lo + 2],
			r3 = xs[lo + 3],
			r4 = xs[lo + 4],
			r5 = xs[lo + 5],
			r6 = xs[lo + 6],
			r7 = xs[lo + 7];
		let i = 8;
		for (; i < n - (n % 8); i += 8) {
			r0 += xs[lo + i];
			r1 += xs[lo + i + 1];
			r2 += xs[lo + i + 2];
			r3 += xs[lo + i + 3];
			r4 += xs[lo + i + 4];
			r5 += xs[lo + i + 5];
			r6 += xs[lo + i + 6];
			r7 += xs[lo + i + 7];
		}
		let s = r0 + r1 + (r2 + r3) + (r4 + r5 + (r6 + r7));
		for (; i < n; i++) s += xs[lo + i];
		return s;
	}
	let n2 = Math.floor(n / 2);
	n2 -= n2 % 8;
	return npSum(xs, lo, n2) + npSum(xs, lo + n2, n - n2);
}

/** 穩定的 sigmoid（gd.py 的寫法）：指數永遠 ≤ 0，不會溢位 */
export function sigmoid(z: number): number {
	const e = Math.exp(-Math.abs(z));
	return z >= 0 ? 1 / (1 + e) : e / (1 + e);
}

/** np.logaddexp(0, z) = ln(1 + e^z)：先減掉比較大的那個，不會溢位 */
export function softplus(z: number): number {
	if (z === 0) return Math.LN2;
	return z < 0 ? Math.log1p(Math.exp(z)) : z + Math.log1p(Math.exp(-z));
}

const scratchA = new Float64Array(N_DAYS);
const scratchB = new Float64Array(N_DAYS);

/** 平均二元交叉熵 mean(ln(1 + e^z) − y z)，z = w x + b（nat） */
export function lossAt(xs: readonly number[], w: number, b: number): number {
	for (let i = 0; i < N_DAYS; i++) {
		const z = xs[i] * w + b;
		scratchA[i] = softplus(z) - Y[i] * z;
	}
	return npSum(scratchA) / N_DAYS;
}

/** 梯度 (∂loss/∂w, ∂loss/∂b) = (mean((p − y) x), mean(p − y)) */
export function gradAt(xs: readonly number[], w: number, b: number): Vec {
	for (let i = 0; i < N_DAYS; i++) {
		const r = sigmoid(xs[i] * w + b) - Y[i];
		scratchA[i] = r * xs[i];
		scratchB[i] = r;
	}
	return [npSum(scratchA) / N_DAYS, npSum(scratchB) / N_DAYS];
}

/** 猜對幾天：p ≥ 0.5 判成「冷」 */
export function correctAt(xs: readonly number[], w: number, b: number): number {
	let c = 0;
	for (let i = 0; i < N_DAYS; i++) if ((sigmoid(xs[i] * w + b) >= 0.5 ? 1 : 0) === Y[i]) c += 1;
	return c;
}

/** 每一天猜錯了沒有（p ≥ 0.5 判成「冷」） */
export function wrongDays(xs: readonly number[], w: number, b: number): boolean[] {
	return xs.map((x, i) => (sigmoid(x * w + b) >= 0.5 ? 1 : 0) !== Y[i]);
}

/** 往負梯度走一步 */
export function gdStep(xs: readonly number[], w: number, b: number, lr: number): Vec {
	const [dw, db] = gradAt(xs, w, b);
	return [w - lr * dw, b - lr * db];
}

/**
 * 分界氣溫（p = 0.5，也就是 z = 0 的地方）：標準化時是 20 − 10b / w，直接用氣溫時是 −b / w。
 * w = 0 時沒有分界（每天都一樣），回傳 null。
 */
export function cutTemp(mode: Mode, w: number, b: number): number | null {
	if (w === 0) return null;
	return mode === 'std' ? 20 - (10 * b) / w : -b / w;
}

/** 某個氣溫「冷」的機率 */
export const pCold = (mode: Mode, w: number, b: number, temp: number) => sigmoid(w * (mode === 'std' ? (temp - 20) / 10 : temp) + b);

/** 參數大到這個程度就當成發散（本集的學習率不會碰到，只是保護畫面） */
export const BLOW_UP = 1e6;
export const isBlownUp = (w: number, b: number) => !(Math.abs(w) < BLOW_UP && Math.abs(b) < BLOW_UP);

// ---------- 梯度下降的路徑（存下每一步的位置） ----------

/** 從 start 出發、學習率固定的梯度下降；ws[k]、bs[k] 是走了 k 步之後的位置 */
export class Descent {
	readonly mode: Mode;
	readonly lr: number;
	readonly start: Vec;
	ws: Float64Array;
	bs: Float64Array;
	/** 已經算到第幾步 */
	n = 0;
	/** 發散（參數變得非常大或不是數字）的那一步；沒有發散是 null */
	blowUp: number | null = null;

	constructor(mode: Mode, start: Vec, lr: number, capacity = 1024) {
		this.mode = mode;
		this.lr = lr;
		this.start = [start[0], start[1]];
		this.ws = new Float64Array(capacity);
		this.bs = new Float64Array(capacity);
		this.ws[0] = start[0];
		this.bs[0] = start[1];
	}

	private grow(need: number) {
		if (need < this.ws.length) return;
		let cap = this.ws.length;
		while (cap <= need) cap *= 2;
		const ws = new Float64Array(cap);
		const bs = new Float64Array(cap);
		ws.set(this.ws.subarray(0, this.n + 1));
		bs.set(this.bs.subarray(0, this.n + 1));
		this.ws = ws;
		this.bs = bs;
	}

	/** 再走幾步，最多走到第 target 步、這次最多走 budget 步；回傳是不是已經走到 target（或發散停下來） */
	advance(target: number, budget = Infinity): boolean {
		if (this.blowUp !== null) return true;
		const end = Math.min(target, this.n + budget);
		if (end <= this.n) return this.n >= target;
		this.grow(end);
		const xs = FEATURES[this.mode];
		let w = this.ws[this.n];
		let b = this.bs[this.n];
		for (let k = this.n + 1; k <= end; k++) {
			[w, b] = gdStep(xs, w, b, this.lr);
			this.ws[k] = w;
			this.bs[k] = b;
			this.n = k;
			if (isBlownUp(w, b)) {
				this.blowUp = k;
				return true;
			}
		}
		return this.n >= target;
	}

	at(k: number): Vec {
		const i = Math.min(k, this.n);
		return [this.ws[i], this.bs[i]];
	}
}

// ---------- 損失地形（工具四） ----------

export type View = { wMin: number; wMax: number; bMin: number; bMax: number };

/** 等高線圖的範圍：和本集的圖一樣 */
export const VIEWS: Record<Mode, View> = {
	std: { wMin: -10, wMax: 2, bMin: -4, bMax: 4 },
	raw: { wMin: -1.1, wMax: 0.3, bMin: -3, bMax: 17 },
};

/** 學習率：標準化用 1；不標準化只能用 0.01（上限約 2 ÷ 119 ≈ 0.017） */
export const LAND_LR: Record<Mode, number> = { std: 1, raw: 0.01 };

/** 等高線的高度（nat）：和本集的圖一樣 */
export const LEVELS: Record<Mode, number[]> = {
	std: [0.19, 0.2, 0.25, 0.3, 0.4, 0.6, 0.8, 1.2, 2],
	raw: [0.19, 0.25, 0.4, 0.6, 1, 2, 4, 8],
};

/** 等高線用的格點數（w 方向、b 方向） */
export const GRID_N: Record<Mode, Vec> = {
	std: [241, 161],
	raw: [281, 201],
};

/**
 * 谷底：標準化時，學習率 10 走 1000 步（已經不再變）的 (w, b)；
 * 不標準化的谷底是同一個模型換個寫法：z = (w / 10) 氣溫 + (b − 2w)。
 */
export const FLOOR_STD: Vec = [-6.708062615528144, 1.0124326813449256];
export const FLOOR: Record<Mode, Vec> = {
	std: FLOOR_STD,
	raw: [FLOOR_STD[0] / 10, FLOOR_STD[1] - 2 * FLOOR_STD[0]],
};
/** 谷底的損失 */
export const FLOOR_LOSS = lossAt(FEATURES.std, FLOOR_STD[0], FLOOR_STD[1]);

/** 起點的選項 */
export type StartPreset = { label: string; p: Vec };
export const START_PRESETS: Record<Mode, StartPreset[]> = {
	std: [
		{ label: '(0, 0)', p: [0, 0] },
		{ label: '(−10, 4)', p: [-10, 4] },
		{ label: '(2, −4)', p: [2, -4] },
		{ label: '(−10, −4)', p: [-10, -4] },
		{ label: '(2, 4)', p: [2, 4] },
	],
	raw: [
		{ label: '(0, 0)', p: [0, 0] },
		{ label: '(−1, 0)', p: [-1, 0] },
		{ label: '(0.2, 16)', p: [0.2, 16] },
		{ label: '(−1, 16)', p: [-1, 16] },
	],
};

/** 走到第幾步的選項 */
export const STEP_CHOICES: Record<Mode, number[]> = {
	std: [1, 10, 100, 1000, 3000],
	raw: [1, 300, 1000, 10000, 100000],
};
export const DEFAULT_STEPS: Record<Mode, number> = { std: 3000, raw: 300 };

/** 點選的起點吸附到格點：標準化時 w、b 都是 0.1；不標準化時 w 是 0.01、b 是 0.1 */
export const START_STEP: Record<Mode, Vec> = { std: [0.1, 0.1], raw: [0.01, 0.1] };

/** 吸附到 step 的倍數，限制在 lo 到 hi（不會出現 −0；小數點後的捨入誤差也清掉） */
export function snapTo(v: number, step: number, lo: number, hi: number): number {
	const k = Math.round(v / step);
	const s = Number((k * step).toFixed(6));
	return Math.min(hi, Math.max(lo, s)) + 0;
}

export function snapStart(mode: Mode, p: Vec): Vec {
	const v = VIEWS[mode];
	const st = START_STEP[mode];
	return [snapTo(p[0], st[0], v.wMin, v.wMax), snapTo(p[1], st[1], v.bMin, v.bMax)];
}

/**
 * 一整片格點的損失（像本集用廣播算整片）：L[j × nw + i] 是 (w_i, b_j) 的損失。
 * 只拿來畫等高線，所以同樣氣溫的日子合在一起算（31 種氣溫，不是 40 天）：
 * Σ ln(1 + e^z) 照氣溫分組乘上天數，Σ y z = w Σ y x + b Σ y。
 */
export function lossGrid(mode: Mode, nw: number, nb: number): Float64Array {
	const v = VIEWS[mode];
	const xs = FEATURES[mode];
	const groups = new Map<number, number>();
	let sxy = 0;
	let sy = 0;
	xs.forEach((x, i) => {
		groups.set(x, (groups.get(x) ?? 0) + 1);
		sxy += Y[i] * x;
		sy += Y[i];
	});
	const gx = [...groups.keys()];
	const gc = gx.map((x) => groups.get(x) as number);
	const out = new Float64Array(nw * nb);
	for (let j = 0; j < nb; j++) {
		const b = v.bMin + ((v.bMax - v.bMin) * j) / (nb - 1);
		for (let i = 0; i < nw; i++) {
			const w = v.wMin + ((v.wMax - v.wMin) * i) / (nw - 1);
			let s = 0;
			for (let g = 0; g < gx.length; g++) s += gc[g] * softplus(gx[g] * w + b);
			out[j * nw + i] = (s - (w * sxy + b * sy)) / N_DAYS;
		}
	}
	return out;
}

/**
 * 等高線（marching squares）：每個格子看四個角在高度 c 的哪一邊，在穿過的邊上線性內插，
 * 再把相鄰格子的小線段接成折線。回傳數學座標 (w, b) 的折線。
 */
export function contourLines(grid: Float64Array, nw: number, nb: number, view: View, c: number): Vec[][] {
	const dw = (view.wMax - view.wMin) / (nw - 1);
	const db = (view.bMax - view.bMin) / (nb - 1);
	const at = (i: number, j: number) => grid[j * nw + i];
	// 邊的編號：水平邊 (i, j)–(i + 1, j) 是 2(j·nw + i)；垂直邊 (i, j)–(i, j + 1) 是 2(j·nw + i) + 1
	const hEdge = (i: number, j: number) => 2 * (j * nw + i);
	const vEdge = (i: number, j: number) => 2 * (j * nw + i) + 1;
	const pts = new Map<number, Vec>();
	const point = (e: number): Vec => {
		const hit = pts.get(e);
		if (hit) return hit;
		const k = e >> 1;
		const i = k % nw;
		const j = (k - i) / nw;
		let p: Vec;
		if ((e & 1) === 0) {
			const a = at(i, j);
			const t = (c - a) / (at(i + 1, j) - a);
			p = [view.wMin + (i + t) * dw, view.bMin + j * db];
		} else {
			const a = at(i, j);
			const t = (c - a) / (at(i, j + 1) - a);
			p = [view.wMin + i * dw, view.bMin + (j + t) * db];
		}
		pts.set(e, p);
		return p;
	};
	const segs: [number, number][] = [];
	for (let j = 0; j < nb - 1; j++) {
		for (let i = 0; i < nw - 1; i++) {
			const v0 = at(i, j); // 左下
			const v1 = at(i + 1, j); // 右下
			const v2 = at(i + 1, j + 1); // 右上
			const v3 = at(i, j + 1); // 左上
			const idx = (v0 > c ? 1 : 0) | (v1 > c ? 2 : 0) | (v2 > c ? 4 : 0) | (v3 > c ? 8 : 0);
			if (idx === 0 || idx === 15) continue;
			const B = hEdge(i, j);
			const T = hEdge(i, j + 1);
			const L = vEdge(i, j);
			const R = vEdge(i + 1, j);
			const center = (v0 + v1 + v2 + v3) / 4 > c;
			switch (idx) {
				case 1:
				case 14:
					segs.push([L, B]);
					break;
				case 2:
				case 13:
					segs.push([B, R]);
					break;
				case 3:
				case 12:
					segs.push([L, R]);
					break;
				case 4:
				case 11:
					segs.push([R, T]);
					break;
				case 6:
				case 9:
					segs.push([B, T]);
					break;
				case 7:
				case 8:
					segs.push([L, T]);
					break;
				case 5: // 左下、右上在上面
					if (center) segs.push([L, T], [B, R]);
					else segs.push([L, B], [R, T]);
					break;
				case 10: // 右下、左上在上面
					if (center) segs.push([L, B], [R, T]);
					else segs.push([L, T], [B, R]);
					break;
			}
		}
	}
	// 接成折線：每條邊最多屬於兩段
	const byEdge = new Map<number, number[]>();
	segs.forEach(([a, b], k) => {
		for (const e of [a, b]) {
			const list = byEdge.get(e);
			if (list) list.push(k);
			else byEdge.set(e, [k]);
		}
	});
	const used = new Uint8Array(segs.length);
	const lines: Vec[][] = [];
	const walk = (fromSeg: number, edge: number, out: number[]) => {
		let seg = fromSeg;
		let e = edge;
		for (;;) {
			const next = (byEdge.get(e) ?? []).find((k) => k !== seg && !used[k]);
			if (next === undefined) return;
			used[next] = 1;
			const [a, b] = segs[next];
			e = a === e ? b : a;
			out.push(e);
			seg = next;
		}
	};
	for (let k = 0; k < segs.length; k++) {
		if (used[k]) continue;
		used[k] = 1;
		const fwd: number[] = [segs[k][1]];
		walk(k, segs[k][1], fwd);
		const back: number[] = [];
		walk(k, segs[k][0], back);
		const edges = [...back.reverse(), segs[k][0], ...fwd];
		lines.push(edges.map(point));
	}
	return lines;
}

/** 每一個模式的等高線（只算一次） */
const contourCache = new Map<Mode, { level: number; lines: Vec[][] }[]>();
export function landscapeContours(mode: Mode): { level: number; lines: Vec[][] }[] {
	const hit = contourCache.get(mode);
	if (hit) return hit;
	const [nw, nb] = GRID_N[mode];
	const grid = lossGrid(mode, nw, nb);
	const out = LEVELS[mode].map((level) => ({ level, lines: contourLines(grid, nw, nb, VIEWS[mode], level) }));
	contourCache.set(mode, out);
	return out;
}

/** 座標軸的刻度 */
export const TICKS: Record<Mode, { w: number[]; b: number[] }> = {
	std: { w: [-10, -8, -6, -4, -2, 0, 2], b: [-4, -2, 0, 2, 4] },
	raw: { w: [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2], b: [0, 5, 10, 15] },
};

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
	/** 畫面座標 → 數學座標 */
	fromScreen: (px: number, py: number) => Vec;
};

/** 長方形繪圖區：橫軸 xMin 到 xMax、縱軸 yMin 到 yMax，兩軸各自縮放 */
export function makeFrame(width: number, plotH: number, x0: number, x1: number, y0: number, y1: number, pads: Pads): Frame {
	const left = pads.l;
	const right = width - pads.r;
	const top = pads.t;
	const bottom = pads.t + plotH;
	const kx = (right - left) / (x1 - x0);
	const ky = (bottom - top) / (y1 - y0);
	return {
		width,
		height: bottom + pads.b,
		left,
		right,
		top,
		bottom,
		sx: (x) => left + (x - x0) * kx,
		sy: (y) => bottom - (y - y0) * ky,
		fromScreen: (px, py) => [x0 + (px - left) / kx, y0 + (bottom - py) / ky],
	};
}

/** 等高線圖：寬度 width（px）；繪圖區的高是寬的 2/3（標準化時 w、b 兩軸同比例），手機上 0.85 倍 */
export const LAND_PADS: Pads = { l: 40, r: 12, t: 24, b: 40 };
export function landFrame(mode: Mode, width: number): Frame {
	const v = VIEWS[mode];
	const plotW = width - LAND_PADS.l - LAND_PADS.r;
	// 手機上高一點（寬的 0.85 倍），等高線之間才不會太擠
	const plotH = Math.round(Math.max(200, Math.min(460, plotW * (plotW < 480 ? 0.85 : 2 / 3))));
	return makeFrame(width, plotH, v.wMin, v.wMax, v.bMin, v.bMax, LAND_PADS);
}

/** 長方形範圍（畫面座標） */
export type Box = { x0: number; y0: number; x1: number; y1: number };

export const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** 估計文字寬度（px）：中文約 1 個字高，其他約 0.6 個字高 */
export function textWidth(text: string, px: number): number {
	let w = 0;
	for (const ch of text) w += /[⺀-鿿豈-￯]/.test(ch) ? px : 0.6 * px;
	return w;
}

/** 等高線數字的偏好位置：從谷底往這些方向（畫面座標）畫射線，數字盡量排在射線附近 */
const LABEL_RAYS: Record<Mode, Vec[]> = {
	std: [
		[-0.3, 1],
		[1, -0.55],
	],
	raw: [
		[-1, 0.85],
		[1, -0.2],
	],
};

export type ContourLabel = { level: number; text: string; x: number; y: number; box: Box };

/**
 * 每一條等高線挑一個位置寫高度：在線上每隔幾個點取一個候選位置，
 * 選「離偏好的射線近、不和已經放好的數字或 avoid 重疊、整個在繪圖區裡」的那一個。
 */
export function contourLabels(mode: Mode, contours: { level: number; lines: Vec[][] }[], fr: Frame, avoid: Box[], fontPx = 11.5): ContourLabel[] {
	const floor = FLOOR[mode];
	const o: Vec = [fr.sx(floor[0]), fr.sy(floor[1])];
	const rays = LABEL_RAYS[mode].map(([dx, dy]) => {
		const l = Math.hypot(dx, dy);
		return [dx / l, dy / l] as Vec;
	});
	const placed: Box[] = [...avoid];
	const out: ContourLabel[] = [];
	const pad = 3;
	for (const { level, lines } of contours) {
		const text = fmtTrim(level, 2);
		const w = textWidth(text, fontPx) + 6;
		const h = fontPx + 4;
		let best: ContourLabel | null = null;
		let bestScore = Infinity;
		for (const line of lines) {
			for (let k = 0; k < line.length; k += 2) {
				const x = fr.sx(line[k][0]);
				const y = fr.sy(line[k][1]);
				const box = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
				if (box.x0 < fr.left + pad || box.x1 > fr.right - pad || box.y0 < fr.top + pad || box.y1 > fr.bottom - pad) continue;
				let ray = Infinity;
				for (const d of rays) {
					const px = x - o[0];
					const py = y - o[1];
					const t = px * d[0] + py * d[1];
					ray = Math.min(ray, t < 0 ? Math.hypot(px, py) + 400 : Math.abs(px * d[1] - py * d[0]));
				}
				let hit = 0;
				for (const b of placed) hit += overlapArea(box, { x0: b.x0 - 4, y0: b.y0 - 2, x1: b.x1 + 4, y1: b.y1 + 2 });
				const score = hit > 0 ? 1e3 + ray + hit * 10 : ray;
				if (score < bestScore) {
					bestScore = score;
					best = { level, text, x, y, box };
				}
			}
		}
		// 放不下（會壓到別的數字）就不寫：圖例說了灰線的數字是損失
		if (best && bestScore < 1e3 - 1) {
			placed.push(best.box);
			out.push(best);
		}
	}
	return out;
}

/** 路徑上要畫點的步數：1–9、10、20、…、90、100、200、…（每一個數量級 9 個點，看得出步伐先大後小） */
export function isMarkStep(k: number): boolean {
	if (k < 1) return false;
	let m = k;
	while (m >= 10 && m % 10 === 0) m /= 10;
	return m < 10;
}

// ---------- 訓練（本集重點） ----------

/** 學習率的選項 */
export const TRAIN_LRS = [0.01, 1, 10, 100] as const;
export type TrainLr = (typeof TRAIN_LRS)[number];
export const TRAIN_DEFAULT_LR: TrainLr = 1;
/** 最多走幾步 */
export const TRAIN_MAX_STEPS = 5000;

export type TrainRow = {
	step: number;
	w: number;
	b: number;
	loss: number;
	correct: number;
	/** 準確率：猜對的比例 */
	acc: number;
};

export function trainRow(step: number, w: number, b: number): TrainRow {
	const xs = FEATURES.std;
	const correct = correctAt(xs, w, b);
	return { step, w, b, loss: lossAt(xs, w, b), correct, acc: correct / N_DAYS };
}

/** 從第 0 步（w = b = 0）開始的紀錄 */
export const trainStart = (): TrainRow[] => [trainRow(0, 0, 0)];

/** 在紀錄後面再走 k 步（最多走到 TRAIN_MAX_STEPS），回傳新的紀錄 */
export function trainMore(rows: TrainRow[], lr: number, k: number): TrainRow[] {
	const out = rows.slice();
	let last = out[out.length - 1];
	const end = Math.min(TRAIN_MAX_STEPS, last.step + k);
	while (last.step < end && !isBlownUp(last.w, last.b)) {
		const [w, b] = gdStep(FEATURES.std, last.w, last.b, lr);
		last = trainRow(last.step + 1, w, b);
		out.push(last);
	}
	return out;
}

/** 本集「S 形曲線貼上資料」那一格的五個氣溫 */
export const PROBE_TEMPS = [5, 15, 20, 25, 35];

/** 氣溫的範圍（S 形曲線圖的橫軸） */
export const T_MIN = 3;
export const T_MAX = 37;

/**
 * 每一天的點在圖上的位置：冷（1）畫在上緣、熱（0）畫在下緣；
 * 同樣氣溫、同樣答案的日子往內疊（第幾個，從 0 數）。
 */
export function dayStack(): number[] {
	const seen = new Map<string, number>();
	return TEMP.map((t, i) => {
		const key = `${t}-${Y[i]}`;
		const k = seen.get(key) ?? 0;
		seen.set(key, k + 1);
		return k;
	});
}

// ---------- 數字格式 ----------

/** 損失：小數點後 4 位（0.5638） */
export const lossText = (v: number) => fmtFixed(v, 4);
/** w、b：小數點後 3 位（−5.749） */
export const paramText = (v: number) => fmtFixed(v, 3);
/** 分界氣溫：小數點後 2 位（21.46） */
export const cutText = (v: number) => fmtFixed(v, 2);
/** 準確率：和 Python 印出來一樣（0.9、0.525、0.875） */
export const accText = (v: number) => fmtTrim(v, 3);
/** 機率：小數點後 3 位 */
export const probText = (v: number) => fmtFixed(v, 3);
/** 梯度：小數點後 4 位 */
export const gradText = (v: number) => fmtFixed(v, 4);
/** 整數加千分位：100000 → 100,000 */
export const fmtInt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** 步數的寫法：10 萬步寫成「10 萬」 */
export const stepWord = (n: number) => (n >= 10000 && n % 10000 === 0 ? `${n / 10000} 萬` : fmtInt(n));
/** 「100 步」「10 萬步」 */
export const stepsText = (n: number) => (n >= 10000 && n % 10000 === 0 ? `${n / 10000} 萬步` : `${fmtInt(n)} 步`);
/** 起點這種短小數：去掉尾巴的 0（−10、0.25、−0.53） */
export const shortText = (v: number) => fmtTrim(v, 3);
export const vecText = (p: Vec) => `(${shortText(p[0])}, ${shortText(p[1])})`;
/** 給 <input> 用：負號用一般的「-」 */
export const inputText = (v: number) => shortText(v).replace('−', '-');
