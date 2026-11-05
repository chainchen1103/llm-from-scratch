import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import styles from './Ep08Lr.module.css';
import { around, placeLabel, plotFrame, pointBox, textWidth, type Box, type Frame, type Spot } from './ep04-calc.ts';
import {
	BOWL_ORDER,
	BOWLS,
	coordText,
	exitStep,
	FACTOR_LABEL,
	factorKind,
	factorText,
	heightText,
	isDiverge,
	isThird,
	logAxis,
	LR_DEFAULT,
	LR_MAX,
	LR_MIN,
	LR_PAGE_STEP,
	LR_PRESETS,
	LR_THIRD,
	log10Clamp,
	lrCase,
	lrInput,
	lrText,
	numPlain,
	numSpoken,
	parseLr,
	runGD,
	runKind,
	snapLrDrag,
	stepLr,
	stepTicks,
	vsThird,
	xFactor,
	yFactor,
	type Bowl,
	type BowlKey,
	type FactorKind,
	type NumText,
	type Run,
} from './ep08-lr.ts';

/**
 * 學習率實驗室（工具二）：碗 x² + 3y² 從 (1, 2) 出發，用學習率 η 走 30 步梯度下降。
 * 上面是學習率的數線（可以拖、可以用方向鍵，也可以輸入數字）：綠色是收斂、黃色是 y 每步換邊但還會收斂、
 * 紅色是發散，紅線是上限 1/3。中間是等高線上的路徑和每一步的高度（對數刻度，灰線是其他預設的學習率），
 * 下面是 x、y 每步乘的數 1 − 2η、1 − 6η 和第 t 步的位置與高度。
 * 可以切換成又長又窄的碗 0.1x² + 3y²（從 (10, 1) 出發、走 20 步）：x 每步只乘 1 − 0.2η，看鋸齒狀前進。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 640;
const PLAY_MS = 160;
type Pt = [number, number];

const sup = (k: number) => String(k).replace('-', '−');

/** 一個數：一般小數、a × 10ⁿ、∞ */
function Num({ t }: { t: NumText }) {
	if (t.kind === 'nan') return <span className={styles.nowrap}>太大，算不出來</span>;
	if (t.kind === 'inf') return <span className={styles.nowrap}>{t.neg ? '−∞' : '∞'}</span>;
	if (t.kind === 'plain') return <span className={styles.nowrap}>{t.text}</span>;
	return (
		<span className={styles.nowrap}>
			{t.mant} × 10<sup>{sup(t.exp)}</sup>
		</span>
	);
}

/** SVG 裡的寫法（上標用 tspan） */
function SvgNum({ t }: { t: NumText }) {
	if (t.kind === 'nan') return <>算不出來</>;
	if (t.kind === 'inf') return <>{t.neg ? '−∞' : '∞'}</>;
	if (t.kind === 'plain') return <>{t.text}</>;
	return (
		<>
			{t.mant} × 10
			<tspan dy="-0.45em" fontSize="0.75em">
				{sup(t.exp)}
			</tspan>
		</>
	);
}

/** 10 的次方（座標軸的刻度） */
const SvgPow10 = ({ k }: { k: number }) =>
	k === 0 ? (
		<>1</>
	) : k === 1 ? (
		<>10</>
	) : (
		<>
			10
			<tspan dy="-0.45em" fontSize="0.75em">
				{sup(k)}
			</tspan>
		</>
	);

/** 說明裡的數字：等寬、不折行 */
const M = ({ children }: { children: ReactNode }) => <span className={`${styles.mono} ${styles.nowrap}`}>{children}</span>;

const statusClass = (k: FactorKind) => (isDiverge(k) ? styles.statusBad : k === 'shrink' ? styles.statusOk : styles.statusFlip);

const clampPx = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 一個標籤和一群東西重疊的總面積（px²） */
const overlapArea = (b: Box, avoid: Box[]) =>
	avoid.reduce((sum, a) => sum + Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), 0);
