/**
 * EP02 互動元件（CompoundDemo、ExpLogMirror）用到的計算與數字格式。
 * 沒有用到 React，方便單獨測試。
 */

/** 自然常數 e（和 Python 的 math.e 是同一個 float64） */
export const E = Math.E;

// ---------- 複利：(1 + 1/n)^n ----------

export type CompoundStep = { n: number; period: string };

/** 一年結算 n 次；period 是「多久結算一次」 */
export const COMPOUND_STEPS: CompoundStep[] = [
	{ n: 1, period: '一年' },
	{ n: 2, period: '半年' },
	{ n: 4, period: '每季' },
	{ n: 12, period: '每月' },
	{ n: 52, period: '每週' },
	{ n: 365, period: '每天' },
	{ n: 8760, period: '每小時' },
	{ n: 525600, period: '每分鐘' },
	{ n: 1000000, period: '大約每 32 秒' },
];

/**
 * x 的 n 次方（x > 0，n 是正整數），回傳最接近真正答案的 float64。
 *
 * 為什麼不直接寫 x ** n：瀏覽器的 ** 和 Python 的 ** 用的是不同的程式庫，
 * 有時最後一位會差一點點，例如 (1 + 1/12) ** 12，瀏覽器算出 2.6130352902246763，
 * Python 是 2.613035290224676。Python 的結果剛好是「最接近真正答案的 float64」，
 * 所以這裡先用 BigInt 保留很多位數算完，最後才捨入一次，就和 Python 一樣。
 */
export function powInt(x: number, n: number): number {
	if (!(x > 0) || !Number.isFinite(x)) throw new RangeError('x 要是正數');
	if (!Number.isInteger(n) || n < 0 || n > 2 ** 31) throw new RangeError('n 要是不太大的正整數');
	// x = m × 2^k，m 是整數（乘以 2 不會有誤差）
	let m = x;
	let k = 0;
	while (!Number.isInteger(m)) {
		m *= 2;
		k -= 1;
	}
	// 數字寫成 mant × 2^exp，mant 最多保留 PREC 個二進位位數（float64 只有 53 位）
	const PREC = 160;
	const trim = (mant: bigint, exp: number): [bigint, number] => {
		const extra = mant.toString(2).length - PREC;
		return extra > 0 ? [mant >> BigInt(extra), exp + extra] : [mant, exp];
	};
	let rMant = BigInt(1);
	let rExp = 0;
	let bMant = BigInt(m);
	let bExp = k;
	// 平方再平方：x^13 = x^8 · x^4 · x^1，只要做大約 2 × log2(n) 次乘法
	for (let p = n; p > 0; p = Math.floor(p / 2)) {
		if (p % 2 === 1) [rMant, rExp] = trim(rMant * bMant, rExp + bExp);
		if (p > 1) [bMant, bExp] = trim(bMant * bMant, bExp * 2);
	}
	// Number(BigInt) 會捨入到最接近的 float64，這是唯一的一次捨入；
	// 之後乘 2 的次方不會有誤差（分兩次乘，避免中間的 2 的次方太小變成 0）
	const e = rExp + PREC;
	const half = Math.trunc(e / 2);
	return Number(rMant) * 2 ** -PREC * 2 ** half * 2 ** (e - half);
}

/** 存 1 元、年利率 100%、一年結算 n 次，年底拿回的錢 */
export const compound = (n: number) => powInt(1 + 1 / n, n);

// ---------- 數字格式 ----------

/** 和 Python 的 repr 一樣：最短又能還原的寫法，整數補 .0（2 → 2.0） */
export function pyRepr(v: number): string {
	const s = String(v);
	return Number.isInteger(v) && !s.includes('e') ? `${s}.0` : s;
}

/** 整數加千分位：1000000 → 1,000,000 */
export const fmtInt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 取 3 位有效數字、不用科學記號，去掉尾巴的 0：0.0037143 → 0.00371；exact 表示沒有捨入 */
export function fmtSig3(v: number): { text: string; exact: boolean } {
	if (v === 0) return { text: '0', exact: true };
	const digits = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(v))));
	let text = v.toFixed(digits);
	if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
	return { text, exact: Number(text) === v };
}

/** 固定小數位數；負號用數學的「−」，而且不顯示「−0.00」 */
export function fmtFixed(v: number, digits: number): string {
	const s = v.toFixed(digits);
	if (Number(s) === 0) return (0).toFixed(digits);
	return s.replace('-', '−');
}

// ---------- 數線 ----------

export const LINE_MIN = 2;
export const LINE_MAX = 2.75;

/** 數字在數線上的位置（0 到 1） */
export const linePos = (v: number) => Math.min(1, Math.max(0, (v - LINE_MIN) / (LINE_MAX - LINE_MIN)));

// ---------- e^x 與 ln x 的鏡像 ----------

/** 座標圖的範圍，兩軸相同 */
export const PLOT_MIN = -3;
export const PLOT_MAX = 7.5;
/** 滑桿 x 的範圍：e^2 ≈ 7.39，剛好還在圖裡 */
export const MIRROR_X_MIN = -3;
export const MIRROR_X_MAX = 2;
export const MIRROR_X_STEP = 0.01;

export type Pt = [number, number];

/** 在 y = e^x 上取點：x 從圖的左邊界到 e^x 碰到上邊界（x = ln 7.5） */
export function expCurve(count = 200): Pt[] {
	const a = PLOT_MIN;
	const b = Math.log(PLOT_MAX);
	return Array.from({ length: count + 1 }, (_, i) => {
		const x = a + ((b - a) * i) / count;
		return [x, Math.exp(x)];
	});
}

/** y = ln x 的曲線：把 e^x 曲線上每個點 (a, b) 的座標對調成 (b, a) */
export const lnCurve = (count = 200): Pt[] => expCurve(count).map(([x, y]) => [y, x]);

/** 滑桿在 x 時：A 在 e^x 上，B 是 A 對 y = x 的鏡像，M 是 AB 的中點（落在 y = x 上） */
export function mirrorPoints(x: number) {
	const ex = Math.exp(x);
	const lnOfEx = Math.log(ex);
	const A: Pt = [x, ex];
	const B: Pt = [ex, lnOfEx];
	const M: Pt = [(x + ex) / 2, (ex + lnOfEx) / 2];
	return { ex, lnOfEx, A, B, M };
}

/** 一串點 → SVG path；toScreen 把數學座標換成畫面座標 */
export function toPath(points: Pt[], toScreen: (p: Pt) => Pt): string {
	return points
		.map((p, i) => {
			const [sx, sy] = toScreen(p);
			return `${i === 0 ? 'M' : 'L'}${sx.toFixed(2)} ${sy.toFixed(2)}`;
		})
		.join(' ');
}
