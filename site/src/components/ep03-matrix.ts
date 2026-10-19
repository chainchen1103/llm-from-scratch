/**
 * EP03 互動元件（MatmulStepper、QueryScoreDemo）用到的計算與數字格式。
 * 沒有用到 React，方便單獨測試；數字和 NumPy 的結果一致。
 */

export type Mat = number[][];
export type Vec2 = [number, number];

// ---------- 數字格式 ----------

/**
 * 固定小數位數。真的剛好在正中間時取偶數（和 Python 的 f"{x:.2f}"、NumPy 的 np.round 一樣），
 * JS 內建的 toFixed 遇到正中間一律往大的取，例如 (0.125).toFixed(2) 是 "0.13"，Python 和 NumPy 是 0.12。
 * 負號用數學的「−」，而且不顯示「−0.0」。
 */
export function fmtFixed(v: number, digits: number): string {
	if (!Number.isFinite(v)) return Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '−inf';
	const a = Math.abs(v);
	let s = a.toFixed(digits);
	// toFixed(100) 是完整的十進位展開（這裡的數字都不會小到需要更多位）
	const full = a.toFixed(100);
	const cut = full.indexOf('.') + digits + (digits > 0 ? 1 : 0);
	const kept = digits > 0 ? full.slice(0, cut) : full.slice(0, full.indexOf('.'));
	const rest = full.slice(digits > 0 ? cut : full.indexOf('.') + 1);
	if (/^50*$/.test(rest) && Number(kept[kept.length - 1]) % 2 === 0) s = kept;
	if (Number(s) === 0) return s;
	return v < 0 ? `−${s}` : s;
}

/** 輸入的數字（0.5 的倍數、矩陣裡的整數）：最短寫法，負號用「−」 */
export const fmtNum = (v: number): string => (v === 0 ? '0' : String(v).replace('-', '−'));

/** 算式裡的因數：負數加括號，例如 3×(−1) */
export const fmtFactor = (v: number): string => (v < 0 ? `(${fmtNum(v)})` : fmtNum(v));

/** 向量寫成 (4, 5, 6) */
export const fmtVec = (v: readonly number[]): string => `(${v.map(fmtNum).join(', ')})`;

/** 形狀寫成 (2, 3) */
export const fmtShape = ([m, n]: readonly number[]): string => `(${m}, ${n})`;

/** 矩陣寫成 [[4, −1], [10, −1]] */
export const fmtMat = (M: Mat): string => `[${M.map((r) => `[${r.map(fmtNum).join(', ')}]`).join(', ')}]`;

/** 權重寫成百分比，小數點後一位：0.70204779 → "70.2%"（和 np.round(w * 100, 1) 一致） */
export const fmtPct = (w: number): string => `${fmtFixed(w * 100, 1)}%`;

// ---------- 矩陣乘法 ----------

/** 教學文檔的例子：A 是 2 列 3 欄，B 是 3 列 2 欄 */
export const MAT_A: Mat = [
	[1, 2, 3],
	[4, 5, 6],
];
export const MAT_B: Mat = [
	[1, 0],
	[0, 1],
	[1, -1],
];

export type MatmulExample = {
	key: string;
	left: string; // 左邊矩陣的名字
	right: string; // 右邊矩陣的名字
	L: Mat;
	R: Mat;
};

/** 兩個例子：A @ B 是 (2, 3) @ (3, 2) → (2, 2)；順序對調的 B @ A 是 (3, 2) @ (2, 3) → (3, 3) */
export const MATMUL_EXAMPLES: MatmulExample[] = [
	{ key: 'AB', left: 'A', right: 'B', L: MAT_A, R: MAT_B },
	{ key: 'BA', left: 'B', right: 'A', L: MAT_B, R: MAT_A },
];

export const shapeOf = (M: Mat): [number, number] => [M.length, M[0]?.length ?? 0];

/** C 的一格：C[i, j] = L 的第 i 列 · R 的第 j 欄（i、j 是 Python 的索引，從 0 數） */
export type CellStep = {
	i: number;
	j: number;
	row: number[]; // L 的第 i 列
	col: number[]; // R 的第 j 欄
	products: number[]; // 對應位置相乘
	value: number; // 全部加起來
};

/** 逐格算 L @ R：一列一列、由左到右，回傳每一格的算法 */
export function matmulSteps(L: Mat, R: Mat): CellStep[] {
	const [m, n] = shapeOf(L);
	const [n2, p] = shapeOf(R);
	if (n !== n2) throw new RangeError(`形狀不合：${fmtShape([m, n])} @ ${fmtShape([n2, p])}`);
	const steps: CellStep[] = [];
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < p; j++) {
			const row = L[i];
			const col = R.map((r) => r[j]);
			const products = row.map((a, k) => a * col[k]);
			let value = 0;
			for (const x of products) value += x;
			steps.push({ i, j, row, col, products, value });
		}
	}
	return steps;
}

/** L @ R 的結果 */
export function matmul(L: Mat, R: Mat): Mat {
	const [m] = shapeOf(L);
	const [, p] = shapeOf(R);
	const steps = matmulSteps(L, R);
	return Array.from({ length: m }, (_, i) => steps.slice(i * p, (i + 1) * p).map((s) => s.value));
}

/** 這一格的算式：4×1 + 5×0 + 6×1 */
export const termsText = (row: readonly number[], col: readonly number[]): string =>
	row.map((a, k) => `${fmtFactor(a)}×${fmtFactor(col[k])}`).join(' + ');

// ---------- 查詢向量對 4 支 key 打分數 ----------

