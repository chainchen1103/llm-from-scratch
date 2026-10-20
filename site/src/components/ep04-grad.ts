/**
 * EP04 互動元件（GradientFieldDemo、DirectionalDerivativeDemo）用到的計算、數字格式與畫圖的幾何。
 * 沒有用到 React，方便單獨測試。數字格式、標籤擺放、箭頭形狀沿用 EP03 的 ep03-vectors.ts。
 *
 * 函數是本集的碗 f(x, y) = x² + 3y²：∂f/∂x = 2x、∂f/∂y = 6y，梯度 ∇f = (2x, 6y)。
 * GradientFieldDemo 的點吸附到 0.25 的格點，所以高度、偏導數、梯度長度的平方都是 1/16 的倍數，
 * 電腦算起來沒有捨入誤差；只有開根號、角度、cos 要四捨五入到固定位數。
 */
import { fmtFixed, PADS, type Box, type Vec } from './ep03-vectors.ts';

export {
	anglePath,
	arrowShape,
	fmtFactor,
	fmtFixed,
	fmtInput,
	fmtNum,
	placeLabel,
	pointBox,
	segmentBoxes,
	spotBox,
	textWidth,
} from './ep03-vectors.ts';
export type { Box, Spot, Vec } from './ep03-vectors.ts';

// ---------- 碗：f(x, y) = x² + 3y² ----------

/** 高度 f(x, y) = x² + 3y²（和 Python 的 x ** 2 + 3 * y ** 2 同樣的運算順序） */
export const bowl = (x: number, y: number) => x * x + 3 * (y * y);

/** 梯度 ∇f = (∂f/∂x, ∂f/∂y) = (2x, 6y)；+ 0 讓 −0 變成 0 */
export const gradAt = (p: Vec): Vec => [2 * p[0] + 0, 6 * p[1] + 0];

export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

/** 長度 ‖v‖ = √(v₁² + v₂²)，和 np.linalg.norm 的算法相同（先算 v · v 再開根號） */
export const norm = (v: Vec) => Math.sqrt(dot(v, v));

export const vecEq = (u: Vec, v: Vec) => u[0] === v[0] && u[1] === v[1];

/** 弧度 ↔ 度：和 np.radians（x × (π / 180)）、np.degrees（x × (180 / π)）同樣的算法 */
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** 角度換到 0 ≤ d < 360 */
export function norm360(d: number): number {
	let r = d % 360;
	if (r < 0) r += 360;
	return r === 360 ? 0 : r + 0;
}

/** 兩個方向相差幾度（0 到 180） */
export function angDiff(a: number, b: number): number {
	const d = Math.abs(norm360(a) - norm360(b));
	return Math.min(d, 360 - d);
}

/** 梯度和 x 軸的夾角（度，0 ≤ φ < 360）：np.degrees(np.arctan2(gy, gx))，負的再加 360 */
export const gradAngle = (g: Vec) => norm360(Math.atan2(g[1], g[0]) * RAD2DEG);

// ---------- GradientFieldDemo：等高線圖上的點 P ----------

/** 座標圖從 −3.5 畫到 3.5，兩軸同比例 */
export const FIELD_HALF = 3.5;
/** P 吸附到 0.25 的格點 */
export const P_STEP = 0.25;
/** P 的範圍：|x| ≤ 2.75、|y| ≤ 2，縮短後的梯度箭頭才放得進圖裡（尖端是 (1.2x, 1.6y)） */
export const P_LIM: Vec = [2.75, 2];
/** 梯度箭頭的長度縮成 1/10（和本集 plot_gradient.py 的 quiver scale=10 一樣） */
export const ARROW_SCALE = 10;
/** 等高線：相鄰兩條的高度都差 4（等間隔，線越密、坡越陡） */
export const LEVEL_STEP = 4;
export const LEVELS = [1, 5, 9, 13, 17, 21, 25];
export const P_START: Vec = [1, 2];