const toD = (pts: Pt[]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

/** 乘數放進次方時的寫法：負數、分數加括號；η = 1/3 時用分數 */
function factorBase(b: Bowl, lr: number, axis: 'x' | 'y'): string {
	if (isThird(lr) && axis === 'x') return b.key === 'round' ? '(1/3)' : '(14/15)';
	const m = axis === 'x' ? xFactor(b, lr) : yFactor(lr);
	const t = factorText(m, lr).text;
	return t.startsWith('−') ? `(${t})` : t;
}

// ---------- 學習率的數線 ----------

const RULER_H = 64;
const RULER_PADS = { l: 14, r: 14 };
const TRACK_Y = 21;
const TRACK_H = 14;
const RULER_TICKS = [0, 0.1, 0.2, 0.3, 0.4];
const RULER_LABELS: [number, string][] = [
	[0, '0'],
	[0.1, '0.1'],
	[0.2, '0.2'],
	[0.4, '0.4'],
];

function LrRuler({ W, lr, onLr, labelId, describedBy, valueText }: { W: number; lr: number; onLr: (v: number) => void; labelId: string; describedBy: string; valueText: string }) {
	const [dragging, setDragging] = useState(false);
	const dragId = useRef<number | null>(null);
	const left = RULER_PADS.l;
	const right = W - RULER_PADS.r;
	const sx = (v: number) => left + (v / LR_MAX) * (right - left);
	const fromX = (px: number) => ((px - left) / (right - left)) * LR_MAX;
	const cy = TRACK_Y + TRACK_H / 2;

	const localX = (e: ReactPointerEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return (e.clientX - r.left) * (W / r.width);
	};
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		setDragging(true);
		(e.currentTarget.parentElement as HTMLElement | null)?.focus({ preventScroll: true });
		onLr(snapLrDrag(fromX(localX(e))));
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragId.current !== e.pointerId) return;
		onLr(snapLrDrag(fromX(localX(e))));
	};
	const endDrag = () => {
		dragId.current = null;
		setDragging(false);
	};
	const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		let next: number | null = null;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = stepLr(lr, 1);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = stepLr(lr, -1);
		else if (e.key === 'PageUp') next = stepLr(lr, 1, LR_PAGE_STEP);
		else if (e.key === 'PageDown') next = stepLr(lr, -1, LR_PAGE_STEP);
		else if (e.key === 'Home') next = LR_MIN;
		else if (e.key === 'End') next = LR_MAX;
		if (next === null) return;
		e.preventDefault();
		onLr(next);
	};

	const x6 = sx(1 / 6);
	const x3 = sx(LR_THIRD);
	const thumbX = sx(lr);
	return (
		<div
			className={styles.ruler}
			role="slider"
			tabIndex={0}
			aria-labelledby={labelId}
			aria-describedby={describedBy}
			aria-valuemin={LR_MIN}
			aria-valuemax={LR_MAX}
			aria-valuenow={lr}
			aria-valuetext={valueText}
			onKeyDown={onKeyDown}
		>
			<svg
				className={`${styles.rulerSvg} ${dragging ? styles.grabbing : ''}`}
				viewBox={`0 0 ${W} ${RULER_H}`}
				aria-hidden="true"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onLostPointerCapture={endDrag}
			>
				{/* 三段：收斂、換邊但收斂、發散 */}
				<rect className={styles.zoneOk} x={left} y={TRACK_Y} width={x6 - left} height={TRACK_H} />
				<rect className={styles.zoneFlip} x={x6} y={TRACK_Y} width={x3 - x6} height={TRACK_H} />
				<rect className={styles.zoneBad} x={x3} y={TRACK_Y} width={right - x3} height={TRACK_H} />
				<rect className={styles.trackEdge} x={left} y={TRACK_Y} width={right - left} height={TRACK_H} rx={3} />
				<text className={styles.zoneText} x={(left + x6) / 2} y={13} textAnchor="middle">
					收斂
				</text>
				<text className={styles.zoneText} x={(x6 + x3) / 2} y={13} textAnchor="middle">
					{x3 - x6 >= 96 ? 'y 換邊，仍收斂' : '換邊，仍收斂'}
				</text>
				<text className={styles.zoneTextBad} x={(x3 + right) / 2} y={13} textAnchor="middle">
					發散
				</text>
				{RULER_TICKS.map((v) => (
					<line key={v} className={styles.rulerTick} x1={sx(v)} y1={TRACK_Y + TRACK_H} x2={sx(v)} y2={TRACK_Y + TRACK_H + 5} />
				))}
				{RULER_LABELS.map(([v, s]) => (
					<text key={s} className={styles.tickText} x={sx(v)} y={TRACK_Y + TRACK_H + 19} textAnchor="middle">
						{s}
					</text>
				))}
				{/* 上限 1/3 */}
				<line className={styles.limitLine} x1={x3} y1={TRACK_Y - 4} x2={x3} y2={TRACK_Y + TRACK_H + 6} />
				<text className={styles.limitText} x={x3} y={TRACK_Y + TRACK_H + 19} textAnchor="middle">
					1/3
				</text>
				{dragging ? <circle className={styles.thumbRing} cx={thumbX} cy={cy} r={14} /> : null}
				<circle className={styles.thumb} cx={thumbX} cy={cy} r={9} />
			</svg>
		</div>
	);
}

// ---------- 等高線上的路徑 ----------

const PATH_PADS = { l: 34, r: 10, t: 12, b: 30 };

type PathView = { fr: Frame; kx: number; ky: number; v: { xMin: number; xMax: number; yMin: number; yMax: number }; xTicks: number[]; yTicks: number[] };

function pathView(b: Bowl, W: number): PathView {
	const p = PATH_PADS;
	if (b.key === 'round') {
		// 兩軸同比例：y 從 −2.6 到 2.6，x 的範圍看寬度
		const H = Math.round(Math.min(340, Math.max(240, W * 0.6)));
		const yHalf = 2.6;
		const unit = (H - p.t - p.b) / (2 * yHalf);
		const xHalf = (W - p.l - p.r) / (2 * unit);
		const v = { xMin: -xHalf, xMax: xHalf, yMin: -yHalf, yMax: yHalf };
		const xTicks: number[] = [];
		for (let k = Math.ceil(-xHalf + 0.15); k <= xHalf - 0.15; k++) xTicks.push(k);
		return { fr: plotFrame(W, H, v, p), kx: unit, ky: unit, v, xTicks, yTicks: [-2, -1, 0, 1, 2] };
	}
	// 又長又窄的碗：x 從 −1.2 到 11.6、y 從 −1.5 到 1.5（y 方向畫得比較大，鋸齒才看得清楚）
	const H = Math.round(Math.min(240, Math.max(170, W * 0.36)));
	const v = { xMin: -1.2, xMax: 11.6, yMin: -1.5, yMax: 1.5 };
	const fr = plotFrame(W, H, v, p);
	const kx = (fr.right - fr.left) / (v.xMax - v.xMin);
	const ky = (fr.bottom - fr.top) / (v.yMax - v.yMin);
	return { fr, kx, ky, v, xTicks: [0, 2, 4, 6, 8, 10], yTicks: [-1, 0, 1] };
}

