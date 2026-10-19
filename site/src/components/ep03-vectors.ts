/**
 * EP03 互動元件（DotProductDemo、LinearMapDemo）用到的計算、數字格式與畫圖的幾何。
 * 沒有用到 React，方便單獨測試。
 *
 * 兩個元件的數字都吸附到 0.5 的格點，所以內積、矩陣乘向量的結果都是 0.25 的倍數，
 * 電腦算起來沒有捨入誤差；只有長度（開根號）、夾角、cos θ 要四捨五入到固定位數。
 */

export type Vec = [number, number];
/** 2 × 2 矩陣，一列一列寫：[[第 1 列], [第 2 列]] */
export type Mat = [[number, number], [number, number]];

// ---------- 吸附與範圍 ----------

/** 拖動與輸入的步長 */
export const STEP = 0.5;

/** 吸附到最近的 0.5 格點，再限制在 −lim 到 lim 之間（不會出現 −0） */
export function snap(v: number, lim: number): number {
	const s = Math.round(v / STEP) * STEP;
	return Math.min(lim, Math.max(-lim, s)) + 0;
}

export const snapVec = (v: Vec, lim: number): Vec => [snap(v[0], lim), snap(v[1], lim)];

export const isZero = (v: Vec) => v[0] === 0 && v[1] === 0;
export const vecEq = (u: Vec, v: Vec) => u[0] === v[0] && u[1] === v[1];

// ---------- 內積、長度、夾角 ----------

/** 內積 a · b = a₁b₁ + a₂b₂ */
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

/** 長度 ‖a‖ = √(a₁² + a₂²)，和 np.linalg.norm 的算法相同（先算 a · a 再開根號） */
export const norm = (a: Vec) => Math.sqrt(dot(a, a));

/** 平面上的「外積」a₁b₂ − a₂b₁：0 表示兩支箭頭在同一條直線上；正的表示 b 在 a 的逆時針那一側 */
export const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];

export type Relation = 'zero' | 'same' | 'close' | 'perpendicular' | 'away' | 'opposite';

export type DotInfo = {
	/** 兩項乘積 a₁b₁、a₂b₂ */
	terms: Vec;
	dot: number;
	normA: number;
	normB: number;
	/** 有零向量時是 null（沒有方向，夾角與餘弦相似度無法計算） */
	cos: number | null;
	/** 夾角，單位是度 */
	angle: number | null;
	/** b 在 a 方向上的影子長 ‖b‖ cos θ = a · b / ‖a‖（夾角超過 90° 時是負的） */
	shadow: number | null;
	/** 從 b 的尖端垂直落到 a 所在直線的點（影子的另一端） */
	foot: Vec | null;
	relation: Relation;
};

/**
 * 和 NumPy 的算法一樣：cos θ = (a @ b) / (norm(a) * norm(b))，夾角 = np.degrees(np.arccos(cos θ))。
 * 同方向時 cos θ 可能算成 1.0000000000000002，先夾在 −1 到 1 之間，arccos 才不會變成 nan
 * （對應 np.clip(cos, -1, 1)）。
 */
export function dotInfo(a: Vec, b: Vec): DotInfo {
	const terms: Vec = [a[0] * b[0], a[1] * b[1]];
	const d = terms[0] + terms[1];
	const normA = norm(a);
	const normB = norm(b);
	if (isZero(a) || isZero(b)) {
		return { terms, dot: d, normA, normB, cos: null, angle: null, shadow: null, foot: null, relation: 'zero' };
	}
	const cos = Math.min(1, Math.max(-1, d / (normA * normB)));
	const angle = Math.acos(cos) * (180 / Math.PI);
	const k = d / dot(a, a);
	const foot: Vec = [k * a[0] + 0, k * a[1] + 0];
	// 正負號與「是否在同一條直線上」用沒有誤差的整數運算判斷（數字都是 0.5 的倍數）
	const c = cross(a, b);
	let relation: Relation;
	if (d === 0) relation = 'perpendicular';
	else if (d > 0) relation = c === 0 ? 'same' : 'close';
	else relation = c === 0 ? 'opposite' : 'away';
	return { terms, dot: d, normA, normB, cos, angle, shadow: d / normA, foot, relation };
}

