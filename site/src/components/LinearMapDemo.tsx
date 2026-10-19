import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './Ep03Vectors.module.css';
import {
	apply,
	around,
	aroundWide,
	arrowShape,
	awayFrom,
	col,
	DEMO_P,
	easeInOut,
	exitPoint,
	fmtInput,
	fmtNum,
	fmtVec,
	fromCols,
	isFlat,
	isZeroMat,
	lerpMat,
	MAP_HALF,
	MAP_PRESETS,
	MAT_LIM,
	mappedGrid,
	matEq,
	placeLabel,
	plotFrame,
	pointBox,
	polygonPath,
	segmentBoxes,
	scale,
	snap,
	snapVec,
	STEP,
	textWidth,
	vecEq,
	type Box,
	type Mat,
	type Spot,
	type Vec,
} from './ep03-vectors.ts';

/**
 * 矩陣＝把 (1, 0)、(0, 1) 送到哪裡：矩陣的第 1 欄是 (1, 0) 的落點 M e₁，第 2 欄是 (0, 1) 的落點 M e₂。
 * 拖動兩個落點（或改矩陣的四個數字），看整片格線怎麼變形、單位正方形變成哪個平行四邊形，
 * 以及示範點 (3, 2) 被送到 3 × 第 1 欄 + 2 × 第 2 欄。
 *
 * 換預設矩陣時，圖從舊矩陣平滑地變到新矩陣（逐格內插；系統設定「減少動態效果」時直接跳過去）。
 * 下面的數字一律顯示新矩陣。
 */

const DEFAULT_WIDTH = 440;
const GRID_N = 6; // 原本的格線 −6 … 6
const MAPPED_N = 14; // 變換後的格線多畫一些，縮小的變換也能鋪滿整張圖
const TICKS = [-6, -4, -2, 0, 2, 4, 6];
const ANIM_MS = 650;
const PROJECT = MAP_PRESETS.find((p) => p.key === 'project')!.m;
const CUSTOM_DESC = '自訂的矩陣：兩欄就是藍色、紫色箭頭的尖端。';

type Which = 'c1' | 'c2';

/** 矩陣的一格：方向鍵一次 0.5；輸入其他數字時吸附到最近的 0.5，離開輸入格後格子裡也改成吸附後的數字 */
function NumField({ value, onValue, label, className }: { value: number; onValue: (v: number) => void; label: string; className: string }) {
	const [text, setText] = useState<string | null>(null);
	return (
		<input
			type="number"
			className={`${styles.num} ${className}`}
			step={STEP}
			min={-MAT_LIM}
			max={MAT_LIM}
			aria-label={label}
			value={text ?? fmtInput(value)}
			onChange={(e) => {
				const raw = e.currentTarget.value;
				setText(raw);
				const v = Number(raw);
				if (raw.trim() !== '' && Number.isFinite(v)) onValue(snap(v, MAT_LIM));
			}}
			onBlur={() => setText(null)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') setText(null);
			}}
		/>
	);
}

