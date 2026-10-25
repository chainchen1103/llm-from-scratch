/**
 * EP06 互動元件（JointTableDemo、SentenceChainDemo）用到的計算與數字格式。
 * 沒有用到 React，方便單獨測試。
 *
 * 數字照本集的 Python 寫法用 float64 實際算，和 NumPy 逐位相同：
 * - 表的加總、相除、外積照 joint.sum(axis=…)、joint / …、np.outer 的順序算；
 * - 連乘一個一個乘（np.prod 也是從頭乘到尾）；
 * - np.log 用 EP05 的 lnExact（最接近真正答案的 float64）；
 * - np.sum 照 NumPy 的分段加總（pairwise summation）的順序加，長的句子最後一位也一樣。
 * 畫面上的數字四捨五入到固定位數，和 np.round、Python 的格式化一致（剛好在正中間時取偶數）。
 */
import { fmtFixed, sciParts } from './ep04-calc.ts';
import { lnExact } from './ep05-chain.ts';
import { pyFloat } from './ep02-sums.ts';

export { fmtFixed, pyFloat, sciParts };

// ---------- 工具二：聯合機率表（示範數字） ----------

/** 列：前一個字 A */
export const PREV = ['很', '不'];
/** 欄：下一個字 B */
export const NEXT = ['冷', '熱', '好'];

/** 示範的聯合機率表，和本集的 joint 一樣 */
export const JOINT: number[][] = [
	[0.2, 0.15, 0.25],
	[0.05, 0.05, 0.3],
];

/** 同一張表的「百分之幾」（整數），用來判斷相除的結果是不是剛好（例如 0.15 / 0.60 = 0.25） */
export const JOINT_PCT: number[][] = [
	[20, 15, 25],
	[5, 5, 30],
];

/** 表格裡的機率：2 位小數（和本集的表一樣寫成 0.20、0.60） */
export const CELL_DIGITS = 2;
/** 條件機率：3 位小數（和本集的 np.round(cond, 3) 一樣） */
export const COND_DIGITS = 3;

/** 分數 n / d（n、d 是整數），只用來判斷「剛好」還是「約」 */
export type Ratio = { n: number; d: number };

/** n / d 四捨五入到 digits 位小數後，是不是剛好等於 n / d */
export const ratioExact = (r: Ratio, digits: number) => (r.n * 10 ** digits) % r.d === 0;

/** 表格：每一格、每一列的總和 P(A)、每一欄的總和 P(B)、全部的總和 */
export type Table = {
	cells: number[][];
	/** 每一格的分數（真實的表：百分之幾／100；如果獨立：P(A) P(B) 的萬分之幾／10000） */
	ratios: Ratio[][];
	rowSums: number[];
	colSums: number[];
	total: number;
};

/** joint.sum(axis=1)：每一列從左加到右 */
const sumRows = (m: number[][]) => m.map((row) => row.reduce((s, v) => s + v));
/** joint.sum(axis=0)：每一欄從上加到下 */
const sumCols = (m: number[][]) => m[0].map((_, j) => m.slice(1).reduce((s, row) => s + row[j], m[0][j]));

/** 真實的表 */
export function realTable(): Table {
	const rowSums = sumRows(JOINT);
	return {
		cells: JOINT.map((r) => [...r]),
		ratios: JOINT_PCT.map((r) => r.map((n) => ({ n, d: 100 }))),
		rowSums,
		colSums: sumCols(JOINT),
		total: rowSums.reduce((s, v) => s + v),
	};
}

/** 如果獨立：np.outer(p_prev, p_next)，第 i 列第 j 欄是 p_prev[i] × p_next[j] */
export function indepTable(): Table {
	const real = realTable();
	const cells = real.rowSums.map((a) => real.colSums.map((b) => a * b));
	const rowPct = JOINT_PCT.map((r) => r.reduce((s, v) => s + v));
	const colPct = JOINT_PCT[0].map((_, j) => JOINT_PCT[0][j] + JOINT_PCT[1][j]);
	const rowSums = sumRows(cells);
	return {
		cells,
		ratios: rowPct.map((a) => colPct.map((b) => ({ n: a * b, d: 10000 }))),
		rowSums,
		colSums: sumCols(cells),
		total: rowSums.reduce((s, v) => s + v),
	};
}

export const getTable = (indep: boolean) => (indep ? indepTable() : realTable());

/** 選了哪一列（前一個字）或哪一欄（下一個字） */
export type Pick = { kind: 'row'; i: number } | { kind: 'col'; j: number };