export type DotPreset = { label: string; aria: string; a: Vec; b: Vec };

export const DOT_LIM = 4; // 分量的範圍 −4 到 4
export const DOT_HALF = 4.5; // 座標圖從 −4.5 畫到 4.5

export const DOT_PRESETS: DotPreset[] = [
	{ label: '45°', aria: '夾角 45 度：a = (3, 0)，b = (2, 2)', a: [3, 0], b: [2, 2] },
	{ label: '垂直', aria: '垂直：a = (2, 1)，b = (−1, 2)', a: [2, 1], b: [-1, 2] },
	{ label: '反方向', aria: '反方向：a = (2, 1)，b = (−2, −1)', a: [2, 1], b: [-2, -1] },
];

/** b 放大 2 倍之後還在範圍內（而且不是零向量）才能按「放大 b」 */
export const canDouble = (b: Vec, lim = DOT_LIM) => !isZero(b) && Math.abs(2 * b[0]) <= lim && Math.abs(2 * b[1]) <= lim;

// ---------- 矩陣與線性變換 ----------

export const MAT_LIM = 4; // 矩陣每個數字的範圍 −4 到 4
export const MAP_HALF = 6.5; // 座標圖從 −6.5 畫到 6.5（(3, 2) 會被送到 (6, 1)、(5, 2)）
/** 示範點 */
export const DEMO_P: Vec = [3, 2];

/** 第 j 欄（j = 0 或 1）：第 1 欄是 (1, 0) 的落點，第 2 欄是 (0, 1) 的落點 */
export const col = (m: Mat, j: 0 | 1): Vec => [m[0][j], m[1][j]];

/** 由兩欄組成矩陣 */
export const fromCols = (c1: Vec, c2: Vec): Mat => [
	[c1[0], c2[0]],
	[c1[1], c2[1]],
];

/** M x：欄觀點 x₁ × 第 1 欄 + x₂ × 第 2 欄；逐位和 NumPy 的 M @ x 相同 */
export const apply = (m: Mat, x: Vec): Vec => [m[0][0] * x[0] + m[0][1] * x[1] + 0, m[1][0] * x[0] + m[1][1] * x[1] + 0];

export const scale = (c: number, v: Vec): Vec => [c * v[0] + 0, c * v[1] + 0];

export const matEq = (p: Mat, q: Mat) => p[0][0] === q[0][0] && p[0][1] === q[0][1] && p[1][0] === q[1][0] && p[1][1] === q[1][1];

/** 兩欄在同一條直線上（或有一欄是零）：整個平面被壓扁，無法復原 */
export const isFlat = (m: Mat) => m[0][0] * m[1][1] - m[0][1] * m[1][0] === 0;
export const isZeroMat = (m: Mat) => m[0][0] === 0 && m[0][1] === 0 && m[1][0] === 0 && m[1][1] === 0;

export type MapPreset = { key: string; label: string; name: string; m: Mat; desc: string };

export const MAP_PRESETS: MapPreset[] = [
	{ key: 'identity', label: '恆等 I', name: '恆等矩陣 I', m: [[1, 0], [0, 1]], desc: '什麼都不做：每個點都留在原地，像乘以 1。' },
	{ key: 'scale', label: '縮放', name: '縮放', m: [[2, 0], [0, 0.5]], desc: '橫向拉長 2 倍、縱向壓成一半。' },
	{ key: 'rotate', label: '旋轉 90°', name: '旋轉 90°', m: [[0, -1], [1, 0]], desc: '繞原點逆時針轉 90°。' },
	{ key: 'shear', label: '剪切', name: '剪切', m: [[1, 1], [0, 1]], desc: '越高的點往右推越多，正方形變成平行四邊形。' },
	{ key: 'project', label: '投影', name: '投影', m: [[1, 0], [0, 0]], desc: '壓扁到 x 軸上，只留下影子。' },
];

