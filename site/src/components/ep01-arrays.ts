/**
 * EP01 互動元件用到的陣列計算（和 NumPy 的行為一致）：
 * 廣播的形狀規則、axis 運算與 NumPy 風格的輸出格式、Softmax 的兩種寫法。
 * 沒有用到 React，方便單獨測試。
 */

export type Shape = number[];

// ---------- 形狀 ----------

export const MAX_DIM = 6;
export const MAX_NDIM = 4;

export const fmtShape = (s: Shape) => (s.length === 0 ? '()' : s.length === 1 ? `(${s[0]},)` : `(${s.join(', ')})`);

export const size = (s: Shape) => s.reduce((p, d) => p * d, 1);

/** 「2,3」「(2, 3)」「3」「()」都可以；回傳 null 表示看不懂 */
export function parseShape(text: string): Shape | null {
	const t = text
		.replace(/（/g, '(')
		.replace(/）/g, ')')
		.replace(/[，、]/g, ',')
		.trim();
	const inner = t.replace(/^\(/, '').replace(/\)$/, '').trim();
	if (inner === '') return [];
	const parts = inner
		.split(',')
		.map((p) => p.trim())
		.filter((p) => p !== '');
	if (parts.length === 0 || parts.length > MAX_NDIM) return null;
	const dims = parts.map(Number);
	if (dims.some((d) => !Number.isInteger(d) || d < 1 || d > MAX_DIM)) return null;
	return dims;
}

// ---------- 廣播 ----------

export type BroadcastCol = {
	da: number | null; // A 在這一欄的長度（null：A 沒有這一維）
	db: number | null;
	out: number | null; // 結果的長度（null：不相容）
	rule: string;
	stretchA: boolean; // A 在這一維被延伸
	stretchB: boolean;
};

/** 兩個形狀靠右對齊，逐欄套用廣播規則 */
export function broadcast(a: Shape, b: Shape) {
	const n = Math.max(a.length, b.length);
	const cols: BroadcastCol[] = [];
	for (let k = 0; k < n; k++) {
		const ia = k - (n - a.length);
		const ib = k - (n - b.length);
		const da = ia >= 0 ? a[ia] : null;
		const db = ib >= 0 ? b[ib] : null;
		const ea = da ?? 1;
		const eb = db ?? 1;
		let out: number | null;
		let rule: string;
		if (ea === eb) {
			out = ea;
			rule = da === null || db === null ? '沒有的當成 1，相等' : '相等';
		} else if (ea === 1) {
			out = eb;
			rule = da === null ? 'A 沒有這一維：當成 1，延伸' : 'A 是 1：延伸';
		} else if (eb === 1) {
			out = ea;
			rule = db === null ? 'B 沒有這一維：當成 1，延伸' : 'B 是 1：延伸';
		} else {
			out = null;
			rule = `${ea} 對 ${eb}：都不是 1，不相容`;
		}
		cols.push({
			da,
			db,
			out,
			rule,
			stretchA: out !== null && ea === 1 && out > 1,
			stretchB: out !== null && eb === 1 && out > 1,
		});
	}
	const ok = cols.every((c) => c.out !== null);
	return { cols, ok, result: ok ? (cols.map((c) => c.out) as number[]) : null };
}

/** 結果的位置 r 對應到原本形狀 s 的哪個元素（扁平索引），以及那一格是不是延伸出來的虛擬複製 */
export function source(s: Shape, r: number[]) {
	const offset = r.length - s.length;
	let flat = 0;
	let virtual = false;
	r.forEach((v, t) => {
		const sd = t - offset;
		if (sd < 0) {
			if (v !== 0) virtual = true;
			return;
		}
		if (s[sd] === 1 && v !== 0) virtual = true;
		flat = flat * s[sd] + (s[sd] === 1 ? 0 : v);
	});
	return { flat, virtual };
}

// ---------- axis ----------

export const AXIS_M = [
	[1, 2, 3],
	[4, 5, 6],
];

export type Op = 'sum' | 'mean' | 'max' | 'argmax';
export type Axis = 'none' | 0 | 1 | -1;

function reduce(op: Op, xs: number[]): number {
	if (op === 'sum') return xs.reduce((a, b) => a + b, 0);
	if (op === 'mean') return xs.reduce((a, b) => a + b, 0) / xs.length;
	const best = Math.max(...xs);
	return op === 'max' ? best : xs.indexOf(best);
}

const fmtNum = (v: number, op: Op) => (op === 'mean' ? (Number.isInteger(v) ? `${v}.` : `${v}`) : `${v}`);

/** 和 NumPy 的 print 一樣：同一個陣列裡的數字補成一樣寬 */
export function fmtArray(values: number[], op: Op, shape: Shape): string {
	const strs = values.map((v) => fmtNum(v, op));
	if (shape.length === 0) return strs[0];
	const w = Math.max(...strs.map((s) => s.length));
	const pad = strs.map((s) => s.padStart(w));
	if (shape.length === 1) return `[${pad.join(' ')}]`;
	const [r, c] = shape;
	const lines = [];
	for (let i = 0; i < r; i++) lines.push(`[${pad.slice(i * c, (i + 1) * c).join(' ')}]`);
	return `[${lines.join('\n ')}]`;
}

/** m.op(axis=..., keepdims=...) 的結果、形狀，以及 NumPy 會印出的文字 */
export function axisResult(op: Op, axis: Axis, keepdims: boolean) {
	const m = AXIS_M;
	const rows = m.length;
	const cols = m[0].length;
	const ax = axis === -1 ? 1 : axis;
	let values: number[];
	let shape: Shape;
	if (ax === 'none') {
		values = [reduce(op, m.flat())];
		shape = keepdims ? [1, 1] : [];
	} else if (ax === 0) {
		values = Array.from({ length: cols }, (_, j) => reduce(op, m.map((row) => row[j])));
		shape = keepdims ? [1, cols] : [cols];
	} else {
		values = m.map((row) => reduce(op, row));
		shape = keepdims ? [rows, 1] : [rows];
	}
	const call = `m.${op}(${[axis === 'none' ? '' : `axis=${axis}`, keepdims ? 'keepdims=True' : ''].filter(Boolean).join(', ')})`;
	return { values, shape, call, output: fmtArray(values, op, shape) };
}

// ---------- Softmax ----------

/** 直接照公式：e^z / Σe^z（分數很大或很小時會壞掉） */
export function softmaxNaive(z: number[]) {
	const e = z.map((v) => Math.exp(v));
	const sum = e.reduce((a, b) => a + b, 0);
	return { e, sum, p: e.map((v) => v / sum) };
}

/** 先減掉最大值再算（數值穩定） */
export function softmaxStable(z: number[]) {
	const max = Math.max(...z);
	const shifted = z.map((v) => v - max);
	const e = shifted.map((v) => Math.exp(v));
	const sum = e.reduce((a, b) => a + b, 0);
	return { max, shifted, e, sum, p: e.map((v) => v / sum) };
}

/** 顯示用：inf、nan 照 NumPy 的寫法；很大或很小的數用科學記號 */
export function fmtValue(v: number): string {
	if (Number.isNaN(v)) return 'nan';
	if (v === Infinity) return 'inf';
	if (v === -Infinity) return '-inf';
	if (v === 0) return '0';
	const a = Math.abs(v);
	if (a >= 1e6 || a < 1e-4) return v.toExponential(3).replace(/\.?0+e/, 'e');
	return String(Number(v.toFixed(4)));
}
