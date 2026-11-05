import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import styles from './Ep08Logit.module.css';
import {
	accText,
	cutTemp,
	cutText,
	dayStack,
	FEATURES,
	fmtInt,
	FLOOR_LOSS,
	gradAt,
	gradText,
	isBlownUp,
	lossText,
	makeFrame,
	N_COLD,
	N_DAYS,
	paramText,
	pCold,
	PROBE_TEMPS,
	probText,
	T_MAX,
	T_MIN,
	TEMP,
	TRAIN_DEFAULT_LR,
	TRAIN_LRS,
	TRAIN_MAX_STEPS,
	trainMore,
	textWidth,
	trainStart,
	wrongDays,
	Y,
	type TrainLr,
	type TrainRow,
	type Vec,
} from './ep08-logit.ts';

/**
 * 第一個會學習的模型（本集重點）：示範資料 40 天的點（冷 = 1 在上緣、熱 = 0 在下緣），
 * 邏輯迴歸 p = σ(w x + b)，x = (氣溫 − 20) / 10。w、b 從 0 開始，按「走一步」做一輪訓練迴圈：
 * ① 算預測 → ② 算損失（平均二元交叉熵）→ ③ 算梯度 → ④ 往負梯度走一步。
 * 畫出 S 形曲線、分界氣溫（p = 0.5 的地方）、猜錯的日子，和損失、準確率的小圖。
 * 學習率可選 0.01、1、10、100；每個學習率各自從 0 開始訓練，換學習率不會清掉其他學習率走過的步數。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 560;
const LR_KEYS = TRAIN_LRS.map(String);
const STACK = dayStack();
const STEP_BUTTONS = [
	{ k: 1, label: '走一步' },
	{ k: 10, label: '走 10 步' },
	{ k: 100, label: '走 100 步' },
];
/** 小圖橫軸的長度：步數往上取到這些數 */
const X_NICE = [10, 20, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000];

/** 量一個元素的實際寬度 */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
	const ref = useRef<T>(null);
	const [w, setW] = useState(DEFAULT_W);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const update = () => {
			const v = Math.round(el.getBoundingClientRect().width);
			if (v > 0) setW(v);
		};
		update();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, w];
}

