/**
 * EP07 互動元件（CrossEntropyStackDemo、SoftmaxGradDemo）用到的計算與數字格式。
 * 沒有用到 React，方便單獨測試。
 *
 * 數字照本集的 Python 寫法用 float64 實際算：
 * - Softmax 先減掉最大值（EP01）：e = np.exp(z − z.max())、q = e / e.sum()；
 * - logsumexp 也先減最大值：max + ln Σ e^(z − max)；
 * - ln 用 ep05-chain.ts 的 lnExact（和 np.log 一樣是最接近真正答案的 float64）；
 * - 加總、內積都從頭加到尾（3 個數時 np.sum 與 @ 也是這個順序）；
 * - 交叉熵 p̂ @ −ln q、熵 p̂ @ −ln p̂、KL＝交叉熵 − 熵，往負梯度走一步是 z − 1.0 × (q − p̂)，都和本集的程式一樣。
 * 畫面上的數字四捨五入到固定位數，和 np.round、Python 的格式化一致（剛好在正中間時取偶數）。
 */
import { fmtFixed, sciParts } from './ep04-calc.ts';
import { lnExact } from './ep05-chain.ts';

export { fmtFixed, sciParts };

/** 三個 token（EP06 的玩具資料：0 冷、1 熱、2 好） */
export const TOKENS = ['冷', '熱', '好'] as const;

// ---------- 共用的計算 ----------

/** 從頭加到尾 */
const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

/** 內積 a @ b：從頭加到尾 */
export const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

/** 穩定的 Softmax（EP01）：先減掉最大值再取 exp，輸出都大於 0、加起來是 1 */
export function softmax(z: readonly number[]): number[] {
	const m = Math.max(...z);
	const e = z.map((v) => Math.exp(v - m));
	const s = sum(e);
	return e.map((v) => v / s);
}

/** logsumexp(z) = ln Σ e^z，先減掉最大值（EP02） */
export function logsumexp(z: readonly number[]): number {
	const m = Math.max(...z);
	return m + lnExact(sum(z.map((v) => Math.exp(v - m))));
}

/** −ln v；v = 0 時是 ∞（ln 0 = −∞） */
const negLn = (v: number) => (v > 0 ? -lnExact(v) : Infinity);

/** 熵 H(p) = Σ p(x)(−ln p(x))（nat），0 × ln 0 當成 0 */
export const entropy = (p: readonly number[]) => p.reduce((s, v) => s + (v > 0 ? v * -lnExact(v) : 0), 0);

/** 交叉熵 H(p, q) = Σ p(x)(−ln q(x))（nat）；p > 0 的地方 q 是 0 時是 ∞ */
export const crossEntropy = (p: readonly number[], q: readonly number[]) => p.reduce((s, v, i) => s + (v > 0 ? v * negLn(q[i]) : 0), 0);

// ---------- 單位：nat 與 bit ----------

export type Unit = 'nat' | 'bit';

/** nat 換成 bit：除以 ln 2（1 bit = ln 2 nat）；∞ 還是 ∞ */
export const inUnit = (v: number, unit: Unit) => (unit === 'bit' ? v / Math.LN2 : v);

// ============================================================
// CrossEntropyStackDemo：交叉熵＝熵＋KL
// ============================================================

/** 資料：EP06 的 10 個 token 裡，冷 5 次、熱 2 次、好 3 次 */
export const COUNTS = [5, 2, 3];
export const N_DATA = 10;
/** 資料的比例 p̂ = 次數 / 10（和 np.bincount(data) / data.size 一樣，剛好是 0.5、0.2、0.3） */
export const P_HAT = COUNTS.map((c) => c / N_DATA);
/** 資料的熵 H(p̂)（nat）：1.0296530140645737 */
export const H_DATA = entropy(P_HAT);

/** 往負梯度走一步的步伐（固定 1.0；怎麼選是 EP08 的事） */
export const STEP_SIZE = 1.0;

/** 拖動 q 的範圍與格點 */
export const Q_MIN = 0.01;
export const Q_MAX = 0.98;
export const Q_STEP = 0.01;

/** 吸附到 0.01 並限制在 0.01 到 0.98；用「整數 ÷ 100」得到和字面值一樣的 float64 */
export const snapQ = (v: number) => Math.max(Q_MIN * 100, Math.min(Q_MAX * 100, Math.round(v * 100))) / 100;

/** 數字框輸入的 q：格點是 0.001（和框裡顯示的 3 位小數一樣），限制在 0.01 到 0.98 */
export const snapQInput = (v: number) => Math.max(Q_MIN * 1000, Math.min(Q_MAX * 1000, Math.round(v * 1000))) / 1000;