/**
 * 4 支固定的 key（2 維）。q 在一開始的 (1, 1) 時，分數剛好是 3、0、2、−2：
 * k₁ = (2, 1) 方向接近（夾角約 18°）、k₂ = (−1, 1) 垂直、k₃ = (2, 0) 有點像（45°）、k₄ = (−1, −1) 方向相反。
 */
export const KEYS: { v: Vec2; hint: string }[] = [
	{ v: [2, 1], hint: '方向接近' },
	{ v: [-1, 1], hint: '垂直' },
	{ v: [2, 0], hint: '有點像' },
	{ v: [-1, -1], hint: '方向相反' },
];

export const Q_START: Vec2 = [1, 1];
/** 可以拉長的 key：k₃（從 0 數是 2） */
export const LONG_KEY = 2;
export const LONG_FACTOR = 3;
export const Q_FACTOR = 2;
/** 拖動 q 時吸附到 0.5 的倍數 */
export const Q_SNAP = 0.5;

/** 座標圖的範圍（兩軸同比例）：右邊要放得下拉長後的 k₃ = (6, 0) */
export const PLOT = { xMin: -4.5, xMax: 6.5, yMin: -4.5, yMax: 4.5 };
/** 箭頭尖端（實際拿去打分數的 q）能到的範圍，四周留一點空間給名字 */
export const Q_LIMIT = { xMin: -4, xMax: 6, yMin: -4, yMax: 4 };

export type ScoreMode = 'dot' | 'cos';

export const dot = (a: readonly number[], b: readonly number[]): number => {
	let s = 0;
	for (let k = 0; k < a.length; k++) s += a[k] * b[k];
	return s;
};

/** 長度（範數）‖a‖：和 np.linalg.norm 一樣是 sqrt(a · a) */
export const norm = (a: readonly number[]): number => Math.sqrt(dot(a, a));

/** 餘弦相似度；有零向量時沒有方向，回傳 null（NumPy 會得到 nan） */
export function cosSim(a: readonly number[], b: readonly number[]): number | null {
	const d = norm(a) * norm(b);
	return d === 0 ? null : dot(a, b) / d;
}

/** 數值穩定的 Softmax：先減掉最大值，e 的次方最大是 e⁰ = 1，不會溢位 */
export function softmax(z: readonly number[]): number[] {
	const m = Math.max(...z);
	const e = z.map((v) => Math.exp(v - m));
	let s = 0;
	for (const x of e) s += x;
	return e.map((x) => x / s);
}

/** 夾角（度）；有零向量時是 null */
export function angleDeg(a: readonly number[], b: readonly number[]): number | null {
	const c = cosSim(a, b);
	if (c === null) return null;
	return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

export const scaleVec = (v: Vec2, s: number): Vec2 => [v[0] * s, v[1] * s];

/** 吸附到 step 的倍數（−0 改成 0） */
export const snap = (v: number, step = Q_SNAP): number => Math.round(v / step) * step + 0;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** q 的範圍：放大 2 倍時，放大前的 q 只能到一半，放大後的尖端才會留在圖裡 */
export function qBounds(doubled: boolean) {
	const f = doubled ? Q_FACTOR : 1;
	return { xMin: Q_LIMIT.xMin / f, xMax: Q_LIMIT.xMax / f, yMin: Q_LIMIT.yMin / f, yMax: Q_LIMIT.yMax / f };
}

/** 把 q 限制在範圍內並吸附到 0.5 */
export function fitQ(q: Vec2, doubled: boolean): Vec2 {
	const b = qBounds(doubled);
	return [snap(clamp(q[0], b.xMin, b.xMax)), snap(clamp(q[1], b.yMin, b.yMax))];
}

export type KeyScore = {
	k: Vec2; // 實際用的 key（k₃ 可能拉長了）
	dot: number; // kᵢ · q
	norm: number; // ‖kᵢ‖
	cos: number | null; // 餘弦相似度
	angle: number | null; // 夾角（度）
	score: number | null; // 這次用的分數（內積或餘弦相似度）
	weight: number | null; // Softmax 之後的權重
	best: boolean; // 分數最高（同分時可能不只一支）
};

export type QueryResult = {
	q: Vec2; // 實際拿去打分數的 q（可能放大了 2 倍）
	qNorm: number;
	keys: KeyScore[];
	maxScore: number | null;
	ok: boolean; // false：餘弦相似度遇到零向量，算不出來
};

/** 查詢 q 對 4 支 key 打分數 → Softmax → 權重 */
export function scoreQuery(qBase: Vec2, mode: ScoreMode, longKey: boolean, doubleQ: boolean): QueryResult {
	const q = doubleQ ? scaleVec(qBase, Q_FACTOR) : qBase;
	const ks = KEYS.map(({ v }, i) => (longKey && i === LONG_KEY ? scaleVec(v, LONG_FACTOR) : v));
	const dots = ks.map((k) => dot(k, q));
	const coss = ks.map((k) => cosSim(k, q));
	const scores: number[] | null = mode === 'dot' ? dots : coss.every((c) => c !== null) ? (coss as number[]) : null;
	const weights = scores ? softmax(scores) : null;
	const maxScore = scores ? Math.max(...scores) : null;
	return {
		q,
		qNorm: norm(q),
		keys: ks.map((k, i) => ({
			k,
			dot: dots[i],
			norm: norm(k),
			cos: coss[i],
			angle: angleDeg(k, q),
			score: scores ? scores[i] : null,
			weight: weights ? weights[i] : null,
			best: scores !== null && maxScore !== null && maxScore - scores[i] < 1e-12,
		})),
		maxScore,
		ok: scores !== null,
	};
}