const r2 = (v: number) => Math.round(Math.max(-1e5, Math.min(1e5, v)) * 100) / 100;
const pathOf = (pts: Vec[]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`).join(' ');

/** 一條很長的折線：每一個畫面上的 px 只留第一、最小、最大、最後一個點（來回跳的線也畫得出來） */
function thinLine(pts: Vec[]): Vec[] {
	if (pts.length < 600) return pts;
	const out: Vec[] = [];
	let col = Math.floor(pts[0][0]);
	let bucket: Vec[] = [];
	const flush = () => {
		if (!bucket.length) return;
		let lo = bucket[0];
		let hi = bucket[0];
		for (const p of bucket) {
			if (p[1] < lo[1]) lo = p;
			if (p[1] > hi[1]) hi = p;
		}
		const keep = [bucket[0], lo, hi, bucket[bucket.length - 1]];
		keep.sort((a, b) => a[0] - b[0]);
		for (const p of keep) if (out[out.length - 1] !== p) out.push(p);
		bucket = [];
	};
	for (const p of pts) {
		const c = Math.floor(p[0]);
		if (c !== col) {
			flush();
			col = c;
		}
		bucket.push(p);
	}
	flush();
	return out;
}

const lrLabel = (lr: number) => String(lr);
/** 一串標籤（畫面的 y）照順序排開，彼此至少隔 gap px，而且都在 top 到 bottom 之間 */
function spread<T extends { y: number }>(items: T[], gap: number, top: number, bottom: number): T[] {
	const out = items.map((it) => ({ ...it })).sort((a, b) => a.y - b.y);
	for (let k = 1; k < out.length; k++) if (out[k].y - out[k - 1].y < gap) out[k].y = out[k - 1].y + gap;
	const over = out.length ? out[out.length - 1].y - bottom : 0;
	if (over > 0) for (const it of out) it.y -= over;
	for (let k = out.length - 2; k >= 0; k--) if (out[k + 1].y - out[k].y < gap) out[k].y = out[k + 1].y - gap;
	if (out.length && out[0].y < top) {
		const d = top - out[0].y;
		for (const it of out) it.y += d;
	}
	return out;
}

// ---------- S 形曲線與資料 ----------

type CurveProps = { width: number; row: TrainRow; prev: TrainRow | null; label: string; describedBy: string };

function CurvePlot({ width, row, prev, label, describedBy }: CurveProps) {
	const plotH = Math.round(Math.max(180, Math.min(260, width * 0.4)));
	const fr = makeFrame(width, plotH, T_MIN, T_MAX, 0, 1, { l: 40, r: 10, t: 30, b: 40 });
	const { sx, sy } = fr;
	const temps: number[] = [];
	for (let t = T_MIN; t <= T_MAX + 1e-9; t += 0.25) temps.push(t);
	const curve = (r: TrainRow) => pathOf(temps.map((t) => [sx(t), sy(pCold('std', r.w, r.b, t))] as Vec));
	const wrong = wrongDays(FEATURES.std, row.w, row.b);
	const cut = cutTemp('std', row.w, row.b);
	const cutIn = cut !== null && cut >= T_MIN && cut <= T_MAX;
	const showPrev = prev !== null && (prev.w !== row.w || prev.b !== row.b);
	const dotR = width < 420 ? 3.6 : 4.3;
	const gap = dotR * 2 + 1;
	const cutLabel = cut === null ? '' : `分界 ${cutText(cut)} °C`;
	const cutX = cutIn ? Math.min(fr.right - 52, Math.max(fr.left + 52, sx(cut as number))) : 0;

	return (
		<svg className={styles.plot} viewBox={`0 0 ${width} ${fr.height}`} role="img" aria-label={label} aria-describedby={describedBy}>
			<rect className={styles.plotBg} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
			{[5, 10, 15, 20, 25, 30, 35].map((t) => (
				<g key={t}>
					<line className={styles.gridMinor} x1={sx(t)} y1={fr.top} x2={sx(t)} y2={fr.bottom} />
					<text className={styles.tickText} x={sx(t)} y={fr.bottom + 16} textAnchor="middle">
						{t}
					</text>
				</g>
			))}
			{[0, 0.5, 1].map((p) => (
				<g key={p}>
					<line className={p === 0.5 ? styles.halfLine : styles.grid} x1={fr.left} y1={sy(p)} x2={fr.right} y2={sy(p)} />
					<text className={styles.tickText} x={fr.left - 6} y={sy(p) + 4} textAnchor="end">
						{p}
					</text>
				</g>
			))}
			<text className={styles.axisTitle} x={4} y={14} textAnchor="start">
				「冷」的機率 p
			</text>
			<text className={styles.axisTitle} x={fr.right} y={fr.bottom + 34} textAnchor="end">
				氣溫（°C）
			</text>

			{showPrev && prev ? <path className={styles.prevCurve} d={curve(prev)} /> : null}

			{/* 分界：p = 0.5 的地方 */}
			{cutIn ? (
				<g>
					<line className={styles.cutLine} x1={sx(cut as number)} y1={fr.top - 4} x2={sx(cut as number)} y2={fr.bottom} />
					<text className={`${styles.cutText} ${styles.halo}`} x={cutX} y={fr.top - 10} textAnchor="middle">
						{cutLabel}
					</text>
				</g>
			) : cut !== null ? (
				<text className={`${styles.cutText} ${styles.halo}`} x={cut < T_MIN ? fr.left + 4 : fr.right - 4} y={fr.top - 10} textAnchor={cut < T_MIN ? 'start' : 'end'}>
					{cut < T_MIN ? '← ' : ''}
					{cutLabel}（圖外）{cut > T_MAX ? ' →' : ''}
				</text>
			) : (
				<text className={`${styles.cutText} ${styles.halo}`} x={(fr.left + fr.right) / 2} y={fr.top - 10} textAnchor="middle">
					w = 0：沒有分界
				</text>
			)}

			{/* 40 天：冷畫在上緣、熱畫在下緣，同樣的氣溫往內疊 */}
			{TEMP.map((t, i) => {
				const cold = Y[i] === 1;
				const cy = cold ? sy(1) + STACK[i] * gap : sy(0) - STACK[i] * gap;
				return (
					<g key={i}>
						<circle className={cold ? styles.dotCold : styles.dotHot} cx={sx(t)} cy={cy} r={dotR} />
						{wrong[i] ? <circle className={styles.wrongRing} cx={sx(t)} cy={cy} r={dotR + 2.6} /> : null}
					</g>
				);
			})}

			<path className={styles.curve} d={curve(row)} />
			{cutIn ? <circle className={styles.nowDot} cx={sx(cut as number)} cy={sy(0.5)} r={4.5} /> : null}
			<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
		</svg>
	);
}

// ---------- 損失與準確率的小圖 ----------

type HistoryProps = { width: number; lr: TrainLr; hist: Record<string, TrainRow[]>; label: string };

function HistoryPlot({ width, lr, hist, label }: HistoryProps) {
	const rows = hist[String(lr)];
	const others = TRAIN_LRS.filter((v) => v !== lr && hist[String(v)].length > 1);
	const maxStep = Math.max(rows.length - 1, ...others.map((v) => hist[String(v)].length - 1));
	const xMax = X_NICE.find((n) => n >= maxStep) ?? TRAIN_MAX_STEPS;
	const shownLines = [rows, ...others.map((v) => hist[String(v)])];
	const maxLoss = Math.max(...shownLines.flatMap((rs) => rs.map((r) => (Number.isFinite(r.loss) ? r.loss : 0))));
	const yMax = maxLoss <= 0.8 ? 0.8 : Math.ceil(maxLoss * 2) / 2;
	const pads = { l: 40, r: 50, t: 22, b: 8 };
	const lossH = 120;
	const accH = 64;
	const gapH = 30;
	const fL = makeFrame(width, lossH, 0, xMax, 0, yMax, pads);
	const fA = makeFrame(width, accH, 0, xMax, 0.4, 1, { ...pads, t: pads.t + lossH + gapH, b: 30 });
	const lossPts = (rs: TrainRow[]) => thinLine(rs.map((r) => [fL.sx(r.step), fL.sy(Math.min(r.loss, yMax))] as Vec));
	const accPts = thinLine(rows.flatMap((r, i) => (i === 0 ? [[fA.sx(r.step), fA.sy(r.acc)] as Vec] : [[fA.sx(r.step), fA.sy(rows[i - 1].acc)] as Vec, [fA.sx(r.step), fA.sy(r.acc)] as Vec])));
	const cur = rows[rows.length - 1];
	const tickStep = yMax <= 0.8 ? 0.2 : yMax <= 2 ? 0.5 : 1;
	const lossTicks = Array.from({ length: Math.floor(yMax / tickStep + 1e-9) + 1 }, (_, k) => Math.round(k * tickStep * 10) / 10);
	const xTicks = [0, xMax / 2, xMax];
	const ln2 = Math.LN2;
	// 其他學習率的名字：放在線的右端，上下至少隔 13 px
	// 其他學習率的名字：寫在線的右端、和線尾一樣高；兩個名字撞在一起時，後一個往右排（排不下才往上移），
	// 不把名字推到別條線的高度，免得看起來像在標這個學習率的線
	const otherLabels: { v: number; x: number; y: number; w: number }[] = [];
	others
		.map((v) => {
			const rs = hist[String(v)];
			const last = rs[rs.length - 1];
			const y = Math.min(fL.bottom - 8, Math.max(fL.top + 4, fL.sy(Math.min(last.loss, yMax))));
			return { v, x: fL.sx(last.step) + 4, y, w: textWidth(`η = ${lrLabel(v)}`, 11.5) + 6 };
		})
		.sort((a, b) => a.x - b.x)
		.forEach((it) => {
			for (const p of otherLabels) {
				if (Math.abs(p.y - it.y) >= 13 || it.x >= p.x + p.w || p.x >= it.x + it.w) continue;
				if (p.x + p.w + it.w <= width - 2) it.x = p.x + p.w;
				else it.y = p.y - 13 >= fL.top + 4 ? p.y - 13 : p.y + 13;
			}
			otherLabels.push(it);
		});
	// 右邊的兩條虛線：ln 2 和谷底
	const refLabels = spread(
		[
			{ text: 'ln 2', y: fL.sy(ln2) },
			{ text: '谷底', y: fL.sy(FLOOR_LOSS) },
		],
		13,
		fL.top,
		fL.bottom + 4,
	);

	return (
		<svg className={styles.plot} viewBox={`0 0 ${width} ${fA.height}`} role="img" aria-label={label}>
			{/* 損失 */}
			<text className={styles.axisTitle} x={4} y={14} textAnchor="start">
				損失（nat）
			</text>
			{lossTicks.map((t) => (
				<g key={t}>
					<line className={styles.gridMinor} x1={fL.left} y1={fL.sy(t)} x2={fL.right} y2={fL.sy(t)} />
					<text className={styles.tickText} x={fL.left - 6} y={fL.sy(t) + 4} textAnchor="end">
						{t}
					</text>
				</g>
			))}
			<line className={styles.refLine} x1={fL.left} y1={fL.sy(ln2)} x2={fL.right} y2={fL.sy(ln2)} />
			<line className={styles.refLine} x1={fL.left} y1={fL.sy(FLOOR_LOSS)} x2={fL.right} y2={fL.sy(FLOOR_LOSS)} />
			{refLabels.map((r) => (
				<text key={r.text} className={styles.refText} x={fL.right + 4} y={r.y + 4} textAnchor="start">
					{r.text}
				</text>
			))}
			{others.map((v) => (
				<path key={v} className={styles.otherLine} d={pathOf(lossPts(hist[String(v)]))} />
			))}
			<path className={styles.lossLine} d={pathOf(lossPts(rows))} />
			<circle className={styles.lossDot} cx={fL.sx(cur.step)} cy={fL.sy(Math.min(cur.loss, yMax))} r={4} />
			<line className={styles.axisLine} x1={fL.left} y1={fL.bottom} x2={fL.right} y2={fL.bottom} />
			{/* 其他學習率的名字畫在線的上面（有白邊），不會被這個學習率的線劃過 */}
			{otherLabels.map((o) => (
				<text key={o.v} className={`${styles.otherText} ${styles.halo}`} x={o.x} y={o.y + 4} textAnchor="start">
					η = {lrLabel(o.v)}
				</text>
			))}

			{/* 準確率 */}
			<text className={styles.axisTitle} x={4} y={fA.top - 8} textAnchor="start">
				準確率
			</text>
			{[0.5, 1].map((t) => (
				<g key={t}>
					<line className={styles.gridMinor} x1={fA.left} y1={fA.sy(t)} x2={fA.right} y2={fA.sy(t)} />
					<text className={styles.tickText} x={fA.left - 6} y={fA.sy(t) + 4} textAnchor="end">
						{t}
					</text>
				</g>
			))}
			<path className={styles.accLine} d={pathOf(accPts)} />
			<circle className={styles.accDot} cx={fA.sx(cur.step)} cy={fA.sy(cur.acc)} r={4} />
			<line className={styles.axisLine} x1={fA.left} y1={fA.bottom} x2={fA.right} y2={fA.bottom} />
			{xTicks.map((t) => (
				<text key={t} className={styles.tickText} x={fA.sx(t)} y={fA.bottom + 16} textAnchor={t === 0 ? 'start' : t === xMax ? 'end' : 'middle'}>
					{fmtInt(t)}
				</text>
			))}
			<text className={styles.axisTitle} x={fA.right + 4} y={fA.bottom + 16} textAnchor="start">
				步
			</text>
		</svg>
	);
}

// ---------- 主元件 ----------

const freshHistory = (): Record<string, TrainRow[]> => Object.fromEntries(LR_KEYS.map((k) => [k, trainStart()]));

export default function LogisticTrainer() {
	const [lr, setLr] = useState<TrainLr>(TRAIN_DEFAULT_LR);
	const [hist, setHist] = useState<Record<string, TrainRow[]>>(freshHistory);
	const [prev, setPrev] = useState<TrainRow | null>(null);
	const [curveRef, wCurve] = useWidth<HTMLDivElement>();
	const [histRef, wHist] = useWidth<HTMLDivElement>();
	const uid = useId();
	const lrId = `${uid}-lr`;
	const hintId = `${uid}-hint`;

	const rows = hist[String(lr)];
	const cur = rows[rows.length - 1];
	const blown = isBlownUp(cur.w, cur.b) || !Number.isFinite(cur.loss);
	const atMax = cur.step >= TRAIN_MAX_STEPS;

	// ----- 操作 -----
	const walk = (k: number) => {
		setPrev(cur);
		setHist((h) => ({ ...h, [String(lr)]: trainMore(h[String(lr)], lr, k) }));
	};
	const reset = () => {
		setPrev(null);
		setHist((h) => ({ ...h, [String(lr)]: trainStart() }));
	};
	const pickLr = (v: TrainLr) => {
		setLr(v);
		setPrev(null);
	};

	// ----- 下一輪的四步（從現在的 w、b 算） -----
	const [dw, db] = gradAt(FEATURES.std, cur.w, cur.b);
	const nextW = cur.w - lr * dw;
	const nextB = cur.b - lr * db;
	const probes = PROBE_TEMPS.map((t) => probText(pCold('std', cur.w, cur.b, t)));
	const cut = cutTemp('std', cur.w, cur.b);
	const cutStr = cut === null ? '沒有分界' : `${cutText(cut)} °C`;
	const wrong = wrongDays(FEATURES.std, cur.w, cur.b);
	const wrongTemps = TEMP.filter((_, i) => wrong[i]);
	const factor = (v: number) => (v < 0 ? `(${gradText(v)})` : gradText(v));

	// ----- 說明 -----
	let note;
	const lossStr = lossText(cur.loss);
	if (blown) {
		note = (
			<p className={styles.bad}>
				<span className={styles.divTag}>發散</span> 參數變得非常大，停下來了。按「重來」。
			</p>
		);
	} else if (cur.step === 0) {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>什麼都沒學：</span>w = b = 0，每天 p = 0.5（S 形是 0.5 的水平線），損失 ln 2 = 0.6931。p ≥ 0.5 判成「冷」，所以全部判成「冷」，猜對 {N_COLD} 天，準確率 {N_COLD}／{N_DAYS} = {accText(N_COLD / N_DAYS)}。按「走一步」。
			</p>
		);
	} else if (lr === 100) {
		const a = rows[rows.length - 2];
		// 第 25 步之後被彈開：先忽高忽低一陣子，最近 10 步都比第 1 步還糟，才算「在兩個數之間來回跳」
		const settled = cur.step >= 36 && rows.slice(-10).every((r) => r.loss >= rows[1].loss);
		let peak = rows[Math.min(26, rows.length - 1)];
		for (const r of rows.slice(26)) if (r.loss > peak.loss) peak = r;
		note =
			cur.step < 26 ? (
				<p className={styles.note}>
					<span className={styles.tagWord}>學習率 100：</span>一步走很遠（第 1 步 w 就到 {paramText(rows[1].w)}）。損失暫時還在降，繼續走。
				</p>
			) : !settled ? (
				<p className={styles.note}>
					<span className={styles.tagWord}>被彈開了：</span>第 25 步降到 {lossText(rows[25].loss)}，之後損失又往上跳，最高到 {lossText(peak.loss)}（第 {fmtInt(peak.step)} 步）
					{peak.step === cur.step ? '' : `，現在是 ${lossStr}`}。每一步都走過頭，繼續走，看它最後停在哪裡。
				</p>
			) : (
				<p className={styles.bad}>
					<span className={styles.tagWord}>太大，會來回跳：</span>第 25 步降到 {lossText(rows[25].loss)}，又被彈開；現在損失在 {lossText(Math.min(a.loss, cur.loss))} 和 {lossText(Math.max(a.loss, cur.loss))} 之間跳，比第 1 步的 {lossText(rows[1].loss)} 還糟，分界也跟著左右跳。學習率沒有萬用的數字，要看損失曲線試。
				</p>
			);
	} else if (lr === 0.01) {
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>學習率 0.01 太小：</span>不會出錯，只是慢。每一步只動一點點，第 {fmtInt(cur.step)} 步損失才 {lossStr}
				{cur.step < 300 ? '，按「走 100 步」看看 300 步走到哪裡。' : '。'}
			</p>
		);
	} else if (lr === 10) {
		note =
			cur.step >= 100 ? (
				<p className={styles.ok}>
					<span className={styles.tagWord}>學習率 10 比 1 快：</span>不到 100 步就到谷底 {lossText(FLOOR_LOSS)}，再走也不會更低。準確率還是 {accText(cur.acc)}：猜錯的 {wrongTemps.length} 天在 {wrongTemps.join('、')} 度。
				</p>
			) : (
				<p className={styles.plain}>
					<span className={styles.tagWord}>學習率 10：</span>第 1 步損失就降到 {lossText(rows[1].loss)}，比學習率 1 的第 10 步還低。繼續走，看它多快到谷底 {lossText(FLOOR_LOSS)}。
				</p>
			);
	} else if (cur.step === 1) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>第 1 步準確率就到 {accText(cur.acc)}</span>，分界 {cutStr}。之後準確率還會變嗎？繼續走，看損失和準確率的小圖。
			</p>
		);
	} else if (cur.step < 300) {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>準確率停在 {accText(cur.acc)}，損失還在降：</span>w 從 {paramText(rows[1].w)} 變成 {paramText(cur.w)}，S 形越來越陡，模型越來越有把握。準確率只看 p 落在 0.5 的哪一邊，損失看正確答案拿到多少機率。
			</p>
		);
	} else {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>
					第 {fmtInt(cur.step)} 步：損失 {lossStr}，分界 {cutStr}。
				</span>
				猜錯的 {wrongTemps.length} 天（外面一圈）都在 {wrongTemps.join('、')} 度：同樣的氣溫有冷有熱，沒有任何一條 S 形能全部猜對，損失也降不到 0（谷底 {lossText(FLOOR_LOSS)}）。
			</p>
		);
	}

	const summary = `學習率 ${lr}，第 ${cur.step} 步：損失 ${lossStr}，準確率 ${accText(cur.acc)}（${cur.correct} 天猜對），分界氣溫 ${cut === null ? '沒有' : `${cutText(cut)} 度`}，w = ${paramText(cur.w)}，b = ${paramText(cur.b)}。`;
	const curveLabel = `示範資料 40 天的點：冷畫在上緣、熱畫在下緣。紫色 S 形曲線是模型給「冷」的機率，第 ${cur.step} 步${cut === null ? '是 0.5 的水平線' : `在 ${cutText(cut)} 度穿過 0.5`}；猜錯 ${N_DAYS - cur.correct} 天${wrongTemps.length && wrongTemps.length <= 6 ? `（${wrongTemps.join('、')} 度）` : ''}。`;
	const histLabel = `損失和準確率的小圖：學習率 ${lr} 走了 ${cur.step} 步，損失從 0.6931 到 ${lossStr}，準確率 ${accText(cur.acc)}。`;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="邏輯迴歸訓練互動示範：一步一步訓練第一個會學習的模型">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>
					第一個會學習的模型：一步一步訓練<span className={styles.demoTag}>示範資料</span>
				</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`} id={hintId}>
					40 天的氣溫和答案（1 = 冷、0 = 熱），模型 p = σ(w x + b)，x = (氣溫 − 20) ÷ 10。w、b 從 0 開始，按一次「走一步」就做一輪：① 算預測 → ② 算損失 → ③ 算梯度 → ④ 往負梯度走一步。
				</p>
			</div>

			<div className={styles.controls}>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={lrId}>
						學習率 η
					</span>
					<div className={styles.chips} role="group" aria-labelledby={lrId}>
						{TRAIN_LRS.map((v) => (
							<button key={v} type="button" className={styles.chip} aria-pressed={lr === v} onClick={() => pickLr(v)}>
								{lrLabel(v)}
							</button>
						))}
					</div>
				</div>
				<div className={styles.controlRow}>
					<div className={styles.chips}>
						{STEP_BUTTONS.map((s) => (
							<button key={s.k} type="button" className={`${styles.chip} ${s.k === 1 ? styles.action : ''}`} onClick={() => walk(s.k)} disabled={blown || atMax}>
								{s.label}
							</button>
						))}
						<button type="button" className={styles.chip} onClick={reset} disabled={cur.step === 0}>
							重來
						</button>
					</div>
				</div>
				<p className={`${styles.xs} ${styles.muted} ${styles.pretty}`}>每個學習率各自從 0 開始訓練；換學習率不會清掉其他學習率走過的步數，「重來」只清掉現在這個學習率。</p>
				<p className={styles.small}>
					學習率 {lr}，第 <span className={styles.stepCount}>{fmtInt(cur.step)}</span> 步
					{atMax ? `（最多走 ${fmtInt(TRAIN_MAX_STEPS)} 步）` : ''}
				</p>
			</div>

			<div className={styles.group}>
				<div ref={curveRef} className={styles.plotWrap}>
					<CurvePlot width={wCurve} row={cur} prev={prev} label={curveLabel} describedBy={hintId} />
				</div>
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swDot} ${styles.swCold}`} />冷（y = 1）
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swDot} ${styles.swHot}`} />熱（y = 0）
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swWrong}`} />
						猜錯的日子
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swCurve}`} />
						S 形曲線 p
					</span>
					{prev !== null && (prev.w !== cur.w || prev.b !== cur.b) ? (
						<span className={styles.legendItem}>
							<span className={`${styles.sw} ${styles.swPrev}`} />
							按按鈕之前的 S 形
						</span>
					) : null}
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swCut}`} />
						分界（p = 0.5）
					</span>
				</div>
			</div>

			<div className={styles.pair}>
				<div className={styles.panel}>
					<div className={styles.stats}>
						<div className={styles.stat}>
							<span className={styles.statLabel}>損失</span>
							<span className={`${styles.statValue} ${styles.lossValue}`}>{lossStr}</span>
							<span className={styles.statSub}>平均二元交叉熵（nat）</span>
						</div>
						<div className={styles.stat}>
							<span className={styles.statLabel}>準確率</span>
							<span className={`${styles.statValue} ${styles.accValue}`}>{accText(cur.acc)}</span>
							<span className={styles.statSub}>
								{cur.correct}／{N_DAYS} 天猜對
							</span>
						</div>
						<div className={styles.stat}>
							<span className={styles.statLabel}>分界氣溫</span>
							<span className={styles.statValue}>{cutStr}</span>
							<span className={styles.statSub}>20 − 10b ÷ w：比它冷就判「冷」</span>
						</div>
						<div className={styles.stat}>
							<span className={styles.statLabel}>參數</span>
							<span className={`${styles.statValue} ${styles.pathValue}`}>
								<span className={styles.nowrap}>w = {paramText(cur.w)}</span> <span className={styles.nowrap}>b = {paramText(cur.b)}</span>
							</span>
						</div>
					</div>
				</div>
				<div className={styles.panel} ref={histRef}>
					<HistoryPlot width={wHist} lr={lr} hist={hist} label={histLabel} />
					<p className={`${styles.xs} ${styles.muted} ${styles.pretty}`}>
						綠線是這個學習率的損失；走過的其他學習率畫成灰線（右端是學習率）。虛線：ln 2 = 0.693（什麼都沒學）、谷底 {lossText(FLOOR_LOSS)}。
					</p>
				</div>
			</div>

			<ol className={styles.loop} aria-label={`下一輪：第 ${cur.step} 步到第 ${cur.step + 1} 步`}>
				<li className={styles.loopTitle}>
					下一輪（第 {fmtInt(cur.step)} 步 → 第 {fmtInt(cur.step + 1)} 步）
				</li>
				<li className={styles.loopItem}>
					<span className={styles.loopNum}>①</span>
					<span className={styles.loopBody}>
						<span className={styles.loopName}>
							算預測：每一天「冷」的機率 <span className={styles.nowrap}>p = σ(w x + b)</span>
						</span>
						<span className={styles.probeRow} aria-hidden="true">
							{PROBE_TEMPS.map((t) => (
								<span key={t} className={styles.probeHead}>
									{t} 度
								</span>
							))}
							{probes.map((p, i) => (
								<span key={i}>{p}</span>
							))}
						</span>
						<span className={styles.srOnly}>{PROBE_TEMPS.map((t, i) => `${t} 度 ${probes[i]}`).join('、')}</span>
					</span>
				</li>
				<li className={styles.loopItem}>
					<span className={styles.loopNum}>②</span>
					<span className={styles.loopBody}>
						<span className={styles.loopName}>算損失：40 天平均的二元交叉熵</span>
						<span className={styles.deriv}>
							<span>loss =</span>{' '}
							<span>
								mean(ln(1 + e<sup>z</sup>) − y z)
							</span>{' '}
							<span>=</span>{' '}
							<span className={`${styles.lossValue} ${styles.tagWord}`}>{lossStr}</span>
						</span>
					</span>
				</li>
				<li className={styles.loopItem}>
					<span className={styles.loopNum}>③</span>
					<span className={styles.loopBody}>
						<span className={styles.loopName}>
							算梯度：<span className={styles.nowrap}>mean((p − y) x)</span>、<span className={styles.nowrap}>mean(p − y)</span>
						</span>
						<span className={styles.deriv}>
							<span>∂loss/∂w = {gradText(dw)}</span>
						</span>
						<span className={styles.deriv}>
							<span>∂loss/∂b = {gradText(db)}</span>
						</span>
					</span>
				</li>
				<li className={styles.loopItem}>
					<span className={styles.loopNum}>④</span>
					<span className={styles.loopBody}>
						<span className={styles.loopName}>往負梯度走一步（學習率 {lr}）</span>
						<span className={styles.deriv}>
							<span>w ←</span>{' '}
							<span>
								{paramText(cur.w)} − {lr} × {factor(dw)}
							</span>{' '}
							<span>
								= <span className={styles.tagWord}>{paramText(nextW)}</span>
							</span>
						</span>
						<span className={styles.deriv}>
							<span>b ←</span>{' '}
							<span>
								{paramText(cur.b)} − {lr} × {factor(db)}
							</span>{' '}
							<span>
								= <span className={styles.tagWord}>{paramText(nextB)}</span>
							</span>
						</span>
					</span>
				</li>
			</ol>

			{note}

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>
		</section>
	);
}

