import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './Ep05Jacobian.module.css';
import {
	fmtFixed,
	fmtInput,
	fmtShort,
	fmtSig,
	IN_HALF,
	niceTicks,
	outHalf,
	overlapCost,
	P_LIM,
	P_START,
	P_STEP,
	paren,
	placeLabel,
	pointBox,
	polylineBoxes,
	polylinePath,
	segmentBoxes,
	SIDE_START,
	SIDES,
	snapP,
	snapTenth,
	textWidth,
	vecEq,
	viewFrame,
	WARP_PRESETS,
	warpInfo,
	type Box,
	type Spot,
	type Vec,
} from './ep05-jacobian.ts';

/**
 * 放大看，非線性變換就像矩陣：F(x, y) = (x² − y, xy) 把以 p 為中心的小正方形變成一個彎的形狀（藍色實線），
 * Jacobian 預測的是平行四邊形 F(p) + J (q − p)（珊瑚色虛線，q 是正方形上的點）。正方形越小，兩個越貼合。
 *
 * 左圖是輸入平面（固定從 −3 畫到 3），可以拖動 p；右圖是輸出平面，以 F(p) 為中心，
 * 範圍跟著形狀自動放大或縮小（兩張圖一樣寬，所以「放大幾倍」就是兩張圖比例尺的比）。
 * 兩張圖都是兩軸同比例。viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_WIDTH = 330;
/** 四周留白（px）：左邊放刻度數字（右圖的刻度可能是 −1.05 這種長度），下面放刻度數字 */
const PADS = { l: 40, r: 12, t: 12, b: 26 };
const IN_GRID = [-3, -2, -1, 0, 1, 2, 3];

/** 一個座標的數字輸入：方向鍵一次 0.1；輸入其他數字時吸附到最近的 0.1，離開輸入格後格子裡也改成吸附後的數字 */
function NumField({ value, onValue, label }: { value: number; onValue: (v: number) => void; label: string }) {
	const [text, setText] = useState<string | null>(null);
	return (
		<input
			type="number"
			className={styles.num}
			step={P_STEP}
			min={-P_LIM}
			max={P_LIM}
			aria-label={label}
			value={text ?? fmtInput(value)}
			onChange={(e) => {
				const raw = e.currentTarget.value;
				setText(raw);
				const v = Number(raw);
				if (raw.trim() !== '' && Number.isFinite(v)) onValue(snapTenth(v));
			}}
			onBlur={() => setText(null)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') setText(null);
			}}
		/>
	);
}

/** 2 × 2 矩陣，一列一列寫 */
function Matrix({ cells, className }: { cells: [string, string, string, string]; className?: string }) {
	return (
		<span className={`${styles.matrix} ${className ?? ''}`}>
			{cells.map((c, i) => (
				<span key={i}>{c}</span>
			))}
		</span>
	);
}

/** 邊長的寫法：1、0.4、0.1、0.05 */
const sideText = (s: number) => fmtShort(s, 2);