/** 本集 plot_gradient.py 的五個點，加上碗底 */
export const FIELD_PRESETS: { p: Vec; label: string; aria: string }[] = [
	{ p: [1, 2], label: '(1, 2)', aria: 'P = (1, 2)' },
	{ p: [-2, 1], label: '(−2, 1)', aria: 'P = (−2, 1)' },
	{ p: [2, -1], label: '(2, −1)', aria: 'P = (2, −1)' },
	{ p: [-1, -1], label: '(−1, −1)', aria: 'P = (−1, −1)' },
	{ p: [0.5, 0.5], label: '(0.5, 0.5)', aria: 'P = (0.5, 0.5)' },
	{ p: [0, 0], label: '碗底 (0, 0)', aria: '碗底 P = (0, 0)' },
];

/** 吸附到最近的 step 格點，再限制在 −lim 到 lim 之間（不會出現 −0） */
export function snapTo(v: number, step: number, lim: number): number {
	const s = Math.round(v / step) * step;
	return Math.min(lim, Math.max(-lim, s)) + 0;
}

export const snapP = (v: Vec): Vec => [snapTo(v[0], P_STEP, P_LIM[0]), snapTo(v[1], P_STEP, P_LIM[1])];

export type GradInfo = {
	/** 高度 f(P) 的兩項：x² 和 3y² */
	terms: Vec;
	f: number;
	/** 梯度 (2x, 6y) */
	g: Vec;
	/** 梯度兩個分量的平方 */
	sq: Vec;
	/** 平方和 = ‖∇f‖² */
	sumSq: number;
	norm: number;
	/** 碗底：梯度是零向量 */
	zero: boolean;
	/** 梯度和 x 軸的夾角（度）；零向量沒有方向，是 null */
	angle: number | null;
};

export function gradInfo(p: Vec): GradInfo {
	const terms: Vec = [p[0] * p[0], 3 * (p[1] * p[1])];
	const g = gradAt(p);
	const sq: Vec = [g[0] * g[0], g[1] * g[1]];
	const sumSq = sq[0] + sq[1];
	const zero = g[0] === 0 && g[1] === 0;
	return { terms, f: terms[0] + terms[1], g, sq, sumSq, norm: Math.sqrt(sumSq), zero, angle: zero ? null : gradAngle(g) };
}

/** 等高線 x² + 3y² = c 是一個橢圓：(√c cos t, √(c/3) sin t)，t 從 0 到 2π；c = 0 時只是原點 */
export function contourPoints(c: number, n = 144): Vec[] {
	const a = Math.sqrt(c);
	const b = Math.sqrt(c / 3);
	return Array.from({ length: n + 1 }, (_, i) => {
		const t = (2 * Math.PI * i) / n;
		return [a * Math.cos(t), b * Math.sin(t)] as Vec;
	});
}

/** 橢圓 x² + 3y² = c 上，參數 t（度）那一點：用來放等高線的高度數字 */
export const contourAt = (c: number, tDeg: number): Vec => [Math.sqrt(c) * Math.cos(tDeg * DEG2RAD), Math.sqrt(c / 3) * Math.sin(tDeg * DEG2RAD)];

/** 本集「畫成箭頭」那張圖的格點：x、y 都是 −2、−1、0、1、2 */
export const QUIVER_POINTS: Vec[] = [-2, -1, 0, 1, 2].flatMap((y) => [-2, -1, 0, 1, 2].map((x) => [x, y] as Vec));

// ---------- DirectionalDerivativeDemo：繞著 P 轉動單位向量 u ----------

/** 數值方向導數的一小步（中央差分，和本集的 h 預設值一樣） */
export const H = 1e-5;
/** 座標圖以 P 為中心，往四邊各畫 1.75（放大 P 附近，u 的長度 1 才看得清楚） */
export const DIR_HALF = 1.75;
export const DIR_PRESETS: { p: Vec; label: string }[] = [
	{ p: [1, 2], label: '(1, 2)' },
	{ p: [-2, 1], label: '(−2, 1)' },
	{ p: [-1, -1], label: '(−1, −1)' },
];
/** u 一開始和 x 軸夾 45° */
export const U_START = 45;
/** 方向鍵一次轉 5°，Page Up／Page Down 一次 15° */
export const KEY_STEP = 5;
export const PAGE_STEP = 15;
/** 拖動時離特別的方向（梯度、垂直、反方向）不到 3° 就吸過去 */
export const MAGNET = 3;

