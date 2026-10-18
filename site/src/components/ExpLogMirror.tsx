import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './Ep02Curves.module.css';
import {
	expCurve,
	fmtFixed,
	lnCurve,
	mirrorPoints,
	MIRROR_X_MAX,
	MIRROR_X_MIN,
	MIRROR_X_STEP,
	PLOT_MAX,
	PLOT_MIN,
	toPath,
	type Pt,
} from './ep02-curves.ts';

/**
 * e^x 與 ln x 互為鏡像：拖動 x，A = (x, e^x) 在 e^x 上，
 * 把座標對調得到 B = (e^x, x)，它落在 ln x 上；A、B 對 y = x 這條斜線對稱。
 *
 * 兩軸同比例。viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小；
 * 還沒量到寬度之前（伺服器產生的 HTML）用預設大小，整張圖等比例縮放。
 */

const DEFAULT_SIZE = 400;
const PAD = 14; // 座標圖四周留白（px）
const GRID = Array.from({ length: 11 }, (_, i) => PLOT_MIN + i); // -3, -2, …, 7
const TICK_LABELS = [-2, 2, 4, 6];
const PRESETS = [-1, 0, 1, 2];
// 虛線名稱的位置：「y = x」在虛線左上、「鏡子」在右下，各自很短。
// AB 和虛線的交點最遠只到 (e² + 2) / 2 ≈ 4.69，手機上兩段字也和 AB 的連線隔開一段距離。
const MIRROR_LABEL_AT = 6.3;
const LABEL_AT = 6.8; // 曲線名稱的位置：e^x 在 y = 6.8 那一段的左邊，ln x 在 x = 6.8 那一段的下面
const EXP_POINTS = expCurve();
const LN_POINTS = lnCurve();

const fmtX = (x: number) => fmtFixed(x, 2);
const fmtY = (y: number) => fmtFixed(y, 4);

const ex = <>e<sup>x</sup></>;

function hintFor(x: number, ey: string): ReactNode {
	if (x === 0)
		return (
			<>
				x = 0：<span className={styles.nowrap}>e<sup>0</sup> = 1</span>，所以 <span className={styles.nowrap}>ln 1 = 0</span>。兩條曲線分別通過 <span className={styles.nowrap}>(0, 1)</span> 和 <span className={styles.nowrap}>(1, 0)</span>。
			</>
		);
	if (x === 1)
		return (
			<>
				x = 1：<span className={styles.nowrap}>e<sup>1</sup> = e ≈ 2.7183</span>，所以 <span className={styles.nowrap}>ln e = 1</span>。
			</>
		);
	if (x < 0) return <>x 是負數，{ex} 還是正的，只是比 1 小（{ey}）；所以比 1 小的正數，取 ln 是負的。</>;
	if (x < 1) return <>x 在 0 和 1 之間，{ex} 就在 1 和 e 之間；反過來，1 到 e 之間的數，取 ln 落在 0 到 1 之間。</>;
	return <>{ex} 往上衝得很快，鏡像的 ln x 就往右爬得很慢：輸入要變成 e 倍（約 2.718 倍），ln x 才多 1。</>;
}