export type CondItem = {
	/** 這一項的字（選列時是下一個字，選欄時是前一個字） */
	label: string;
	/** 分子：那一格的聯合機率 */
	num: number;
	/** 條件機率＝分子 ÷ 那一列（欄）的總和 */
	value: number;
	exact: boolean;
	/** 另一張表的同一個條件機率（真實的表 ↔ 如果獨立），畫成虛線 */
	other: number;
	otherExact: boolean;
};

export type Conditional = {
	pick: Pick;
	/** 已經知道的那個字 */
	given: string;
	/** 那一列（欄）的總和，也就是 P(已知的字) */
	givenSum: number;
	items: CondItem[];
	/** 每一項加起來（float64） */
	sum: number;
};

/**
 * 條件分佈：選一列時是 joint / joint.sum(axis=1, keepdims=True) 的那一列，P(B | A)；
 * 選一欄時是 joint / joint.sum(axis=0) 的那一欄，P(A | B)。
 * 「如果獨立」的表照同樣的方法除，結果剛好是另一個字的邊際機率。
 */
export function conditional(pick: Pick, indep: boolean): Conditional {
	const cur = getTable(indep);
	const alt = getTable(!indep);
	const cond = (t: Table, i: number, j: number) => (pick.kind === 'row' ? t.cells[i][j] / t.rowSums[i] : t.cells[i][j] / t.colSums[j]);
	const ratio = (t: Table, i: number, j: number): Ratio => {
		const r = t.ratios[i][j];
		const d = pick.kind === 'row' ? t.ratios[i].reduce((s, x) => s + x.n, 0) : t.ratios.reduce((s, row) => s + row[j].n, 0);
		return { n: r.n, d };
	};
	const idx: [number, number][] = pick.kind === 'row' ? NEXT.map((_, j) => [pick.i, j]) : PREV.map((_, i) => [i, pick.j]);
	const items = idx.map(([i, j]) => ({
		label: pick.kind === 'row' ? NEXT[j] : PREV[i],
		num: cur.cells[i][j],
		value: cond(cur, i, j),
		exact: ratioExact(ratio(cur, i, j), COND_DIGITS),
		other: cond(alt, i, j),
		otherExact: ratioExact(ratio(alt, i, j), COND_DIGITS),
	}));
	return {
		pick,
		given: pick.kind === 'row' ? PREV[pick.i] : NEXT[pick.j],
		givenSum: pick.kind === 'row' ? cur.rowSums[pick.i] : cur.colSums[pick.j],
		items,
		sum: items.reduce((s, it) => s + it.value, 0),
	};
}

export const cellText = (v: number) => fmtFixed(v, CELL_DIGITS);
export const condText = (v: number) => fmtFixed(v, COND_DIGITS);

/** 差多少（真實 − 如果獨立）：+0.05、−0.08、0.00 */
export function diffText(v: number): string {
	const s = fmtFixed(v, CELL_DIGITS);
	if (/^−?0\.0+$/.test(s)) return (0).toFixed(CELL_DIGITS);
	return s.startsWith('−') ? s : `+${s}`;
}

/** 表的右下角：總和是 1（float64 可能是 0.9999999999999999 或 1.0000000000000002，四捨五入後都是 1） */
export const totalText = (v: number) => (fmtFixed(v, 6) === '1.000000' ? '1' : cellText(v));

/** 每一格「真實 − 如果獨立」 */
export function tableDiff(): number[][] {
	const a = realTable().cells;
	const b = indepTable().cells;
	return a.map((row, i) => row.map((v, j) => v - b[i][j]));
}

// ---------- 工具三：一句話的機率＝條件機率的連乘 ----------

export const FORWARD = ['今天', '天', '氣', '很', '冷'];
export const BACKWARD = [...FORWARD].reverse();

/** 每一步的條件機率（字串和本集一樣；只有最後一個是 EP00 的實測） */
export const P_COND_TEXT = ['0.01', '0.2', '0.9', '0.3', '0.293'];
export const P_COND = P_COND_TEXT.map(Number);
/** 哪幾步是 EP00 的實測（其他是示範數字） */
export const MEASURED = [false, false, false, false, true];

/** 弄壞它 2：每個 token 單獨出現的機率（示範數字） */
export const P_SINGLE_TEXT: Record<string, string> = { 今天: '0.002', 天: '0.004', 氣: '0.003', 很: '0.01', 冷: '0.001' };