/** 從 p 走到 q：t = 0 是 p，t = 1 剛好是 q */
export const lerpMat = (p: Mat, q: Mat, t: number): Mat => {
	if (t >= 1) return q;
	const f = (u: number, v: number) => u + (v - u) * t;
	return [
		[f(p[0][0], q[0][0]), f(p[0][1], q[0][1])],
		[f(p[1][0], q[1][0]), f(p[1][1], q[1][1])],
	];
};

/** 動畫的速度曲線：開始和結束慢、中間快 */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * 變換後的格線：原本的直線 y = k 和 x = k（k = −n … n）各取一段，兩端送進 M。
 * 線性變換把直線送到直線，所以只要變換兩個端點；壓扁的變換可能把一條線壓成一個點（兩端相同）。
 */
export function mappedGrid(m: Mat, n: number): { from: Vec; to: Vec; axis: boolean }[] {
	const lines: { from: Vec; to: Vec; axis: boolean }[] = [];
	for (let k = -n; k <= n; k++) {
		lines.push({ from: apply(m, [-n, k]), to: apply(m, [n, k]), axis: k === 0 });
		lines.push({ from: apply(m, [k, -n]), to: apply(m, [k, n]), axis: k === 0 });
	}
	return lines;
}

/** p 在正方形 |x|, |y| ≤ half 外面時，回傳從原點走向 p、碰到正方形邊界的那一點；在裡面就回傳 null */
export function exitPoint(p: Vec, half: number): Vec | null {
	const big = Math.max(Math.abs(p[0]), Math.abs(p[1]));
	if (big <= half) return null;
	const t = half / big;
	return [p[0] * t, p[1] * t];
}

// ---------- 數字格式 ----------

/** 負號用數學的「−」（U+2212） */
const minus = (s: string) => s.replace('-', '−');

/**
 * 沒有捨入誤差的數字（0.25 的倍數，例如分量、內積）：最多 4 位小數，去掉尾巴的 0。
 * 3 → "3"、−1.5 → "−1.5"、3.75 → "3.75"、−0 → "0"
 */
export function fmtNum(v: number): string {
	let s = v.toFixed(4);
	if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
	if (Number(s) === 0) return '0';
	return minus(s);
}

/** 給 <input> 用的寫法：負號用一般的「-」 */
export const fmtInput = (v: number) => fmtNum(v).replace('−', '-');

/** 乘法裡的負數加括號：−1.5 → "(−1.5)" */
export const fmtFactor = (v: number) => (v < 0 ? `(${fmtNum(v)})` : fmtNum(v));

/** 向量：(3, −1.5) */
export const fmtVec = (v: Vec) => `(${fmtNum(v[0])}, ${fmtNum(v[1])})`;

/**
 * 固定小數位數，和 Python 的 f"{x:.3f}" 一樣用「最接近的十進位」四捨五入；
 * 剛好在正中間（例如 0.0625 取 3 位）時，和 Python 一樣取偶數那一邊。
 * 負號用「−」，而且不顯示「−0.000」。
 */
export function fmtFixed(v: number, digits: number): string {
	let s = v.toFixed(digits);
	// toFixed 遇到剛好在正中間時取絕對值大的那一邊；檢查是不是剛好在中間，是的話改取偶數
	const scaled = Math.abs(v) * 10 ** digits;
	const lower = Math.floor(scaled);
	if (Number.isFinite(scaled) && scaled - lower === 0.5 && isExactHalf(Math.abs(v), lower, digits) && lower % 2 === 0) {
		s = ((v < 0 ? -1 : 1) * (lower / 10 ** digits)).toFixed(digits);
	}
	if (Number(s) === 0) return (0).toFixed(digits);
	return minus(s);
}

