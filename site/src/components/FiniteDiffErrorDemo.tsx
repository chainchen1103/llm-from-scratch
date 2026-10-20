import { useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import styles from './Ep04Calc.module.css';
import {
	bestDecade,
	fdCurve,
	fdPoint,
	decadeH,
	FD_E_MAX,
	FD_E_MIN,
	FD_K_MAX,
	FD_K_MIN,
	FD_TRUE,
	fmtFixed,
	placeLabel,
	plotFrame,
	pointBox,
	polylineBoxes,
	sameDigits,
	sciParts,
	textWidth,
	commonPrefix,
	type Box,
	type FdPoint,
	type Spot,
} from './ep04-calc.ts';

/**
 * h 與數值導數的誤差（弄壞它 2）：eˣ 在 x = 1 的導數是 e，用前向差分與中央差分算，
 * 畫出誤差 |數值導數 − e| 隨 h 的變化。兩軸都是對數刻度，兩條線都是 V 字：
 * 右邊 h 太大，公式本身不準（截斷誤差）；左邊 h 太小，捨入誤差被放大。
 *
 * 數字全部在瀏覽器裡用 float64 實際算（Math.exp），和弄壞它 2 的 NumPy 程式一樣不先化簡公式。
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 560;
const PADS = { l: 46, r: 14, t: 30, b: 46 };
const VIEW = { xMin: FD_K_MIN - 0.35, xMax: FD_K_MAX + 0.35, yMin: FD_E_MIN - 0.4, yMax: FD_E_MAX + 0.4 };
const plotHeight = (w: number) => Math.round(Math.min(400, Math.max(270, w * 0.6)));

const CURVE = fdCurve();
const DECADES = Array.from({ length: FD_K_MAX - FD_K_MIN + 1 }, (_, i) => FD_K_MIN + i);
const BEST_FW = bestDecade(CURVE, 'fw');
const BEST_CE = bestDecade(CURVE, 'ce');
/** 谷底最接近的整數次方（給「最準」的狀態和按鈕用） */
const BEST_FW_K = Math.round(BEST_FW.k);
const BEST_CE_K = Math.round(BEST_CE.k);
const E_TEXT = fmtFixed(FD_TRUE, 12);

type Pt = [number, number];

/** 10 的次方：10⁻⁸（HTML 的上標） */
const Pow10 = ({ k }: { k: number }) =>
	k === 0 ? (
		<>1</>
	) : (
		<span className={styles.nowrap}>
			10<sup>{String(k).replace('-', '−')}</sup>
		</span>
	);

/** 科學記號：6.6 × 10⁻⁹ */
function Sci({ v, sig = 2 }: { v: number; sig?: number }) {
	const { mant, exp } = sciParts(v, sig);
	if (exp === 0) return <span className={styles.nowrap}>{mant}</span>;
	return (
		<span className={styles.nowrap}>
			{mant} × 10<sup>{String(exp).replace('-', '−')}</sup>
		</span>
	);
}

/** 給螢幕閱讀器念的整數：−8 → 負 8 */
const spokenInt = (n: number) => (n < 0 ? `負 ${-n}` : String(n));

const sciSpoken = (v: number, sig = 2) => {
	const { mant, exp } = sciParts(v, sig);
	return exp === 0 ? mant : `${mant} 乘 10 的 ${spokenInt(exp)} 次方`;
};

/** SVG 裡的 10 的次方（上標用 tspan） */
const SvgPow10 = ({ k }: { k: number }) =>
	k === 0 ? (
		<>1</>
	) : (
		<>
			10
			<tspan dy="-0.45em" fontSize="0.75em">
				{String(k).replace('-', '−')}
			</tspan>
		</>
	);

/**
 * 一個數字和另一個數字比，前面一樣的部分另外標出來。
 * mode = 'accuracy'：和 e 比，一樣的部分是「算對的位數」（綠），後面是誤差（珊瑚色）；
 * mode = 'cancel'：f(1 + h) 和 f(1) 比，一樣的部分相減後會全部抵消（黃底）。
 */
function Digits({ text, against, mode = 'accuracy' }: { text: string; against: string; mode?: 'accuracy' | 'cancel' }) {
	const n = commonPrefix(text, against);
	return (
		<span className={styles.nowrap}>
			<span className={mode === 'accuracy' ? styles.digitsSame : styles.digitsCancel}>{text.slice(0, n)}</span>
			<span className={mode === 'accuracy' ? styles.digitsDiff : undefined}>{text.slice(n)}</span>
		</span>
	);
}

type Status = 'trunc' | 'best' | 'round';
const statusOf = (k: number, best: number): Status => (k > best ? 'trunc' : k === best ? 'best' : 'round');
const STATUS_TEXT: Record<Status, string> = { trunc: '截斷誤差為主', best: '最準', round: '捨入誤差為主' };
const STATUS_CLS: Record<Status, string> = { trunc: styles.statusTrunc, best: styles.statusBest, round: styles.statusRound };

export default function FiniteDiffErrorDemo() {
	const [k, setK] = useState(FD_K_MAX);
	const [W, setW] = useState(DEFAULT_W);
	const wrapRef = useRef<HTMLDivElement>(null);
	const uid = useId();
	const clipId = `fd-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const sliderId = `${uid}-k`;
	const hintId = `${uid}-hint`;

	// 量座標圖的實際寬度
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const update = () => {
			const w = Math.round(el.getBoundingClientRect().width);
			if (w > 0) setW(w);
		};
		update();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const H = plotHeight(W);
	const fr = plotFrame(W, H, VIEW, PADS);
	const { sx, sy } = fr;
	const h = decadeH(k);
	const p: FdPoint = fdPoint(k, h);
	const fwStatus = statusOf(k, BEST_FW_K);
	const ceStatus = statusOf(k, BEST_CE_K);

	// 兩條線（畫面座標）；誤差剛好是 0 時畫在最下面
	const ly = (e: number) => (e > 0 ? Math.log10(e) : VIEW.yMin);
	const lines = useMemo(() => {
		const f = plotFrame(W, H, VIEW, PADS);
		const fw = CURVE.map((c) => [f.sx(c.k), f.sy(ly(c.fwErr))] as Pt);
		const ce = CURVE.map((c) => [f.sx(c.k), f.sy(ly(c.ceErr))] as Pt);
		const path = (pts: Pt[]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
		return { fw, ce, fwPath: path(fw), cePath: path(ce) };
	}, [W, H]);

	// 點圖：選最近的整數次方
	const onPlotClick = (e: ReactMouseEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		const px = ((e.clientX - r.left) * W) / r.width;
		const kk = Math.round(fr.fromX(px));
		setK(Math.min(FD_K_MAX, Math.max(FD_K_MIN, kk)));
	};

	// ----- 刻度 -----
	const decadePx = (fr.right - fr.left) / (VIEW.xMax - VIEW.xMin);
	const xTicks = decadePx >= 30 ? DECADES.filter((d) => d % 2 !== 0) : [-13, -9, -5, -1];
	const yTicks = [0, -4, -8, -12, -16];
	const yGrid = Array.from({ length: FD_E_MAX - FD_E_MIN + 1 }, (_, i) => FD_E_MIN + i);

	// ----- 目前的點、谷底的標籤 -----
	const cx = sx(k);
	const fwPt: Pt = [cx, sy(ly(p.fwErr))];
	const cePt: Pt = [cx, sy(ly(p.ceErr))];
	const bestFwPt: Pt = [sx(BEST_FW.k), sy(ly(BEST_FW.fwErr))];
	const bestCePt: Pt = [sx(BEST_CE.k), sy(ly(BEST_CE.ceErr))];
	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 2, x1: fr.right - 2, y1: fr.bottom - 2 };
	const avoid: Box[] = [
		...polylineBoxes(lines.fw, 4),
		...polylineBoxes(lines.ce, 4),
		pointBox(fwPt[0], fwPt[1], 10),
		pointBox(cePt[0], cePt[1], 10),
		{ x0: cx - 3, y0: fr.top, x1: cx + 3, y1: fr.bottom },
	];
	const bestLabel = (pt: Pt, text: string): { spot: Spot; box: Box } => {
		const w = textWidth(text, 13) + 4;
		const cands: Spot[] = [
			{ x: pt[0], y: pt[1] + 22, anchor: 'middle' },
			{ x: pt[0], y: pt[1] + 36, anchor: 'middle' },
			{ x: pt[0] + 12, y: pt[1] + 18, anchor: 'start' },
			{ x: pt[0] - 12, y: pt[1] + 18, anchor: 'end' },
			{ x: pt[0], y: pt[1] + 52, anchor: 'middle' },
			{ x: pt[0] + 14, y: pt[1], anchor: 'start' },
			{ x: pt[0] - 14, y: pt[1], anchor: 'end' },
		];
		const lab = placeLabel(cands, w, 17, avoid, bounds);
		avoid.push(lab.box);
		return lab;
	};
	avoid.push(pointBox(bestFwPt[0], bestFwPt[1], 10), pointBox(bestCePt[0], bestCePt[1], 10));
	const fwBestLab = bestLabel(bestFwPt, '前向最準');
	const ceBestLab = bestLabel(bestCePt, '中央最準');

	// ----- 文字 -----
	const fwText = fmtFixed(p.fw, 12);
	const ceText = fmtFixed(p.ce, 12);
	const fp = fmtFixed(Math.exp(1 + h), 15);
	const f1 = fmtFixed(Math.exp(1), 15);
	const same = sameDigits(fp, f1);
	const riseComputed = Math.exp(1 + h) - Math.exp(1);
	const riseTrue = FD_TRUE * Math.expm1(h); // e^(1+h) − e = e·(e^h − 1)，用 expm1 算才不會在相減時損失位數
	const relPct = fmtFixed((p.fwErr / FD_TRUE) * 100, 0);
	const kSpoken = spokenInt(k);
	const next = k < FD_K_MAX ? fdPoint(k + 1, decadeH(k + 1)) : null;

	let note: ReactNode;
	if (k >= -4) {
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>右邊：h 太大，公式本身不準（截斷誤差）。</span>
				h 每小 10 倍，前向差分的誤差小約 10 倍、中央差分小約 100 倍
				{next ? (
					<>
						（從 <Pow10 k={k + 1} /> 到 <Pow10 k={k} />：前向小了 {fmtFixed(next.fwErr / p.fwErr, 1)} 倍、中央小了 {fmtFixed(next.ceErr / p.ceErr, 1)} 倍）
					</>
				) : null}
				，所以右半邊兩條都是斜直線，中央那條比較陡。
			</p>
		);
	} else if (k >= -7) {
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>中央差分在 10<sup>−5</sup> 附近最準</span>，再往左捨入誤差就開始放大，線變得忽高忽低；前向差分還在往下走（它的截斷誤差比較大，要 h 更小才碰到谷底）。
			</p>
		);
	} else if (k === -8) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>前向差分在 10<sup>−8</sup> 最準</span>（V 字的谷底）：再往右，公式本身不準；再往左，捨入誤差放大。10<sup>−8</sup> 大約是 float64 約 16 位有效數字的一半。
			</p>
		);
	} else {
		note = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>左邊：h 太小，捨入誤差放大。</span>f(1 + h) 和 f(1) 前面 {same} 位都一樣，相減後這些位數全部抵消，剩下的幾乎都是捨入誤差，再除以很小的 h 就被放大。
				{k === FD_K_MIN ? (
					<>
						{' '}
						h = 10<sup>−15</sup> 時，前向差分算出 {fmtFixed(p.fw, 2)}，和 e 差了 {relPct}%。
					</>
				) : null}
			</p>
		);
	}

	const summary = `h = 10 的 ${kSpoken} 次方。前向差分 ${fwText}，誤差 ${sciSpoken(p.fwErr)}，${STATUS_TEXT[fwStatus]}；中央差分 ${ceText}，誤差 ${sciSpoken(p.ceErr)}，${STATUS_TEXT[ceStatus]}。`;

	const chips: { k: number; label: ReactNode; aria: string }[] = [
		{ k: FD_K_MAX, label: <>最大 <Pow10 k={FD_K_MAX} /></>, aria: `最大的 h：10 的 ${spokenInt(FD_K_MAX)} 次方` },
		{ k: BEST_CE_K, label: <>中央最準 <Pow10 k={BEST_CE_K} /></>, aria: `中央差分最準：10 的 ${spokenInt(BEST_CE_K)} 次方` },
		{ k: BEST_FW_K, label: <>前向最準 <Pow10 k={BEST_FW_K} /></>, aria: `前向差分最準：10 的 ${spokenInt(BEST_FW_K)} 次方` },
		{ k: FD_K_MIN, label: <>最小 <Pow10 k={FD_K_MIN} /></>, aria: `最小的 h：10 的 ${spokenInt(FD_K_MIN)} 次方` },
	];

	const card = (which: 'fw' | 'ce') => {
		const isFw = which === 'fw';
		const status = isFw ? fwStatus : ceStatus;
		return (
			<div className={styles.calc}>
				<div className={styles.calcHead}>
					<span className={isFw ? styles.fwName : styles.ceName}>{isFw ? '前向差分' : '中央差分'}</span>
					<span className={`${styles.status} ${STATUS_CLS[status]}`}>{STATUS_TEXT[status]}</span>
				</div>
				<p className={styles.deriv}>
					{isFw ? (
						<>
							<span>(f(1 + h) − f(1))</span>
							<span>/ h</span>
						</>
					) : (
						<>
							<span>(f(1 + h) − f(1 − h))</span>
							<span>/ (2h)</span>
						</>
					)}
				</p>
				<p className={styles.deriv}>
					<span>
						= <Digits text={isFw ? fwText : ceText} against={E_TEXT} />
					</span>
				</p>
				<p className={styles.deriv}>
					<span>
						誤差 = <span className={`${styles.result} ${styles.big}`}><Sci v={isFw ? p.fwErr : p.ceErr} /></span>
					</span>
				</p>
			</div>
		);
	};

	return (
		<section className={`not-content ${styles.demo}`} aria-label="h 與數值導數的誤差互動示範">
			<div className={styles.group}>
				<p className={styles.title}>h 越小，數值導數越準嗎？</p>
				<p className={`${styles.small} ${styles.muted}`}>
					e<sup>x</sup> 在 x = 1 的導數是 <span className={styles.mono}>e = {E_TEXT}…</span>。用前向差分和中央差分算，畫出誤差 |數值導數 − e|。兩軸都是對數刻度：每一大格乘 10。
				</p>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={sliderId}>
						h = <span className={styles.value}><Pow10 k={k} /></span>
					</label>
					<span className={`${styles.muted} ${styles.small}`}>
						程式寫成 <span className={styles.mono}>1e{String(k)}</span>；拖動滑桿，或按方向鍵一次一格
					</span>
				</div>
				<input
					id={sliderId}
					className={styles.slider}
					type="range"
					min={FD_K_MIN}
					max={FD_K_MAX}
					step={1}
					value={k}
					aria-valuetext={`h = 10 的 ${kSpoken} 次方`}
					aria-describedby={hintId}
					onChange={(e) => setK(Number(e.currentTarget.value))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>
						<Pow10 k={FD_K_MIN} />（h 很小）
					</span>
					<span>
						（h 比較大）<Pow10 k={FD_K_MAX} />
					</span>
				</div>
				<div className={styles.chips} role="group" aria-label="直接跳到某個 h">
					{chips.map((c) => (
						<button key={c.k} type="button" className={styles.chip} aria-pressed={k === c.k} aria-label={c.aria} onClick={() => setK(c.k)}>
							{c.label}
						</button>
					))}
				</div>
			</div>

			<div className={styles.plotWide} ref={wrapRef}>
				<svg
					className={`${styles.plot} ${styles.clickable}`}
					viewBox={`0 0 ${W} ${H}`}
					role="img"
					aria-label={`log–log 座標圖：橫軸 h 從 10 的負 15 次方到 10 的負 1 次方，縱軸是誤差。紫色是前向差分、藍色是中央差分，兩條都是 V 字。前向差分在 h = 10 的 ${spokenInt(BEST_FW_K)} 次方附近最準，中央差分在 10 的 ${spokenInt(BEST_CE_K)} 次方附近最準。目前 h = 10 的 ${kSpoken} 次方：前向誤差 ${sciSpoken(p.fwErr)}，中央誤差 ${sciSpoken(p.ceErr)}。`}
					aria-describedby={hintId}
					onClick={onPlotClick}
				>
					<defs>
						<clipPath id={clipId}>
							<rect x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
						</clipPath>
					</defs>

					{/* 格線：每一大格（乘 10）一條 */}
					{DECADES.map((d) => (
						<line key={`gx${d}`} className={d % 2 !== 0 ? styles.grid : styles.gridMinor} x1={sx(d)} y1={fr.top} x2={sx(d)} y2={fr.bottom} />
					))}
					{yGrid.map((d) => (
						<line key={`gy${d}`} className={d % 4 === 0 ? styles.grid : styles.gridMinor} x1={fr.left} y1={sy(d)} x2={fr.right} y2={sy(d)} />
					))}
					<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
					{xTicks.map((t) => (
						<text key={`tx${t}`} className={styles.tickText} x={sx(t)} y={fr.bottom + 18} textAnchor="middle">
							<SvgPow10 k={t} />
						</text>
					))}
					{yTicks.map((t) => (
						<text key={`ty${t}`} className={styles.tickText} x={fr.left - 6} y={sy(t) + 4.5} textAnchor="end">
							<SvgPow10 k={t} />
						</text>
					))}
					<text className={styles.axisTitle} x={fr.left} y={fr.top - 10} textAnchor="start">
						誤差 |數值導數 − e|
					</text>
					<text className={styles.axisTitle} x={(fr.left + fr.right) / 2} y={fr.bottom + 38} textAnchor="middle">
						h
					</text>

					<g clipPath={`url(#${clipId})`}>
						{/* 目前的 h */}
						<rect className={styles.cursorBand} x={cx - 0.5 * decadePx} y={fr.top} width={decadePx} height={fr.bottom - fr.top} />
						<line className={styles.cursor} x1={cx} y1={fr.top} x2={cx} y2={fr.bottom} />
						<path className={styles.ceLine} d={lines.cePath} />
						<path className={styles.fwLine} d={lines.fwPath} />
					</g>

					{/* 兩條線各自的谷底 */}
					<circle className={`${styles.bestRing} ${styles.bestRingFw}`} cx={bestFwPt[0]} cy={bestFwPt[1]} r={9} />
					<circle className={`${styles.bestRing} ${styles.bestRingCe}`} cx={bestCePt[0]} cy={bestCePt[1]} r={9} />
					<text className={`${styles.fwText} ${styles.halo}`} x={fwBestLab.spot.x} y={fwBestLab.spot.y} textAnchor={fwBestLab.spot.anchor} dominantBaseline="central" fontSize={13}>
						前向最準
					</text>
					<text className={`${styles.ceText} ${styles.halo}`} x={ceBestLab.spot.x} y={ceBestLab.spot.y} textAnchor={ceBestLab.spot.anchor} dominantBaseline="central" fontSize={13}>
						中央最準
					</text>

					{/* 目前 h 在兩條線上的點：前向畫大一點，兩點重疊時也看得到兩個顏色 */}
					<circle className={styles.fwDot} cx={fwPt[0]} cy={fwPt[1]} r={7} />
					<circle className={styles.ceDot} cx={cePt[0]} cy={cePt[1]} r={4.5} />
				</svg>
				<div className={styles.sides}>
					<p>
						<span className={styles.sideTitle}>← 左邊：h 太小</span>
						捨入誤差放大
					</p>
					<p>
						<span className={styles.sideTitle}>右邊：h 太大 →</span>
						公式本身不準（截斷誤差）
					</p>
				</div>
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={styles.swFw} />
						前向差分
					</span>
					<span className={styles.legendItem}>
						<span className={styles.swCe} />
						中央差分
					</span>
				</div>
				<p className={styles.hint} id={hintId}>
					滑桿一格是 10 倍；也可以點圖上任一處，選最近的那一格。
				</p>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.cols}>
				{card('fw')}
				{card('ce')}
			</div>

			<div className={styles.calc}>
				<p className={styles.calcTitle}>前向差分的分子：f(1 + h) − f(1)</p>
				<div className={styles.derivGrid}>
					<span>f(1 + h)</span>
					<span className={styles.rhs}>
						<span>
							= <Digits text={fp} against={f1} mode="cancel" />
						</span>
					</span>
					<span>f(1)</span>
					<span className={styles.rhs}>
						<span>
							= <Digits text={f1} against={fp} mode="cancel" />
						</span>
					</span>
					<span>相減</span>
					<span className={styles.rhs}>
						<span>
							= <Sci v={riseComputed} sig={3} />
						</span>
						<span className={styles.muted}>
							（真正的差 <Sci v={riseTrue} sig={3} />）
						</span>
					</span>
				</div>
				<p className={`${styles.small} ${styles.muted}`}>
					{same >= 2 ? (
						<>
							前 {same} 位一樣（<span className={styles.digitsCancel}>黃底</span>），相減後全部抵消，只剩大約 {Math.max(0, 16 - same)} 位有意義的數字（float64 約 16 位有效數字）。
						</>
					) : (
						<>兩個數差很多，相減不會損失有效數字；誤差主要來自公式本身。</>
					)}
				</p>
			</div>

			{note}

			<p className={`${styles.small} ${styles.muted}`}>
				經驗法則：前向差分的 h 取 10<sup>−8</sup> 左右，中央差分取 10<sup>−5</sup> 到 10<sup>−6</sup>，所以數值導數預設 <span className={`${styles.mono} ${styles.nowrap}`}>h=1e-5</span>。這些數在捨入誤差的雜訊裡，換一台電腦、換一個瀏覽器，最後幾位可能不一樣。
			</p>
		</section>
	);
}