export const R_MIN = 1;
export const R_MAX = 200;
export const clampR = (r: number) => Math.max(R_MIN, Math.min(R_MAX, Math.round(r)));

/** float64 最小的正規數（約 2.2 × 10⁻³⁰⁸）：比它小的數只剩比較少的有效位數 */
export const FLOAT64_MIN_NORMAL = 2.2250738585072014e-308;

export type Mode = 'cond' | 'indep';

export type Step = {
	t: number;
	token: string;
	/** 條件：前面的 token 接起來（第一步、或當成獨立時是空字串） */
	context: string;
	p: number;
	pText: string;
	measured: boolean;
	/** ln p */
	ln: number;
	/** 連乘到這一步 */
	prod: number;
	/** 連乘到這一步，精確的有效位數 */
	prodSig: number;
	/** log 機率加到這一步（np.cumsum） */
	cumLn: number;
};

/** 小數字串 → 整數（去掉小數點），例如 '0.293' → 293n */
const decInt = (s: string) => BigInt(s.replace('.', '').replace(/^0+/, '') || '0');

/** 一串小數的乘積，精確寫出來有幾位有效數字（去掉頭尾的 0） */
export function exactSig(factors: string[]): number {
	let n = BigInt(1);
	for (const f of factors) n *= decInt(f);
	return n.toString().replace(/0+$/, '').length;
}

/** 一句話（照順序）每一步的機率字串 */
export function factorTexts(mode: Mode, reversed: boolean): string[] {
	const order = mode === 'indep' && reversed ? BACKWARD : FORWARD;
	return mode === 'indep' ? order.map((t) => P_SINGLE_TEXT[t]) : P_COND_TEXT;
}

/** 一句話的 5 步：條件機率模式只有正常的詞序；當成獨立時可以對調 */
export function sentenceSteps(mode: Mode, reversed: boolean): Step[] {
	const order = mode === 'indep' && reversed ? BACKWARD : FORWARD;
	const texts = factorTexts(mode, reversed);
	let prod = 1;
	let cumLn = 0;
	return order.map((token, k) => {
		const p = Number(texts[k]);
		const ln = lnExact(p);
		prod *= p;
		cumLn = k === 0 ? ln : cumLn + ln;
		return {
			t: k + 1,
			token,
			context: mode === 'cond' ? order.slice(0, k).join('') : '',
			p,
			pText: texts[k],
			measured: mode === 'cond' && MEASURED[k],
			ln,
			prod,
			prodSig: exactSig(texts.slice(0, k + 1)),
			cumLn,
		};
	});
}

/**
 * np.sum 的加法順序（NumPy 的 pairwise summation）：
 * 少於 8 個從頭加到尾；128 個以內用 8 個累加器輪流加、最後兩兩合併；更長的切成兩半各自加。
 */
export function npSum(xs: number[], lo = 0, n = xs.length): number {
	if (n < 8) {
		let s = -0;
		for (let i = 0; i < n; i++) s += xs[lo + i];
		return s;
	}
	if (n <= 128) {
		const r = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => xs[lo + k]);
		let i = 8;
		for (; i < n - (n % 8); i += 8) for (let k = 0; k < 8; k++) r[k] += xs[lo + i + k];
		let s = r[0] + r[1] + (r[2] + r[3]) + (r[4] + r[5] + (r[6] + r[7]));
		for (; i < n; i++) s += xs[lo + i];
		return s;
	}
	let n2 = Math.floor(n / 2);
	n2 -= n2 % 8;
	return npSum(xs, lo, n2) + npSum(xs, lo + n2, n - n2);
}

export type ZeroAt = {
	/** 第幾次重複（從 1 數） */
	rep: number;
	/** 那一次重複裡的第幾個 token（從 1 數） */
	t: number;
	token: string;
	/** 整句的第幾個 token（從 1 數） */
	index: number;
	/** 前一個 token 時的連乘（還沒變成 0） */
	before: number;
};

/** 句子重複 R_MAX 次時，連乘在哪裡第一次變成 0（一直沒變成 0 就是 null） */
export function firstZero(mode: Mode, reversed: boolean): ZeroAt | null {
	const order = mode === 'indep' && reversed ? BACKWARD : FORWARD;
	const ps = factorTexts(mode, reversed).map(Number);
	let prod = 1;
	for (let i = 0; i < R_MAX * ps.length; i++) {
		const before = prod;
		prod *= ps[i % ps.length];
		if (prod === 0) {
			const k = i % ps.length;
			return { rep: Math.floor(i / ps.length) + 1, t: k + 1, token: order[k], index: i + 1, before };
		}
	}
	return null;
}

