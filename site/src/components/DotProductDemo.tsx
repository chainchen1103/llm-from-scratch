import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './Ep03Vectors.module.css';
import {
	anglePath,
	arrowShape,
	canDouble,
	dotInfo,
	DOT_HALF,
	DOT_LIM,
	DOT_PRESETS,
	fmtFactor,
	fmtFixed,
	fmtInput,
	fmtNum,
	isZero,
	placeLabel,
	plotFrame,
	pointBox,
	segmentBoxes,
	snap,
	snapVec,
	STEP,
	textWidth,
	vecEq,
	type Box,
	type Relation,
	type Spot,
	type Vec,
} from './ep03-vectors.ts';

/**
 * 內積的兩種算法與夾角：拖動兩支箭頭 a、b 的尖端（吸附到 0.5 的格點），
 * 看「對應位置相乘再加起來」和「長度 × 長度 × cos θ」算出同一個數，
 * 以及 b 落在 a 方向上的影子：夾角超過 90° 時影子落在反方向，內積變成負的。
 *
 * 兩軸同比例。viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小；
 * 還沒量到寬度之前（伺服器產生的 HTML）用預設大小，整張圖等比例縮放。
 */

const DEFAULT_WIDTH = 400;
const GRID = Array.from({ length: 2 * DOT_LIM + 1 }, (_, i) => i - DOT_LIM); // −4 … 4
const TICKS = [-4, -2, 0, 2, 4];

type Which = 'a' | 'b';

const RELATION_TEXT: Record<Exclude<Relation, 'zero'>, { word: string; text: string; cls: 'ok' | 'note' | 'bad' }> = {
	same: { word: '方向接近', text: '夾角 0°，b 和 a 同方向：內積是正的，餘弦相似度是 1。', cls: 'ok' },
	close: { word: '方向接近', text: '夾角小於 90°，內積是正的。', cls: 'ok' },
	perpendicular: { word: '垂直', text: '夾角剛好 90°，內積是 0（也叫正交）。', cls: 'note' },
	away: { word: '方向相反', text: '夾角大於 90°，兩支箭頭偏向相反的方向，內積是負的。', cls: 'bad' },
	opposite: { word: '方向相反', text: '夾角 180°，b 和 a 完全相反：內積是負的，餘弦相似度是 −1。', cls: 'bad' },
};

/** ‖v‖：兩條直線用 CSS 的雙線邊框畫，不受字型影響 */
const Norm = ({ v }: { v: string }) => <span className={styles.norm}>{v}</span>;

/** 一個分量的數字輸入：方向鍵一次 0.5；輸入其他數字時，圖上吸附到最近的 0.5，離開輸入格後格子裡也改成吸附後的數字 */
function NumField({ value, onValue, label, className }: { value: number; onValue: (v: number) => void; label: string; className: string }) {
	const [text, setText] = useState<string | null>(null);
	return (
		<input
			type="number"
			className={`${styles.num} ${className}`}
			step={STEP}
			min={-DOT_LIM}
			max={DOT_LIM}
			aria-label={label}
			value={text ?? fmtInput(value)}
			onChange={(e) => {
				const raw = e.currentTarget.value;
				setText(raw);
				const v = Number(raw);
				if (raw.trim() !== '' && Number.isFinite(v)) onValue(snap(v, DOT_LIM));
			}}
			onBlur={() => setText(null)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') setText(null);
			}}
		/>
	);
}