export default function ExpLogMirror() {
	const [x, setX] = useState(1);
	const [size, setSize] = useState(DEFAULT_SIZE);
	const wrapRef = useRef<HTMLDivElement>(null);
	const sliderId = useId();
	const hintId = useId();

	// 量座標圖的實際寬度
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const update = () => {
			const w = Math.round(el.getBoundingClientRect().width);
			if (w > 0) setSize(w);
		};
		update();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// 數學座標 → 畫面座標（兩軸同比例）
	const unit = (size - 2 * PAD) / (PLOT_MAX - PLOT_MIN);
	const sx = (v: number) => PAD + (v - PLOT_MIN) * unit;
	const sy = (v: number) => PAD + (PLOT_MAX - v) * unit;
	const toScreen = ([a, b]: Pt): Pt => [sx(a), sy(b)];

	const expPath = useMemo(() => toPath(EXP_POINTS, toScreen), [size]);
	const lnPath = useMemo(() => toPath(LN_POINTS, toScreen), [size]);

	const { ex: ey, lnOfEx, A, B, M } = mirrorPoints(x);
	const [ax, ay] = toScreen(A);
	const [bx, by] = toScreen(B);
	const [mx, my] = toScreen(M);
	const fx = fmtX(x);
	const fy = fmtY(ey);
	const fl = fmtX(lnOfEx);

	// 點的名稱沿著曲線的法線方向、往遠離 y = x 的那一側放，並留在圖裡。
	// e^x 在 A 的斜率是 e^x，法線（畫面座標，往左上）是 (-e^x, -1)；B 是鏡像，法線是 (1, e^x)。
	const clamp = (v: number) => Math.min(size - 10, Math.max(10, v));
	const off = 15;
	const len = Math.hypot(ey, 1);
	const [nx, ny] = [ey / len, 1 / len];
	// A 往上走、B 往右走到曲線名稱附近（e^x > 4）時，A、B 的名稱改放到內側，離點線約 15 px
	const inner = ey > 4;
	const aLabel: Pt = inner ? [ax + 15, ay - 6] : [ax - off * nx, ay - off * ny];
	const bLabel: Pt = inner ? [bx + 6, by - 15] : [bx + off * ny, by + off * nx];
	// 直角記號：沿著 y = x（畫面上往右上）和沿著 AB（往左上，朝 A）
	const r = 9 / Math.SQRT2;
	const rightAngle = `M${mx + r} ${my - r} L${mx} ${my - 2 * r} L${mx - r} ${my - r}`;

	const o = [sx(0), sy(0)];
	const top = sy(PLOT_MAX);
	const right = sx(PLOT_MAX);

	return (
		<section className={`not-content ${styles.demo}`} aria-label="指數與對數鏡像互動示範">
			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={sliderId}>
						x = <span className={styles.value}>{fx}</span>
					</label>
					<span className={`${styles.muted} ${styles.small}`}>拖動滑桿，或按方向鍵微調</span>
				</div>
				<input
					id={sliderId}
					className={styles.slider}
					type="range"
					min={MIRROR_X_MIN}
					max={MIRROR_X_MAX}
					step={MIRROR_X_STEP}
					value={x}
					aria-valuetext={`x = ${fx}`}
					aria-describedby={hintId}
					onChange={(e) => setX(Number(e.currentTarget.value))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>−3</span>
					<span>2</span>
				</div>
				<div className={styles.chips} role="group" aria-label="直接跳到某個 x">
					{PRESETS.map((p) => (
						<button key={p} type="button" className={styles.chip} aria-pressed={x === p} onClick={() => setX(p)}>
							x = {fmtFixed(p, 0)}
						</button>
					))}
				</div>
			</div>

			<div className={styles.eqs} aria-live="polite" aria-atomic="true">
				<p className={styles.srOnly}>
					e 的 {fx} 次方 = {fy}，ln({fy}) = {fl}
				</p>
				<p className={styles.eq} aria-hidden="true">
					<span className={styles.swatchExp} aria-hidden="true" />
					<span>
						e<sup>{fx}</sup> = {fy}
					</span>
				</p>
				<p className={styles.eq} aria-hidden="true">
					<span className={styles.swatchLn} aria-hidden="true" />
					<span>
						ln({fy}) = {fl}
					</span>
				</p>
			</div>

			<div className={styles.mirrorLayout}>
				<div className={styles.plotWrap} ref={wrapRef}>
					<svg
						className={styles.plot}
						viewBox={`0 0 ${size} ${size}`}
						role="img"
						aria-label={`座標圖：藍色曲線 y = e 的 x 次方、紫色曲線 y = ln x、灰色虛線 y = x。A = (${fx}, ${fy}) 在 e 的 x 次方上，B = (${fy}, ${fl}) 在 ln x 上，兩點對 y = x 對稱。`}
					>
						{/* 格線 */}
						{GRID.map((g) => (
							<g key={g}>
								<line className={styles.grid} x1={sx(g)} y1={top} x2={sx(g)} y2={sy(PLOT_MIN)} />
								<line className={styles.grid} x1={sx(PLOT_MIN)} y1={sy(g)} x2={right} y2={sy(g)} />
							</g>
						))}

						{/* 座標軸 */}
						<line className={styles.axis} x1={sx(PLOT_MIN)} y1={o[1]} x2={right} y2={o[1]} />
						<line className={styles.axis} x1={o[0]} y1={sy(PLOT_MIN)} x2={o[0]} y2={top} />
						<path className={styles.axisArrow} d={`M${right + 2} ${o[1]} l-9 -4.5 v9 z`} />
						<path className={styles.axisArrow} d={`M${o[0]} ${top - 2} l-4.5 9 h9 z`} />
						<text className={styles.axisName} x={right - 2} y={o[1] + 19} textAnchor="end">
							x
						</text>
						<text className={styles.axisName} x={o[0] - 9} y={top + 12} textAnchor="end">
							y
						</text>

						{/* 鏡子 y = x */}
						<line className={styles.mirrorLine} x1={sx(PLOT_MIN)} y1={sy(PLOT_MIN)} x2={right} y2={top} />

						{/* 刻度數字 */}
						{TICK_LABELS.map((t) => (
							<g key={t}>
								<text className={`${styles.tickText} ${styles.halo}`} x={sx(t)} y={o[1] + 19} textAnchor="middle">
									{fmtFixed(t, 0)}
								</text>
								<text className={`${styles.tickText} ${styles.halo}`} x={o[0] - 6} y={sy(t) + 5} textAnchor="end">
									{fmtFixed(t, 0)}
								</text>
							</g>
						))}
						{/* 原點的 0 放在右下：左下有 y = x 的虛線經過，貼著它會看起來像「−0」；右下這一小塊沒有線（ln x 在更下面） */}
						<text className={`${styles.tickText} ${styles.halo}`} x={o[0] + 5} y={o[1] + 17} textAnchor="start">
							0
						</text>

						{/* 虛線的名稱 */}
						{(
							[
								['y = x', -1],
								['鏡子', 1],
							] as const
						).map(([label, side]) => {
							const lx = sx(MIRROR_LABEL_AT) + side * 11;
							const ly = sy(MIRROR_LABEL_AT) + side * 11;
							return (
								<text
									key={label}
									className={`${styles.labelMirror} ${styles.halo}`}
									x={lx}
									y={ly}
									textAnchor="middle"
									dominantBaseline="central"
									transform={`rotate(-45 ${lx} ${ly})`}
								>
									{label}
								</text>
							);
						})}

						{/* 兩條曲線 */}
						<path className={styles.curveExp} d={expPath} />
						<path className={styles.curveLn} d={lnPath} />
						{/* 曲線名稱放在曲線外側（A、B 的連線只會出現在兩條曲線之間），兩個位置互為鏡像 */}
						<text className={`${styles.labelExp} ${styles.halo}`} x={(sx(0) + sx(Math.log(LABEL_AT))) / 2} y={sy(LABEL_AT) + 5} textAnchor="middle">
							y = e
							<tspan dy="-0.5em" style={{ fontSize: '0.75em' }}>
								x
							</tspan>
						</text>
						<text className={`${styles.labelLn} ${styles.halo}`} x={sx(LABEL_AT) - 18} y={(sy(0) + sy(Math.log(LABEL_AT))) / 2 + 5} textAnchor="middle">
							y = ln x
						</text>

						{/* A、B 與連線 */}
						<line className={styles.segment} x1={ax} y1={ay} x2={bx} y2={by} />
						<path className={styles.rightAngle} d={rightAngle} />
						<circle className={styles.pointA} cx={ax} cy={ay} r={7} />
						<circle className={styles.pointB} cx={bx} cy={by} r={7} />
						<text className={`${styles.labelExp} ${styles.halo}`} x={clamp(aLabel[0])} y={clamp(aLabel[1])} textAnchor="middle" dominantBaseline="central">
							A
						</text>
						<text className={`${styles.labelLn} ${styles.halo}`} x={clamp(bLabel[0])} y={clamp(bLabel[1])} textAnchor="middle" dominantBaseline="central">
							B
						</text>
					</svg>
				</div>

				<div className={styles.readout}>
					<div className={styles.coords}>
						<p className={styles.muted}>
							A 的座標是 (x, {ex})，B 把它對調成 ({ex}, x)：
						</p>
						<p>
							<span className={`${styles.coordExp} ${styles.nowrap}`}>
								A = ({fx}, {fy})
							</span>{' '}
							<span className={styles.nowrap}>在 y = {ex} 上</span>
						</p>
						<p>
							<span className={`${styles.coordLn} ${styles.nowrap}`}>
								B = ({fy}, {fl})
							</span>{' '}
							<span className={styles.nowrap}>在 y = ln x 上</span>
						</p>
					</div>
					<p className={styles.ok}>把輸入和輸出對調，就從 {ex} 走到 ln x：A、B 以 y = x 為鏡子互相對稱，兩點的連線和鏡子垂直。</p>
					<p id={hintId} className={`${styles.muted} ${styles.small}`}>
						{hintFor(x, fy)}
					</p>
				</div>
			</div>
		</section>
	);
}