/** 數字框按方向鍵：跳到下一個 0.01 的倍數（0.333 → 0.34 或 0.33），限制在 0.01 到 0.98 */
export function stepQ(v: number, dir: 1 | -1): number {
	const k = Math.round(v * 1000);
	const next = dir > 0 ? Math.floor(k / 10) * 10 + 10 : Math.ceil(k / 10) * 10 - 10;
	return Math.max(Q_MIN * 100, Math.min(Q_MAX * 100, next / 10)) / 100;
}

/** 起點：三個分數都是 0，Softmax 是 (1/3, 1/3, 1/3) */
export const Z_START = [0, 0, 0];

export type StackState = {
	z: number[];
	/** 模型的機率 q = Softmax(z) */
	q: number[];
	/** 損失＝交叉熵 H(p̂, q)（nat） */
	ce: number;
	/** 熵 H(p̂)（nat），不會變 */
	h: number;
	/** KL 散度 D(p̂ ‖ q) = 交叉熵 − 熵（nat） */
	kl: number;
	/** 困惑度 e^交叉熵 */
	ppl: number;
	/** 平均損失對分數的梯度 q − p̂ */
	grad: number[];
	/** 往負梯度走一步之後的分數 z − 1.0 × (q − p̂) */
	next: number[];
};

export function stackState(z: readonly number[]): StackState {
	const q = softmax(z);
	const ce = crossEntropy(P_HAT, q);
	const kl = ce - H_DATA;
	const grad = q.map((v, i) => v - P_HAT[i]);
	return {
		z: [...z],
		q,
		ce,
		h: H_DATA,
		kl,
		ppl: Math.exp(ce),
		grad,
		next: z.map((v, i) => v - STEP_SIZE * grad[i]),
	};
}

/** 往負梯度走一步：z 換成 z − 1.0 × (q − p̂) */
export const gradStep = (z: readonly number[]) => stackState(z).next;

/**
 * 把第 i 個 token 的機率設成 v（0 < v < 1），另外兩個照原本的比例縮放、加起來維持 1。
 * 在 Softmax 裡，這等於只改第 i 個分數、另外兩個分數不動：
 * q_i = e^(z_i) / (e^(z_i) + S)，S = 另外兩個的 e^z 加起來，所以 z_i = ln v − ln(1 − v) + ln S。
 */
export function withProb(z: readonly number[], i: number, v: number): number[] {
	const others = z.filter((_, j) => j !== i);
	const zi = lnExact(v) - lnExact(1 - v) + logsumexp(others);
	return z.map((x, j) => (j === i ? zi : x));
}

/** 起點的分數全部是 0（用來判斷「從 1/3 開始」按鈕是不是按下的狀態） */
export const isStart = (z: readonly number[]) => z.every((v) => v === 0);

/** 機率：3 位小數（和本集的 np.round(q, 3) 一樣）。比 0.0005 小時改用科學記號，不會寫成 0.000 */
export const Q_DIGITS = 3;
/** 交叉熵、熵、KL：4 位小數（和本集的 round(ce, 4) 一樣） */
export const LOSS_DIGITS = 4;
/** 困惑度：3 位小數（和本集的 round(np.exp(ce), 3) 一樣） */
export const PPL_DIGITS = 3;
/** 分數與梯度：3 位小數 */
export const Z_DIGITS = 3;

/** 資料的比例 p̂ 照原本的寫法：0.5、0.2、0.3（剛好，不用四捨五入） */
export const P_HAT_TEXT = ['0.5', '0.2', '0.3'];

/** 數字的寫法：一般的小數、科學記號、無限大 */
export type NumText = { kind: 'plain'; text: string } | { kind: 'sci'; mant: string; exp: number } | { kind: 'inf' };

/** 損失的寫法：∞ 照寫，其他固定 4 位小數 */
export const lossText = (v: number): NumText => (v === Infinity ? { kind: 'inf' } : { kind: 'plain', text: fmtFixed(v, LOSS_DIGITS) });

/** 困惑度的寫法：∞ 照寫，其他固定 3 位小數 */
export const pplText = (v: number): NumText => (v === Infinity ? { kind: 'inf' } : { kind: 'plain', text: fmtFixed(v, PPL_DIGITS) });

/** 機率的寫法：固定 digits 位小數；小到四捨五入會變成 0 的時候改用科學記號（有效數字 3 位），0 照寫 */
export function probText(v: number, digits = Q_DIGITS): NumText {
	if (v === 0) return { kind: 'plain', text: '0' };
	if (v === Infinity) return { kind: 'inf' };
	const text = fmtFixed(v, digits);
	if (/^−?[0.]+$/.test(text)) return { kind: 'sci', ...sciParts(v, 3) };
	return { kind: 'plain', text };
}