/** |v| 是不是剛好等於 (lower + 0.5) / 10^digits（用 BigInt 檢查，不受浮點誤差影響） */
function isExactHalf(absV: number, lower: number, digits: number): boolean {
	// absV = mant × 2^exp（mant 是整數）；比較 absV × 2 × 10^digits 和 2 × lower + 1
	let mant = absV;
	let exp = 0;
	while (!Number.isInteger(mant)) {
		mant *= 2;
		exp -= 1;
	}
	const lhs = BigInt(mant) * BigInt(2) * BigInt(10) ** BigInt(digits);
	const rhs = BigInt(2 * lower + 1);
	return exp === 0 ? lhs === rhs : lhs === rhs * BigInt(2) ** BigInt(-exp);
}

// ---------- 畫圖的幾何（畫面座標，y 往下） ----------

export type Frame = {
	unit: number;
	/** SVG 的高度（px）；寬度就是傳進來的 width */
	height: number;
	/** 正方形繪圖區的左、右、上、下邊（px） */
	left: number;
	right: number;
	top: number;
	bottom: number;
	sx: (x: number) => number;
	sy: (y: number) => number;
	/** 畫面座標 → 數學座標 */
	fromScreen: (px: number, py: number) => Vec;
};

/** 四周留白（px）：左邊和下面放刻度數字 */
export const PADS = { l: 28, r: 12, t: 12, b: 24 };

/** 正方形繪圖區：兩軸都從 −half 到 half；width 是 SVG 的寬度（px） */
export function plotFrame(width: number, half: number, pads = PADS): Frame {
	const side = width - pads.l - pads.r;
	const unit = side / (2 * half);
	return {
		unit,
		height: side + pads.t + pads.b,
		left: pads.l,
		right: pads.l + side,
		top: pads.t,
		bottom: pads.t + side,
		sx: (x) => pads.l + (x + half) * unit,
		sy: (y) => pads.t + (half - y) * unit,
		fromScreen: (px, py) => [(px - pads.l) / unit - half, half - (py - pads.t) / unit],
	};
}

// ---------- 標籤的位置：避開彼此和重要的點 ----------

/** 長方形範圍（畫面座標） */
export type Box = { x0: number; y0: number; x1: number; y1: number };
/** 文字的位置（SVG 的 x、y、text-anchor；垂直方向置中） */
export type Spot = { x: number; y: number; anchor: 'start' | 'middle' | 'end' };

/** 估計文字寬度（px）：中文與全形字約 1 個字高，其他約 0.6 個字高 */
export function textWidth(text: string, px: number): number {
	let w = 0;
	for (const ch of text) w += /[\u2E80-\u9FFF\uF900-\uFFEF]/.test(ch) ? px : 0.6 * px;
	return w;
}

/** 文字佔的範圍 */
export function spotBox(s: Spot, w: number, h: number): Box {
	const x0 = s.anchor === 'start' ? s.x : s.anchor === 'end' ? s.x - w : s.x - w / 2;
	return { x0, y0: s.y - h / 2, x1: x0 + w, y1: s.y + h / 2 };
}

/** 點（例如箭頭尖端）周圍半徑 r 的範圍 */
export const pointBox = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

/** 線段 p → q：沿線每隔 r px 放一個半徑 r 的小方塊，讓標籤避開這條線 */
export function segmentBoxes(p: Vec, q: Vec, r: number): Box[] {
	const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
	const n = Math.max(1, Math.ceil(len / r));
	return Array.from({ length: n + 1 }, (_, i) => pointBox(p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n, r));
}

/** 兩個範圍重疊的面積 */
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const inside = (a: Box, b: Box) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;

/**
 * 在完全落在 bounds 裡的候選位置中，選和 avoid 重疊面積最小的；一樣小時選排在前面的
 * （所以完全不重疊的位置裡，第一個會被選中）。沒有候選位置在 bounds 裡時用第一個。
 */