/** 和 x 軸夾 deg 度的單位向量 (cos, sin)：np.array([np.cos(t), np.sin(t)])，t = np.radians(deg) */
export function unitAt(deg: number): Vec {
	const t = deg * DEG2RAD;
	return [Math.cos(t), Math.sin(t)];
}

/** 方向導數 ∇f · u（u 和 x 軸夾 deg 度） */
export const dirDeriv = (g: Vec, deg: number) => dot(g, unitAt(deg));

export type DirKind = 'up' | 'down' | 'perp' | 'other';

export type DirInfo = {
	g: Vec;
	u: Vec;
	/** ∇f · u 的兩項 */
	terms: Vec;
	/** 方向導數 ∇f · u */
	dd: number;
	gNorm: number;
	/** u 和梯度的夾角 θ 的 cos（夾在 −1 到 1 之間） */
	cos: number;
	/** θ（度，0 到 180） */
	theta: number;
	/** ‖∇f‖ cos θ */
	viaCos: number;
	/** 數值（中央差分）：(f(P + h u) − f(P − h u)) / (2h) */
	numeric: number;
	/** 梯度的方向（度） */
	phi: number;
	kind: DirKind;
};

/** 特別的方向：梯度方向、逆時針垂直、反方向、順時針垂直（都換到 0 ≤ d < 360） */
export function specialAngles(phi: number) {
	return { up: norm360(phi), perpA: norm360(phi + 90), down: norm360(phi + 180), perpB: norm360(phi + 270) };
}

/** 和特別的方向重合（相差不到 1e-9 度）時是 up／perp／down */
export function dirKind(phi: number, deg: number): DirKind {
	const s = specialAngles(phi);
	const eps = 1e-9;
	if (angDiff(deg, s.up) < eps) return 'up';
	if (angDiff(deg, s.down) < eps) return 'down';
	if (angDiff(deg, s.perpA) < eps || angDiff(deg, s.perpB) < eps) return 'perp';
	return 'other';
}

/**
 * 和 NumPy 的算法一樣：u = (cos t, sin t)，方向導數 grad @ u，
 * cos θ = (grad @ u) / (norm(grad) * norm(u))（夾在 −1 到 1 之間），θ = np.degrees(np.arccos(cos θ))，
 * 數值用中央差分 (bowl(p + h * u) − bowl(p − h * u)) / (2 * h)。
 */
export function dirInfo(p: Vec, deg: number): DirInfo {
	const g = gradAt(p);
	const u = unitAt(deg);
	const terms: Vec = [g[0] * u[0], g[1] * u[1]];
	const dd = terms[0] + terms[1];
	const gNorm = norm(g);
	const cos = Math.min(1, Math.max(-1, dd / (gNorm * norm(u))));
	const theta = Math.acos(cos) * RAD2DEG;
	const numeric = (bowl(p[0] + H * u[0], p[1] + H * u[1]) - bowl(p[0] - H * u[0], p[1] - H * u[1])) / (2 * H);
	const phi = gradAngle(g);
	return { g, u, terms, dd, gNorm, cos, theta, viaCos: gNorm * cos, numeric, phi, kind: dirKind(phi, deg) };
}

/** 拖動得到的角度：取整數度；離特別的方向不到 MAGNET 度就吸過去 */
export function snapAngle(raw: number, phi: number): number {
	const s = specialAngles(phi);
	let best: number | null = null;
	let bestD = MAGNET;
	for (const a of [s.up, s.perpA, s.down, s.perpB]) {
		const d = angDiff(raw, a);
		if (d < bestD) {
			best = a;
			bestD = d;
		}
	}
	return best ?? norm360(Math.round(norm360(raw)));
}

/**
 * 滑桿與波浪圖用的版本：橫軸是 0 到 360 的一直線（不繞回去），所以 360 不會變成 0，
 * 吸過去的特別方向也挑在直線上最近的那一個（例如 359° 附近的 0.5° 會吸到 360.5°，超出範圍就不吸）。
 */
export function snapAngleLinear(raw: number, phi: number): number {
	const v = Math.min(360, Math.max(0, raw));
	const s = specialAngles(phi);
	let best: number | null = null;
	let bestD = MAGNET;
	for (const a0 of [s.up, s.perpA, s.down, s.perpB]) {
		for (const a of [a0, a0 + 360]) {
			if (a > 360) continue;
			const d = Math.abs(v - a);
			if (d < bestD) {
				best = a;
				bestD = d;
			}
		}
	}
	return best ?? Math.round(v);
}

