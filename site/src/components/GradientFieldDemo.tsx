import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './Ep04Grad.module.css';
import {
	ARROW_SCALE,
	arrowShape,
	contourAt,
	contourPoints,
	FIELD_HALF,
	FIELD_PRESETS,
	fmt4,
	fmtFactor,
	fmtInput,
	fmtNum,
	gradAt,
	gradInfo,
	LEVEL_STEP,
	LEVELS,
	overlapCost,
	P_LIM,
	P_START,
	P_STEP,
	placeLabel,
	pointBox,
	polylinePath,
	QUIVER_POINTS,
	segmentBoxes,
	snapP,
	snapTo,
	textWidth,
	vecEq,
	viewFrame,
	type Box,
	type Spot,
	type Vec,
} from './ep04-grad.ts';

/**
 * 在碗 f(x, y) = x² + 3y² 的等高線圖上拖動點 P（吸附到 0.25 的格點），看 P 的梯度：
 * 珊瑚色箭頭是 ∇f = (2x, 6y)（長度縮成 1/10），兩段虛線是它的 x、y 分量（兩個偏導數），
 * 紫色線是經過 P 的等高線。梯度和這條線垂直、指向上坡；碗底的梯度是零向量。
 *
 * 兩軸同比例。viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小；
 * 還沒量到寬度之前（伺服器產生的 HTML）用預設大小，整張圖等比例縮放。
 */

const DEFAULT_WIDTH = 400;
const GRID = [-3, -2, -1, 0, 1, 2, 3];
/** 等高線高度數字的位置：橢圓參數 t（度）。相鄰兩條分別放左下、右下，數字才不會擠在一起 */
const LABEL_T = [240, 300];

/** ‖v‖：兩條直線用 CSS 的雙線邊框畫，不受字型影響 */
const Norm = ({ v }: { v: string }) => <span className={styles.norm}>{v}</span>;

/** 一個座標的數字輸入：方向鍵一次 0.25；輸入其他數字時吸附到最近的 0.25，離開輸入格後格子裡也改成吸附後的數字 */
function NumField({ value, onValue, label, lim }: { value: number; onValue: (v: number) => void; label: string; lim: number }) {
	const [text, setText] = useState<string | null>(null);
	return (
		<input
			type="number"
			className={styles.num}
			step={P_STEP}
			min={-lim}
			max={lim}
			aria-label={label}
			value={text ?? fmtInput(value)}
			onChange={(e) => {
				const raw = e.currentTarget.value;
				setText(raw);
				const v = Number(raw);
				if (raw.trim() !== '' && Number.isFinite(v)) onValue(snapTo(v, P_STEP, lim));
			}}
			onBlur={() => setText(null)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') setText(null);
			}}
		/>
	);
}

/** 平方：負數加括號，(−2)² */
const sqText = (v: number) => `${fmtFactor(v)}²`;

