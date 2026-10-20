import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import styles from './Ep04Calc.module.css';
import {
	around,
	clampX0,
	clipLine,
	curvePoints,
	dragH,
	fDigits,
	fmtFixed,
	fmtShort,
	fmtTrim,
	FN_ORDER,
	FUNCS,
	H_CHOICES,
	H_MAX,
	placeLabel,
	plotFrame,
	pointBox,
	polylineBoxes,
	secant,
	segmentBoxes,
	snapTo,
	tangentOpacity,
	textWidth,
	toPath,
	X0_STEP,
	type Box,
	type FnKey,
	type Spot,
} from './ep04-calc.ts';

/**
 * 割線變成切線：曲線上固定點 P = (x₀, f(x₀))，另一點 Q = (x₀ + h, f(x₀ + h))，兩點連成割線。
 * h 越來越小，Q 越靠近 P，割線的斜率 (f(x₀ + h) − f(x₀)) / h 越來越靠近導數 f′(x₀)，割線轉成切線。
 * 可以選 h（正負都可以）、直接沿著曲線拖 Q、改 x₀、換函數（x²、x³、eˣ）。
 *
 * 兩軸各自縮放。viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小；
 * 還沒量到寬度之前（伺服器產生的 HTML）用預設大小，整張圖等比例縮放。
 */

const DEFAULT_W = 400;
const PADS = { l: 34, r: 12, t: 12, b: 26 };
const plotHeight = (w: number) => Math.round(Math.min(400, Math.max(270, w * 0.95)));

type Pt = [number, number];

/** 函數的名字：x²、x³、eˣ（上標用 <sup>） */
function FnName({ k, x = 'x' }: { k: FnKey; x?: ReactNode }) {
	if (k === 'square')
		return (
			<>
				{x}
				<sup>2</sup>
			</>
		);
	if (k === 'cube')
		return (
			<>
				{x}
				<sup>3</sup>
			</>
		);
	return (
		<>
			e<sup>{x}</sup>
		</>
	);
}

/** 函數名稱的純文字（給螢幕閱讀器） */
const FN_SPOKEN: Record<FnKey, string> = { square: 'x 平方', cube: 'x 三次方', exp: 'e 的 x 次方' };

/** 乘法、除法裡的負數加括號：−0.1 → (−0.1) */
const paren = (s: string) => (s.startsWith('−') ? `(${s})` : s);

/** 給 <input> 用的寫法：負號用一般的「-」 */
const fmtInput = (v: number) => fmtShort(v).replace('−', '-');

/** 每個函數的說明：割線斜率化簡後是什麼、和導數差多少 */
const FN_NOTES: Record<FnKey, ReactNode> = {
	square: (
		<>
			代數算得出來：<span className={styles.nowrap}>x²</span> 的割線斜率剛好是 <span className={styles.nowrap}>2x₀ + h</span>，所以「差」就是 h。h 越小，割線斜率越靠近導數 <span className={styles.nowrap}>2x₀</span>。
		</>
	),
	cube: (
		<>
			<span className={styles.nowrap}>x³</span> 的割線斜率是 <span className={styles.nowrap}>3x₀² + 3x₀h + h²</span>，比導數 <span className={styles.nowrap}>3x₀²</span> 多了 <span className={styles.nowrap}>3x₀h + h²</span>：h 越小，多出來的越接近 0。
		</>
	),
	exp: (
		<>
			<span className={styles.tagWord}>斜率等於自己的高度：</span>
			<span className={styles.nowrap}>
				f′(x₀) = e<sup>x₀</sup> = f(x₀)
			</span>
			。切線往左走 1 格剛好碰到 x 軸（圖上綠色那 1 格）：上升 ÷ 前進 = 高度 ÷ 1。
		</>
	),
};