/** 純文字（測試、aria 用）：4.54 × 10⁻⁵ → '4.54e-05'，∞ → 'inf' */
export function numPlain(t: NumText): string {
	if (t.kind === 'inf') return 'inf';
	if (t.kind === 'plain') return t.text.replace('−', '-');
	return `${t.mant.replace('−', '-')}e${t.exp < 0 ? '-' : '+'}${String(Math.abs(t.exp)).padStart(2, '0')}`;
}

/** 給螢幕閱讀器念的：4.54 乘 10 的負 5 次方、無限大 */
export const numSpoken = (t: NumText) => (t.kind === 'inf' ? '無限大' : t.kind === 'plain' ? t.text : `${t.mant} 乘 10 的 ${t.exp < 0 ? `負 ${-t.exp}` : t.exp} 次方`);

/**
 * 「熵＋KL」各自四捨五入後加起來，和四捨五入後的交叉熵差最後一位的時候，回傳加起來的寫法（例如 1.0297 + 0.0302 = 1.0599，
 * 交叉熵是 1.0598）；一致或有 ∞ 時回傳 null。
 */
export function roundingGap(h: number, kl: number, ce: number, unit: Unit): string | null {
	if (!Number.isFinite(ce)) return null;
	const toInt = (v: number) => BigInt(fmtFixed(inUnit(v, unit), LOSS_DIGITS).replace('−', '-').replace('.', ''));
	const s = toInt(h) + toInt(kl);
	if (s === toInt(ce)) return null;
	const neg = s < BigInt(0);
	const digits = (neg ? -s : s).toString().padStart(LOSS_DIGITS + 1, '0');
	return `${neg ? '−' : ''}${digits.slice(0, -LOSS_DIGITS)}.${digits.slice(-LOSS_DIGITS)}`;
}

/** KL 用 nat 和 bit 寫都已經是 0.0000：交叉熵停在熵（bit 的數字比較大，所以只要看 bit） */
export const klGone = (kl: number) => Number.isFinite(kl) && fmtFixed(kl / Math.LN2, LOSS_DIGITS) === (0).toFixed(LOSS_DIGITS);

/** 堆疊長條的縱軸：0 到 1.5 nat（約 2.164 bit）；超過的部分畫到上緣為止，上面畫一個往上的三角形 */
export const STACK_MAX_NAT = 1.5;

/** 縱軸的刻度（照目前的單位）：位置用 nat 算（同一個量換單位，長條的高度不變） */
export function stackTicks(unit: Unit): { label: string; nat: number }[] {
	const vals = unit === 'nat' ? [0, 0.5, 1, 1.5] : [0, 0.5, 1, 1.5, 2];
	return vals.map((v) => ({ label: v === 0 ? '0' : fmtFixed(v, 1), nat: unit === 'bit' ? v * Math.LN2 : v }));
}

// ============================================================
// SoftmaxGradDemo：Softmax＋交叉熵的梯度 q − y
// ============================================================

export const G_Z_MIN = -8;
export const G_Z_MAX = 8;
export const G_Z_STEP = 0.1;

/** 吸附到 0.1 並限制在 −8 到 8；用「整數 ÷ 10」得到和字面值一樣的 float64（0.3，不是 0.30000000000000004） */
export const snapZ = (v: number) => Math.max(G_Z_MIN * 10, Math.min(G_Z_MAX * 10, Math.round(v * 10))) / 10 + 0;

/** ln 998：讓 Softmax(0, ln 998, 0) 剛好是 (0.001, 0.998, 0.001)（弄壞它 2） */
export const LN998 = lnExact(998);

export type GradPresetKey = 'doc' | 'wrong' | 'right' | 'flat';

export type GradPreset = { key: GradPresetKey; label: string; z: number[]; correct: number };

/**
 * 例子：
 * - 本節的分數 [1, 2, 3]，正確答案是冷（第 0 個）：q − y = (−0.910, 0.2447, 0.6652)；
 * - 很有把握卻答錯：(0, ln 998, 0)，正確答案是冷，只拿到 0.001（弄壞它 2）；
 * - 很有把握答對：(ln 998, 0, 0)，正確答案是冷，拿到 0.998；
 * - 三個一樣：(0, 0, 0)。
 */
export const GRAD_PRESETS: GradPreset[] = [
	{ key: 'doc', label: '分數 [1, 2, 3]', z: [1, 2, 3], correct: 0 },
	{ key: 'wrong', label: '很有把握卻答錯', z: [0, LN998, 0], correct: 0 },
	{ key: 'right', label: '很有把握答對', z: [LN998, 0, 0], correct: 0 },
	{ key: 'flat', label: '三個分數一樣', z: [0, 0, 0], correct: 0 },
];

export type LossKind = 'ce' | 'mse';