export type Repeated = {
	r: number;
	/** token 數：5r */
	n: number;
	/** np.prod(np.tile(p, r))：float64 一個一個乘 */
	prod: number;
	/** 連乘精確寫出來有幾位有效數字 */
	prodSig: number;
	/** np.sum(np.log(np.tile(p, r))) */
	logSum: number;
	/** 一句話的 log 機率（r = 1 時的 logSum） */
	logOne: number;
	/** 真正的機率是 10 的幾次方 */
	log10: number;
	zero: ZeroAt | null;
	/** 這個 r 已經下溢成 0 */
	underflow: boolean;
	/** 還沒變成 0，但已經比最小的正規數小（只剩比較少的有效位數） */
	subnormal: boolean;
};

export function repeated(mode: Mode, reversed: boolean, r: number): Repeated {
	const texts = factorTexts(mode, reversed);
	const ps = texts.map(Number);
	const lns = ps.map(lnExact);
	const all: number[] = [];
	let prod = 1;
	for (let k = 0; k < r; k++)
		for (let i = 0; i < ps.length; i++) {
			prod *= ps[i];
			all.push(lns[i]);
		}
	const logSum = npSum(all);
	const zero = firstZero(mode, reversed);
	const allTexts: string[] = [];
	for (let k = 0; k < r; k++) allTexts.push(...texts);
	return {
		r,
		n: r * ps.length,
		prod,
		prodSig: exactSig(allTexts),
		logSum,
		logOne: npSum(lns),
		log10: logSum / Math.LN10,
		zero,
		underflow: prod === 0,
		subnormal: prod > 0 && prod < FLOAT64_MIN_NORMAL,
	};
}

// ---------- 機率的寫法 ----------

export type ProbParts = { mant: string; exp: number };

/** Python 印出來的寫法有幾位有效數字（最短、能還原的寫法） */
export const shortestDigits = (v: number) => v.toExponential().split('e')[0].replace('.', '').replace(/^0+/, '').length;

/** 連乘最多顯示幾位有效數字 */
export const PROB_SIG = 5;

/**
 * 連乘的機率寫成科學記號 m × 10^e：
 * 最多 5 位有效數字；精確的值本來就比較短時照精確的寫（1.8 × 10⁻³，不寫成 0.0018000000000000002 或 1.8000）；
 * 比最小的正規數還小時，float64 只剩幾位是準的，最多寫到 Python 印出來的位數（1e-323 → 1 × 10⁻³²³）。
 * 0 回傳 null。
 */
export function probParts(v: number, sig: number): ProbParts | null {
	if (v === 0) return null;
	let s = Math.min(PROB_SIG, sig);
	if (Math.abs(v) < FLOAT64_MIN_NORMAL) s = Math.min(s, shortestDigits(v));
	const { mant, exp } = sciParts(v, Math.max(1, s));
	return { mant, exp };
}

/**
 * 10 的 L 次方寫成 m × 10^e（從 log 加總換算回來的機率）：m 固定 3 位有效數字（2.50、1.10），1 ≤ m < 10。
 * L 很負的時候（例如 −2523.96）float64 存不下 10^L，所以把整數和小數部分分開算。
 */
export function pow10Fixed(L: number): { m: string; e: number } {
	let e = Math.floor(L);
	let m = (10 ** (L - e)).toPrecision(3);
	if (Number(m) >= 10) {
		e += 1;
		m = (Number(m) / 10).toPrecision(3);
	}
	return { m, e };
}

/** 給螢幕閱讀器念的：1.5822 乘 10 的負 4 次方 */
export const probSpoken = (p: ProbParts | null) => (p === null ? '0' : `${p.mant} 乘 10 的 ${p.exp < 0 ? `負 ${-p.exp}` : p.exp} 次方`);

/** log 機率：固定小數位數，負號用「−」（fmtFixed 已經換好） */
export const logText = (v: number, digits: number) => fmtFixed(v, digits);

/** 每一步的 ln p 與累加：3 位小數（和本集的 np.round(np.cumsum(...), 3) 一樣） */
export const STEP_LOG_DIGITS = 3;
/** 整句的 log 機率：4 位小數 */
export const SUM_LOG_DIGITS = 4;
