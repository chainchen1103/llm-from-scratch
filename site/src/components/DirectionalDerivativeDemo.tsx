import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './Ep04Grad.module.css';
import {
	angDiff,
	anglePath,
	ARROW_SCALE,
	arrowShape,
	contourPoints,
	DIR_HALF,
	DIR_PRESETS,
	dirInfo,
	fmt4,
	fmt6,
	fmtDeg,
	fmtFixed,
	fmtNum,
	H,
	KEY_STEP,
	LEVELS,
	norm360,
	PAGE_STEP,
	placeLabel,
	pointBox,
	polylinePath,
	RAD2DEG,
	segmentBoxes,
	snapAngleLinear,
	specialAngles,
	stepAngle,
	textWidth,
	U_START,
	viewFrame,
	waveFrame,
	wavePoints,
	type Box,
	type DirKind,
	type Spot,
	type Vec,
} from './ep04-grad.ts';

/**
 * 方向導數：站在碗 f(x, y) = x² + 3y² 上的點 P，轉動單位向量 u（拖動 u 的尖端、滑桿或下面的波浪圖），
 * 看三種算法得到同一個數：內積 ∇f · u、‖∇f‖ cos θ、數值（中央差分）(f(P + h u) − f(P − h u)) / (2h)。
 * 下面的波浪圖是方向導數對 u 的角度：最高點在梯度方向，最低點在反方向，和梯度垂直時是 0。
 *
 * 座標圖以 P 為中心放大（兩軸同比例）；梯度箭頭縮成 1/10，u 的長度是 1（沒有縮）。
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_WIDTH = 400;
const DEFAULT_WAVE_W = 600;

/** ‖v‖：兩條直線用 CSS 的雙線邊框畫，不受字型影響 */
const Norm = ({ v }: { v: string }) => <span className={styles.norm}>{v}</span>;

/** 乘法裡的負數加括號（小數點後 4 位）：−0.7071 → "(−0.7071)" */
const factor4 = (v: number) => {
	const s = fmt4(v);
	return s.startsWith('−') ? `(${s})` : s;
};

const STATUS: Record<DirKind, { cls: 'ok' | 'note' | 'bad' | 'plain'; word: string }> = {
	up: { cls: 'ok', word: '和梯度同方向' },
	down: { cls: 'bad', word: '和梯度反方向' },
	perp: { cls: 'note', word: '和梯度垂直' },
	other: { cls: 'plain', word: '' },
};