export default function LinearMapDemo() {
	const [m, setM] = useState<Mat>(MAP_PRESETS[0].m); // 目前的矩陣（下面的數字）
	const [shown, setShown] = useState<Mat>(MAP_PRESETS[0].m); // 圖上畫的矩陣（動畫中會在兩個矩陣之間）
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [hover, setHover] = useState<Which | null>(null);
	const [dragging, setDragging] = useState<Which | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const shownRef = useRef<Mat>(shown);
	const rafRef = useRef(0);
	const dragRef = useRef<{ which: Which; dx: number; dy: number } | null>(null);
	const lastRef = useRef<Which>('c2');
	const uid = useId();
	const clipId = `map-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
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

	useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

	const draw = (v: Mat) => {
		shownRef.current = v;
		setShown(v);
	};
	/** 直接改成 v（拖動、輸入數字）：停掉動畫 */
	const setNow = (v: Mat) => {
		cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
		setM((prev) => (matEq(prev, v) ? prev : v));
		if (!matEq(shownRef.current, v)) draw(v);
	};
	/** 換預設矩陣：從圖上目前的樣子平滑地變過去 */
	const animateTo = (target: Mat) => {
		cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
		setM(target);
		const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		const from = shownRef.current;
		if (reduce || matEq(from, target)) {
			draw(target);
			return;
		}
		const t0 = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / ANIM_MS);
			draw(lerpMat(from, target, easeInOut(t)));
			rafRef.current = t < 1 ? requestAnimationFrame(tick) : 0;
		};
		rafRef.current = requestAnimationFrame(tick);
	};

	const fr = plotFrame(width, MAP_HALF);
	const { sx, sy } = fr;
	const c1 = col(m, 0);
	const c2 = col(m, 1);
	const setCol = (which: Which, v: Vec) => setNow(which === 'c1' ? fromCols(v, c2) : fromCols(c1, v));
	const setEntry = (i: 0 | 1, j: 0 | 1, v: number) => {
		const next: Mat = [[m[0][0], m[0][1]], [m[1][0], m[1][1]]];
		next[i][j] = v;
		setNow(next);
	};

	// ----- 拖動兩個落點（Pointer Events：滑鼠、觸控、觸控筆都適用） -----
	const toLocal = (e: ReactPointerEvent<SVGSVGElement>): Vec => {
		const r = e.currentTarget.getBoundingClientRect();
		const k = width / r.width;
		return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
	};
	const nearest = (px: number, py: number, radius: number): Which | null => {
		const d1 = Math.hypot(px - sx(c1[0]), py - sy(c1[1]));
		const d2 = Math.hypot(px - sx(c2[0]), py - sy(c2[1]));
		if (Math.min(d1, d2) > radius) return null;
		if (Math.abs(d1 - d2) < 0.5) return lastRef.current; // 疊在一起：抓上一次拖的那個
		return d1 < d2 ? 'c1' : 'c2';
	};
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e);
		const which = nearest(px, py, e.pointerType === 'mouse' ? 22 : 34);
		if (!which) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		setNow(m); // 動畫還沒跑完就抓：直接跳到終點
		const v = which === 'c1' ? c1 : c2;
		dragRef.current = { which, dx: sx(v[0]) - px, dy: sy(v[1]) - py };
		lastRef.current = which;
		setDragging(which);
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e);
		const d = dragRef.current;
		if (!d) {
			if (e.pointerType === 'mouse') setHover(nearest(px, py, 22));
			return;
		}
		const v = snapVec(fr.fromScreen(px + d.dx, py + d.dy), MAT_LIM);
		const cur = d.which === 'c1' ? c1 : c2;
		if (!vecEq(cur, v)) setCol(d.which, v);
	};
	const endDrag = () => {
		dragRef.current = null;
		setDragging(null);
	};

	// ----- 圖上的幾何（畫面座標；用動畫中的 shown） -----
	const s1 = col(shown, 0);
	const s2 = col(shown, 1);
	const o: Vec = [sx(0), sy(0)];
	const scr = (v: Vec): Vec => [sx(v[0]), sy(v[1])];
	const t1 = scr(s1);
	const t2 = scr(s2);
	const arr1 = arrowShape(o[0], o[1], t1[0], t1[1], 14, 12);
	const arr2 = arrowShape(o[0], o[1], t2[0], t2[1], 14, 12);
	const grid = mappedGrid(shown, MAPPED_N);
	const area = polygonPath([o, t1, scr([s1[0] + s2[0], s1[1] + s2[1]]), t2]);
	const step1 = scale(DEMO_P[0], s1); // 3 × 第 1 欄
	const mp = apply(shown, DEMO_P); // 3 × 第 1 欄 + 2 × 第 2 欄
	const mpS = scr(mp);
	const pS = scr(DEMO_P);
	const exit = exitPoint(mp, MAP_HALF - 0.2);
	const samePlace = Math.hypot(mpS[0] - pS[0], mpS[1] - pS[1]) < 18;
	const ring = dragging ?? hover;

	// 標籤：依序放圖外的提示、兩個落點的名稱、M·(3, 2)、(3, 2)；後放的避開先放的，也都避開各個點和兩支箭頭
	// （範圍可以稍微超出格線，用到右邊和上面的留白）
	const bounds: Box = { x0: fr.left + 2, y0: fr.top - 6, x1: fr.right + 10, y1: fr.bottom - 2 };
	const avoid: Box[] = [pointBox(o[0], o[1], 8), pointBox(t1[0], t1[1], 12), pointBox(t2[0], t2[1], 12), pointBox(pS[0], pS[1], 9), ...segmentBoxes(o, t1, 3), ...segmentBoxes(o, t2, 3)];
	if (!exit) avoid.push(pointBox(mpS[0], mpS[1], 11));
	// 座標軸的名字 x、y
	avoid.push({ x0: fr.right - 14, y0: o[1] - 18, x1: fr.right - 2, y1: o[1] - 2 }, { x0: o[0] + 7, y0: fr.top + 2, x1: o[0] + 19, y1: fr.top + 18 });
	const MP_TEXT = 'M·(3, 2)';
	const P_TEXT = '(3, 2)';
	// 圖外的落點：在邊界畫一個指向它的三角形，旁邊寫上落點的座標
	let edgeEl = null;
	if (exit) {
		const e = scr(exit);
		const len = Math.hypot(e[0] - o[0], e[1] - o[1]);
		const u: Vec = [(e[0] - o[0]) / len, (e[1] - o[1]) / len];
		const back: Vec = [e[0] - u[0] * 12, e[1] - u[1] * 12];
		const text = fmtVec(apply(m, DEMO_P)); // 動畫中也寫終點的座標（和下面的算式一致）
		const at: Vec = [back[0] - u[0] * 4, back[1] - u[1] * 4];
		const lab = placeLabel([...around(at[0], at[1], 14), ...around(at[0], at[1], 30)], textWidth(text, 13) + 4, 18, avoid, bounds);
		avoid.push(lab.box);
		edgeEl = (
			<g>
				<path className={styles.edgeMarker} d={polygonPath([e, [back[0] - u[1] * 7, back[1] + u[0] * 7], [back[0] + u[1] * 7, back[1] - u[0] * 7]])} />
				<text className={`${styles.pointMappedText} ${styles.svgMono} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central">
					{text}
				</text>
			</g>
		);
	}

	const tipSpots = (tip: Vec, fallback: Vec): Spot[] => {
		const len = Math.hypot(tip[0] - o[0], tip[1] - o[1]);
		if (len < 1) return [{ x: o[0] + fallback[0], y: o[1] + fallback[1], anchor: 'middle' }, ...around(o[0], o[1], 26)];
		const u: Vec = [(tip[0] - o[0]) / len, (tip[1] - o[1]) / len];
		return [{ x: tip[0] + u[0] * 26, y: tip[1] + u[1] * 26, anchor: 'middle' }, ...around(tip[0], tip[1], 20)];
	};
	const NAME_W = textWidth('M e₁', 16) + 6;
	const l1 = placeLabel(tipSpots(t1, [20, 20]), NAME_W, 20, avoid, bounds);
	avoid.push(l1.box);
	const l2 = placeLabel(tipSpots(t2, [-28, -18]), NAME_W, 20, avoid, bounds);
	avoid.push(l2.box);

	// (3, 2) 和它的落點靠得近時（例如剪切、縮放），兩個名字各自放在背對另一個點的那一側，
	// 並且離另一個點遠一點，才不會看起來像是在標另一個點
	const MP_W = textWidth(MP_TEXT, 13) + 4;
	const P_W = textWidth(P_TEXT, 14) + 4;
	const mpOther = samePlace ? null : pS;
	const pOther = exit ? null : mpS;
	const mpLabel = exit
		? null
		: placeLabel(
				[...awayFrom(aroundWide(mpS[0], mpS[1], 20), mpS, mpOther, MP_W), ...awayFrom(aroundWide(mpS[0], mpS[1], 32), mpS, mpOther, MP_W)],
				MP_W,
				18,
				mpOther ? [...avoid, pointBox(mpOther[0], mpOther[1], 16)] : avoid,
				bounds,
			);
	if (mpLabel) avoid.push(mpLabel.box);
	const pLabel = samePlace
		? null
		: placeLabel(
				[...awayFrom(aroundWide(pS[0], pS[1], 18), pS, pOther, P_W), ...awayFrom(aroundWide(pS[0], pS[1], 30), pS, pOther, P_W)],
				P_W,
				18,
				pOther ? [...avoid, pointBox(pOther[0], pOther[1], 16)] : avoid,
				bounds,
			);
	if (pLabel) avoid.push(pLabel.box);

	// ----- 文字（一律用目前的矩陣 m） -----
	const preset = MAP_PRESETS.find((p) => matEq(p.m, m));
	const mpNow = apply(m, DEMO_P);
	const part1 = scale(DEMO_P[0], c1);
	const part2 = scale(DEMO_P[1], c2);
	const outNow = exitPoint(mpNow, MAP_HALF - 0.2) !== null;
	let flatText = '';
	if (isZeroMat(m)) flatText = '整個平面被壓成原點一個點，無法復原。';
	else if (matEq(m, PROJECT)) flatText = '整個平面被壓扁到一條線上，無法復原：例如 (3, 2) 和 (3, −5) 都被送到 (3, 0)。';
	else if (isFlat(m)) flatText = '整個平面被壓扁到一條線上，無法復原：兩欄在同一條直線上，很多不同的點會被送到同一個點。';
	const matText = `第 1 列 ${fmtNum(m[0][0])}、${fmtNum(m[0][1])}，第 2 列 ${fmtNum(m[1][0])}、${fmtNum(m[1][1])}`;
	const summary = `矩陣 M：${matText}。M e₁ = ${fmtVec(c1)}，M e₂ = ${fmtVec(c2)}，M·(3, 2) = ${fmtVec(mpNow)}。${flatText}`;
	const p0 = fmtNum(DEMO_P[0]);
	const p1 = fmtNum(DEMO_P[1]);
	const descs = [...MAP_PRESETS.map((p) => ({ key: p.key, text: `${p.name}：${p.desc}` })), { key: 'custom', text: CUSTOM_DESC }];
	const descKey = preset?.key ?? 'custom';

	return (
		<section className={`not-content ${styles.demo}`} aria-label="矩陣與線性變換互動示範">
			<div className={styles.group}>
				<p className={styles.title} id={`${uid}-presets`}>
					選一個矩陣，或直接拖動兩個落點
				</p>
				<div className={styles.chips} role="group" aria-labelledby={`${uid}-presets`}>
					{MAP_PRESETS.map((p) => (
						<button key={p.key} type="button" className={styles.chip} aria-pressed={preset?.key === p.key} onClick={() => animateTo(p.m)}>
							{p.label}
						</button>
					))}
				</div>
				{/* 所有說明疊在同一格，高度固定，換說明時下面的圖不會跳動 */}
				<div className={`${styles.stackText} ${styles.small} ${styles.muted}`}>
					{descs.map((d) => (
						<p key={d.key} className={d.key === descKey ? '' : styles.stackHidden}>
							{d.text}
						</p>
					))}
				</div>
			</div>

			<div className={styles.stack}>
				<div className={styles.plotCenter} ref={wrapRef}>
					<svg
						className={`${styles.plot} ${dragging ? styles.grabbing : hover ? styles.grab : ''}`}
						viewBox={`0 0 ${width} ${fr.height}`}
						role="img"
						aria-label={`座標平面：淡灰色是原本的格線，藍色是經過 M 變換後的格線，黃色是單位正方形變成的形狀。藍色箭頭 M e₁ = ${fmtVec(c1)}，紫色箭頭 M e₂ = ${fmtVec(c2)}，示範點 (3, 2) 被送到 ${fmtVec(mpNow)}${outNow ? '（在圖外）' : ''}。`}
						aria-describedby={hintId}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						onLostPointerCapture={endDrag}
						onPointerLeave={() => setHover(null)}
					>
						<defs>
							<clipPath id={clipId}>
								<rect x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
							</clipPath>
						</defs>

						{/* 原本的格線與刻度（刻度數字放在圖的左邊和下面） */}
						{Array.from({ length: 2 * GRID_N + 1 }, (_, i) => i - GRID_N).map((g) => (
							<g key={g}>
								<line className={styles.gridOrig} x1={sx(g)} y1={fr.top} x2={sx(g)} y2={fr.bottom} />
								<line className={styles.gridOrig} x1={fr.left} y1={sy(g)} x2={fr.right} y2={sy(g)} />
							</g>
						))}
						{TICKS.map((t) => (
							<g key={t}>
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

						<g clipPath={`url(#${clipId})`}>
							{/* 變換後的格線 */}
							{grid.map((l, i) => {
								const [x1, y1] = scr(l.from);
								const [x2, y2] = scr(l.to);
								return <line key={i} className={l.axis ? styles.gridMappedAxis : styles.gridMapped} x1={x1} y1={y1} x2={x2} y2={y2} />;
							})}
							{/* 原本的單位正方形（虛線）和它變成的平行四邊形 */}
							<path className={styles.unitSquare} d={polygonPath([o, scr([1, 0]), scr([1, 1]), scr([0, 1])])} />
							<path className={styles.area} d={area} />
							{/* 欄觀點：先走 3 × 第 1 欄，再走 2 × 第 2 欄 */}
							<path className={styles.pathA} d={`M${o[0]} ${o[1]} L${sx(step1[0])} ${sy(step1[1])}`} />
							<path className={styles.pathB} d={`M${sx(step1[0])} ${sy(step1[1])} L${mpS[0]} ${mpS[1]}`} />
						</g>

						<text className={`${styles.axisName} ${styles.halo}`} x={fr.right - 4} y={o[1] - 9} textAnchor="end">
							x
						</text>
						<text className={`${styles.axisName} ${styles.halo}`} x={o[0] + 9} y={fr.top + 12} textAnchor="start">
							y
						</text>

						{/* 示範點 (3, 2) 和它的落點 */}
						{pLabel ? (
							<g>
								<circle className={styles.pointOrig} cx={pS[0]} cy={pS[1]} r={5} />
								<text className={`${styles.pointOrigText} ${styles.halo}`} x={pLabel.spot.x} y={pLabel.spot.y} textAnchor={pLabel.spot.anchor} dominantBaseline="central">
									{P_TEXT}
								</text>
							</g>
						) : null}
						{mpLabel ? (
							<g>
								<circle className={styles.pointMapped} cx={mpS[0]} cy={mpS[1]} r={7} />
								<text className={`${styles.pointMappedText} ${styles.svgMono} ${styles.halo}`} x={mpLabel.spot.x} y={mpLabel.spot.y} textAnchor={mpLabel.spot.anchor} dominantBaseline="central">
									{MP_TEXT}
								</text>
							</g>
						) : (
							edgeEl
						)}

						{/* 兩個落點：M e₁（第 1 欄）、M e₂（第 2 欄）；淡色圓圈標出可以抓的範圍 */}
						<circle className={styles.handleA} cx={t1[0]} cy={t1[1]} r={11} />
						<circle className={styles.handleB} cx={t2[0]} cy={t2[1]} r={11} />
						{ring ? <circle className={styles.tipRing} cx={ring === 'c1' ? t1[0] : t2[0]} cy={ring === 'c1' ? t1[1] : t2[1]} r={16} /> : null}
						{arr1 ? (
							<g>
								<line className={styles.shaftA} x1={o[0]} y1={o[1]} x2={arr1.shaftEnd[0]} y2={arr1.shaftEnd[1]} />
								<path className={styles.headA} d={arr1.head} />
							</g>
						) : (
							<circle className={styles.tipA} cx={o[0]} cy={o[1]} r={5} />
						)}
						{arr2 ? (
							<g>
								<line className={styles.shaftB} x1={o[0]} y1={o[1]} x2={arr2.shaftEnd[0]} y2={arr2.shaftEnd[1]} />
								<path className={styles.headB} d={arr2.head} />
							</g>
						) : (
							<circle className={styles.tipB} cx={o[0]} cy={o[1]} r={5} />
						)}
						<text className={`${styles.labelA} ${styles.halo}`} x={l1.spot.x} y={l1.spot.y} textAnchor={l1.spot.anchor} dominantBaseline="central">
							M e₁
						</text>
						<text className={`${styles.labelB} ${styles.halo}`} x={l2.spot.x} y={l2.spot.y} textAnchor={l2.spot.anchor} dominantBaseline="central">
							M e₂
						</text>
					</svg>
					<div className={styles.legend} aria-hidden="true">
						<span className={styles.legendItem}>
							<span className={styles.legendGrid} />
							原本的格線
						</span>
						<span className={styles.legendItem}>
							<span className={styles.legendMapped} />
							變換後的格線
						</span>
						<span className={styles.legendItem}>
							<span className={styles.legendArea} />
							單位正方形變成的形狀
						</span>
						<span className={styles.legendItem}>
							<span className={styles.legendPoint} />
							(3, 2) 的落點
						</span>
					</div>
					<p className={styles.hint} id={hintId}>
						拖動藍色、紫色箭頭的尖端（會吸附到 0.5 的格點），或改矩陣裡的數字；方向鍵一次加減 0.5。
					</p>
				</div>

				<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
					{summary}
				</p>

				<div className={styles.readoutCols}>
					<div className={styles.group}>
						<div className={styles.matrixRow}>
							<span className={styles.matrixName} aria-hidden="true">
								M =
							</span>
							<div className={styles.matrix} role="group" aria-label="矩陣 M 的四個數字">
								{([0, 1] as const).map((i) =>
									([0, 1] as const).map((j) => (
										<NumField
											key={`${i}${j}`}
											value={m[i][j]}
											onValue={(v) => setEntry(i, j, v)}
											label={`第 ${i + 1} 列第 ${j + 1} 欄（${j === 0 ? '(1, 0)' : '(0, 1)'} 的落點的 ${i === 0 ? 'x' : 'y'}）`}
											className={j === 0 ? styles.numA : styles.numB}
										/>
									)),
								)}
							</div>
						</div>
						<div className={styles.colLegend}>
							<p className={styles.colLegendItem}>
								<span className={styles.swatchA} aria-hidden="true" />
								<span>
									<span className={styles.textA}>第 1 欄</span>＝(1, 0) 的落點：<span className={`${styles.mono} ${styles.nowrap}`}>M e₁ = {fmtVec(c1)}</span>
								</span>
							</p>
							<p className={styles.colLegendItem}>
								<span className={styles.swatchB} aria-hidden="true" />
								<span>
									<span className={styles.textB}>第 2 欄</span>＝(0, 1) 的落點：<span className={`${styles.mono} ${styles.nowrap}`}>M e₂ = {fmtVec(c2)}</span>
								</span>
							</p>
						</div>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>欄觀點：(3, 2) 被送到兩欄的加權和</p>
						<div className={styles.derivGrid}>
							<span>M·(3, 2)</span>
							<span className={styles.rhs}>
								<span>
									= <span className={styles.textA}>{p0} × 第 1 欄</span>
								</span>
								<span>
									+ <span className={styles.textB}>{p1} × 第 2 欄</span>
								</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>
									= {p0} × <span className={styles.textA}>{fmtVec(c1)}</span>
								</span>
								<span>
									+ {p1} × <span className={styles.textB}>{fmtVec(c2)}</span>
								</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>= {fmtVec(part1)}</span>
								<span>+ {fmtVec(part2)}</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>
									= <span className={`${styles.result} ${styles.big}`}>{fmtVec(mpNow)}</span>
								</span>
							</span>
						</div>
					</div>
				</div>

				{flatText ? <p className={styles.bad}>{flatText}</p> : null}
				{outNow ? (
					<p className={`${styles.small} ${styles.muted}`}>
						<span className={styles.mono}>M·(3, 2)</span> 落在圖的範圍外，圖邊上的三角形指出它的方向。
					</p>
				) : null}
				<p className={styles.ok}>知道 (1, 0) 和 (0, 1) 被送到哪裡，就知道每個點去哪裡：(x, y) 會被送到 x × 第 1 欄 + y × 第 2 欄。</p>
			</div>
		</section>
	);
}