export default function JacobianWarpDemo() {
	const [p, setP] = useState<Vec>(P_START);
	const [side, setSide] = useState(SIDE_START);
	const [wIn, setWIn] = useState(DEFAULT_WIDTH);
	const [wOut, setWOut] = useState(DEFAULT_WIDTH);
	const [hover, setHover] = useState(false);
	const [dragging, setDragging] = useState(false);
	const inRef = useRef<HTMLDivElement>(null);
	const outRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<number | null>(null);
	const uid = useId();
	const safe = uid.replace(/[^a-zA-Z0-9_-]/g, '');
	const clipIn = `jw-in-${safe}`;
	const clipOut = `jw-out-${safe}`;
	const hintId = `${uid}-hint`;

	// 量兩張圖的實際寬度
	useEffect(() => {
		const pairs: [HTMLDivElement | null, (w: number) => void][] = [
			[inRef.current, setWIn],
			[outRef.current, setWOut],
		];
		const update = () => {
			for (const [el, set] of pairs) {
				if (!el) continue;
				const w = Math.round(el.getBoundingClientRect().width);
				if (w > 0) set(w);
			}
		};
		update();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(update);
		for (const [el] of pairs) if (el) ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const w = useMemo(() => warpInfo(p, side), [p, side]);
	const table = useMemo(() => SIDES.map((s) => ({ s, ...warpInfo(p, s) })), [p]);
	const half = outHalf(w);
	const zoom = IN_HALF / half;

	const setPoint = (v: Vec) => setP((prev) => (vecEq(prev, v) ? prev : v));

	// ----- 左圖：輸入平面 -----
	const frIn = viewFrame(wIn, 0, 0, IN_HALF, PADS);
	const sIn = (v: Vec): Vec => [frIn.sx(v[0]), frIn.sy(v[1])];
	const P = sIn(p);
	const oIn = sIn([0, 0]);
	const sqPts = w.outline.map(sIn);
	const sqPath = `${polylinePath(sqPts)} Z`;
	const sqPx = side * frIn.unit;
	const qWorst = sIn(w.outline[w.worst]);

	// 拖動（Pointer Events：滑鼠、觸控、觸控筆都適用）：點左圖任一點，p 就移過去
	const toLocal = (e: ReactPointerEvent<SVGSVGElement>): Vec => {
		const r = e.currentTarget.getBoundingClientRect();
		const k = wIn / r.width;
		return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
	};
	const nearP = (px: number, py: number) => Math.hypot(px - P[0], py - P[1]) <= 22;
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = e.pointerId;
		setDragging(true);
		setPoint(snapP(frIn.fromScreen(...toLocal(e))));
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e);
		if (dragRef.current !== e.pointerId) {
			if (e.pointerType === 'mouse') setHover(nearP(px, py));
			return;
		}
		setPoint(snapP(frIn.fromScreen(px, py)));
	};
	const endDrag = () => {
		dragRef.current = null;
		setDragging(false);
	};

	// p 的名字：避開正方形的邊和座標軸的名字
	const boundsIn: Box = { x0: frIn.left + 2, y0: frIn.top + 1, x1: frIn.right - 1, y1: frIn.bottom - 1 };
	const avoidIn: Box[] = [pointBox(P[0], P[1], 9), ...polylineBoxes(sqPts.filter((_, i) => i % 5 === 0), 3)];
	avoidIn.push({ x0: frIn.right - 14, y0: oIn[1] - 18, x1: frIn.right - 2, y1: oIn[1] - 2 }, { x0: oIn[0] + 7, y0: frIn.top + 2, x1: oIn[0] + 19, y1: frIn.top + 18 });
	// 正方形夠大時，名字放在正方形裡、p 的旁邊；放不下時放在正方形外側（先試右邊、左邊的中間，離 p 最近；
	// q 在左下角，p 的名字先試右邊才不會和 q 擠在一起）
	const sqHalf = sqPx / 2;
	const pW = textWidth('p', 16) + 2;
	const insideLabel =
		sqHalf >= 20
			? placeLabel(
					[
						{ x: P[0] + 7, y: P[1] - 10, anchor: 'start' },
						{ x: P[0] - 7, y: P[1] - 10, anchor: 'end' },
						{ x: P[0] + 7, y: P[1] + 10, anchor: 'start' },
						{ x: P[0] - 7, y: P[1] + 10, anchor: 'end' },
					],
					pW,
					16,
					avoidIn,
					boundsIn,
				)
			: null;
	const m = sqHalf + (sqHalf >= 8 ? 7 : 11);
	const pLabel =
		insideLabel && overlapCost(insideLabel.box, avoidIn) <= 30
			? insideLabel
			: placeLabel(
					[
						{ x: P[0] + m, y: P[1], anchor: 'start' },
						{ x: P[0] - m, y: P[1], anchor: 'end' },
						{ x: P[0], y: P[1] - m - 4, anchor: 'middle' },
						{ x: P[0], y: P[1] + m + 4, anchor: 'middle' },
						{ x: P[0] - m, y: P[1] - m, anchor: 'end' },
						{ x: P[0] + m, y: P[1] - m, anchor: 'start' },
						{ x: P[0] - m, y: P[1] + m, anchor: 'end' },
						{ x: P[0] + m, y: P[1] + m, anchor: 'start' },
					],
					pW,
					18,
					avoidIn,
					boundsIn,
				);
	avoidIn.push(pLabel.box);
	// 最大距離出現在哪一個 q（正方形夠大才畫）：名字放在角落外側，背對 p
	const showQ = sqPx >= 30;
	const qDir: Vec = [Math.sign(qWorst[0] - P[0]) || -1, Math.sign(qWorst[1] - P[1]) || 1];
	const qLabel = showQ
		? placeLabel(
				[
					{ x: qWorst[0] + qDir[0] * 8, y: qWorst[1] + qDir[1] * 10, anchor: qDir[0] > 0 ? 'start' : 'end' },
					{ x: qWorst[0] + qDir[0] * 11, y: qWorst[1], anchor: qDir[0] > 0 ? 'start' : 'end' },
					{ x: qWorst[0], y: qWorst[1] + qDir[1] * 13, anchor: 'middle' },
					{ x: qWorst[0] - qDir[0] * 8, y: qWorst[1] + qDir[1] * 10, anchor: qDir[0] > 0 ? 'end' : 'start' },
				],
				textWidth('q', 15) + 2,
				16,
				avoidIn,
				boundsIn,
			)
		: null;

	// ----- 右圖：輸出平面（以 F(p) 為中心） -----
	const frOut = viewFrame(wOut, w.fp[0], w.fp[1], half, PADS);
	const sOut = (v: Vec): Vec => [frOut.sx(v[0]), frOut.sy(v[1])];
	const ticksX = niceTicks(frOut.x0, frOut.x1);
	const ticksY = niceTicks(frOut.y0, frOut.y1);
	const tickPx = ticksX.step * frOut.unit;
	const widest = Math.max(...ticksX.values.map((t) => textWidth(fmtFixed(t, ticksX.decimals), 12.5)));
	// 刻度數字擠不下時，每隔一個寫一個（挑 0 或偶數倍的那些）
	const every = tickPx >= widest + 8 ? 1 : 2;
	const showTick = (t: number, step: number) => every === 1 || Math.round(t / step) % 2 === 0;
	const curvePts = w.curve.map(sOut);
	const paraPts = w.para.map(sOut);
	const curvePath = `${polylinePath(curvePts)} Z`;
	const paraPath = `${polylinePath(paraPts)} Z`;
	const FP = sOut(w.fp);
	const gA = sOut(w.curve[w.worst]);
	const gB = sOut(w.para[w.worst]);
	const gapPx = Math.hypot(gA[0] - gB[0], gA[1] - gB[1]);

	const boundsOut: Box = { x0: frOut.left + 2, y0: frOut.top + 1, x1: frOut.right - 1, y1: frOut.bottom - 1 };
	const avoidOut: Box[] = [
		pointBox(FP[0], FP[1], 8),
		...polylineBoxes(curvePts.filter((_, i) => i % 4 === 0), 3),
		...polylineBoxes(paraPts.filter((_, i) => i % 4 === 0), 3),
	];
	if (gapPx >= 3) avoidOut.push(...segmentBoxes(gA, gB, 3), pointBox(gA[0], gA[1], 5), pointBox(gB[0], gB[1], 5));
	const fpText = 'F(p)';
	const fpLabel = placeLabel(
		[
			{ x: FP[0] + 10, y: FP[1] - 12, anchor: 'start' },
			{ x: FP[0] - 10, y: FP[1] - 12, anchor: 'end' },
			{ x: FP[0] + 10, y: FP[1] + 13, anchor: 'start' },
			{ x: FP[0] - 10, y: FP[1] + 13, anchor: 'end' },
			{ x: FP[0], y: FP[1] - 18, anchor: 'middle' },
			{ x: FP[0], y: FP[1] + 19, anchor: 'middle' },
		],
		textWidth(fpText, 14) + 6,
		18,
		avoidOut,
		boundsOut,
	);
	avoidOut.push(fpLabel.box);
	// 最大距離的標籤：放在短線外側（離 F(p) 遠的那一邊），再試其他位置
	let gapLabel: { spot: Spot; box: Box } | null = null;
	const gapText = '最大距離';
	if (gapPx >= 12) {
		const mid: Vec = [(gA[0] + gB[0]) / 2, (gA[1] + gB[1]) / 2];
		const out: Vec = [mid[0] - FP[0], mid[1] - FP[1]];
		const ol = Math.hypot(out[0], out[1]) || 1;
		const u: Vec = [out[0] / ol, out[1] / ol];
		const anchorOf = (dx: number): Spot['anchor'] => (dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle');
		const cands: Spot[] = [16, 26].flatMap((k) => [
			{ x: mid[0] + u[0] * k, y: mid[1] + u[1] * k, anchor: anchorOf(u[0]) },
			{ x: gA[0] + u[0] * k, y: gA[1] + u[1] * k, anchor: anchorOf(u[0]) },
			{ x: gB[0] + u[0] * k, y: gB[1] + u[1] * k, anchor: anchorOf(u[0]) },
		]);
		gapLabel = placeLabel(cands, textWidth(gapText, 13) + 6, 18, avoidOut, boundsOut);
	}

	// ----- 文字 -----
	const xt = fmtShort(p[0], 1);
	const yt = fmtShort(p[1], 1);
	const pv = `(${xt}, ${yt})`;
	const J = w.J;
	const jt = J.map((row) => row.map((v) => fmtShort(v))) as [[string, string], [string, string]];
	const fpt: [string, string] = [fmtShort(w.fp[0]), fmtShort(w.fp[1])];
	const fpv = `(${fpt[0]}, ${fpt[1]})`;
	const maxT = fmtSig(w.maxErr);
	const ratioT = fmtSig(w.ratio);
	const st = sideText(side);
	const zoomT = fmtShort(zoom, 2);
	const zoomWord = zoom > 1 ? `放大 ${zoomT} 倍` : zoom < 1 ? `縮小成 ${zoomT} 倍` : '和輸入平面同比例';
	const summary = `p = ${pv}，正方形邊長 ${st}。F(p) = ${fpv}；J 第 1 列 ${jt[0][0]}、${jt[0][1]}，第 2 列 ${jt[1][0]}、${jt[1][1]}。變形後的邊界和平行四邊形最多差 ${maxT}，除以邊長是 ${ratioT}。`;

	let sideNote;
	if (side >= 1)
		sideNote = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>邊長 {st}：</span>
				<span className={styles.shapeText}>藍色實線</span>明顯是彎的，和<span className={styles.predText}>平行四邊形</span>最多差 {maxT}（輸出平面上標著「最大距離」的短線）。把邊長選小一點看看。
			</p>
		);
	else if (side >= 0.4)
		sideNote = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>邊長 {st}：</span>已經很接近平行四邊形，最多差 {maxT}，是邊長的 {ratioT} 倍。再選小一點。
			</p>
		);
	else
		sideNote = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>邊長 {st}：</span>
				<span className={styles.shapeText}>藍色實線</span>和<span className={styles.predText}>珊瑚色虛線</span>幾乎重疊，最多只差 {maxT}，只有邊長的 {ratioT} 倍：放大看，F 就像矩陣 J。
			</p>
		);

	const bg = (b: Box) => <rect className={styles.labelBg} x={b.x0} y={b.y0 + 1} width={b.x1 - b.x0} height={b.y1 - b.y0 - 2} rx={3} />;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="Jacobian 與非線性變換互動示範">
			<div className={styles.group}>
				<p className={styles.title} id={`${uid}-presets`}>
					選一個點 <span className={styles.pName}>p</span>，或直接在輸入平面上拖動
				</p>
				<div className={styles.chips} role="group" aria-labelledby={`${uid}-presets`}>
					{WARP_PRESETS.map((pr) => (
						<button key={pr.label} type="button" className={styles.chip} aria-pressed={vecEq(p, pr.p)} aria-label={pr.aria} onClick={() => setPoint(pr.p)}>
							{pr.label}
						</button>
					))}
				</div>
				<div className={styles.inputRow}>
					<span className={styles.pName}>p</span>
					<span aria-hidden="true">= (</span>
					<NumField value={p[0]} onValue={(x) => setPoint([x, p[1]])} label="p 的 x 座標" />
					<span aria-hidden="true">,</span>
					<NumField value={p[1]} onValue={(y) => setPoint([p[0], y])} label="p 的 y 座標" />
					<span aria-hidden="true">)</span>
				</div>
				<p className={`${styles.small} ${styles.muted}`}>x、y 都從 −{fmtShort(P_LIM, 1)} 到 {fmtShort(P_LIM, 1)}，每格 0.1；方向鍵一次加減 0.1。</p>
			</div>

			<div className={styles.controlRow}>
				<span className={styles.controlLabel} id={`${uid}-side`}>
					正方形的邊長
				</span>
				<div className={styles.chips} role="group" aria-labelledby={`${uid}-side`}>
					{SIDES.map((s) => (
						<button key={s} type="button" className={`${styles.chip} ${styles.chipMono}`} aria-pressed={side === s} aria-label={`邊長 ${sideText(s)}`} onClick={() => setSide(s)}>
							{sideText(s)}
						</button>
					))}
				</div>
			</div>

			<div className={styles.pair}>
				<div className={styles.panel}>
					<p className={styles.panelTitle}>
						<span>輸入平面</span>
						<span>
							p = {pv}，邊長 {st}
						</span>
					</p>
					<div ref={inRef}>
						<svg
							className={`${styles.plot} ${styles.draggable} ${dragging ? styles.grabbing : hover ? styles.grab : ''}`}
							viewBox={`0 0 ${wIn} ${frIn.height}`}
							role="img"
							aria-label={`輸入平面，x、y 從 −3 到 3：點 p = ${pv}，藍色是以 p 為中心、邊長 ${st} 的正方形。`}
							aria-describedby={hintId}
							onPointerDown={onPointerDown}
							onPointerMove={onPointerMove}
							onPointerUp={endDrag}
							onPointerCancel={endDrag}
							onLostPointerCapture={endDrag}
							onPointerLeave={() => setHover(false)}
						>
							<defs>
								<clipPath id={clipIn}>
									<rect x={frIn.left} y={frIn.top} width={frIn.right - frIn.left} height={frIn.bottom - frIn.top} />
								</clipPath>
							</defs>

							{/* 格線與刻度（刻度數字放在圖的左邊和下面） */}
							{IN_GRID.map((t) => (
								<g key={t}>
									<line className={styles.grid} x1={frIn.sx(t)} y1={frIn.top} x2={frIn.sx(t)} y2={frIn.bottom} />
									<line className={styles.grid} x1={frIn.left} y1={frIn.sy(t)} x2={frIn.right} y2={frIn.sy(t)} />
									<text className={styles.tickText} x={frIn.sx(t)} y={frIn.bottom + 17} textAnchor="middle">
										{fmtShort(t, 0)}
									</text>
									<text className={styles.tickText} x={frIn.left - 6} y={frIn.sy(t) + 4.5} textAnchor="end">
										{fmtShort(t, 0)}
									</text>
								</g>
							))}

							{/* 座標軸 */}
							<line className={styles.axis} x1={frIn.left} y1={oIn[1]} x2={frIn.right} y2={oIn[1]} />
							<line className={styles.axis} x1={oIn[0]} y1={frIn.bottom} x2={oIn[0]} y2={frIn.top} />
							<path className={styles.axisArrow} d={`M${frIn.right + 2} ${oIn[1]} l-9 -4.5 v9 z`} />
							<path className={styles.axisArrow} d={`M${oIn[0]} ${frIn.top - 2} l-4.5 9 h9 z`} />
							<text className={`${styles.axisName} ${styles.halo}`} x={frIn.right - 4} y={oIn[1] - 9} textAnchor="end">
								x
							</text>
							<text className={`${styles.axisName} ${styles.halo}`} x={oIn[0] + 9} y={frIn.top + 12} textAnchor="start">
								y
							</text>

							{/* p：淡色圓圈標出可以抓的範圍；正方形畫在上面，小的時候也看得到 */}
							<circle className={styles.handle} cx={P[0]} cy={P[1]} r={11} />
							{dragging || hover ? <circle className={styles.ring} cx={P[0]} cy={P[1]} r={16} /> : null}
							<g clipPath={`url(#${clipIn})`}>
								<path className={styles.square} d={sqPath} />
							</g>
							{showQ ? <circle className={styles.corner} cx={qWorst[0]} cy={qWorst[1]} r={3.5} /> : null}
							<circle className={styles.point} cx={P[0]} cy={P[1]} r={sqPx >= 16 ? 4.5 : 2.5} />
							<text className={`${styles.pointText} ${styles.halo}`} x={pLabel.spot.x} y={pLabel.spot.y} textAnchor={pLabel.spot.anchor} dominantBaseline="central">
								p
							</text>
							{qLabel ? (
								<text className={`${styles.qText} ${styles.halo}`} x={qLabel.spot.x} y={qLabel.spot.y} textAnchor={qLabel.spot.anchor} dominantBaseline="central">
									q
								</text>
							) : null}
						</svg>
					</div>
				</div>

				<div className={styles.panel}>
					<p className={styles.panelTitle}>
						<span>輸出平面</span>
						<span className={styles.zoom}>{zoomWord}</span>
					</p>
					<div ref={outRef}>
						<svg
							className={styles.plot}
							viewBox={`0 0 ${wOut} ${frOut.height}`}
							role="img"
							aria-label={`輸出平面，以 F(p) = ${fpv} 為中心，比輸入平面${zoomWord}：藍色實線是 F 把正方形邊界變成的形狀，珊瑚色虛線是 Jacobian 預測的平行四邊形，兩者最多差 ${maxT}。`}
						>
							<defs>
								<clipPath id={clipOut}>
									<rect x={frOut.left} y={frOut.top} width={frOut.right - frOut.left} height={frOut.bottom - frOut.top} />
								</clipPath>
							</defs>

							{ticksX.values.map((t) => (
								<g key={`x${t}`}>
									<line className={t === 0 ? styles.axis : styles.grid} x1={frOut.sx(t)} y1={frOut.top} x2={frOut.sx(t)} y2={frOut.bottom} />
									{showTick(t, ticksX.step) ? (
										<text className={styles.tickText} x={frOut.sx(t)} y={frOut.bottom + 17} textAnchor="middle">
											{fmtFixed(t, ticksX.decimals)}
										</text>
									) : null}
								</g>
							))}
							{ticksY.values.map((t) => (
								<g key={`y${t}`}>
									<line className={t === 0 ? styles.axis : styles.grid} x1={frOut.left} y1={frOut.sy(t)} x2={frOut.right} y2={frOut.sy(t)} />
									{showTick(t, ticksY.step) ? (
										<text className={styles.tickText} x={frOut.left - 6} y={frOut.sy(t) + 4.5} textAnchor="end">
											{fmtFixed(t, ticksY.decimals)}
										</text>
									) : null}
								</g>
							))}
							<rect className={styles.frameLine} x={frOut.left} y={frOut.top} width={frOut.right - frOut.left} height={frOut.bottom - frOut.top} />

							<g clipPath={`url(#${clipOut})`}>
								<path className={styles.warped} d={curvePath} />
								<path className={styles.para} d={paraPath} />
							</g>
							{gapPx >= 3 ? (
								<g>
									<line className={styles.gap} x1={gA[0]} y1={gA[1]} x2={gB[0]} y2={gB[1]} />
									<circle className={styles.gapDot} cx={gA[0]} cy={gA[1]} r={3} />
									<circle className={styles.gapDot} cx={gB[0]} cy={gB[1]} r={3} />
								</g>
							) : null}
							<circle className={styles.point} cx={FP[0]} cy={FP[1]} r={4.5} />
							{bg(fpLabel.box)}
							<text className={styles.pointText} x={fpLabel.spot.x} y={fpLabel.spot.y} textAnchor={fpLabel.spot.anchor} dominantBaseline="central" style={{ fontStyle: 'normal' }}>
								{fpText}
							</text>
							{gapLabel ? (
								<g>
									{bg(gapLabel.box)}
									<text className={styles.gapText} x={gapLabel.spot.x} y={gapLabel.spot.y} textAnchor={gapLabel.spot.anchor} dominantBaseline="central">
										{gapText}
									</text>
								</g>
							) : null}
						</svg>
					</div>
					<p className={`${styles.small} ${styles.muted}`}>以 F(p) 為中心；橫軸是 x² − y、縱軸是 xy（F 的兩個輸出）。</p>
				</div>
			</div>

			<div className={styles.legend} aria-hidden="true">
				<span className={styles.legendItem}>
					<span className={styles.swSquare} />
					以 p 為中心的正方形
				</span>
				<span className={styles.legendItem}>
					<span className={styles.swWarped} />
					F 把正方形邊界變成的形狀
				</span>
				<span className={styles.legendItem}>
					<span className={styles.swPara} />
					Jacobian 預測的平行四邊形 F(p) + J (q − p)
				</span>
				<span className={styles.legendItem}>
					<span className={styles.swGap} />
					最大距離（同一個 q 的兩個落點）
				</span>
			</div>
			<p className={styles.hint} id={hintId}>
				拖動輸入平面上的 p（或點一下任一處），p 會吸附到 0.1 的格點；也可以用上面的格子輸入。q 是正方形邊界上的點（每邊取 50 個，共 200 個），輸入平面上標出的 q 是最大距離出現的那一點。輸出平面以 F(p) 為中心，範圍跟著形狀自動調整；兩張圖一樣寬，標題旁的倍數是和輸入平面比。
			</p>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.readoutCols}>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>Jacobian 在 p 這一點</p>
					<div className={styles.rhs}>
						<span className={styles.matName}>J</span>
						<span>=</span>
						<Matrix cells={['2x', '−1', 'y', 'x']} />
					</div>
					<div className={styles.rhs}>
						<span>=</span>
						<Matrix cells={[`2 × ${paren(xt)}`, '−1', yt, xt]} />
						<span>=</span>
						<Matrix cells={[jt[0][0], jt[0][1], jt[1][0], jt[1][1]]} className={styles.result} />
					</div>
					<p className={`${styles.small} ${styles.muted}`}>每一列是一個輸出的梯度：第 1 列是 x² − y 的，第 2 列是 xy 的。正方形的兩邊被 J 送到「邊長 × 第 1 欄」和「邊長 × 第 2 欄」，就是平行四邊形的兩邊。</p>
				</div>

				<div className={styles.calc}>
					<p className={styles.calcTitle}>正方形的中心 p 被送到 F(p)</p>
					<div className={styles.rhs}>
						<span>F(p) = (x² − y, xy)</span>
					</div>
					<div className={styles.rhs}>
						<span>
							= ({paren(xt)}² − {paren(yt)},
						</span>
						<span>
							{paren(xt)} × {paren(yt)})
						</span>
					</div>
					<div className={styles.rhs}>
						<span>
							= <span className={`${styles.result} ${styles.big}`}>{fpv}</span>
						</span>
					</div>
					<p className={`${styles.small} ${styles.muted}`}>
						平行四邊形 F(p) + J (q − p)：中心搬到 F(p)，形狀由 J 決定（EP03 的線性變換）。
					</p>
				</div>

				<div className={styles.calc}>
					<p className={styles.calcTitle}>彎了多少：同一個 q 的兩個落點最多差多遠</p>
					<div className={styles.rhs}>
						<span>最大距離</span>
						<span>
							= <span className={`${styles.result} ${styles.big}`}>{maxT}</span>
						</span>
					</div>
					<div className={styles.rhs}>
						<span>÷ 邊長</span>
						<span>
							= {maxT} ÷ {st} = <span className={`${styles.result} ${styles.big}`}>{ratioT}</span>
						</span>
					</div>
					<table className={styles.table}>
						<caption>邊長越來越小</caption>
						<thead>
							<tr>
								<th scope="col">邊長</th>
								<th scope="col">最大距離</th>
								<th scope="col">÷ 邊長</th>
							</tr>
						</thead>
						<tbody>
							{table.map((r) => (
								<tr key={r.s} className={r.s === side ? styles.current : undefined} aria-current={r.s === side ? 'true' : undefined}>
									<td>{sideText(r.s)}</td>
									<td>{fmtSig(r.maxErr)}</td>
									<td>{fmtSig(r.ratio)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{sideNote}
			{w.flat ? (
				<p className={styles.note}>
					<span className={styles.tagWord}>p = {pv}：J 的兩欄在同一條直線上</span>（EP03 的「壓扁」），平行四邊形扁成一條線段。F 在 p 附近也把小正方形壓得很扁，邊長要選得更小，形狀才會貼近那條線段。
				</p>
			) : null}
			<p className={`${styles.small} ${styles.muted}`}>
				為什麼拖動 p，最大距離都不變？這個 F 的差距剛好是 (a², ab)（q − p = (a, b)），和 p 在哪裡無關，只看正方形多大：邊長縮成 1/10，最大距離縮成 1/100，比邊長本身縮得快得多。
			</p>
		</section>
	);
}