export default function DotProductDemo() {
	const [a, setA] = useState<Vec>([3, 0]);
	const [b, setB] = useState<Vec>([2, 2]);
	// 按「放大 b」之前的內積與餘弦相似度，用來比較；其他任何改變都會清掉
	const [before, setBefore] = useState<{ dot: number; cos: number } | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [hover, setHover] = useState<Which | null>(null);
	const [dragging, setDragging] = useState<Which | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{ which: Which; dx: number; dy: number } | null>(null);
	const uid = useId();
	const clipId = `dot-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
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

	const fr = plotFrame(width, DOT_HALF);
	const { sx, sy } = fr;
	const info = dotInfo(a, b);
	const zero = info.relation === 'zero';

	const setVec = (which: Which, v: Vec) => {
		const set = which === 'a' ? setA : setB;
		set((prev) => (vecEq(prev, v) ? prev : v));
		setBefore(null);
	};
	const setComp = (which: Which, i: 0 | 1, v: number) => {
		const cur = which === 'a' ? a : b;
		setVec(which, i === 0 ? [v, cur[1]] : [cur[0], v]);
	};
	const pickPreset = (pa: Vec, pb: Vec) => {
		setA(pa);
		setB(pb);
		setBefore(null);
	};
	const doubleB = () => {
		if (!canDouble(b) || info.cos === null) return;
		setBefore({ dot: info.dot, cos: info.cos });
		setB([2 * b[0], 2 * b[1]]);
	};

	// ----- 拖動（Pointer Events：滑鼠、觸控、觸控筆都適用） -----
	const toLocal = (e: ReactPointerEvent<SVGSVGElement>): Vec => {
		const r = e.currentTarget.getBoundingClientRect();
		const k = width / r.width;
		return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
	};
	const nearest = (px: number, py: number, radius: number): Which | null => {
		const da = Math.hypot(px - sx(a[0]), py - sy(a[1]));
		const db = Math.hypot(px - sx(b[0]), py - sy(b[1]));
		if (Math.min(da, db) > radius) return null;
		return db <= da ? 'b' : 'a'; // 疊在一起時抓 b（畫在上面）
	};
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e);
		const which = nearest(px, py, e.pointerType === 'mouse' ? 22 : 34);
		if (!which) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		const v = which === 'a' ? a : b;
		dragRef.current = { which, dx: sx(v[0]) - px, dy: sy(v[1]) - py };
		setDragging(which);
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = toLocal(e);
		const d = dragRef.current;
		if (!d) {
			if (e.pointerType === 'mouse') setHover(nearest(px, py, 22));
			return;
		}
		setVec(d.which, snapVec(fr.fromScreen(px + d.dx, py + d.dy), DOT_LIM));
	};
	const endDrag = () => {
		dragRef.current = null;
		setDragging(null);
	};

	// ----- 圖上的幾何（畫面座標） -----
	const o: Vec = [sx(0), sy(0)];
	const tipA: Vec = [sx(a[0]), sy(a[1])];
	const tipB: Vec = [sx(b[0]), sy(b[1])];
	const lenA = Math.hypot(tipA[0] - o[0], tipA[1] - o[1]);
	const lenB = Math.hypot(tipB[0] - o[0], tipB[1] - o[1]);
	const arrA = arrowShape(o[0], o[1], tipA[0], tipA[1]);
	const arrB = arrowShape(o[0], o[1], tipB[0], tipB[1]);
	const unitOf = (tip: Vec, len: number): Vec => (len > 0 ? [(tip[0] - o[0]) / len, (tip[1] - o[1]) / len] : [0, 0]);
	const ua = unitOf(tipA, lenA); // a 的方向（畫面座標）
	const ub = unitOf(tipB, lenB);
	// 影子與垂足（畫面座標）：影子畫在 a 的直線旁邊、b 的另一側（和教學文檔的圖一樣：b 在上面，影子畫在 x 軸下面一點）
	const OFF = 7;
	let sh: { foot: Vec; n: Vec; len: number; negative: boolean } | null = null;
	if (!zero && info.foot) {
		const foot: Vec = [sx(info.foot[0]), sy(info.foot[1])];
		const side = Math.sign(a[0] * b[1] - a[1] * b[0]) || 1;
		const n: Vec = [-ua[1] * side, ua[0] * side]; // 法向量，指向 b 的另一側
		sh = { foot, n, len: Math.hypot(foot[0] - o[0], foot[1] - o[1]), negative: info.dot < 0 };
	}

	// 標籤要避開的東西：原點、兩個尖端、兩支箭頭、影子、垂直的點線
	const bounds: Box = { x0: fr.left + 2, y0: fr.top - 6, x1: fr.right + 10, y1: fr.bottom - 2 }; // 可以用到右邊和上面的留白
	const avoid: Box[] = [pointBox(o[0], o[1], 8), pointBox(tipA[0], tipA[1], 12), pointBox(tipB[0], tipB[1], 12), ...segmentBoxes(o, tipA, 3), ...segmentBoxes(o, tipB, 3)];
	// 座標軸的名字 x、y
	avoid.push({ x0: fr.right - 14, y0: o[1] - 18, x1: fr.right - 2, y1: o[1] - 2 }, { x0: o[0] + 7, y0: fr.top + 2, x1: o[0] + 19, y1: fr.top + 18 });
	if (sh) {
		const { foot, n } = sh;
		if (sh.len > 0.5) avoid.push(...segmentBoxes([o[0] + n[0] * OFF, o[1] + n[1] * OFF], [foot[0] + n[0] * OFF, foot[1] + n[1] * OFF], 5));
		avoid.push(...segmentBoxes(tipB, foot, 3));
	}

	// 箭頭名稱：先試箭頭前方，再試兩側（先試遠離另一支箭頭的那一側）；零向量放在原點旁、背對另一支箭頭
	const nameSpots = (tip: Vec, u: Vec, other: Vec): Spot[] => {
		if (u[0] === 0 && u[1] === 0) {
			const away: Vec = other[0] === 0 && other[1] === 0 ? [-0.7, 0.7] : [-other[0], -other[1]];
			return [
				{ x: o[0] + away[0] * 18, y: o[1] + away[1] * 18, anchor: 'middle' },
				{ x: o[0] - 14, y: o[1] + 16, anchor: 'middle' },
			];
		}
		const n: Vec = [-u[1], u[0]];
		const s = Math.sign(n[0] * other[0] + n[1] * other[1]) || 1; // n 指向另一支箭頭的那一側時 s = 1
		return [
			{ x: tip[0] + u[0] * 17, y: tip[1] + u[1] * 17, anchor: 'middle' },
			{ x: tip[0] + u[0] * 8 - n[0] * s * 18, y: tip[1] + u[1] * 8 - n[1] * s * 18, anchor: 'middle' },
			{ x: tip[0] + u[0] * 8 + n[0] * s * 18, y: tip[1] + u[1] * 8 + n[1] * s * 18, anchor: 'middle' },
			{ x: tip[0] - u[0] * 14 - n[0] * s * 18, y: tip[1] - u[1] * 14 - n[1] * s * 18, anchor: 'middle' },
			{ x: tip[0] - u[0] * 14 + n[0] * s * 18, y: tip[1] - u[1] * 14 + n[1] * s * 18, anchor: 'middle' },
		];
	};
	const NAME_W = textWidth('a', 16) + 6;
	const labelA = placeLabel(nameSpots(tipA, ua, ub), NAME_W, 20, avoid, bounds);
	avoid.push(labelA.box);
	const labelB = placeLabel(nameSpots(tipB, ub, ua), NAME_W, 20, avoid, bounds);
	avoid.push(labelB.box);

	let shadowEl = null;
	let perpEl = null;
	let angleEl = null;
	if (sh) {
		const { foot, n, negative } = sh;
		if (sh.len > 0.5) {
			const text = negative ? '影子（負的）' : '影子';
			const mid: Vec = [(o[0] + foot[0]) / 2, (o[1] + foot[1]) / 2];
			const side2: Spot['anchor'] = n[0] > 0.35 ? 'start' : n[0] < -0.35 ? 'end' : 'middle';
			const cands: Spot[] = [
				{ x: mid[0] + n[0] * 22, y: mid[1] + n[1] * 22, anchor: side2 },
				{ x: mid[0] + n[0] * 22, y: mid[1] + n[1] * 22, anchor: 'middle' },
				{ x: mid[0] + n[0] * 38, y: mid[1] + n[1] * 38, anchor: side2 },
				{ x: foot[0] + n[0] * 22, y: foot[1] + n[1] * 22, anchor: side2 },
				{ x: o[0] + n[0] * 22, y: o[1] + n[1] * 22, anchor: side2 },
			];
			const lab = placeLabel(cands, textWidth(text, 14) + 4, 18, avoid, bounds);
			shadowEl = (
				<g>
					<line className={negative ? styles.shadowNeg : styles.shadowPos} x1={o[0] + n[0] * OFF} y1={o[1] + n[1] * OFF} x2={foot[0] + n[0] * OFF} y2={foot[1] + n[1] * OFF} />
					<text className={`${negative ? styles.shadowNegText : styles.shadowPosText} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central">
						{text}
					</text>
				</g>
			);
		}
		// 從 b 的尖端垂直落到 a 的直線
		const pv: Vec = [tipB[0] - foot[0], tipB[1] - foot[1]];
		const pLen = Math.hypot(pv[0], pv[1]);
		if (pLen > 1) {
			const v: Vec = [pv[0] / pLen, pv[1] / pLen];
			// 直角記號的另一邊沿著 a 的直線、朝原點（垂足就是原點時沿著 a）
			const u: Vec = sh.len > 0.5 ? [(o[0] - foot[0]) / sh.len, (o[1] - foot[1]) / sh.len] : ua;
			const s = Math.min(9, pLen / 2);
			perpEl = (
				<g>
					<line className={styles.perp} x1={tipB[0]} y1={tipB[1]} x2={foot[0]} y2={foot[1]} />
					<path className={styles.rightAngle} d={`M${foot[0] + u[0] * s} ${foot[1] + u[1] * s} L${foot[0] + u[0] * s + v[0] * s} ${foot[1] + u[1] * s + v[1] * s} L${foot[0] + v[0] * s} ${foot[1] + v[1] * s}`} />
				</g>
			);
		}
		// 夾角：垂直時就是上面那個直角記號（垂足在原點），不另外畫圓弧
		const r = Math.min(30, 0.55 * Math.min(lenA, lenB));
		if (info.relation !== 'perpendicular' && info.relation !== 'same' && r >= 8) {
			const arc = anglePath(a, b, o[0], o[1], r);
			angleEl = (
				<g>
					<path className={styles.arc} d={arc.d} />
					<text className={`${styles.arcText} ${styles.halo}`} x={o[0] + arc.mid[0] * (r + 11)} y={o[1] + arc.mid[1] * (r + 11)} textAnchor="middle" dominantBaseline="central">
						θ
					</text>
				</g>
			);
		}
	}

	// a 所在的直線（向兩邊延伸到圖外，用 clipPath 切掉）
	const far = 3 * width;
	const aLine = !isZero(a) ? <line className={styles.aLine} x1={o[0] - ua[0] * far} y1={o[1] - ua[1] * far} x2={o[0] + ua[0] * far} y2={o[1] + ua[1] * far} /> : null;

	// ----- 文字 -----
	const av = `(${fmtNum(a[0])}, ${fmtNum(a[1])})`;
	const bv = `(${fmtNum(b[0])}, ${fmtNum(b[1])})`;
	const dotText = fmtNum(info.dot);
	const normA = fmtFixed(info.normA, 3);
	const normB = fmtFixed(info.normB, 3);
	const angle = info.angle !== null ? fmtFixed(info.angle, 1) : null;
	const cos = info.cos !== null ? fmtFixed(info.cos, 3) : null;
	const shadow = info.shadow !== null ? fmtFixed(info.shadow, 3) : null;
	const viaCos = info.cos !== null ? fmtFixed(info.normA * info.normB * info.cos, 3) : null;
	const rel = zero ? null : RELATION_TEXT[info.relation as Exclude<Relation, 'zero'>];
	const doubled = canDouble(b);
	const pressed = (pa: Vec, pb: Vec) => vecEq(a, pa) && vecEq(b, pb);
	let shadowNote = '';
	if (info.relation === 'perpendicular') shadowNote = 'b 和 a 垂直，影子縮成一個點，長度是 0；';
	else if (info.dot < 0) shadowNote = '影子落在 a 的反方向（圖上的虛線），算成負的；';
	else if (!zero) shadowNote = '影子長就是圖上那段粗線的長度；';
	const shadowCls = info.dot < 0 ? styles.textNeg : info.dot > 0 ? styles.textPos : styles.result;

	const summary = zero
		? `a = ${av}，b = ${bv}，內積 ${dotText}。零向量沒有方向，夾角與餘弦相似度無法計算。`
		: `a = ${av}，b = ${bv}，內積 ${dotText}，夾角 ${angle} 度，餘弦相似度 ${cos}，影子長 ${shadow}，${rel!.word}。`;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="內積與夾角互動示範">
			<div className={styles.group}>
				<p className={styles.title} id={`${uid}-presets`}>
					選一組 a、b，或直接拖動箭頭的尖端
				</p>
				<div className={styles.chips} role="group" aria-labelledby={`${uid}-presets`}>
					{DOT_PRESETS.map((p) => (
						<button key={p.label} type="button" className={styles.chip} aria-pressed={pressed(p.a, p.b)} aria-label={p.aria} onClick={() => pickPreset(p.a, p.b)}>
							{p.label}
						</button>
					))}
					<button type="button" className={`${styles.chip} ${styles.chipAction}`} aria-disabled={!doubled} aria-describedby={!doubled && !isZero(b) ? `${uid}-nodouble` : undefined} onClick={doubleB}>
						放大 b（× 2）
					</button>
				</div>
			</div>

			<div className={styles.layout}>
				<div className={styles.plotWrap} ref={wrapRef}>
					<svg
						className={`${styles.plot} ${dragging ? styles.grabbing : hover ? styles.grab : ''}`}
						viewBox={`0 0 ${width} ${fr.height}`}
						role="img"
						aria-label={`座標平面：藍色箭頭 a = ${av}，紫色箭頭 b = ${bv}。${zero ? '有零向量，沒有夾角。' : `夾角 ${angle} 度；粗線是 b 落在 a 方向上的影子，長 ${shadow}${info.dot < 0 ? '，落在 a 的反方向' : ''}。`}`}
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

						{/* 格線與刻度（刻度數字放在圖的左邊和下面，不會被箭頭、影子蓋住） */}
						{GRID.map((g) => (
							<g key={g}>
								<line className={styles.grid} x1={sx(g)} y1={fr.top} x2={sx(g)} y2={fr.bottom} />
								<line className={styles.grid} x1={fr.left} y1={sy(g)} x2={fr.right} y2={sy(g)} />
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
						<text className={`${styles.axisName} ${styles.halo}`} x={fr.right - 4} y={o[1] - 9} textAnchor="end">
							x
						</text>
						<text className={`${styles.axisName} ${styles.halo}`} x={o[0] + 9} y={fr.top + 12} textAnchor="start">
							y
						</text>

						<g clipPath={`url(#${clipId})`}>{aLine}</g>
						{shadowEl}
						{perpEl}
						{angleEl}

						{/* 可拖的尖端：淡色圓圈標出可以抓的範圍 */}
						<circle className={styles.handleA} cx={tipA[0]} cy={tipA[1]} r={11} />
						<circle className={styles.handleB} cx={tipB[0]} cy={tipB[1]} r={11} />
						{dragging || hover ? <circle className={styles.tipRing} cx={(dragging ?? hover) === 'a' ? tipA[0] : tipB[0]} cy={(dragging ?? hover) === 'a' ? tipA[1] : tipB[1]} r={16} /> : null}

						{/* 兩支箭頭：a 畫在下面、b 畫在上面；零向量只畫一個點 */}
						{arrA ? (
							<g>
								<line className={styles.shaftA} x1={o[0]} y1={o[1]} x2={arrA.shaftEnd[0]} y2={arrA.shaftEnd[1]} />
								<path className={styles.headA} d={arrA.head} />
							</g>
						) : (
							<circle className={styles.tipA} cx={o[0]} cy={o[1]} r={5} />
						)}
						{arrB ? (
							<g>
								<line className={styles.shaftB} x1={o[0]} y1={o[1]} x2={arrB.shaftEnd[0]} y2={arrB.shaftEnd[1]} />
								<path className={styles.headB} d={arrB.head} />
							</g>
						) : (
							<circle className={styles.tipB} cx={o[0]} cy={o[1]} r={5} />
						)}
						<text className={`${styles.labelA} ${styles.halo}`} x={labelA.spot.x} y={labelA.spot.y} textAnchor={labelA.spot.anchor} dominantBaseline="central">
							a
						</text>
						<text className={`${styles.labelB} ${styles.halo}`} x={labelB.spot.x} y={labelB.spot.y} textAnchor={labelB.spot.anchor} dominantBaseline="central">
							b
						</text>
					</svg>
					<p className={styles.hint} id={hintId}>
						拖動 a、b 的尖端（會吸附到 0.5 的格點），或在數字格裡輸入；方向鍵一次加減 0.5。
					</p>
				</div>

				<div className={styles.readout}>
					<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
						{summary}
					</p>

					<div className={styles.group}>
						{(['a', 'b'] as const).map((w) => {
							const v = w === 'a' ? a : b;
							const cls = w === 'a' ? styles.numA : styles.numB;
							return (
								<div key={w} className={styles.vecRow}>
									<span className={w === 'a' ? styles.nameA : styles.nameB}>{w}</span>
									<span aria-hidden="true">= (</span>
									<NumField value={v[0]} onValue={(x) => setComp(w, 0, x)} label={`${w} 的第 1 個數字 ${w}₁`} className={cls} />
									<span aria-hidden="true">,</span>
									<NumField value={v[1]} onValue={(x) => setComp(w, 1, x)} label={`${w} 的第 2 個數字 ${w}₂`} className={cls} />
									<span aria-hidden="true">)</span>
								</div>
							);
						})}
						{!doubled && !isZero(b) ? (
							<p className={`${styles.small} ${styles.muted}`} id={`${uid}-nodouble`}>
								b 再放大 2 倍會超出 −4 到 4 的範圍，所以「放大 b」暫時不能按。
							</p>
						) : null}
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>算法一：對應位置相乘，再加起來</p>
						<div className={styles.derivGrid}>
							<span>a·b</span>
							<span className={styles.rhs}>
								<span>= a₁b₁ + a₂b₂</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>
									= {fmtFactor(a[0])} × {fmtFactor(b[0])}
								</span>
								<span>
									+ {fmtFactor(a[1])} × {fmtFactor(b[1])}
								</span>
							</span>
							<span />
							<span className={styles.rhs}>
								<span>
									= {fmtNum(info.terms[0])} + {fmtFactor(info.terms[1])}
								</span>
								<span>
									= <span className={`${styles.result} ${styles.big}`}>{dotText}</span>
								</span>
							</span>
						</div>
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>算法二：長度 × 長度 × cos θ</p>
						<p className={`${styles.deriv} ${styles.pair}`}>
							<span>
								<Norm v="a" /> = {normA}
							</span>
							<span>
								<Norm v="b" /> = {normB}
							</span>
						</p>
						{zero ? (
							<p className={styles.small}>夾角 θ、cos θ：無法計算（零向量沒有方向）</p>
						) : (
							<>
								<p className={`${styles.deriv} ${styles.pair}`}>
									<span>θ = {angle}°</span>
									<span>cos θ = {cos}</span>
								</p>
								<div className={styles.derivGrid}>
									<span>a·b</span>
									<span className={styles.rhs}>
										<span>
											= <Norm v="a" /> <Norm v="b" /> cos θ
										</span>
										<span>
											= <span className={`${styles.result} ${styles.big}`}>{viaCos}</span>
										</span>
									</span>
								</div>
								<div className={styles.derivGrid}>
									<span className={shadowCls}>影子長</span>
									<span className={styles.rhs}>
										<span>
											= <Norm v="b" /> cos θ
										</span>
										<span>
											= <span className={shadowCls}>{shadow}</span>
										</span>
									</span>
								</div>
								<p className={`${styles.small} ${styles.muted}`}>
									{shadowNote}所以{' '}
									<span className={`${styles.mono} ${styles.nowrap}`}>
										a·b = <Norm v="a" /> × 影子長
									</span>
									。
								</p>
							</>
						)}
					</div>

					<div className={styles.calc}>
						<p className={styles.calcTitle}>餘弦相似度：只看方向</p>
						<div className={styles.derivGrid}>
							<span>cos θ</span>
							<span className={styles.rhs}>
								<span>
									= a·b ÷ (<Norm v="a" /> <Norm v="b" />)
								</span>
								{zero ? (
									<span>= 無法計算</span>
								) : (
									<span>
										= <span className={`${styles.result} ${styles.big}`}>{cos}</span>
									</span>
								)}
							</span>
						</div>
					</div>

					<p className={rel ? styles[rel.cls] : styles.plain}>
						{rel ? (
							<>
								<span className={styles.tagWord}>{rel.word}</span>：{rel.text}
							</>
						) : (
							'零向量沒有方向，夾角與餘弦相似度無法計算。'
						)}
					</p>

					{before && info.cos !== null ? (
						<p className={styles.note}>
							b 放大 2 倍：內積 {fmtNum(before.dot)} → {dotText}，也變成 2 倍；餘弦相似度 {fmtFixed(before.cos, 3)} → {cos}，不變。放大只改變長度、不改變方向，所以比較「像不像」要除以長度。
						</p>
					) : null}
				</div>
			</div>
		</section>
	);
}