export function placeLabel(cands: Spot[], w: number, h: number, avoid: Box[], bounds: Box): { spot: Spot; box: Box } {
	const boxes = cands.map((c) => spotBox(c, w, h));
	let pick = -1;
	let best = Infinity;
	boxes.forEach((b, i) => {
		if (!inside(b, bounds)) return;
		const cost = avoid.reduce((sum, a) => sum + overlapArea(a, b), 0);
		if (cost < best) {
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

/**
 * 把候選位置重新排序：文字的中心越往「背對 other」的方向（從 other 指向 at）越前面。
 * 兩個點靠得很近時，各自的名字放在外側，才不會看起來像是在標另一個點。other 是 null 時不改順序。
 */
export function awayFrom(cands: Spot[], at: Vec, other: Vec | null, w: number): Spot[] {
	if (!other) return cands;
	const dx = at[0] - other[0];
	const dy = at[1] - other[1];
	const len = Math.hypot(dx, dy);
	if (len < 1e-9) return cands;
	const score = (s: Spot) => {
		const b = spotBox(s, w, 0);
		return (((b.x0 + b.x1) / 2 - at[0]) * dx + (s.y - at[1]) * dy) / len;
	};
	return cands
		.map((s, i) => ({ s, i, k: Math.round(score(s)) }))
		.sort((p, q) => q.k - p.k || p.i - q.i)
		.map((c) => c.s);
}

/**
 * around 的 8 個位置，再加上 4 個「在點的正上方或正下方、但文字往左或往右對齊」的位置：
 * 點靠近圖的左右兩邊、置中放不下時，文字仍然可以留在點的上面或下面。
 */
export function aroundWide(x: number, y: number, d: number): Spot[] {
	return [
		...around(x, y, d),
		{ x: x + 8, y: y - d, anchor: 'end' },
		{ x: x - 8, y: y - d, anchor: 'start' },
		{ x: x + 8, y: y + d, anchor: 'end' },
		{ x: x - 8, y: y + d, anchor: 'start' },
	];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 箭頭：從 (x1, y1) 指到 (x2, y2)。回傳箭桿的終點（箭頭三角形的底）和三角形的 path。
 * 箭頭比三角形還短時，三角形跟著縮小；長度是 0 時回傳 null。
 */
export function arrowShape(x1: number, y1: number, x2: number, y2: number, head = 13, width = 11) {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const len = Math.hypot(dx, dy);
	if (len < 0.5) return null;
	const ux = dx / len;
	const uy = dy / len;
	const h = Math.min(head, len * 0.6);
	const w = (width / 2) * (h / head);
	const bx = x2 - ux * h;
	const by = y2 - uy * h;
	return {
		shaftEnd: [r2(bx + ux * 1), r2(by + uy * 1)] as Vec,
		head: `M${r2(x2)} ${r2(y2)} L${r2(bx - uy * w)} ${r2(by + ux * w)} L${r2(bx + uy * w)} ${r2(by - ux * w)} Z`,
	};
}

/**
 * 夾角的圓弧：圓心在畫面座標 (cx, cy)，半徑 r，從 a 的方向轉到 b 的方向（走比較小的那一邊，最多 180°）。
 * 回傳 path 和弧的正中間那一點的方向（畫面座標的單位向量），用來放「θ」。
 */
export function anglePath(a: Vec, b: Vec, cx: number, cy: number, r: number) {
	const start = Math.atan2(a[1], a[0]);
	const sweep = Math.atan2(cross(a, b), dot(a, b)); // −π 到 π，正的是逆時針
	const n = Math.max(2, Math.ceil((Math.abs(sweep) / Math.PI) * 24));
	const pts: string[] = [];
	for (let i = 0; i <= n; i++) {
		const t = start + (sweep * i) / n;
		pts.push(`${i === 0 ? 'M' : 'L'}${r2(cx + r * Math.cos(t))} ${r2(cy - r * Math.sin(t))}`);
	}
	const mid = start + sweep / 2;
	return { d: pts.join(' '), mid: [Math.cos(mid), -Math.sin(mid)] as Vec };
}

/** 一串點 → SVG 的多邊形 path（畫面座標） */
export const polygonPath = (pts: Vec[]) => `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`).join(' ')} Z`;