export default function DirectionalDerivativeDemo() {
	const [pi, setPi] = useState(0);
	const [deg, setDeg] = useState(U_START);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [waveW, setWaveW] = useState(DEFAULT_WAVE_W);
	const [dragging, setDragging] = useState<'plot' | 'wave' | null>(null);
	const [hover, setHover] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const waveRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<number | null>(null);
	const uid = useId();
	const clipId = `dir-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const sliderId = `${uid}-slider`;
	const hintId = `${uid}-hint`;

	// 量兩張圖的實際寬度
	useEffect(() => {
		const pairs: [HTMLDivElement | null, (w: number) => void][] = [
			[wrapRef.current, setWidth],
			[waveRef.current, setWaveW],
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

	const p = DIR_PRESETS[pi].p;
	const d = dirInfo(p, deg);
	const sp = specialAngles(d.phi);
	const g = d.g;

	// 換點時，如果 u 正對著梯度、垂直或反方向，換過去之後也維持一樣的關係
	const pickP = (i: number) => {
		if (i === pi) return;
		const kind = d.kind;
		const wasPerpB = kind === 'perp' && angDiff(deg, sp.perpB) < 1e-9;
		const next = specialAngles(dirInfo(DIR_PRESETS[i].p, 0).phi);
		setPi(i);
		if (kind === 'up') setDeg(next.up);
		else if (kind === 'down') setDeg(next.down);
		else if (kind === 'perp') setDeg(wasPerpB ? next.perpB : next.perpA);
	};
	const togglePerp = () => setDeg(d.kind === 'perp' && angDiff(deg, sp.perpA) < 1e-9 ? sp.perpB : sp.perpA);

	// ----- 滑桿的鍵盤：方向鍵 5°、Page Up／Page Down 15°、Home／End 到 0°／360° -----
	const onSliderKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		let next: number | null = null;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = stepAngle(deg, 1, KEY_STEP);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = stepAngle(deg, -1, KEY_STEP);
		else if (e.key === 'PageUp') next = stepAngle(deg, 1, PAGE_STEP);
		else if (e.key === 'PageDown') next = stepAngle(deg, -1, PAGE_STEP);
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = 360;
		if (next === null) return;
		e.preventDefault();
		setDeg(next);
	};

	// ----- 座標圖（以 P 為中心） -----
	const fr = viewFrame(width, p[0], p[1], DIR_HALF);
	const { sx, sy } = fr;
	const toScreen = ([x, y]: Vec): Vec => [sx(x), sy(y)];
	const P: Vec = [sx(p[0]), sy(p[1])];

	const gridX: number[] = [];
	for (let t = Math.ceil(fr.x0 * 2) / 2; t <= fr.x1 + 1e-9; t += 0.5) gridX.push(t);
	const gridY: number[] = [];
	for (let t = Math.ceil(fr.y0 * 2) / 2; t <= fr.y1 + 1e-9; t += 0.5) gridY.push(t);

	const contours = useMemo(() => LEVELS.map((c) => ({ c, d: polylinePath(contourPoints(c, 288).map(toScreen)) })), [width, pi]);
	const f0 = p[0] * p[0] + 3 * (p[1] * p[1]);
	const levelPath = useMemo(() => polylinePath(contourPoints(f0, 288).map(toScreen)), [width, pi]);

	const gTip = toScreen([p[0] + g[0] / ARROW_SCALE, p[1] + g[1] / ARROW_SCALE]);
	const uTip = toScreen([p[0] + d.u[0], p[1] + d.u[1]]);
	const gArrow = arrowShape(P[0], P[1], gTip[0], gTip[1], 12, 10);
	const uArrow = arrowShape(P[0], P[1], uTip[0], uTip[1], 16, 16);
	const unitOf = (t: Vec): Vec => {
		const l = Math.hypot(t[0] - P[0], t[1] - P[1]);
		return l > 0 ? [(t[0] - P[0]) / l, (t[1] - P[1]) / l] : [0, 0];
	};
	const ugs = unitOf(gTip); // 畫面座標的方向
	const uus = unitOf(uTip);
	const gLen = Math.hypot(gTip[0] - P[0], gTip[1] - P[1]);

	// 拖動：點圖上任一點，u 就指向那裡
	const toLocal = (e: ReactPointerEvent<SVGSVGElement>, w: number): Vec => {
		const r = e.currentTarget.getBoundingClientRect();
		const k = w / r.width;
		return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
	};
	const plotAngle = (px: number, py: number): number | null => {
		if (Math.hypot(px - P[0], py - P[1]) < 8) return null;
		const raw = norm360(Math.atan2(P[1] - py, px - P[0]) * RAD2DEG);
		return snapAngleLinear(raw, d.phi);
	};
	const nearTip = (px: number, py: number) => Math.hypot(px - uTip[0], py - uTip[1]) <= 22;
	const startDrag = (e: ReactPointerEvent<SVGSVGElement>, which: 'plot' | 'wave') => {
		if (e.pointerType === 'mouse' && e.button !== 0) return false;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = e.pointerId;
		setDragging(which);
		return true;
	};
	const onPlotDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e, width);
		const a = plotAngle(px, py);
		if (a === null) return;
		if (startDrag(e, 'plot')) setDeg(a);
	};
	const onPlotMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e, width);
		if (dragRef.current !== e.pointerId) {
			if (e.pointerType === 'mouse') setHover(nearTip(px, py));
			return;
		}
		const a = plotAngle(px, py);
		if (a !== null) setDeg(a);
	};
	const endDrag = () => {
		dragRef.current = null;
		setDragging(null);
	};

	// ----- 標籤 -----
	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 1, x1: fr.right - 1, y1: fr.bottom - 1 };
	const avoid: Box[] = [pointBox(P[0], P[1], 9), pointBox(uTip[0], uTip[1], 10), pointBox(gTip[0], gTip[1], 10)];
	if (gArrow) avoid.push(...segmentBoxes(P, gTip, 4));
	if (uArrow) avoid.push(...segmentBoxes(P, uTip, 4));

	// θ 的圓弧（同方向時沒有；垂直時畫直角記號）
	let thetaEl = null;
	let thetaBox: Box | null = null;
	const arcR = Math.min(30, 0.55 * Math.min(gLen, fr.unit));
	if (d.kind === 'perp') {
		const s = 10;
		thetaEl = <path className={styles.rightAngle} d={`M${P[0] + ugs[0] * s} ${P[1] + ugs[1] * s} L${P[0] + ugs[0] * s + uus[0] * s} ${P[1] + ugs[1] * s + uus[1] * s} L${P[0] + uus[0] * s} ${P[1] + uus[1] * s}`} />;
	} else if (d.kind !== 'up' && d.theta > 4 && arcR >= 10) {
		const arc = anglePath(g, d.u, P[0], P[1], arcR);
		const tx = P[0] + arc.mid[0] * (arcR + 11);
		const ty = P[1] + arc.mid[1] * (arcR + 11);
		thetaBox = pointBox(tx, ty, 8);
		thetaEl = (
			<g>
				<path className={styles.arc} d={arc.d} />
				<text className={`${styles.arcText} ${styles.halo}`} x={tx} y={ty} textAnchor="middle" dominantBaseline="central">
					θ
				</text>
			</g>
		);
	}
	if (thetaBox) avoid.push(thetaBox);

	/** 箭頭名字的候選位置：尖端前方，再試兩側（先試遠離另一支箭頭的那一側） */
	const tipSpots = (tip: Vec, u: Vec, other: Vec): Spot[] => {
		const n: Vec = [-u[1], u[0]];
		const s = Math.sign(n[0] * other[0] + n[1] * other[1]) || 1;
		const anchorFor = (dx: number): Spot['anchor'] => (dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle');
		const out = (k: number, m: number): Spot => {
			const dx = u[0] * k + n[0] * m;
			const dy = u[1] * k + n[1] * m;
			const len = Math.hypot(dx, dy) || 1;
			return { x: tip[0] + dx, y: tip[1] + dy, anchor: anchorFor(dx / len) };
		};
		return [out(15, 0), out(6, -s * 16), out(6, s * 16), out(-12, -s * 16), out(-12, s * 16)];
	};
	const gText = `∇f = (${fmtNum(g[0])}, ${fmtNum(g[1])})`;
	const gW = textWidth(gText, 14) + 6;
	const gLabel = placeLabel(tipSpots(gTip, ugs, uus), gW, 20, avoid, bounds);
	avoid.push(gLabel.box);
	const uW = textWidth('u', 16) + 6;
	const uLabel = placeLabel(tipSpots(uTip, uus, ugs), uW, 20, avoid, bounds);
	avoid.push(uLabel.box);
	const pW = textWidth('P', 16) + 4;
	const pLabel = placeLabel(
		[
			{ x: P[0] - uus[0] * 16 - ugs[0] * 8, y: P[1] - uus[1] * 16 - ugs[1] * 8, anchor: 'middle' },
			{ x: P[0] - 13, y: P[1] + 14, anchor: 'end' },
			{ x: P[0] + 13, y: P[1] + 14, anchor: 'start' },
			{ x: P[0] - 13, y: P[1] - 12, anchor: 'end' },
			{ x: P[0] + 13, y: P[1] - 12, anchor: 'start' },
		],
		pW,
		20,
		avoid,
		bounds,
	);
	avoid.push(pLabel.box);
	// 經過 P 的等高線的高度：放在這條線旁邊、離 P 有一段距離的地方（沿著法線移開一點，字才不會壓在線上）
	const levelText = `f = ${fmtNum(f0)}`;
	const levelCands: Spot[] = contourPoints(f0, 72)
		.filter(([x, y]) => x > fr.x0 + 0.2 && x < fr.x1 - 0.2 && y > fr.y0 + 0.2 && y < fr.y1 - 0.2)
		.map((q): [Vec, number] => [q, Math.hypot(q[0] - p[0], q[1] - p[1])])
		.filter(([, dist]) => dist > 0.8)
		.sort((a, b) => Math.abs(a[1] - 1.3) - Math.abs(b[1] - 1.3))
		.flatMap(([q]) => {
			const l = Math.hypot(2 * q[0], 6 * q[1]) || 1;
			const n: Vec = [(2 * q[0]) / l, (-6 * q[1]) / l]; // 法線（畫面座標，往碗外）
			return [12, -12].map((k): Spot => ({ x: sx(q[0]) + n[0] * k, y: sy(q[1]) + n[1] * k, anchor: Math.abs(n[0]) > 0.6 ? (n[0] * k > 0 ? 'start' : 'end') : 'middle' }));
		});
	const levelLabel = levelCands.length ? placeLabel(levelCands, textWidth(levelText, 14) + 6, 18, avoid, bounds) : null;

	// ----- 波浪圖 -----
	const amp = d.gNorm;
	const plotH = Math.round(Math.min(160, Math.max(110, waveW * 0.26)));
	const wf = waveFrame(waveW, amp * 1.08, plotH);
	const wavePts = useMemo(() => wavePoints(g).map(([a, v]) => [wf.sx(a), wf.sy(v)] as Vec), [waveW, pi, plotH]);
	const wavePath = polylinePath(wavePts);
	const now: Vec = [wf.sx(deg), wf.sy(d.dd)];
	const peak: Vec = [wf.sx(sp.up), wf.sy(amp)];
	const trough: Vec = [wf.sx(sp.down), wf.sy(-amp)];
	const zeros: { at: Vec; slope: number }[] = [sp.perpA, sp.perpB].map((a) => ({ at: [wf.sx(a), wf.sy(0)], slope: angDiff(a, sp.perpA) < 1e-9 ? -1 : 1 }));
	const tickY = wf.bottom + 33;
	const waveBounds: Box = { x0: 2, y0: 1, x1: waveW - 2, y1: wf.height - 1 };
	const wAvoid: Box[] = [
		pointBox(now[0], now[1], 9),
		pointBox(peak[0], peak[1], 7),
		pointBox(trough[0], trough[1], 7),
		...zeros.map(({ at }) => pointBox(at[0], at[1], 7)),
		// 曲線本身、左邊的刻度數字、下面的刻度數字
		...wavePts.filter((_, i) => i % 3 === 0).map(([x, y]) => pointBox(x, y, 3)),
		...[amp, 0, -amp].map((v) => ({ x0: 0, y0: wf.sy(v) - 8, x1: wf.left - 2, y1: wf.sy(v) + 8 })),
		...[0, 90, 180, 270, 360].map((a) => ({ x0: wf.sx(a) - 17, y0: tickY - 13, x1: wf.sx(a) + 17, y1: tickY + 3 })),
		// 梯度方向的虛線、現在的 u 的虛線
		...[peak[0], now[0]].map((x) => ({ x0: x - 2, y0: wf.top, x1: x + 2, y1: wf.bottom })),
	];
	const anchorX = (x: number, w: number): Spot['anchor'] => (x - w / 2 < wf.left ? 'start' : x + w / 2 > wf.right ? 'end' : 'middle');
	const centered = (x: number, y: number, w: number): Spot => {
		const a = anchorX(x, w);
		return { x: a === 'start' ? Math.max(x - 10, wf.left - 4) : a === 'end' ? Math.min(x + 10, wf.right + 4) : x, y, anchor: a };
	};
	const maxText = `最大 ${fmtFixed(amp, 2)}（梯度方向 ${fmtDeg(sp.up)}°）`;
	const maxW = textWidth(maxText, 13) + 4;
	const maxLabel = placeLabel([centered(peak[0], peak[1] - 15, maxW)], maxW, 16, wAvoid, waveBounds);
	wAvoid.push(maxLabel.box);
	const minText = `最小 ${fmtFixed(-amp, 2)}（反方向）`;
	const minW = textWidth(minText, 13) + 4;
	const minLabel = placeLabel([centered(trough[0], trough[1] + 15, minW)], minW, 16, wAvoid, waveBounds);
	wAvoid.push(minLabel.box);
	const zeroText = '垂直：0';
	const zeroW = textWidth(zeroText, 13) + 4;
	const zeroLabels = zeros.map(({ at: [x, y], slope }, i) => {
		// 曲線往下走（slope < 0）時右上和左下是空的；往上走時左上和右下是空的
		const s = slope < 0 ? 1 : -1;
		const cands: Spot[] = [
			{ x: x + 7 * s, y: y - 12, anchor: s > 0 ? 'start' : 'end' },
			{ x: x - 7 * s, y: y + 12, anchor: s > 0 ? 'end' : 'start' },
			{ x: x - 7 * s, y: y - 12, anchor: s > 0 ? 'end' : 'start' },
			{ x: x + 7 * s, y: y + 12, anchor: s > 0 ? 'start' : 'end' },
		];
		// 先試背對另一個 0 的那一側：兩個「垂直：0」才不會擠在兩點中間，看不出各自屬於哪一點
		const otherX = zeros[1 - i].at[0];
		const away = (c: Spot) => (c.x - x) * (otherX - x) < 0;
		const lab = placeLabel(
			[...cands.filter(away), ...cands.filter((c) => !away(c))],
			zeroW,
			16,
			wAvoid,
			waveBounds,
		);
		wAvoid.push(lab.box);
		return lab;
	});
	const nowText = fmt4(d.dd);
	const nowW = textWidth(nowText, 13) + 4;
	const nowLabel = placeLabel(
		[
			{ x: now[0] + 10, y: now[1] - 13, anchor: 'start' },
			{ x: now[0] - 10, y: now[1] - 13, anchor: 'end' },
			{ x: now[0] + 10, y: now[1] + 14, anchor: 'start' },
			{ x: now[0] - 10, y: now[1] + 14, anchor: 'end' },
			{ x: now[0] + 12, y: now[1], anchor: 'start' },
			{ x: now[0] - 12, y: now[1], anchor: 'end' },
		],
		nowW,
		16,
		wAvoid,
		waveBounds,
	);

	const onWaveDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (startDrag(e, 'wave')) setDeg(snapAngleLinear(wf.degAt(toLocal(e, waveW)[0]), d.phi));
	};
	const onWaveMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragRef.current !== e.pointerId) return;
		setDeg(snapAngleLinear(wf.degAt(toLocal(e, waveW)[0]), d.phi));
	};

	// ----- 文字 -----
	const degText = fmtDeg(deg);
	const thetaText = fmtDeg(d.theta);
	const ddText = fmt4(d.dd);
	const viaText = fmt4(d.viaCos);
	const numText = fmt6(d.numeric);
	const diffText = fmt6(Math.abs(d.numeric - d.dd));
	const gNormText = fmt4(d.gNorm);
	const gv = `(${fmtNum(g[0])}, ${fmtNum(g[1])})`;
	const uv = `(${fmt4(d.u[0])}, ${fmt4(d.u[1])})`;
	const st = STATUS[d.kind];
	const sign = d.dd > 0 ? '正的' : '負的';
	let statusText = '';
	if (d.kind === 'up') statusText = `θ = 0°，cos θ = 1：方向導數最大，就是梯度的長度 ${gNormText}。往這個方向走，上升最快。`;
	else if (d.kind === 'down') statusText = `θ = 180°，cos θ = −1：方向導數最小，−${gNormText}。往這個方向走，下降最快。`;
	else if (d.kind === 'perp') statusText = 'θ = 90°，cos θ = 0：方向導數是 0。u 貼著經過 P 的等高線（和它相切），往這裡走一小步，高度暫時不變。';
	else statusText = `θ ${d.theta < 90 ? '小於' : '大於'} 90°，cos θ 是${sign}：往 u 走是${d.dd > 0 ? '上坡' : '下坡'}，方向導數是${sign}。`;

	const bg = (b: Box) => <rect className={styles.labelBg} x={b.x0} y={b.y0 + 1} width={b.x1 - b.x0} height={b.y1 - b.y0 - 2} rx={3} />;
	const summary = `u 和 x 軸夾 ${degText} 度，和梯度的夾角 θ = ${thetaText} 度。方向導數 ∇f · u = ${ddText}，‖∇f‖ cos θ = ${viaText}，數值算出 ${numText}。`;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="方向導數互動示範">
			<div className={styles.group}>
				<p className={styles.title} id={`${uid}-presets`}>
					站在哪一點 P
				</p>
				<div className={styles.chips} role="group" aria-labelledby={`${uid}-presets`}>
					{DIR_PRESETS.map((pr, i) => (
						<button key={pr.label} type="button" className={styles.chip} aria-pressed={i === pi} aria-label={`P = ${pr.label}`} onClick={() => pickP(i)}>
							P = {pr.label}
						</button>
					))}
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={sliderId}>
						<span className={styles.textU}>u</span> 的方向：和 x 軸夾 <span className={styles.value}>{degText}°</span>
					</label>
				</div>
				<input
					id={sliderId}
					className={styles.slider}
					type="range"
					min={0}
					max={360}
					step="any"
					value={deg}
					aria-valuetext={`${degText} 度，方向導數 ${ddText}`}
					aria-describedby={hintId}
					onChange={(e) => setDeg(snapAngleLinear(Number(e.currentTarget.value), d.phi))}
					onKeyDown={onSliderKey}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>0°</span>
					<span>90°</span>
					<span>180°</span>
					<span>270°</span>
					<span>360°</span>
				</div>
				<div className={styles.chips} role="group" aria-label="把 u 轉到特別的方向">
					<button type="button" className={styles.chip} aria-pressed={d.kind === 'up'} onClick={() => setDeg(sp.up)}>
						對齊梯度
					</button>
					<button type="button" className={styles.chip} aria-pressed={d.kind === 'perp'} onClick={togglePerp}>
						垂直
					</button>
					<button type="button" className={styles.chip} aria-pressed={d.kind === 'down'} onClick={() => setDeg(sp.down)}>
						反方向
					</button>
				</div>
				<p className={styles.hint} id={hintId}>
					拖動滑桿、圖上 u 的尖端或下面的波浪圖都可以轉動 u（靠近梯度、垂直、反方向時會吸過去）；方向鍵一次 {KEY_STEP}°，Page Up／Page Down 一次 {PAGE_STEP}°。再按一次「垂直」換到另一邊的垂直方向。
				</p>
			</div>

			<div className={styles.layout}>
				<div className={styles.plotWrap} ref={wrapRef}>
					<svg
						className={`${styles.plot} ${dragging === 'plot' ? styles.grabbing : hover ? styles.grab : ''}`}
						viewBox={`0 0 ${width} ${fr.height}`}
						role="img"
						aria-label={`P = (${fmtNum(p[0])}, ${fmtNum(p[1])}) 附近放大的等高線圖：紫色線是經過 P 的等高線；珊瑚色箭頭是梯度 ${gv}（長度縮成 1/${ARROW_SCALE}）；藍色箭頭是單位向量 u，和 x 軸夾 ${degText} 度，和梯度的夾角 θ = ${thetaText} 度。`}
						onPointerDown={onPlotDown}
						onPointerMove={onPlotMove}
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

						{/* 格線（每 0.5 一條）與整數刻度 */}
						{gridX.map((t) => (
							<g key={`x${t}`}>
								<line className={t === 0 ? styles.axis : styles.grid} x1={sx(t)} y1={fr.top} x2={sx(t)} y2={fr.bottom} />
								{Number.isInteger(t) ? (
									<text className={styles.tickText} x={sx(t)} y={fr.bottom + 17} textAnchor="middle">
										{fmtNum(t)}
									</text>
								) : null}
							</g>
						))}
						{gridY.map((t) => (
							<g key={`y${t}`}>
								<line className={t === 0 ? styles.axis : styles.grid} x1={fr.left} y1={sy(t)} x2={fr.right} y2={sy(t)} />
								{Number.isInteger(t) ? (
									<text className={styles.tickText} x={fr.left - 6} y={sy(t) + 5} textAnchor="end">
										{fmtNum(t)}
									</text>
								) : null}
							</g>
						))}

						<g clipPath={`url(#${clipId})`}>
							{contours.map((ct) => (
								<path key={ct.c} className={styles.contour} d={ct.d} />
							))}
							<path className={styles.level} d={levelPath} />
						</g>
						{levelLabel ? (
							<g>
								{bg(levelLabel.box)}
								<text className={styles.levelText} x={levelLabel.spot.x} y={levelLabel.spot.y} textAnchor={levelLabel.spot.anchor} dominantBaseline="central">
									{levelText}
								</text>
							</g>
						) : null}

						{/* u 的尖端走的圓：半徑 1 */}
						<circle className={styles.track} cx={P[0]} cy={P[1]} r={fr.unit} />
						{thetaEl}

						{/* u（長度 1）畫在下面、比較粗；梯度（縮成 1/10）畫在上面、比較細：兩支重疊（u 對齊梯度）時都看得到 */}
						<circle className={styles.handleU} cx={uTip[0]} cy={uTip[1]} r={11} />
						{dragging === 'plot' || hover ? <circle className={styles.ring} cx={uTip[0]} cy={uTip[1]} r={16} /> : null}
						{uArrow ? (
							<g>
								<line className={`${styles.uShaft} ${styles.uWide}`} x1={P[0]} y1={P[1]} x2={uArrow.shaftEnd[0]} y2={uArrow.shaftEnd[1]} />
								<path className={styles.uHead} d={uArrow.head} />
							</g>
						) : null}
						{gArrow ? (
							<g>
								<line className={`${styles.gradShaft} ${styles.gradThin}`} x1={P[0]} y1={P[1]} x2={gArrow.shaftEnd[0]} y2={gArrow.shaftEnd[1]} />
								<path className={styles.gradHead} d={gArrow.head} />
							</g>
						) : null}
						<circle className={styles.point} cx={P[0]} cy={P[1]} r={5} />

						{bg(gLabel.box)}
						<text className={styles.gradText} x={gLabel.spot.x} y={gLabel.spot.y} textAnchor={gLabel.spot.anchor} dominantBaseline="central">
							{gText}
						</text>
						<text className={`${styles.uText} ${styles.halo}`} x={uLabel.spot.x} y={uLabel.spot.y} textAnchor={uLabel.spot.anchor} dominantBaseline="central">
							u
						</text>
						<text className={`${styles.pointText} ${styles.halo}`} x={pLabel.spot.x} y={pLabel.spot.y} textAnchor={pLabel.spot.anchor} dominantBaseline="central">
							P
						</text>
					</svg>
					<div className={styles.legend} aria-hidden="true">
						<span className={styles.legendItem}>
							<span className={styles.swGrad} />
							梯度 ∇f（長度縮成 1/{ARROW_SCALE}）
						</span>
						<span className={styles.legendItem}>
							<span className={styles.swU} />
							單位向量 u（長度 1）
						</span>
						<span className={styles.legendItem}>
							<span className={styles.swLevel} />
							經過 P 的等高線
						</span>
					</div>
					<div className={styles.waveWrap}>
						<p className={styles.title}>轉一圈：方向導數是一條 cos 波浪</p>
						<p className={`${styles.small} ${styles.muted}`}>
							橫軸是 u 和 x 軸的夾角，縱軸是方向導數 ∇f · u = <Norm v="∇f" /> cos θ。藍點是現在的 u；也可以在圖上拖動。
						</p>
						<div ref={waveRef}>
							<svg
								className={`${styles.plot} ${dragging === 'wave' ? styles.grabbing : ''}`}
								viewBox={`0 0 ${waveW} ${wf.height}`}
								role="img"
								aria-label={`方向導數對 u 的角度的圖：一條 cos 波浪，最大 ${fmtFixed(amp, 2)} 在梯度方向 ${fmtDeg(sp.up)} 度，最小 ${fmtFixed(-amp, 2)} 在反方向 ${fmtDeg(sp.down)} 度，在 ${fmtDeg(Math.min(sp.perpA, sp.perpB))} 度和 ${fmtDeg(Math.max(sp.perpA, sp.perpB))} 度（和梯度垂直）是 0。現在 u 在 ${degText} 度，方向導數 ${ddText}。`}
								onPointerDown={onWaveDown}
								onPointerMove={onWaveMove}
								onPointerUp={endDrag}
								onPointerCancel={endDrag}
								onLostPointerCapture={endDrag}
							>
								{/* 0°、90°、180°、270°、360° 的格線與刻度 */}
								{[0, 90, 180, 270, 360].map((a) => (
									<g key={a}>
										<line className={styles.grid} x1={wf.sx(a)} y1={wf.top} x2={wf.sx(a)} y2={wf.bottom} />
										<text className={styles.tickText} x={wf.sx(a)} y={tickY} textAnchor="middle">
											{a}°
										</text>
									</g>
								))}
								{[amp, -amp].map((v) => (
									<line key={v} className={styles.grid} x1={wf.left} y1={wf.sy(v)} x2={wf.right} y2={wf.sy(v)} />
								))}
								<line className={styles.waveZero} x1={wf.left} y1={wf.sy(0)} x2={wf.right} y2={wf.sy(0)} />
								{[amp, 0, -amp].map((v) => (
									<text key={v} className={styles.tickText} x={wf.left - 6} y={wf.sy(v) + 5} textAnchor="end">
										{v === 0 ? '0' : fmtFixed(v, 2)}
									</text>
								))}

								{/* 梯度方向與反方向 */}
								<line className={styles.waveGuide} x1={peak[0]} y1={wf.top} x2={peak[0]} y2={wf.bottom} />
								<path className={styles.waveCurve} d={wavePath} />
								<line className={styles.waveNow} x1={now[0]} y1={wf.top} x2={now[0]} y2={wf.bottom} />
								<circle className={styles.waveMax} cx={peak[0]} cy={peak[1]} r={4.5} />
								<circle className={styles.waveMax} cx={trough[0]} cy={trough[1]} r={4.5} />
								{zeros.map(({ at: [x, y] }, i) => (
									<circle key={i} className={styles.wavePerp} cx={x} cy={y} r={4.5} />
								))}
								<circle className={styles.waveDot} cx={now[0]} cy={now[1]} r={6.5} />

								<text className={`${styles.waveLabel} ${styles.waveLabelGrad} ${styles.halo}`} x={maxLabel.spot.x} y={maxLabel.spot.y} textAnchor={maxLabel.spot.anchor} dominantBaseline="central">
									{maxText}
								</text>
								<text className={`${styles.waveLabel} ${styles.waveLabelGrad} ${styles.halo}`} x={minLabel.spot.x} y={minLabel.spot.y} textAnchor={minLabel.spot.anchor} dominantBaseline="central">
									{minText}
								</text>
								{zeroLabels.map((lab, i) => (
									<text key={i} className={`${styles.waveLabel} ${styles.waveLabelLevel} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central">
										{zeroText}
									</text>
								))}
								{/* 在梯度、垂直、反方向上時，旁邊已經有說明，不另外標數字 */}
								{d.kind === 'other' ? (
									<text className={`${styles.waveLabel} ${styles.waveLabelU} ${styles.halo}`} x={nowLabel.spot.x} y={nowLabel.spot.y} textAnchor={nowLabel.spot.anchor} dominantBaseline="central">
										{nowText}
									</text>
								) : null}
							</svg>
						</div>
					</div>
				</div>

				<div className={styles.readout}>
					<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
						{summary}
					</p>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>u 和夾角 θ</p>
						<div className={styles.lines}>
							<span>
								<span>
									<span className={styles.textU}>u</span> = {uv}
								</span>
							</span>
							<span>
								<span>
									θ = <span className={styles.result}>{thetaText}°</span>
								</span>
							</span>
						</div>
						<p className={`${styles.small} ${styles.muted}`}>
							u = (cos {degText}°, sin {degText}°)，長度 1。θ 是 u 和梯度 ∇f = {gv} 的夾角（0° 到 180°）。
						</p>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>算法一：內積 ∇f · u</p>
						<div className={styles.lines}>
							<span>
								<span>
									{fmtNum(g[0])} × {factor4(d.u[0])}
								</span>
							</span>
							<span>
								<span>
									+ {fmtNum(g[1])} × {factor4(d.u[1])}
								</span>
							</span>
							<span>
								<span>
									= <span className={`${styles.result} ${styles.big}`}>{ddText}</span>
								</span>
							</span>
						</div>
						<p className={`${styles.small} ${styles.muted}`}>u 只顯示 4 位小數，計算用的是完整的數。</p>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>
							算法二：<Norm v="∇f" /> cos θ
						</p>
						<div className={styles.lines}>
							<span>
								<span>{gNormText}</span>
								<span>× cos {thetaText}°</span>
							</span>
							<span>
								<span>= {gNormText}</span>
								<span>× {factor4(d.cos)}</span>
							</span>
							<span>
								<span>
									= <span className={`${styles.result} ${styles.big}`}>{viaText}</span>
								</span>
							</span>
						</div>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>數值：中央差分，h = {String(H)}</p>
						<div className={styles.lines}>
							<span>
								<span>(f(P + h u)</span>
								<span>− f(P − h u))</span>
								<span>/ (2h)</span>
							</span>
							<span>
								<span>
									= <span className={`${styles.result} ${styles.big}`}>{numText}</span>
								</span>
							</span>
						</div>
						<p className={`${styles.small} ${styles.muted}`}>沿著 u 往前、往後各走一小步，只拿兩個高度相減、除以 2h，不用偏導數的公式，也得到同一個數（和算法一差 {diffText}）。</p>
					</div>

					<p className={styles[st.cls]}>
						{st.word ? <span className={styles.tagWord}>{st.word}：</span> : null}
						{statusText}
					</p>
				</div>
			</div>

			<p className={styles.ok}>
				往<span className={styles.textGrad}>梯度方向</span>走，上升最快；往反方向走，下降最快（之後的梯度下降就用這個）。和梯度垂直的方向貼著等高線，高度暫時不變。
			</p>
		</section>
	);
}