export default function GradientFieldDemo() {
	const [p, setP] = useState<Vec>(P_START);
	const [showField, setShowField] = useState(false);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [hover, setHover] = useState(false);
	const [dragging, setDragging] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<number | null>(null);
	const uid = useId();
	const clipId = `grad-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const hintId = `${uid}-hint`;

	// 量座標圖的實際寬度
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const update = () => {
			const w = Math.round(el.getBoundingClientRect().width);
			if (w > 0) setWidth(w);
		};
		update();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const fr = viewFrame(width, 0, 0, FIELD_HALF);
	const { sx, sy } = fr;
	const toScreen = ([x, y]: Vec): Vec => [sx(x), sy(y)];
	const info = gradInfo(p);

	const setPoint = (v: Vec) => setP((prev) => (vecEq(prev, v) ? prev : v));

	// ----- 拖動（Pointer Events：滑鼠、觸控、觸控筆都適用）：點圖上任一點，P 就移過去 -----
	const toLocal = (e: ReactPointerEvent<SVGSVGElement>): Vec => {
		const r = e.currentTarget.getBoundingClientRect();
		const k = width / r.width;
		return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
	};
	const nearP = (px: number, py: number) => Math.hypot(px - sx(p[0]), py - sy(p[1])) <= 22;
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = e.pointerId;
		setDragging(true);
		setPoint(snapP(fr.fromScreen(...toLocal(e))));
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e);
		if (dragRef.current !== e.pointerId) {
			if (e.pointerType === 'mouse') setHover(nearP(px, py));
			return;
		}
		setPoint(snapP(fr.fromScreen(px, py)));
	};
	const endDrag = () => {
		dragRef.current = null;
		setDragging(false);
	};

	// ----- 等高線（只跟著寬度變） -----
	const contours = useMemo(
		() =>
			LEVELS.map((c, i) => {
				const at = toScreen(contourAt(c, LABEL_T[i % 2]));
				return { c, d: polylinePath(contourPoints(c).map(toScreen)), at };
			}),
		[width],
	);
	const levelPath = info.f > 0 ? polylinePath(contourPoints(info.f, 180).map(toScreen)) : null;

	// ----- 圖上的幾何（畫面座標） -----
	const P: Vec = [sx(p[0]), sy(p[1])];
	const g = info.g;
	const tipMath: Vec = [p[0] + g[0] / ARROW_SCALE, p[1] + g[1] / ARROW_SCALE];
	const tip: Vec = toScreen(tipMath);
	const corner: Vec = [sx(tipMath[0]), P[1]]; // 先走 x 分量、再走 y 分量
	const arrow = info.zero ? null : arrowShape(P[0], P[1], tip[0], tip[1]);
	const gLen = Math.hypot(tip[0] - P[0], tip[1] - P[1]);
	const ug: Vec = gLen > 0 ? [(tip[0] - P[0]) / gLen, (tip[1] - P[1]) / gLen] : [0, 0];

	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 1, x1: fr.right - 1, y1: fr.bottom - 1 };
	const avoid: Box[] = [pointBox(P[0], P[1], 10)];
	// 座標軸的名字 x、y
	const o: Vec = [sx(0), sy(0)];
	avoid.push({ x0: fr.right - 14, y0: o[1] - 18, x1: fr.right - 2, y1: o[1] - 2 }, { x0: o[0] + 7, y0: fr.top + 2, x1: o[0] + 19, y1: fr.top + 18 });
	// 等高線的高度數字
	for (const ct of contours) avoid.push(pointBox(ct.at[0], ct.at[1], 9));
	if (arrow) {
		avoid.push(...segmentBoxes(P, tip, 4), pointBox(tip[0], tip[1], 8));
		if (Math.abs(corner[0] - P[0]) > 1) avoid.push(...segmentBoxes(P, corner, 3));
		if (Math.abs(corner[1] - tip[1]) > 1) avoid.push(...segmentBoxes(corner, tip, 3));
	}

	// 梯度的名字：放在尖端前方，或兩側
	let gradLabel: { spot: Spot; box: Box } | null = null;
	const gradText = info.zero ? '碗底：∇f = (0, 0)' : `∇f = (${fmtNum(g[0])}, ${fmtNum(g[1])})`;
	const gradW = textWidth(gradText, 14) + 6;
	if (arrow) {
		const n: Vec = [-ug[1], ug[0]];
		const side = (u: Vec, d: number): Spot['anchor'] => (u[0] * d > 0.35 ? 'start' : u[0] * d < -0.35 ? 'end' : 'middle');
		const cands: Spot[] = [
			{ x: tip[0] + ug[0] * 14, y: tip[1] + ug[1] * 14, anchor: side(ug, 1) },
			{ x: tip[0] + n[0] * 14, y: tip[1] + n[1] * 14, anchor: side(n, 1) },
			{ x: tip[0] - n[0] * 14, y: tip[1] - n[1] * 14, anchor: side(n, -1) },
			{ x: tip[0] + 10, y: tip[1] - 12, anchor: 'start' },
			{ x: tip[0] - 10, y: tip[1] - 12, anchor: 'end' },
			{ x: tip[0] + 10, y: tip[1] + 12, anchor: 'start' },
			{ x: tip[0] - 10, y: tip[1] + 12, anchor: 'end' },
			{ x: (P[0] + tip[0]) / 2 + n[0] * 16, y: (P[1] + tip[1]) / 2 + n[1] * 16, anchor: side(n, 1) },
			{ x: (P[0] + tip[0]) / 2 - n[0] * 16, y: (P[1] + tip[1]) / 2 - n[1] * 16, anchor: side(n, -1) },
		];
		gradLabel = placeLabel(cands, gradW, 20, avoid, bounds);
	} else {
		gradLabel = placeLabel(
			[
				{ x: P[0], y: P[1] - 30, anchor: 'middle' },
				{ x: P[0], y: P[1] + 30, anchor: 'middle' },
			],
			gradW,
			20,
			avoid,
			bounds,
		);
	}
	avoid.push(gradLabel.box);

	// 兩個偏導數的名字：x 分量放在水平虛線的上面或下面，y 分量放在垂直虛線的左邊或右邊
	const partialLabels: { text: string; spot: Spot; box: Box }[] = [];
	if (arrow) {
		const items: { text: string; cands: Spot[]; show: boolean }[] = [
			{
				text: '∂f/∂x',
				show: g[0] !== 0,
				cands: (() => {
					const mx = (P[0] + corner[0]) / 2;
					const away = g[1] >= 0 ? 1 : -1; // 先試背對 y 分量的那一側
					return [
						{ x: mx, y: P[1] + 20 * away, anchor: 'middle' },
						{ x: mx, y: P[1] - 20 * away, anchor: 'middle' },
						{ x: P[0] - Math.sign(g[0]) * 10, y: P[1] + 14 * away, anchor: g[0] > 0 ? 'end' : 'start' },
						{ x: P[0] - Math.sign(g[0]) * 10, y: P[1] - 14 * away, anchor: g[0] > 0 ? 'end' : 'start' },
					] as Spot[];
				})(),
			},
			{
				text: '∂f/∂y',
				show: g[1] !== 0,
				cands: (() => {
					const my = (corner[1] + tip[1]) / 2;
					const out = g[0] >= 0 ? 1 : -1; // 先試外側（遠離 P 的那一側）
					return [
						{ x: corner[0] + 9 * out, y: my, anchor: out > 0 ? 'start' : 'end' },
						{ x: corner[0] - 9 * out, y: my, anchor: out > 0 ? 'end' : 'start' },
						{ x: corner[0] + 9 * out, y: corner[1] + (tip[1] - corner[1]) * 0.75, anchor: out > 0 ? 'start' : 'end' },
						{ x: corner[0] - 9 * out, y: corner[1] + (tip[1] - corner[1]) * 0.75, anchor: out > 0 ? 'end' : 'start' },
						{ x: corner[0] + 9 * out, y: corner[1] - Math.sign(g[1]) * 4, anchor: out > 0 ? 'start' : 'end' },
						{ x: corner[0] - 9 * out, y: corner[1] - Math.sign(g[1]) * 4, anchor: out > 0 ? 'end' : 'start' },
					] as Spot[];
				})(),
			},
		];
		for (const it of items) {
			if (!it.show) continue;
			const lab = placeLabel(it.cands, textWidth(it.text, 13) + 8, 18, avoid, bounds);
			// 箭頭很短（手機、靠近碗底）時，名字可能放不下：會壓到別的字就不畫，圖例裡有虛線的說明
			if (overlapCost(lab.box, avoid) > 30) continue;
			avoid.push(lab.box);
			partialLabels.push({ text: it.text, ...lab });
		}
	}

	// P 的名字
	const pCands: Spot[] = [
		{ x: P[0] - 12, y: P[1] + 14, anchor: 'end' },
		{ x: P[0] + 12, y: P[1] + 14, anchor: 'start' },
		{ x: P[0] - 12, y: P[1] - 12, anchor: 'end' },
		{ x: P[0] + 12, y: P[1] - 12, anchor: 'start' },
		{ x: P[0] - 15, y: P[1], anchor: 'end' },
		{ x: P[0] + 15, y: P[1], anchor: 'start' },
		{ x: P[0], y: P[1] + 20, anchor: 'middle' },
		{ x: P[0], y: P[1] - 20, anchor: 'middle' },
	];
	const pLabel = placeLabel(pCands, textWidth('P', 16) + 4, 20, avoid, bounds);
	avoid.push(pLabel.box);

	// 經過 P 的等高線的高度：放在這條線旁邊、離 P 遠一點的地方（−P、上下或左右對稱的點都在同一條線上），
	// 沿著那一點的法線往外或往內移開一點，字才不會壓在線上
	let levelLabel: { spot: Spot; box: Box; text: string } | null = null;
	if (info.f > 0) {
		const c = info.f;
		const text = `f = ${fmtNum(c)}`;
		const pts: Vec[] = [
			[-p[0], -p[1]],
			[p[0], -p[1]],
			[-p[0], p[1]],
			[0, -Math.sqrt(c / 3)],
			[0, Math.sqrt(c / 3)],
			[-Math.sqrt(c), 0],
			[Math.sqrt(c), 0],
		];
		const cands: Spot[] = [];
		for (const q of pts) {
			if (Math.abs(q[0]) > FIELD_HALF - 0.1 || Math.abs(q[1]) > FIELD_HALF - 0.1) continue;
			const s = toScreen(q);
			if (Math.hypot(s[0] - P[0], s[1] - P[1]) < 40) continue; // 離 P 太近（碗底附近）
			const gq = gradAt(q); // 法線（數學座標）；畫面的 y 往下
			const l = Math.hypot(gq[0], gq[1]) || 1;
			const nrm: Vec = [gq[0] / l, -gq[1] / l];
			for (const k of [12, -12]) cands.push({ x: s[0] + nrm[0] * k, y: s[1] + nrm[1] * k, anchor: Math.abs(nrm[0]) > 0.6 ? ((nrm[0] * k > 0) ? 'start' : 'end') : 'middle' });
		}
		if (cands.length) {
			const lab = placeLabel(cands, textWidth(text, 14) + 6, 18, avoid, bounds);
			levelLabel = { ...lab, text };
			avoid.push(lab.box);
		}
	}

	// 直角記號：一邊沿著梯度、一邊沿著等高線的切線
	let rightAngle: string | null = null;
	if (arrow && gLen >= 20) {
		const s = 13;
		const ut: Vec = [-ug[1], ug[0]];
		rightAngle = `M${P[0] + ut[0] * s} ${P[1] + ut[1] * s} L${P[0] + ut[0] * s + ug[0] * s} ${P[1] + ut[1] * s + ug[1] * s} L${P[0] + ug[0] * s} ${P[1] + ug[1] * s}`;
	}

	// ----- 文字 -----
	const pv = `(${fmtNum(p[0])}, ${fmtNum(p[1])})`;
	const gv = `(${fmtNum(g[0])}, ${fmtNum(g[1])})`;
	const normText = fmt4(info.norm);
	const exactNorm = Number(normText) === info.norm;
	const summary = info.zero
		? `P = ${pv}，在碗底，高度 0。梯度 (0, 0) 是零向量，沒有方向。`
		: `P = ${pv}，高度 ${fmtNum(info.f)}。∂f/∂x = ${fmtNum(g[0])}，∂f/∂y = ${fmtNum(g[1])}，梯度 ${gv}，長度 ${normText}。`;

	const bg = (b: Box) => <rect className={styles.labelBg} x={b.x0} y={b.y0 + 1} width={b.x1 - b.x0} height={b.y1 - b.y0 - 2} rx={3} />;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="等高線與梯度互動示範">
			<div className={styles.group}>
				<p className={styles.title} id={`${uid}-presets`}>
					選一個點 P，或直接在圖上拖動
				</p>
				<div className={styles.chips} role="group" aria-labelledby={`${uid}-presets`}>
					{FIELD_PRESETS.map((pr) => (
						<button key={pr.label} type="button" className={styles.chip} aria-pressed={vecEq(p, pr.p)} aria-label={pr.aria} onClick={() => setPoint(pr.p)}>
							{pr.label}
						</button>
					))}
					<button type="button" className={`${styles.chip} ${styles.chipToggle}`} aria-pressed={showField} onClick={() => setShowField((v) => !v)}>
						顯示格點上的梯度
					</button>
				</div>
				<div className={styles.inputRow}>
					<span className={styles.pName}>P</span>
					<span aria-hidden="true">= (</span>
					<NumField value={p[0]} onValue={(x) => setPoint([x, p[1]])} label="P 的 x 座標" lim={P_LIM[0]} />
					<span aria-hidden="true">,</span>
					<NumField value={p[1]} onValue={(y) => setPoint([p[0], y])} label="P 的 y 座標" lim={P_LIM[1]} />
					<span aria-hidden="true">)</span>
				</div>
				<p className={`${styles.small} ${styles.muted}`}>
					x 從 −{fmtNum(P_LIM[0])} 到 {fmtNum(P_LIM[0])}、y 從 −{fmtNum(P_LIM[1])} 到 {fmtNum(P_LIM[1])}（梯度箭頭才放得進圖裡），每格 0.25；方向鍵一次加減 0.25。
				</p>
			</div>

			<div className={styles.stack}>
				<div className={styles.plotCenter} ref={wrapRef}>
					<svg
						className={`${styles.plot} ${dragging ? styles.grabbing : hover ? styles.grab : ''}`}
						viewBox={`0 0 ${width} ${fr.height}`}
						role="img"
						aria-label={`f(x, y) = x² + 3y² 的等高線圖：灰色橢圓是等高線，相鄰兩條高度差 ${LEVEL_STEP}。點 P = ${pv}${info.zero ? '，在碗底，梯度是零向量，沒有箭頭。' : `；紫色線是經過 P 的等高線（高度 ${fmtNum(info.f)}）；珊瑚色箭頭是梯度 ${gv}（長度縮成 1/${ARROW_SCALE}），和紫色線垂直、指向外側的上坡。`}`}
						aria-describedby={hintId}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						onLostPointerCapture={endDrag}
						onPointerLeave={() => setHover(false)}
					>
						<defs>
							<clipPath id={clipId}>
								<rect x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
							</clipPath>
						</defs>

						{/* 格線與刻度（刻度數字放在圖的左邊和下面） */}
						{GRID.map((t) => (
							<g key={t}>
								<line className={styles.grid} x1={sx(t)} y1={fr.top} x2={sx(t)} y2={fr.bottom} />
								<line className={styles.grid} x1={fr.left} y1={sy(t)} x2={fr.right} y2={sy(t)} />
								<text className={styles.tickText} x={sx(t)} y={fr.bottom + 17} textAnchor="middle">
									{fmtNum(t)}
								</text>
								<text className={styles.tickText} x={fr.left - 6} y={sy(t) + 5} textAnchor="end">
									{fmtNum(t)}
								</text>
							</g>
						))}

						{/* 座標軸 */}
						<line className={styles.axis} x1={fr.left} y1={o[1]} x2={fr.right} y2={o[1]} />
						<line className={styles.axis} x1={o[0]} y1={fr.bottom} x2={o[0]} y2={fr.top} />
						<path className={styles.axisArrow} d={`M${fr.right + 2} ${o[1]} l-9 -4.5 v9 z`} />
						<path className={styles.axisArrow} d={`M${o[0]} ${fr.top - 2} l-4.5 9 h9 z`} />
						<text className={`${styles.axisName} ${styles.halo}`} x={fr.right - 4} y={o[1] - 9} textAnchor="end">
							x
						</text>
						<text className={`${styles.axisName} ${styles.halo}`} x={o[0] + 9} y={fr.top + 12} textAnchor="start">
							y
						</text>

						{/* 等高線與經過 P 的等高線 */}
						<g clipPath={`url(#${clipId})`}>
							{contours.map((ct) => (
								<path key={ct.c} className={styles.contour} d={ct.d} />
							))}
							{levelPath ? <path className={styles.level} d={levelPath} /> : null}
						</g>
						{contours.map((ct) => (
							<text key={ct.c} className={`${styles.contourText} ${styles.halo}`} x={ct.at[0]} y={ct.at[1]} textAnchor="middle" dominantBaseline="central">
								{ct.c}
							</text>
						))}

						{/* 格點上的梯度（本集「畫成箭頭」那張圖的格點，同樣縮成 1/10） */}
						{showField
							? QUIVER_POINTS.map((q) => {
									const gq = gradAt(q);
									const a = toScreen(q);
									const b = toScreen([q[0] + gq[0] / ARROW_SCALE, q[1] + gq[1] / ARROW_SCALE]);
									const sh = arrowShape(a[0], a[1], b[0], b[1], 8, 7);
									return sh ? (
										<g key={`${q[0]},${q[1]}`}>
											<line className={styles.quiverShaft} x1={a[0]} y1={a[1]} x2={sh.shaftEnd[0]} y2={sh.shaftEnd[1]} />
											<path className={styles.quiverHead} d={sh.head} />
										</g>
									) : (
										<circle key="origin" className={styles.quiverDot} cx={a[0]} cy={a[1]} r={2.5} />
									);
								})
							: null}

						{levelLabel ? (
							<g>
								{bg(levelLabel.box)}
								<text className={styles.levelText} x={levelLabel.spot.x} y={levelLabel.spot.y} textAnchor={levelLabel.spot.anchor} dominantBaseline="central">
									{levelLabel.text}
								</text>
							</g>
						) : null}

						{/* 兩個偏導數：梯度的 x 分量、y 分量 */}
						{arrow && Math.abs(corner[0] - P[0]) > 0.5 ? <line className={styles.partial} x1={P[0]} y1={P[1]} x2={corner[0]} y2={corner[1]} /> : null}
						{arrow && Math.abs(corner[1] - tip[1]) > 0.5 ? <line className={styles.partial} x1={corner[0]} y1={corner[1]} x2={tip[0]} y2={tip[1]} /> : null}

						{/* P：淡色圓圈標出可以抓的範圍 */}
						<circle className={styles.handle} cx={P[0]} cy={P[1]} r={11} />
						{dragging || hover ? <circle className={styles.ring} cx={P[0]} cy={P[1]} r={16} /> : null}
						{rightAngle ? <path className={styles.rightAngle} d={rightAngle} /> : null}

						{/* 梯度箭頭 */}
						{arrow ? (
							<g>
								<line className={styles.gradShaft} x1={P[0]} y1={P[1]} x2={arrow.shaftEnd[0]} y2={arrow.shaftEnd[1]} />
								<path className={styles.gradHead} d={arrow.head} />
							</g>
						) : null}
						<circle className={styles.point} cx={P[0]} cy={P[1]} r={5} />

						{partialLabels.map((pl) => (
							<g key={pl.text}>
								{bg(pl.box)}
								<text className={styles.partialText} x={pl.spot.x} y={pl.spot.y} textAnchor={pl.spot.anchor} dominantBaseline="central">
									{pl.text}
								</text>
							</g>
						))}
						{bg(gradLabel.box)}
						<text className={styles.gradText} x={gradLabel.spot.x} y={gradLabel.spot.y} textAnchor={gradLabel.spot.anchor} dominantBaseline="central">
							{gradText}
						</text>
						<text className={`${styles.pointText} ${styles.halo}`} x={pLabel.spot.x} y={pLabel.spot.y} textAnchor={pLabel.spot.anchor} dominantBaseline="central">
							P
						</text>
					</svg>

					<div className={styles.legend} aria-hidden="true">
						<span className={styles.legendItem}>
							<span className={styles.swContour} />
							等高線（相鄰兩條高度差 {LEVEL_STEP}）
						</span>
						<span className={styles.legendItem}>
							<span className={styles.swLevel} />
							經過 P 的等高線
						</span>
						<span className={styles.legendItem}>
							<span className={styles.swGrad} />
							梯度 ∇f（箭頭長度縮成 1/{ARROW_SCALE}）
						</span>
						<span className={styles.legendItem}>
							<span className={styles.swPartial} />
							x、y 分量（兩個偏導數）
						</span>
					</div>
					<p className={styles.hint} id={hintId}>
						拖動或點一下圖上任一點，P 就移過去（吸附到 0.25 的格點）；也可以在上面的格子輸入 x、y。
					</p>
				</div>

				<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
					{summary}
				</p>

				<div className={styles.readoutCols}>
					<div className={styles.calc}>
						<p className={styles.calcTitle}>高度</p>
						<div className={styles.derivGrid}>
							<span>f(P)</span>
							<span className={styles.rhs}>
								<span>= x² + 3y²</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>= {sqText(p[0])}</span>
								<span>+ 3 × {sqText(p[1])}</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>= {fmtNum(info.terms[0])}</span>
								<span>+ {fmtNum(info.terms[1])}</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>
									= <span className={`${styles.textLevel} ${styles.big}`}>{fmtNum(info.f)}</span>
								</span>
							</span>
						</div>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>偏導數：固定另一個，只動一個</p>
						<div className={styles.derivGrid}>
							<span>∂f/∂x</span>
							<span className={styles.rhs}>
								<span>= 2x</span>
								<span>= 2 × {fmtFactor(p[0])}</span>
								<span>
									= <span className={`${styles.textGrad} ${styles.big}`}>{fmtNum(g[0])}</span>
								</span>
							</span>
							<span>∂f/∂y</span>
							<span className={styles.rhs}>
								<span>= 6y</span>
								<span>= 6 × {fmtFactor(p[1])}</span>
								<span>
									= <span className={`${styles.textGrad} ${styles.big}`}>{fmtNum(g[1])}</span>
								</span>
							</span>
						</div>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>梯度：兩個偏導數排成向量</p>
						<div className={styles.derivGrid}>
							<span>∇f</span>
							<span className={styles.rhs}>
								<span>= (∂f/∂x, ∂f/∂y)</span>
								<span>
									= <span className={`${styles.textGrad} ${styles.big}`}>{gv}</span>
								</span>
							</span>
							<span>
								<Norm v="∇f" />
							</span>
							<span className={styles.rhs}>
								<span>= √({sqText(g[0])}</span>
								<span>+ {sqText(g[1])})</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>= √{fmtNum(info.sumSq)}</span>
								<span>
									{exactNorm ? '=' : '≈'} <span className={`${styles.result} ${styles.big}`}>{normText}</span>
								</span>
							</span>
						</div>
					</div>

					{info.zero ? (
						<p className={styles.plain}>
							<span className={styles.tagWord}>碗底</span>：梯度是零向量 (0, 0)，沒有方向。這裡是平的，往哪個方向走一小步，高度都幾乎不變。
						</p>
					) : (
						<p className={styles.ok}>
							梯度和經過 P 的<span className={styles.textLevel}>等高線</span>垂直（圖上的直角記號），指向<span className={styles.tagWord}>上坡</span>：往碗外、高度變大的那一側。
						</p>
					)}
				</div>

				<p className={styles.note}>
					相鄰兩條灰色等高線的高度都差 {LEVEL_STEP}：線越密，坡越陡。y 方向的線比 x 方向密，所以 y 方向比較陡（6y 的係數 6 比 2x 的 2 大）。打開上面的「顯示格點上的梯度」，可以看到每支箭頭都和等高線垂直、指向外，越往外越長。
				</p>
			</div>
		</section>
	);
}