export default function SecantTangentDemo() {
	const [fnKey, setFnKey] = useState<FnKey>('square');
	const [x0, setX0] = useState(FUNCS.square.x0Default);
	const [h, setH] = useState(2);
	const [always, setAlways] = useState(false);
	const [hText, setHText] = useState<string | null>(null);
	const [hZero, setHZero] = useState(false);
	const [W, setW] = useState(DEFAULT_W);
	const [hover, setHover] = useState(false);
	const [dragging, setDragging] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const dragId = useRef<number | null>(null);
	const uid = useId();
	const clipId = `sec-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const hintId = `${uid}-hint`;
	const x0Id = `${uid}-x0`;
	const hInputId = `${uid}-h`;

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

	const fn = FUNCS[fnKey];
	const H = plotHeight(W);
	const fr = plotFrame(W, H, fn.view, PADS);
	const { sx, sy } = fr;
	const s = secant(fn, x0, h);
	const sign: 1 | -1 = h > 0 ? 1 : -1;
	const mag = Math.abs(h);
	const tanOp = tangentOpacity(h, always);
	const curvePts = useMemo(() => curvePoints(fn), [fn]);
	const curvePath = useMemo(() => toPath(curvePts, plotFrame(W, H, fn.view, PADS)), [curvePts, fn, W, H]);

	// ----- 改變狀態 -----
	const pickFn = (k: FnKey) => {
		setFnKey(k);
		setX0(FUNCS[k].x0Default);
		setHText(null);
		setHZero(false);
	};
	const pickH = (v: number) => {
		setH(v);
		setHText(null);
		setHZero(false);
	};
	const onHInput = (raw: string) => {
		setHText(raw);
		const v = Number(raw);
		if (raw.trim() === '' || !Number.isFinite(v)) return;
		// 吸附到 0.001；不是 0、但比 0.001 還小的數當成 ±0.001
		let snapped = Math.max(-H_MAX, Math.min(H_MAX, snapTo(v, 0.001)));
		if (snapped === 0 && v !== 0) snapped = v > 0 ? 0.001 : -0.001;
		if (snapped === 0) {
			setHZero(true);
			return;
		}
		setHZero(false);
		setH(snapped);
	};

	// ----- 拖動 Q（Pointer Events：滑鼠、觸控、觸控筆都適用）；點圖上任一處，Q 也會移到那個 x -----
	const toLocal = (e: ReactPointerEvent<SVGSVGElement>): Pt => {
		const r = e.currentTarget.getBoundingClientRect();
		const k = W / r.width;
		return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
	};
	const nearQ = (px: number, py: number, radius: number) => Math.hypot(px - sx(s.xq), py - sy(s.fxq)) <= radius;
	const moveQ = (px: number) => {
		setH((prev) => dragH(x0, fr.fromX(px), prev > 0 ? 1 : -1));
		setHText(null);
		setHZero(false);
	};
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const [px, py] = toLocal(e);
		if (px < fr.left - 8 || px > fr.right + 8 || py < fr.top - 8 || py > fr.bottom + 8) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		setDragging(true);
		// 按在 Q 上：從原本的位置開始拖，不跳動；按在別的地方：Q 直接移過去
		if (!nearQ(px, py, e.pointerType === 'mouse' ? 18 : 30)) moveQ(px);
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e);
		if (dragId.current !== e.pointerId) {
			if (e.pointerType === 'mouse') setHover(nearQ(px, py, 18));
			return;
		}
		moveQ(px);
	};
	const endDrag = () => {
		dragId.current = null;
		setDragging(false);
	};

	// ----- 圖上的幾何（畫面座標） -----
	const P: Pt = [sx(x0), sy(s.fx0)];
	const Q: Pt = [sx(s.xq), sy(s.fxq)];
	const toScreen = (p: Pt): Pt => [sx(p[0]), sy(p[1])];
	const secSeg = clipLine(x0, s.fx0, s.slope, fn.view);
	const tanSeg = clipLine(x0, s.fx0, s.deriv, fn.view);
	const secA = secSeg ? toScreen(secSeg[0]) : null;
	const secB = secSeg ? toScreen(secSeg[1]) : null;
	const tanA = tanSeg ? toScreen(tanSeg[0]) : null;
	const tanB = tanSeg ? toScreen(tanSeg[1]) : null;
	const corner: Pt = [Q[0], P[1]]; // 從 P 往右（或往左）走 h，再往上（或往下）走到 Q
	const runLen = Math.abs(corner[0] - P[0]);
	const riseLen = Math.abs(Q[1] - corner[1]);
	const o: Pt = [sx(0), sy(0)];

	// 標籤要避開的東西
	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 2, x1: fr.right - 2, y1: fr.bottom - 2 };
	const screenCurve = curvePts.map(([x, y]) => [sx(x), sy(y)] as Pt).filter(([, y]) => y > fr.top - 40 && y < fr.bottom + 40);
	const avoid: Box[] = [...polylineBoxes(screenCurve, 4), pointBox(P[0], P[1], 9), pointBox(Q[0], Q[1], 12)];
	if (secA && secB) avoid.push(...segmentBoxes(secA, secB, 4));
	if (tanA && tanB && tanOp > 0.2) avoid.push(...segmentBoxes(tanA, tanB, 4));
	// 座標軸與座標軸的名字
	avoid.push({ x0: fr.right - 16, y0: o[1] - 20, x1: fr.right, y1: o[1] - 2 }, { x0: o[0] + 4, y0: fr.top, x1: o[0] + 20, y1: fr.top + 18 });
	avoid.push({ x0: fr.left, y0: o[1] - 1.5, x1: fr.right, y1: o[1] + 1.5 }, { x0: o[0] - 1.5, y0: fr.top, x1: o[0] + 1.5, y1: fr.bottom });

	// 前進 h 與上升（Q 離 P 夠遠才畫）
	let stepEls: ReactNode = null;
	if (runLen >= 14 || riseLen >= 14) {
		const els: ReactNode[] = [];
		if (runLen >= 14) els.push(<line key="run" className={styles.run} x1={P[0]} y1={P[1]} x2={corner[0]} y2={corner[1]} />);
		if (riseLen >= 14) els.push(<line key="rise" className={styles.rise} x1={corner[0]} y1={corner[1]} x2={Q[0]} y2={Q[1]} />);
		avoid.push(...segmentBoxes(P, corner, 3), ...segmentBoxes(corner, Q, 3));
		if (runLen >= 26) {
			const mx = (P[0] + corner[0]) / 2;
			const below = s.rise >= 0; // Q 在上面時，割線在 run 的上方，字放下面
			const lab = placeLabel(
				[
					{ x: mx, y: P[1] + (below ? 13 : -13), anchor: 'middle' },
					{ x: mx, y: P[1] + (below ? -13 : 13), anchor: 'middle' },
				],
				textWidth('h', 14) + 4,
				16,
				avoid,
				bounds,
			);
			avoid.push(lab.box);
			els.push(
				<text key="hlab" className={`${styles.stepText} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor="middle" dominantBaseline="central">
					h
				</text>,
			);
		}
		if (riseLen >= 30) {
			const my = (corner[1] + Q[1]) / 2;
			const low = corner[1] + (Q[1] - corner[1]) * 0.28;
			const lower = corner[1] + (Q[1] - corner[1]) * 0.15;
			const word = s.rise >= 0 ? '上升' : '下降';
			const outward: Spot['anchor'] = sign > 0 ? 'start' : 'end';
			const inward: Spot['anchor'] = sign > 0 ? 'end' : 'start';
			const lab = placeLabel(
				[
					{ x: Q[0] + sign * 7, y: my, anchor: outward },
					{ x: Q[0] - sign * 7, y: my, anchor: inward },
					// Q 靠近圖的邊緣、只能放內側時，往直角那一端移：那裡離割線比較遠，字不會壓在割線上
					{ x: Q[0] - sign * 7, y: low, anchor: inward },
					{ x: Q[0] - sign * 7, y: lower, anchor: inward },
					{ x: Q[0] + sign * 7, y: low, anchor: outward },
				],
				textWidth(word, 14) + 4,
				18,
				avoid,
				bounds,
			);
			avoid.push(lab.box);
			els.push(
				<text key="riselab" className={`${styles.stepText} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central">
					{word}
				</text>,
			);
		}
		stepEls = <g>{els}</g>;
	}

	// eˣ：P 的高度（虛線）與切線底下那 1 格
	let expEls: ReactNode = null;
	if (fnKey === 'exp') {
		const heightLen = Math.abs(P[1] - o[1]);
		const base0 = sx(x0 - 1);
		const els: ReactNode[] = [<line key="height" className={styles.height} x1={P[0]} y1={o[1]} x2={P[0]} y2={P[1]} />];
		avoid.push(...segmentBoxes([P[0], o[1]], P, 3));
		if (tanOp > 0) {
			els.push(<line key="base" className={styles.unitBase} x1={base0} y1={o[1]} x2={P[0]} y2={o[1]} style={{ opacity: tanOp }} />);
			els.push(
				<text key="one" className={`${styles.unitText} ${styles.halo}`} x={(base0 + P[0]) / 2} y={o[1] + 13} textAnchor="middle" dominantBaseline="central" style={{ opacity: tanOp }}>
					1
				</text>,
			);
			avoid.push({ x0: base0, y0: o[1] - 4, x1: P[0], y1: o[1] + 22 });
		}
		if (heightLen >= 24) {
			const my = (P[1] + o[1]) / 2;
			const lab = placeLabel(
				[
					{ x: P[0] + 7, y: my, anchor: 'start' },
					{ x: P[0] - 7, y: my, anchor: 'end' },
					{ x: P[0] + 7, y: my - 6, anchor: 'start' },
					{ x: P[0] - 7, y: my - 6, anchor: 'end' },
					// 擠不下時放在 x 軸下面、虛線的右邊（箭頭指著虛線）
					{ x: P[0] + 2, y: o[1] + 12, anchor: 'start' },
				],
				textWidth('↑高度', 14) + 4,
				18,
				avoid,
				bounds,
			);
			avoid.push(lab.box);
			els.push(
				<text key="hl" className={`${styles.heightText} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central">
					{lab.spot.y > o[1] ? '↑高度' : '高度'}
				</text>,
			);
		}
		expEls = <g>{els}</g>;
	}

	// P、Q 的名字：先放 P，再放 Q（避開 P 的名字）；兩點幾乎重疊時，Q 的名字放在 Q 那一側
	const NAME_W = textWidth('P', 16) + 6;
	const labelP = placeLabel(
		sign > 0 ? [...around(P[0], P[1], 16).filter((c) => c.anchor !== 'start'), ...around(P[0], P[1], 16)] : [...around(P[0], P[1], 16).filter((c) => c.anchor !== 'end'), ...around(P[0], P[1], 16)],
		NAME_W,
		20,
		avoid,
		bounds,
	);
	avoid.push(labelP.box);
	const labelQ = placeLabel(
		sign > 0 ? [...around(Q[0], Q[1], 18).filter((c) => c.anchor !== 'end'), ...around(Q[0], Q[1], 18)] : [...around(Q[0], Q[1], 18).filter((c) => c.anchor !== 'start'), ...around(Q[0], Q[1], 18)],
		NAME_W,
		20,
		avoid,
		bounds,
	);

	// ----- 文字 -----
	const dF = fDigits(h);
	const x0t = fmtShort(x0);
	const xqt = fmtTrim(s.xq, 3);
	const ht = fmtShort(h);
	const fx0t = fmtTrim(s.fx0, dF);
	const fxqt = fmtTrim(s.fxq, dF);
	const riset = fmtTrim(s.rise, dF);
	const slopet = fmtFixed(s.slope, 6);
	const derivt = fmtFixed(s.deriv, 6);
	const difft = fmtFixed(s.diff, 6);
	const close = mag <= 0.01;

	let derivSteps: ReactNode[];
	if (fnKey === 'square') derivSteps = [<>2x₀</>, <>2 × {paren(x0t)}</>];
	else if (fnKey === 'cube')
		derivSteps = [
			<>
				3x₀<sup>2</sup>
			</>,
			<>
				3 × {paren(x0t)}
				<sup>2</sup>
			</>,
		];
	else
		derivSteps = [
			<>
				e<sup>x₀</sup>
			</>,
			<>
				e<sup>{x0t}</sup>
			</>,
		];

	const summary = `${FN_SPOKEN[fnKey]}，x₀ = ${x0t}，h = ${ht}：割線斜率 ${slopet}，導數 ${derivt}，差 ${difft}。`;

	let hNote: ReactNode;
	if (hZero)
		hNote = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>h 不能是 0：</span>Q 和 P 疊在一起，分母 h 是 0，割線斜率算不出來。所以導數要用「h 越來越靠近 0（但不等於 0）」來說。
			</p>
		);
	else if (close)
		hNote = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>h = {ht}：</span>Q 幾乎貼著 P，割線和<span className={styles.tangentText}>切線</span>（綠色虛線）幾乎分不開，割線斜率 {slopet} 和導數 {derivt} 只差 {difft}。
			</p>
		);
	else
		hNote = (
			<p className={styles.plain}>
				{sign < 0 ? <>h 是負的：Q 在 P 的左邊，公式照樣成立。</> : null}
				把 h 一路選小（2、1、0.5、0.1、0.01、0.001），看割線斜率怎麼靠近導數。
			</p>
		);

	return (
		<section className={`not-content ${styles.demo}`} aria-label="割線變成切線互動示範">
			<div className={styles.group}>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={`${uid}-fn`}>
						函數
					</span>
					<div className={styles.chips} role="group" aria-labelledby={`${uid}-fn`}>
						{FN_ORDER.map((k) => (
							<button key={k} type="button" className={`${styles.chip} ${styles.chipMono}`} aria-pressed={fnKey === k} aria-label={`f(x) = ${FN_SPOKEN[k]}`} onClick={() => pickFn(k)}>
								f(x) = <FnName k={k} />
							</button>
						))}
					</div>
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={x0Id}>
						x₀ = <span className={styles.value}>{x0t}</span>
					</label>
					<span className={`${styles.muted} ${styles.small}`}>P 的位置；拖動滑桿，或按方向鍵一次 0.1</span>
				</div>
				<input
					id={x0Id}
					className={styles.slider}
					type="range"
					min={fn.x0Min}
					max={fn.x0Max}
					step={X0_STEP}
					value={x0}
					aria-valuetext={`x₀ = ${x0t}`}
					onChange={(e) => setX0(clampX0(fn, Number(e.currentTarget.value)))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>{fmtShort(fn.x0Min)}</span>
					<span>{fmtShort(fn.x0Max)}</span>
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={`${uid}-hsize`}>
						h 的大小
					</span>
					<div className={styles.chips} role="group" aria-labelledby={`${uid}-hsize`}>
						{H_CHOICES.map((v) => (
							<button key={v} type="button" className={`${styles.chip} ${styles.chipMono}`} aria-pressed={mag === v} aria-label={`h 的大小 ${v}`} onClick={() => pickH(sign * v)}>
								{fmtShort(v)}
							</button>
						))}
					</div>
				</div>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={`${uid}-sign`}>
						Q 在 P 的
					</span>
					<div className={styles.chips} role="group" aria-labelledby={`${uid}-sign`}>
						<button type="button" className={styles.chip} aria-pressed={sign > 0} onClick={() => pickH(mag)}>
							右邊（h &gt; 0）
						</button>
						<button type="button" className={styles.chip} aria-pressed={sign < 0} onClick={() => pickH(-mag)}>
							左邊（h &lt; 0）
						</button>
					</div>
				</div>
				<div className={styles.numRow}>
					<label htmlFor={hInputId} className={styles.small}>
						或直接輸入 h（−2 到 2）
					</label>
					<input
						id={hInputId}
						type="number"
						className={styles.num}
						step={0.001}
						min={-H_MAX}
						max={H_MAX}
						value={hText ?? fmtInput(h)}
						onChange={(e) => onHInput(e.currentTarget.value)}
						onBlur={() => setHText(null)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') setHText(null);
						}}
					/>
					<button type="button" className={`${styles.chip} ${styles.toggle}`} aria-pressed={always} onClick={() => setAlways((v) => !v)}>
						一直顯示切線
					</button>
				</div>
			</div>

			<div className={styles.layout}>
				<div className={styles.plotWrap} ref={wrapRef}>
					<svg
						className={`${styles.plot} ${styles.draggable} ${dragging ? styles.grabbing : hover ? styles.grab : styles.clickable}`}
						viewBox={`0 0 ${W} ${H}`}
						role="img"
						aria-label={`座標圖：藍色曲線 y = ${FN_SPOKEN[fnKey]}。P = (${x0t}, ${fmtFixed(s.fx0, 3)})，Q = (${xqt}, ${fmtFixed(s.fxq, 3)})，紫色割線穿過 P、Q，斜率 ${slopet}${tanOp > 0 ? `；綠色虛線是 P 的切線，斜率 ${derivt}` : ''}。`}
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

						{/* 格線與刻度 */}
						{gridValues(fn.view.xMin, fn.view.xMax, fn.xGrid).map((g) => (
							<line key={`gx${g}`} className={styles.grid} x1={sx(g)} y1={fr.top} x2={sx(g)} y2={fr.bottom} />
						))}
						{gridValues(fn.view.yMin, fn.view.yMax, fn.yGrid).map((g) => (
							<line key={`gy${g}`} className={styles.grid} x1={fr.left} y1={sy(g)} x2={fr.right} y2={sy(g)} />
						))}
						{fn.xTicks.map((t) => (
							<text key={`tx${t}`} className={styles.tickText} x={sx(t)} y={fr.bottom + 17} textAnchor="middle">
								{fmtShort(t)}
							</text>
						))}
						{[0, ...fn.yTicks].map((t) => (
							<text key={`ty${t}`} className={styles.tickText} x={fr.left - 6} y={sy(t) + 4.5} textAnchor="end">
								{fmtShort(t)}
							</text>
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

						<g clipPath={`url(#${clipId})`}>
							<path className={styles.curve} d={curvePath} />
							{expEls}
							{secA && secB ? <line className={styles.secant} x1={secA[0]} y1={secA[1]} x2={secB[0]} y2={secB[1]} /> : null}
							{/* 切線畫在割線上面：兩條幾乎重合時，虛線的空隙裡還看得到割線 */}
							{tanA && tanB ? <line className={styles.tangent} x1={tanA[0]} y1={tanA[1]} x2={tanB[0]} y2={tanB[1]} style={{ opacity: tanOp }} /> : null}
						</g>
						{stepEls}

						{/* P 固定，Q 可以拖：淡色圓圈標出可以抓的範圍 */}
						<circle className={styles.handleQ} cx={Q[0]} cy={Q[1]} r={12} />
						{dragging || hover ? <circle className={styles.ring} cx={Q[0]} cy={Q[1]} r={17} /> : null}
						<circle className={styles.pointP} cx={P[0]} cy={P[1]} r={5.5} />
						<circle className={styles.pointQ} cx={Q[0]} cy={Q[1]} r={5.5} />
						<text className={`${styles.labelP} ${styles.halo}`} x={labelP.spot.x} y={labelP.spot.y} textAnchor={labelP.spot.anchor} dominantBaseline="central">
							P
						</text>
						<text className={`${styles.labelQ} ${styles.halo}`} x={labelQ.spot.x} y={labelQ.spot.y} textAnchor={labelQ.spot.anchor} dominantBaseline="central">
							Q
						</text>
					</svg>
					<div className={styles.legend} aria-hidden="true">
						<span className={styles.legendItem}>
							<span className={styles.swCurve} />
							<span>
								y = <FnName k={fnKey} />
							</span>
						</span>
						<span className={styles.legendItem}>
							<span className={styles.swSecant} />
							割線（穿過 P、Q）
						</span>
						<span className={styles.legendItem}>
							<span className={styles.swTangent} />
							切線（P 的導數）
						</span>
					</div>
					<p className={styles.hint} id={hintId}>
						沿著曲線拖動 Q（或點圖上任一處），h 會吸附到 0.01；更小的 h 用上面的按鈕或輸入格。切線在 h 很小時才淡入，也可以按「一直顯示切線」。
					</p>
				</div>

				<div className={styles.readout}>
					<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
						{summary}
					</p>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>
							<span className={styles.secantText}>割線斜率</span>（平均變化率）
						</p>
						<div className={styles.derivGrid}>
							<span />
							<span className={styles.rhs}>
								<span>(f(x₀ + h) − f(x₀))</span>
								<span>/ h</span>
							</span>
							<span>=</span>
							<span className={styles.rhs}>
								<span>
									(f({xqt}) − f({x0t}))
								</span>
								<span>/ {paren(ht)}</span>
							</span>
							<span>=</span>
							<span className={styles.rhs}>
								<span>({fxqt}</span>
								<span>− {paren(fx0t)})</span>
								<span>/ {paren(ht)}</span>
							</span>
							<span>=</span>
							<span className={styles.rhs}>
								<span>{paren(riset)}</span>
								<span>/ {paren(ht)}</span>
							</span>
							<span>=</span>
							<span className={styles.rhs}>
								<span className={`${styles.secantText} ${styles.big}`}>{slopet}</span>
							</span>
						</div>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>
							<span className={styles.tangentText}>導數</span>（切線的斜率）
						</p>
						<div className={styles.derivGrid}>
							<span>f′(x₀)</span>
							<span>= {derivSteps[0]}</span>
							<span />
							<span>= {derivSteps[1]}</span>
							<span />
							<span>
								= <span className={`${styles.tangentText} ${styles.big}`}>{derivt}</span>
							</span>
						</div>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>割線斜率 − 導數</p>
						<p className={styles.deriv}>
							<span>
								{slopet} − {paren(derivt)}
							</span>
							<span>
								= <span className={`${styles.result} ${styles.big}`}>{difft}</span>
							</span>
						</p>
					</div>

					{hNote}

					<table className={styles.table}>
						<caption>
							h 越來越小（x₀ = {x0t}，Q 在 P 的{sign > 0 ? '右' : '左'}邊）
						</caption>
						<thead>
							<tr>
								<th scope="col">h</th>
								<th scope="col">割線斜率</th>
								<th scope="col">差</th>
							</tr>
						</thead>
						<tbody>
							{H_CHOICES.map((v) => {
								const r = secant(fn, x0, sign * v);
								return (
									<tr key={v} className={mag === v ? styles.current : undefined} aria-current={mag === v ? 'true' : undefined}>
										<td>{fmtShort(sign * v)}</td>
										<td>{fmtFixed(r.slope, 6)}</td>
										<td>{fmtFixed(r.diff, 6)}</td>
									</tr>
								);
							})}
							<tr className={styles.tableFoot}>
								<td>導數</td>
								<td>{derivt}</td>
								<td />
							</tr>
						</tbody>
					</table>

					<p className={fnKey === 'exp' ? styles.note : `${styles.small} ${styles.muted}`}>{FN_NOTES[fnKey]}</p>
				</div>
			</div>
		</section>
	);
}

/** 格線的位置：step 的倍數，在 lo 到 hi 之間 */
function gridValues(lo: number, hi: number, step: number): number[] {
	const out: number[] = [];
	for (let k = Math.ceil(lo / step); k * step <= hi; k++) out.push(k * step);
	return out;
}