/** 前 t 步裡，第一個跑出畫面的步數（沒有就是 null） */
const exitAt = (pv: PathView, run: Run, t: number) => exitStep({ xs: run.xs.slice(0, t + 1), ys: run.ys.slice(0, t + 1), hs: [] }, pv.v.xMin, pv.v.xMax, pv.v.yMin, pv.v.yMax);

function PathPlot({ W, bowl, run, t, lr, clipId }: { W: number; bowl: Bowl; run: Run; t: number; lr: number; clipId: string }) {
	const pv = pathView(bowl, W);
	const { fr, kx, ky, v } = pv;
	const { sx, sy } = fr;
	const H = fr.height;
	const toPx = (x: number, y: number): Pt => [clampPx(sx(x), -2 * W, 3 * W), clampPx(sy(y), -2 * H, 3 * H)];
	const pts: Pt[] = run.xs.map((x, i) => toPx(x, run.ys[i]));
	const done = pts.slice(0, t + 1);
	const later = pts.slice(t);
	const exit = exitAt(pv, run, t);
	const nowInside = run.xs[t] >= v.xMin && run.xs[t] <= v.xMax && run.ys[t] >= v.yMin && run.ys[t] <= v.yMax;
	const o: Pt = [sx(0), sy(0)];
	const start = pts[0];
	const now = pts[t];

	// 標籤：避開路徑上的點
	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 2, x1: fr.right - 2, y1: fr.bottom - 2 };
	const avoid: Box[] = done.filter(([x, y]) => x > fr.left - 10 && x < fr.right + 10 && y > fr.top - 10 && y < fr.bottom + 10).map(([x, y]) => pointBox(x, y, 6));
	avoid.push(pointBox(o[0], o[1], 7));
	const startLab = placeLabel(around(start[0], start[1], 15), textWidth('起點', 13.5) + 4, 18, avoid, bounds);
	avoid.push(startLab.box);
	const nowLabelText = `第 ${t} 步`;
	const nowLab = t > 0 && nowInside ? placeLabel(around(now[0], now[1], 16), textWidth(nowLabelText, 13.5) + 4, 18, avoid, bounds) : null;
	if (nowLab) avoid.push(nowLab.box, pointBox(now[0], now[1], 10));
	// 「谷底」放不下（會壓到路徑或別的字）就不寫，叉叉還是在
	const valleyLab = placeLabel(around(o[0], o[1], 13).slice(0, 4), textWidth('谷底', 13.5) + 4, 18, avoid, bounds);
	const showValley = overlapArea(valleyLab.box, avoid) < 20;

	const startLevel = bowl.a * bowl.start[0] ** 2 + 3 * bowl.start[1] ** 2;
	const ariaPath = `${bowl.label}的等高線圖，谷底在 (0, 0)。從 ${bowl.startText} 出發，學習率 ${lrText(lr)}，畫到第 ${t} 步${exit !== null ? `，第 ${exit} 步起跑出圖外` : `，停在 (${numSpoken(coordText(run.xs[t]))}, ${numSpoken(coordText(run.ys[t]))})`}。`;

	return (
		<svg className={`${styles.plot} ${styles.clipped}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaPath}>
			<defs>
				<clipPath id={clipId}>
					<rect x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
				</clipPath>
			</defs>
			{pv.xTicks.map((k) => (
				<g key={`x${k}`}>
					<line className={styles.gridMinor} x1={sx(k)} y1={fr.top} x2={sx(k)} y2={fr.bottom} />
					<text className={styles.tickText} x={sx(k)} y={fr.bottom + 17} textAnchor="middle">
						{sup(k)}
					</text>
				</g>
			))}
			{pv.yTicks.map((k) => (
				<g key={`y${k}`}>
					<line className={styles.gridMinor} x1={fr.left} y1={sy(k)} x2={fr.right} y2={sy(k)} />
					<text className={styles.tickText} x={fr.left - 6} y={sy(k) + 4} textAnchor="end">
						{sup(k)}
					</text>
				</g>
			))}
			<line className={styles.axis} x1={fr.left} y1={o[1]} x2={fr.right} y2={o[1]} />
			<line className={styles.axis} x1={o[0]} y1={fr.top} x2={o[0]} y2={fr.bottom} />
			<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
			<text className={`${styles.axisTitle} ${styles.halo}`} x={fr.right - 4} y={o[1] - 7} textAnchor="end">
				x
			</text>
			<text className={`${styles.axisTitle} ${styles.halo}`} x={o[0] + 7} y={fr.top + 14} textAnchor="start">
				y
			</text>

			<g clipPath={`url(#${clipId})`}>
				{bowl.levels.map((c) => (
					<ellipse key={c} className={styles.contour} cx={o[0]} cy={o[1]} rx={Math.sqrt(c / bowl.a) * kx} ry={Math.sqrt(c / 3) * ky} />
				))}
				<ellipse className={styles.startLevel} cx={o[0]} cy={o[1]} rx={Math.sqrt(startLevel / bowl.a) * kx} ry={Math.sqrt(startLevel / 3) * ky} />
				{later.length > 1 ? <path className={styles.pathLater} d={toD(later)} /> : null}
				{pts.slice(t + 1).map(([x, y], i) => (
					<circle key={`l${i}`} className={styles.pathDotLater} cx={x} cy={y} r={2.25} />
				))}
				{done.length > 1 ? <path className={styles.path} d={toD(done)} /> : null}
				{done.map(([x, y], i) => (
					<circle key={`d${i}`} className={styles.pathDot} cx={x} cy={y} r={3} />
				))}
			</g>

			{/* 谷底 */}
			<path className={styles.valley} d={`M${o[0] - 5} ${o[1] - 5} L${o[0] + 5} ${o[1] + 5} M${o[0] - 5} ${o[1] + 5} L${o[0] + 5} ${o[1] - 5}`} />
			{showValley ? (
				<text className={`${styles.valleyText} ${styles.halo}`} x={valleyLab.spot.x} y={valleyLab.spot.y} textAnchor={valleyLab.spot.anchor} dominantBaseline="central">
					谷底
				</text>
			) : null}

			{/* 起點、第 t 步 */}
			<circle className={styles.startDot} cx={start[0]} cy={start[1]} r={5.5} />
			<text className={`${styles.pointText} ${styles.halo}`} x={startLab.spot.x} y={startLab.spot.y} textAnchor={startLab.spot.anchor} dominantBaseline="central">
				起點
			</text>
			{t > 0 && nowInside ? (
				<>
					<circle className={styles.nowRing} cx={now[0]} cy={now[1]} r={9} />
					<circle className={styles.nowDot} cx={now[0]} cy={now[1]} r={5} />
				</>
			) : null}
			{nowLab ? (
				<text className={`${styles.pathText} ${styles.halo}`} x={nowLab.spot.x} y={nowLab.spot.y} textAnchor={nowLab.spot.anchor} dominantBaseline="central">
					{nowLabelText}
				</text>
			) : null}
		</svg>
	);
}

// ---------- 高度的對數圖 ----------

const H_PADS = { l: 44, r: 50, t: 26, b: 36 };

type Curve = { key: string; lr: number; run: Run; current: boolean };

function HeightPlot({ W, bowl, curves, t, clipId }: { W: number; bowl: Bowl; curves: Curve[]; t: number; clipId: string }) {
	const N = bowl.steps;
	const H = Math.round(Math.min(250, Math.max(190, W * 0.36)));
	const { lo, hi, labels } = logAxis(curves.map((c) => c.run.hs));
	// 格線只畫在有數字的刻度上：每 1、2 或 5 個 10 的次方一格
	const every = labels.length > 1 ? labels[1] - labels[0] : 1;
	const cur = curves.find((c) => c.current)!;
	const h0 = cur.run.hs[0];
	// 上面多留一點：起點的高度那條線上方至少 HEAD px，「起點的高度」那一行字才放得下
	const HEAD = 20;
	const plotH = H - H_PADS.t - H_PADS.b;
	const yMin = lo - 0.3;
	const yMax = Math.max(hi + 0.3, (Math.log10(h0) * plotH - HEAD * yMin) / (plotH - HEAD));
	const fr = plotFrame(W, H, { xMin: -0.6, xMax: N + 0.6, yMin, yMax }, H_PADS);
	const { sx, sy } = fr;
	const ly = (h: number) => sy(log10Clamp(h, yMin, yMax));
	const curPts: Pt[] = cur.run.hs.map((h, k) => [sx(k), ly(h)]);
	const startY = ly(h0);

	// 右邊的名字：照線尾的高度排，太擠就往下推；推出圖外就整串往上移
	const GAP = 13;
	const ends = curves.map((c) => ({ c, y: ly(c.run.hs[N]) })).sort((a, b) => a.y - b.y);
	for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < GAP) ends[i].y = ends[i - 1].y + GAP;
	const over = ends.length ? ends[ends.length - 1].y - (fr.bottom + 4) : 0;
	if (over > 0) {
		ends[ends.length - 1].y -= over;
		for (let i = ends.length - 2; i >= 0; i--) if (ends[i + 1].y - ends[i].y < GAP) ends[i].y = ends[i + 1].y - GAP;
	}

	// 第 t 步的高度
	const ht = heightText(cur.run.hs[t]);
	const now = curPts[t];
	const avoid: Box[] = [];
	for (let k = 0; k < curPts.length; k++) avoid.push(pointBox(curPts[k][0], curPts[k][1], 5));
	avoid.push(pointBox(now[0], now[1], 9));
	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 2, x1: fr.right - 2, y1: fr.bottom - 2 };

	const label = numPlain(ht);
	const lab = placeLabel(
		[
			{ x: now[0] + 9, y: now[1] - 13, anchor: 'start' },
			{ x: now[0] - 9, y: now[1] - 13, anchor: 'end' },
			{ x: now[0] + 9, y: now[1] + 14, anchor: 'start' },
			{ x: now[0] - 9, y: now[1] + 14, anchor: 'end' },
		] as Spot[],
		textWidth(label, 13.5) + 6,
		18,
		avoid,
		bounds,
	);

	// 「起點的高度」：放在線的上方（或下方），左、中、右挑一個不壓到線的地方
	const startText = `起點的高度 ${numPlain(heightText(h0))}`;
	const startW = textWidth(startText, 12) + 6;
	const curveBoxes: Box[] = [...avoid, lab.box];
	for (const c of curves) if (!c.current) c.run.hs.forEach((h, k) => curveBoxes.push(pointBox(sx(k), ly(h), 3)));
	const midX = (fr.left + fr.right) / 2;
	const startLab = placeLabel(
		[
			{ x: fr.left + 6, y: startY - 9, anchor: 'start' },
			{ x: midX, y: startY - 9, anchor: 'middle' },
			{ x: fr.right - 6, y: startY - 9, anchor: 'end' },
			{ x: midX, y: startY + 10, anchor: 'middle' },
			{ x: fr.right - 6, y: startY + 10, anchor: 'end' },
			{ x: fr.left + 6, y: startY + 10, anchor: 'start' },
		] as Spot[],
		startW,
		15,
		curveBoxes,
		bounds,
	);

	return (
		<svg
			className={styles.plot}
			viewBox={`0 0 ${W} ${H}`}
			role="img"
			aria-label={`高度的對數圖：橫軸是步數 0 到 ${N}，縱軸是高度（對數刻度，每一格乘 ${every === 1 ? '10' : `10 的 ${every} 次方`}）。學習率 ${lrText(cur.lr)} 的高度從 ${numSpoken(heightText(h0))} 變成第 ${N} 步的 ${numSpoken(heightText(cur.run.hs[N]))}；第 ${t} 步是 ${numSpoken(ht)}。灰線是其他學習率。`}
		>
			<defs>
				<clipPath id={clipId}>
					<rect x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
				</clipPath>
			</defs>
			{labels.map((k) => (
				<g key={k}>
					<line className={styles.gridMinor} x1={fr.left} y1={sy(k)} x2={fr.right} y2={sy(k)} />
					<text className={styles.tickText} x={fr.left - 6} y={sy(k) + 4} textAnchor="end">
						<SvgPow10 k={k} />
					</text>
				</g>
			))}
			{stepTicks(N).map((k) => (
				<g key={`s${k}`}>
					<line className={styles.gridMinor} x1={sx(k)} y1={fr.top} x2={sx(k)} y2={fr.bottom} />
					<text className={styles.tickText} x={sx(k)} y={fr.bottom + 17} textAnchor="middle">
						{k}
					</text>
				</g>
			))}
			<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
			<text className={styles.axisTitle} x={fr.left - 38} y={fr.top - 11} textAnchor="start">
				高度（對數刻度，每格乘 10
				{every === 1 ? (
					'）'
				) : (
					<>
						<tspan dy="-0.45em" fontSize="0.75em">
							{every}
						</tspan>
						<tspan dy="0.45em">）</tspan>
					</>
				)}
			</text>
			<text className={styles.axisTitle} x={(fr.left + fr.right) / 2} y={fr.bottom + 33} textAnchor="middle">
				步數
			</text>

			<g clipPath={`url(#${clipId})`}>
				<line className={styles.startLine} x1={fr.left} y1={startY} x2={fr.right} y2={startY} />
				{curves
					.filter((c) => !c.current)
					.map((c) => (
						<path key={c.key} className={styles.refCurve} d={toD(c.run.hs.map((h, k) => [sx(k), ly(h)]))} />
					))}
				<line className={styles.nowLine} x1={now[0]} y1={fr.top} x2={now[0]} y2={fr.bottom} />
				<path className={styles.path} d={toD(curPts)} />
				{curPts.map(([x, y], k) => (
					<circle key={k} className={styles.pathDot} cx={x} cy={y} r={2.5} />
				))}
			</g>
			<text className={`${styles.startLineText} ${styles.halo}`} x={startLab.spot.x} y={startLab.spot.y} textAnchor={startLab.spot.anchor} dominantBaseline="central">
				{startText}
			</text>
			{ends.map(({ c, y }) => (
				<text key={c.key} className={c.current ? styles.pathText : styles.refText} x={fr.right + 5} y={y + 4} textAnchor="start" style={c.current ? { fontSize: 12 } : undefined}>
					{lrText(c.lr)}
				</text>
			))}
			<circle className={styles.nowRing} cx={now[0]} cy={now[1]} r={7.5} />
			<circle className={styles.nowDot} cx={now[0]} cy={now[1]} r={4.5} />
			<text className={`${styles.pathText} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central">
				<SvgNum t={ht} />
			</text>
		</svg>
	);
}

// ---------- 主元件 ----------

export default function LearningRateLab() {
	const [bowlKey, setBowlKey] = useState<BowlKey>('round');
	const [lr, setLr] = useState(LR_DEFAULT);
	const [draft, setDraft] = useState<string | null>(null);
	const [t, setT] = useState(BOWLS.round.steps);
	const [playing, setPlaying] = useState(false);
	const [W, setW] = useState(DEFAULT_W);
	const wrapRef = useRef<HTMLDivElement>(null);
	const uid = useId();
	const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, '');
	const lrLabelId = `${uid}-lr`;
	const lrHintId = `${uid}-lrhint`;
	const lrInputId = `${uid}-lrin`;
	const bowlLabelId = `${uid}-bowl`;
	const presetLabelId = `${uid}-presets`;
	const stepId = `${uid}-step`;

	const bowl = BOWLS[bowlKey];
	const N = bowl.steps;

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

	// 播放：一步一步往前走，走到最後就停
	useEffect(() => {
		if (!playing) return;
		const id = window.setInterval(() => setT((cur) => Math.min(N, cur + 1)), PLAY_MS);
		return () => window.clearInterval(id);
	}, [playing, N]);
	useEffect(() => {
		if (playing && t >= N) setPlaying(false);
	}, [playing, t, N]);

	const run = useMemo(() => runGD(bowl, lr), [bowl, lr]);
	const curves = useMemo<Curve[]>(() => {
		const list: Curve[] = LR_PRESETS.filter((p) => p !== lr).map((p) => ({ key: String(p), lr: p, run: runGD(bowl, p), current: false }));
		list.push({ key: 'current', lr, run, current: true });
		return list;
	}, [bowl, lr, run]);

	const pickBowl = (k: BowlKey) => {
		setPlaying(false);
		setBowlKey(k);
		setT(BOWLS[k].steps);
	};
	const pickLr = (v: number) => {
		setDraft(null);
		setLr(v);
	};
	const togglePlay = () => {
		if (playing) {
			setPlaying(false);
			return;
		}
		if (t >= N) setT(0);
		setPlaying(true);
	};

	// ----- 數字 -----
	const mx = xFactor(bowl, lr);
	const my = yFactor(lr);
	const kx = factorKind(mx);
	const ky = factorKind(my);
	const mxT = factorText(mx, lr);
	const myT = factorText(my, lr);
	const rk = runKind(bowl, lr);
	const lt = lrText(lr);
	const vs = vsThird(lr);
	const xt = coordText(run.xs[t]);
	const yt = coordText(run.ys[t]);
	const ht = heightText(run.hs[t]);
	const hN = heightText(run.hs[N]);
	const xN = coordText(run.xs[N]);
	const yN = coordText(run.ys[N]);
	const h0 = heightText(run.hs[0]);
	const eqX = mxT.approx ? '≈' : '=';
	const eqY = myT.approx ? '≈' : '=';
	const slowest = Math.max(Math.abs(mx), Math.abs(my));
	const slowestT = factorText(slowest, lr);

	const valueText = `學習率 ${lt}：x 每步乘 ${mxT.text}，y 每步乘 ${myT.text}，${rk === 'diverge' ? '發散' : rk === 'stuck' ? '剛好在上限，不收斂' : '收斂'}`;

	// ----- 說明 -----
	const c = lrCase(bowl, lr);
	let note: ReactNode;
	switch (c) {
		case 'tiny':
			note = (
				<p className={styles.note}>
					<span className={styles.tagWord}>太小：</span>y 每步只乘 <M>{myT.text}</M>，{N} 步後高度還有 <M><Num t={hN} /></M>。不會出錯，只是慢（EP04 故意用它：步伐小，線性近似才準）。
				</p>
			);
			break;
		case 'good':
			note = (
				<p className={styles.ok}>
					<span className={styles.tagWord}>順利：</span>x 每步乘 <M>{mxT.text}</M>、y 乘 <M>{myT.text}</M>，{N} 步降到 <M><Num t={hN} /></M>。y 早就到了，後面都在等每步只乘 <M>{mxT.text}</M> 的 x。
				</p>
			);
			break;
		case 'best':
			note = (
				<p className={styles.ok}>
					<span className={styles.tagWord}>兩個方向都縮成一半：</span>x 乘 <M>{mxT.text}</M>、y 乘 <M>{myT.text}</M>（每步換邊）。最慢的方向也只乘 <M>0.5</M>，比 0.1 和 0.3（最慢的方向都乘 <M>0.8</M>）快得多，{N} 步降到 <M><Num t={hN} /></M>。
				</p>
			);
			break;
		case 'bouncy':
			note = (
				<p className={styles.note}>
					<span className={styles.tagWord}>偏大：</span>y 乘 <M>{myT.text}</M>，每一步都跳到谷底的另一邊（2 → −1.6 → 1.28），越跳越近，還是會收斂。最慢的方向也是每步乘 <M>0.8</M>，和 0.1 一樣快（對數圖的後段和灰線 0.1 一樣斜）；{N} 步的高度 <M><Num t={hN} /></M> 比較高，是因為剩下的是從 12 出發的 3y²。
				</p>
			);
			break;
		case 'over':
			note = (
				<p className={styles.bad}>
					<span className={styles.tagWord}>太大：</span>y 乘 <M>{myT.text}</M>，每跳一次就離谷底更遠，{N} 步後高度 <M><Num t={hN} /></M>，比起點的 13 還高。越走越遠叫<span className={styles.tagWord}>發散</span>。
				</p>
			);
			break;
		case 'third':
			note = (
				<p className={styles.note}>
					<span className={styles.tagWord}>剛好在上限 1/3：</span>y 每步乘 <M>−1</M>，永遠在 {bowl.start[1]} 和 −{bowl.start[1]} 之間跳，不收斂也不發散；x 會收斂，高度卻降不下去（第 {N} 步還有 <M><Num t={hN} /></M>）。
				</p>
			);
			break;
		case 'diverge':
			note = (
				<p className={styles.bad}>
					<span className={styles.tagWord}>超過上限 1/3：</span>y 乘 <M>{myT.text}</M>，絕對值大於 1，每跳一次就離谷底更遠，{N} 步後高度 <M><Num t={hN} /></M>：發散。
				</p>
			);
			break;
		case 'narrowZigzag':
			note = (
				<p className={styles.note}>
					<span className={styles.tagWord}>鋸齒狀前進：</span>y 乘 <M>{myT.text}</M>，在谷底兩邊來回跳，{N} 步後只剩 <M><Num t={yN} /></M>；x 每步只乘 <M>{mxT.text}</M>，{N} 步後還在 <M><Num t={xN} /></M>。<span className={styles.tagWord}>最窄的方向決定上限，最長的方向決定要走多久。</span>
				</p>
			);
			break;
		case 'narrowNoZigzag':
			note = (
				<p className={styles.plain}>
					<span className={styles.tagWord}>不鋸齒，x 卻更慢：</span>y 乘 <M>{myT.text}</M>，不換邊；x 每步只乘 <M>{mxT.text}</M>，{N} 步後還在 <M><Num t={xN} /></M>。想讓 x 快一點，學習率又不能超過 1/3（y 會發散）。
				</p>
			);
			break;
		case 'flipConverge':
			note = (
				<p className={styles.note}>
					<span className={styles.tagWord}>每步換邊，還是會收斂：</span>y 乘 <M>{myT.text}</M>（負的），每一步跳到谷底的另一邊；絕對值小於 1，越跳越近。最慢的方向每步乘 <M>{slowestT.text}</M>，{N} 步後高度 <M><Num t={hN} /></M>。
				</p>
			);
			break;
		default:
			note = (
				<p className={styles.plain}>
					<span className={styles.tagWord}>不換邊，直接滑向谷底：</span>x 乘 <M>{mxT.text}</M>、y 乘 <M>{myT.text}</M>，都是正的、小於 1。最慢的方向每步乘 <M>{slowestT.text}</M>：越接近 1 越慢，{N} 步後高度 <M><Num t={hN} /></M>。
				</p>
			);
	}

	const summary =
		`${bowl.label}，學習率 ${lt}。x 每步乘 ${mxT.text}（${FACTOR_LABEL[kx]}），y 每步乘 ${myT.text}（${FACTOR_LABEL[ky]}）。` +
		`第 ${t} 步：x ${numSpoken(xt)}，y ${numSpoken(yt)}，高度 ${numSpoken(ht)}。`;

	const lrValue = draft ?? lrInput(lr);
	const exit = exitAt(pathView(bowl, W), run, t);
	const x0 = bowl.start[0];
	const y0 = bowl.start[1];

	return (
		<section className={`not-content ${styles.demo}`} aria-label="學習率實驗室：換學習率，看梯度下降的路徑和每一步乘的數">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>學習率實驗室</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`}>
					從 {bowl.startText} 出發，每一步 p ← p − η × 梯度，走 {N} 步。換學習率 η，看路徑、每一步乘的數和高度。
				</p>
			</div>

			<div className={styles.group}>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={bowlLabelId}>
						碗
					</span>
					<div className={styles.chips} role="group" aria-labelledby={bowlLabelId}>
						{BOWL_ORDER.map((k) => (
							<button key={k} type="button" className={styles.chip} aria-pressed={bowlKey === k} onClick={() => pickBowl(k)}>
								{BOWLS[k].label}
							</button>
						))}
					</div>
				</div>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={presetLabelId}>
						學習率
					</span>
					<div className={styles.chips} role="group" aria-labelledby={presetLabelId}>
						{LR_PRESETS.map((p) => (
							<button key={p} type="button" className={`${styles.chip} ${styles.chipMono}`} aria-pressed={lr === p} onClick={() => pickLr(p)}>
								{lrText(p)}
							</button>
						))}
						<button type="button" className={`${styles.chip} ${styles.chipLimit}`} aria-pressed={isThird(lr)} onClick={() => pickLr(LR_THIRD)}>
							上限 1/3
						</button>
					</div>
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<span className={styles.title} id={lrLabelId}>
						學習率 η = <span className={styles.value}>{lt}</span>
					</span>
					<span className={styles.numField}>
						<label className={`${styles.small} ${styles.muted}`} htmlFor={lrInputId}>
							輸入
						</label>
						<input
							id={lrInputId}
							className={styles.num}
							type="number"
							inputMode="decimal"
							aria-label={`輸入學習率 η（${LR_MIN} 到 ${LR_MAX}）`}
							min={LR_MIN}
							max={LR_MAX}
							step={0.001}
							value={lrValue}
							onChange={(e) => {
								const raw = e.currentTarget.value;
								setDraft(raw);
								const v = parseLr(raw);
								if (v !== null) setLr(v);
							}}
							onBlur={() => setDraft(null)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') setDraft(null);
								if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
									e.preventDefault();
									pickLr(stepLr(lr, e.key === 'ArrowUp' ? 1 : -1));
								}
							}}
						/>
					</span>
				</div>
				<div ref={wrapRef}>
					<LrRuler W={W} lr={lr} onLr={pickLr} labelId={lrLabelId} describedBy={lrHintId} valueText={valueText} />
				</div>
				<p className={styles.hint} id={lrHintId}>
					拖動數線，或用方向鍵（一次 0.01，Page Up／Page Down 一次 0.05）；數字框可以輸入到 0.001。紅線是上限 1/3：y 每步乘 1 − 6η，η 超過 1/3 時絕對值大於 1。
				</p>
			</div>
			<div className={styles.calc}>
				<p className={styles.calcTitle}>每一步乘的數</p>
				<p className={styles.deriv}>
					<span>x 每步乘 {bowl.xFactorName}</span>
					<span>
						= 1 − {bowl.xCurv} × {lt}
					</span>
					<span>
						{eqX} <span className={`${styles.result} ${styles.big}`}>{mxT.text}</span>
					</span>
					<span className={`${styles.status} ${statusClass(kx)}`}>{FACTOR_LABEL[kx]}</span>
				</p>
				<p className={styles.deriv}>
					<span>y 每步乘 1 − 6η</span>
					<span>= 1 − 6 × {lt}</span>
					<span>
						{eqY} <span className={`${styles.result} ${styles.big}`}>{myT.text}</span>
					</span>
					<span className={`${styles.status} ${statusClass(ky)}`}>{FACTOR_LABEL[ky]}</span>
				</p>
				<p className={styles.derivNote}>
					|乘數| &lt; 1 越乘越小（收斂），負的每步換邊；|乘數| &gt; 1 越乘越大（發散）。兩個都要收斂：η &lt; 2 ÷ 最大的彎曲程度 = 2 ÷ 6 = 1/3。
					{vs === 'above' ? (
						<span className={styles.badText}> 現在 η = {lt}，超過上限 1/3。</span>
					) : vs === 'at' ? (
						<span className={styles.tagWord}> 現在剛好在上限。</span>
					) : lr === 0.333 ? (
						<span className={styles.tagWord}> 現在 η = 0.333，比 1/3 小一點點，非常慢地收斂。</span>
					) : null}
				</p>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.plotWrap}>
				<PathPlot W={W} bowl={bowl} run={run} t={t} lr={lr} clipId={`lr-path-${safeId}`} />
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swPath}`} />
						梯度下降的路徑（虛線是第 {t} 步之後）
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swLevel}`} />
						起點那一圈等高線（高度 {numPlain(h0)}）
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swContour}`} />
						等高線
					</span>
				</div>
				{exit !== null ? (
					<p className={`${styles.small} ${styles.badText}`}>發散：第 {exit} 步起跑出圖外（圖外的部分沒有畫出來）。</p>
				) : null}
				{bowl.key === 'narrow' ? <p className={styles.hint}>為了看清楚鋸齒，y 方向畫得比 x 方向大，真正的碗還要更窄。</p> : null}
			</div>

			<div className={styles.plotWrap}>
				<HeightPlot W={W} bowl={bowl} curves={curves} t={t} clipId={`lr-h-${safeId}`} />
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swPath}`} />
						學習率 {lt}
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swRef}`} />
						其他學習率（右邊的數字）
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swLevel}`} />
						起點的高度：線以上就是比出發時還高
					</span>
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={stepId}>
						看第 <span className={styles.value}>{t}</span> 步
					</label>
					<div className={styles.stepButtons}>
						<button type="button" className={styles.chip} onClick={() => setT((v) => Math.max(0, v - 1))} disabled={t <= 0}>
							上一步
						</button>
						<button type="button" className={styles.chip} onClick={() => setT((v) => Math.min(N, v + 1))} disabled={t >= N}>
							下一步
						</button>
						<button type="button" className={styles.chip} aria-pressed={playing} onClick={togglePlay}>
							{playing ? '暫停' : '從頭播放'}
						</button>
					</div>
				</div>
				<input
					id={stepId}
					className={styles.slider}
					type="range"
					min={0}
					max={N}
					step={1}
					value={t}
					aria-valuetext={`第 ${t} 步，高度 ${numSpoken(ht)}`}
					onChange={(e) => {
						setPlaying(false);
						setT(Number(e.currentTarget.value));
					}}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>0（起點）</span>
					<span>{N}</span>
				</div>
			</div>

			<div className={styles.calc}>
				<p className={styles.calcTitle}>
					第 {t} 步的位置與高度（{rk === 'diverge' ? <span className={styles.badText}>發散</span> : rk === 'stuck' ? '不收斂' : '收斂'}）
				</p>
				<p className={styles.deriv}>
					<span>
						x<sub>{t}</sub> = {factorBase(bowl, lr, 'x')}
						<sup>{t}</sup> × {x0}
					</span>
					<span>
						= <span className={styles.result}><Num t={xt} /></span>
					</span>
				</p>
				<p className={styles.deriv}>
					<span>
						y<sub>{t}</sub> = {factorBase(bowl, lr, 'y')}
						<sup>{t}</sup> × {y0}
					</span>
					<span>
						= <span className={styles.result}><Num t={yt} /></span>
					</span>
				</p>
				<p className={styles.deriv}>
					<span>高度 {bowl.formula}</span>
					<span>
						= <span className={`${styles.result} ${styles.big} ${styles.pathName}`}><Num t={ht} /></span>
					</span>
				</p>
				<p className={styles.derivNote}>起點的高度是 {numPlain(h0)}。每一步都是同一個數一直乘（等比數列），x、y 各乘各的。</p>
			</div>
			{note}
		</section>
	);
}