/**
 * 滑桿的方向鍵：走到下一個 step 的倍數（已經在倍數上就走一整步），限制在 0 到 360。
 * 例如 80.54° 按右鍵到 85°、按左鍵到 80°。
 */
export function stepAngle(deg: number, dir: 1 | -1, step: number): number {
	const k = deg / step;
	const near = Math.round(k);
	const onGrid = Math.abs(k - near) < 1e-9;
	let next: number;
	if (dir > 0) next = (onGrid ? near + 1 : Math.ceil(k)) * step;
	else next = (onGrid ? near - 1 : Math.floor(k)) * step;
	return Math.min(360, Math.max(0, next));
}

// ---------- 畫圖的幾何（畫面座標，y 往下） ----------

export type ViewFrame = {
	unit: number;
	height: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
	/** 看得到的範圍（數學座標） */
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	sx: (x: number) => number;
	sy: (y: number) => number;
	fromScreen: (px: number, py: number) => Vec;
};

/** 正方形繪圖區：中心 (cx, cy)，往四邊各 half；width 是 SVG 的寬度（px） */
export function viewFrame(width: number, cx: number, cy: number, half: number, pads = PADS): ViewFrame {
	const side = width - pads.l - pads.r;
	const unit = side / (2 * half);
	return {
		unit,
		height: side + pads.t + pads.b,
		left: pads.l,
		right: pads.l + side,
		top: pads.t,
		bottom: pads.t + side,
		x0: cx - half,
		x1: cx + half,
		y0: cy - half,
		y1: cy + half,
		sx: (x) => pads.l + (x - cx + half) * unit,
		sy: (y) => pads.t + (cy + half - y) * unit,
		fromScreen: (px, py) => [(px - pads.l) / unit - half + cx, cy + half - (py - pads.t) / unit],
	};
}

/** 一個範圍和一群範圍重疊的總面積（px²）：標籤放不下、會壓到別的東西時就不畫 */
export function overlapCost(b: Box, avoid: Box[]): number {
	let sum = 0;
	for (const a of avoid) sum += Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
	return sum;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 一串點 → SVG 的折線 path（畫面座標） */
export const polylinePath = (pts: Vec[]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`).join(' ');

/** cos 波浪圖：橫軸 0° 到 360°，縱軸 −amp 到 amp（上下各留 pad.t、pad.b px） */
export type WaveFrame = {
	left: number;
	right: number;
	top: number;
	bottom: number;
	height: number;
	sx: (deg: number) => number;
	sy: (v: number) => number;
	/** 畫面 x → 角度（限制在 0 到 360） */
	degAt: (px: number) => number;
};

export const WAVE_PADS = { l: 50, r: 14, t: 30, b: 42 };

export function waveFrame(width: number, amp: number, plotH: number, pads = WAVE_PADS): WaveFrame {
	const w = width - pads.l - pads.r;
	const mid = pads.t + plotH / 2;
	const k = plotH / 2 / amp;
	return {
		left: pads.l,
		right: pads.l + w,
		top: pads.t,
		bottom: pads.t + plotH,
		height: pads.t + plotH + pads.b,
		sx: (deg) => pads.l + (deg / 360) * w,
		sy: (v) => mid - v * k,
		degAt: (px) => Math.min(360, Math.max(0, ((px - pads.l) / w) * 360)),
	};
}

/** 方向導數對角度的曲線：每 2° 取一點 */
export function wavePoints(g: Vec): Vec[] {
	return Array.from({ length: 181 }, (_, i) => [2 * i, dirDeriv(g, 2 * i)] as Vec);
}

// ---------- 數字格式 ----------

/** 角度：小數點後 2 位（80.54） */
export const fmtDeg = (d: number) => fmtFixed(d, 2);
/** 開根號、cos、u 的分量：小數點後 4 位 */
export const fmt4 = (v: number) => fmtFixed(v, 4);
/** 數值導數：小數點後 6 位，看得出和公式差一點點 */
export const fmt6 = (v: number) => fmtFixed(v, 6);