export type GradInfo = {
	z: number[];
	correct: number;
	q: number[];
	/** 正確答案的 one-hot */
	y: number[];
	/** 交叉熵損失 −ln q_正確 = logsumexp(z) − z_正確（nat） */
	ce: number;
	/** 均方誤差 mean((q − y)²)（3 個取平均） */
	mse: number;
	/** Softmax 的 Jacobian diag(q) − q qᵀ：第 i 列第 j 欄是 q_i (δ_ij − q_j) */
	jac: number[][];
	/** 交叉熵對 q 的梯度只有正確那一格：−1 / q_正確 */
	ceDq: number;
	/** 交叉熵對分數的梯度 q − y */
	ceGrad: number[];
	/** 均方誤差對 q 的梯度 (2/3)(q − y) */
	mseDq: number[];
	/** 均方誤差對分數的梯度：(2/3)(q − y) 這一列乘上 Jacobian */
	mseGrad: number[];
	/** 負梯度（箭頭）：交叉熵是 y − q */
	cePush: number[];
	msePush: number[];
	/** Jacobian 裡最大的一格（絕對值） */
	jacMax: number;
	/** 正確答案的推力：交叉熵是均方誤差的幾倍（均方誤差是 0 時是 null） */
	ratio: number | null;
};

export function gradInfo(z: readonly number[], correct: number): GradInfo {
	const q = softmax(z);
	const y = q.map((_, i) => (i === correct ? 1 : 0));
	const d = q.map((v, i) => v - y[i]);
	const jac = q.map((qi, i) => q.map((qj, j) => (i === j ? qi : 0) - qi * qj));
	const mseDq = d.map((v) => (2 * v) / 3);
	// 一列 × Jacobian：第 j 格是 Σ_i mseDq[i] × J[i][j]（從 i = 0 加到 2）
	const mseGrad = q.map((_, j) => mseDq.reduce((s, g, i) => s + g * jac[i][j], 0));
	const cePush = d.map((v) => -v + 0);
	const msePush = mseGrad.map((v) => -v + 0);
	const jacMax = Math.max(...jac.flat().map(Math.abs));
	return {
		z: [...z],
		correct,
		q,
		y,
		ce: logsumexp(z) - z[correct],
		mse: sum(d.map((v) => v * v)) / 3,
		jac,
		ceDq: -1 / q[correct],
		ceGrad: d,
		mseDq,
		mseGrad,
		cePush,
		msePush,
		jacMax,
		ratio: msePush[correct] !== 0 ? cePush[correct] / msePush[correct] : null,
	};
}

/** 箭頭（負梯度）、梯度：4 位小數 */
export const PUSH_DIGITS = 4;
/** Softmax 的機率：4 位小數（和本集的 np.round(q3, 4) 一樣） */
export const GQ_DIGITS = 4;
/** 推力比這個小，箭頭短到看不見：標「幾乎是 0」 */
export const NEAR_ZERO = 0.01;

/** 有正負號的寫法：+0.9100、−0.2447、0.0000（四捨五入後是 0 時不加正負號）；小到變成 0.0000 的改用科學記號 */
export function signedText(v: number, digits = PUSH_DIGITS): NumText {
	const t = probText(v, digits);
	if (t.kind === 'inf') return t;
	if (t.kind === 'plain') return { kind: 'plain', text: v > 0 ? `+${t.text}` : t.text };
	return { kind: 'sci', mant: v > 0 ? `+${t.mant}` : t.mant, exp: t.exp };
}

/** 一般的小數（梯度、Jacobian）：固定 digits 位，小到變成 0 時用科學記號 */
export const vecText = (v: number, digits = PUSH_DIGITS) => probText(v, digits);

/** 分數的寫法：2 位小數（滑桿一格是 0.1；例子裡的 ln 998 寫成 6.91） */
export const gzText = (v: number) => fmtFixed(v, 2);

/** 有效數字 sig 位，去掉小數：−1 / 0.09 → −11.11、−1 / 0.001 → −1000 */
export function sigFixed(v: number, sig: number): string {
	if (v === 0 || !Number.isFinite(v)) return String(v);
	const e = Math.floor(Math.log10(Math.abs(v)));
	const t = fmtFixed(v, Math.max(0, sig - 1 - e));
	return t;
}

/** 整數加千分位：12345 → 12,345 */
export const fmtInt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * 倍數的寫法：2 位有效數字。10 以上寫成整數、加千分位（751.5 → 750、13,456 → 13,000），
 * 10 以下留到第 2 位有效數字（3.36 → 3.4、0.345 → 0.35）；9.96 進位成 10。
 */
export function ratioText(r: number): string {
	const s = Number(r.toPrecision(2));
	return s >= 10 ? fmtInt(s) : s.toPrecision(2);
}
