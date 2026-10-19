import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import styles from './Ep03Matrix.module.css';
import {
	fitQ,
	fmtFactor,
	fmtFixed,
	fmtNum,
	fmtPct,
	KEYS,
	LONG_FACTOR,
	LONG_KEY,
	PLOT,
	Q_FACTOR,
	Q_START,
	qBounds,
	scoreQuery,
	type ScoreMode,
	type Vec2,
} from './ep03-matrix.ts';

/**
 * 查詢向量 q 對一排 key 打分數：分數（內積或餘弦相似度）→ Softmax → 權重。
 * 拖動 q（吸附 0.5），或用數字輸入；「把 k₃ 拉長 3 倍」「q 放大 2 倍」看長度對兩種分數的影響。
 *
 * 兩軸同比例。viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 400;
const PAD = 8;
const X_SPAN = PLOT.xMax - PLOT.xMin;
const Y_SPAN = PLOT.yMax - PLOT.yMin;
const GRID_X = Array.from({ length: X_SPAN }, (_, i) => Math.ceil(PLOT.xMin) + i); // −4 … 6
const GRID_Y = Array.from({ length: Y_SPAN }, (_, i) => Math.ceil(PLOT.yMin) + i); // −4 … 4
const TICKS_X = [-2, 2, 4, 6]; // 放在下緣；−4 不標，免得和左緣的刻度擠在角落
const TICKS_Y = [-2, 2, 4];

/** ‖v‖：兩條直線用 CSS 的雙線邊框畫（等寬字型的「‖」是全形，會把字距撐得很開） */
const Norm = ({ children }: { children: ReactNode }) => <span className={styles.norm}>{children}</span>;

/** k 加下標 */
const KName = ({ i }: { i: number }) => (
	<span className={styles.kName}>
		k<sub>{i + 1}</sub>
	</span>
);

const fmtVec2 = (v: Vec2) => `(${fmtNum(v[0])}, ${fmtNum(v[1])})`;
const fmtScore = (v: number, mode: ScoreMode) => fmtFixed(v, mode === 'dot' ? 1 : 3);

type Pt = [number, number];

/** 從 (x0, y0) 畫到 (x1, y1) 的箭頭（畫面座標）：線段停在箭頭頭部的後面 */
function arrowParts(x1: number, y1: number, x0: number, y0: number, head: number) {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const len = Math.hypot(dx, dy);
	if (len < 0.5) return null;
	const ux = dx / len;
	const uy = dy / len;
	const h = Math.min(head, len * 0.6);
	const bx = x1 - ux * h;
	const by = y1 - uy * h;
	const w = h * 0.45;
	return {
		line: { x1: x0, y1: y0, x2: x1 - ux * h * 0.6, y2: y1 - uy * h * 0.6 },
		head: `M${x1.toFixed(2)} ${y1.toFixed(2)} L${(bx - uy * w).toFixed(2)} ${(by + ux * w).toFixed(2)} L${(bx + uy * w).toFixed(2)} ${(by - ux * w).toFixed(2)} Z`,
		u: [ux, uy] as Pt,
	};
}

export default function QueryScoreDemo() {
	const [q, setQ] = useState<Vec2>(Q_START);
	const [mode, setMode] = useState<ScoreMode>('dot');
	const [longK, setLongK] = useState(false);
	const [doubleQ, setDoubleQ] = useState(false);
	const [editing, setEditing] = useState<{ axis: 0 | 1; text: string } | null>(null);
	const [W, setW] = useState(DEFAULT_W);
	const wrapRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const dragging = useRef<number | null>(null);
	const uid = useId();

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

	const res = scoreQuery(q, mode, longK, doubleQ);
	// 四支一樣高（只有 q 是零向量、用內積時）就不標「分數最高」
	const allTie = res.keys.every((k) => k.best);
	const isBest = (i: number) => res.keys[i].best && !allTie;
	const base = longK || doubleQ ? scoreQuery(q, mode, false, false) : null; // 還沒拉長／放大時
	const qName = doubleQ ? `${Q_FACTOR}q` : 'q';
	const bounds = qBounds(doubleQ);

	// ----- 座標 -----
	const unit = (W - 2 * PAD) / X_SPAN;
	const H = Math.round(2 * PAD + Y_SPAN * unit);
	const sx = (x: number) => PAD + (x - PLOT.xMin) * unit;
	const sy = (y: number) => PAD + (PLOT.yMax - y) * unit;
	const ox = sx(0);
	const oy = sy(0);

	const moveTo = (clientX: number, clientY: number) => {
		const svg = svgRef.current;
		if (!svg) return;
		const r = svg.getBoundingClientRect();
		const px = ((clientX - r.left) * W) / r.width;
		const py = ((clientY - r.top) * H) / r.height;
		const x = (px - PAD) / unit + PLOT.xMin;
		const y = PLOT.yMax - (py - PAD) / unit;
		const f = doubleQ ? Q_FACTOR : 1;
		setQ(fitQ([x / f, y / f], doubleQ));
	};
	const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragging.current = e.pointerId;
		moveTo(e.clientX, e.clientY);
	};
	const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragging.current !== e.pointerId) return;
		moveTo(e.clientX, e.clientY);
	};
	const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragging.current !== e.pointerId) return;
		dragging.current = null;
		if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
	};

	// ----- 數字輸入 -----
	const inputValue = (axis: 0 | 1) => (editing?.axis === axis ? editing.text : String(q[axis]));
	const onInput = (axis: 0 | 1, text: string) => {
		setEditing({ axis, text });
		const v = Number(text);
		if (text.trim() === '' || !Number.isFinite(v)) return;
		const next: Vec2 = axis === 0 ? [v, q[1]] : [q[0], v];
		setQ(fitQ(next, doubleQ));
	};

	const toggleDouble = () => {
		const on = !doubleQ;
		setDoubleQ(on);
		if (on) setQ((prev) => fitQ(prev, true));
	};
	const reset = () => {
		setQ(Q_START);
		setMode('dot');
		setLongK(false);
		setDoubleQ(false);
		setEditing(null);
	};

	// ----- 圖上的箭頭 -----
	const qTip: Pt = [sx(res.q[0]), sy(res.q[1])];
	const qArrow = arrowParts(qTip[0], qTip[1], ox, oy, 13);
	const clampX = (v: number) => Math.min(W - 12, Math.max(12, v));
	const clampY = (v: number) => Math.min(H - 10, Math.max(10, v));
	/** 名字放在尖端外側；超出圖的邊界時改放在箭頭上方 */
	const labelAt = (tip: Pt, u: Pt | undefined, dist: number): Pt => {
		if (!u) return [clampX(tip[0] + dist), clampY(tip[1] - dist)];
		const out: Pt = [tip[0] + u[0] * dist, tip[1] + u[1] * dist];
		if (out[0] > 12 && out[0] < W - 12 && out[1] > 10 && out[1] < H - 10) return out;
		return [clampX(tip[0] - u[0] * 6 + u[1] * dist), clampY(tip[1] - u[1] * 6 - Math.abs(u[0]) * dist)];
	};
	const keyArrows = res.keys.map((k, i) => {
		const tip: Pt = [sx(k.k[0]), sy(k.k[1])];
		const a = arrowParts(tip[0], tip[1], ox, oy, isBest(i) ? 15 : 12);
		return { tip, a, label: a ? labelAt(tip, a.u, 15) : tip };
	});
	/** q 的名字：尖端外側、左側、右側三個位置，挑離 key 的名字和尖端最遠、又在圖裡的那個 */
	const qLabelPos = (): Pt => {
		const u = qArrow?.u;
		if (!u) return labelAt(qTip, undefined, 16);
		const cands: Pt[] = [
			[qTip[0] + u[0] * 19, qTip[1] + u[1] * 19],
			[qTip[0] - u[1] * 18 - u[0] * 4, qTip[1] + u[0] * 18 - u[1] * 4],
			[qTip[0] + u[1] * 18 - u[0] * 4, qTip[1] - u[0] * 18 - u[1] * 4],
		];
		const others = keyArrows.flatMap((k) => [k.label, k.tip]);
		const score = ([x, y]: Pt) => {
			const inside = x > 12 && x < W - 12 && y > 10 && y < H - 10;
			const near = Math.min(...others.map(([ax, ay]) => Math.hypot(ax - x, ay - y)));
			return (inside ? 0 : -1000) + Math.min(near, 30); // 夠遠（30 px）就好，優先用第一個位置
		};
		let best = cands[0];
		for (const c of cands.slice(1)) if (score(c) > score(best) + 0.5) best = c;
		return best;
	};
	const bestNames = res.keys.flatMap((k, i) => (k.best ? [i] : []));

	// ----- 說明 -----
	const pctOf = (r: typeof res, i: number) => (r.keys[i].weight === null ? '—' : fmtPct(r.keys[i].weight!));
	const nameList = (idx: number[]) =>
		idx.map((i, n) => (
			<span key={i}>
				{n > 0 ? '、' : ''}
				<KName i={i} />
			</span>
		));
	const qZero = res.qNorm === 0;
	const k3 = res.keys[LONG_KEY];
	const k3base = base?.keys[LONG_KEY];
	let note: ReactNode;
	let noteClass = styles.note;
	if (!res.ok) {
		noteClass = styles.error;
		note = <>q 是零向量，沒有方向：餘弦相似度的分母 <Norm>k</Norm> × <Norm>q</Norm> 是 0，算不出來（NumPy 會得到 nan）。把 q 拖離原點，或改用內積。</>;
	} else if (qZero) {
		note = <>q 是零向量：和誰的內積都是 0，四個分數一樣，Softmax 平均分配，每支 25%。</>;
	} else if (mode === 'cos' && (longK || doubleQ)) {
		noteClass = styles.ok;
		note = (
			<>
				餘弦相似度只看方向：{longK ? <>k<sub>3</sub> 拉長 {LONG_FACTOR} 倍</> : null}
				{longK && doubleQ ? '、' : ''}
				{doubleQ ? `q 放大 ${Q_FACTOR} 倍` : ''}，分數和權重都和原本一樣（虛線框是原本的權重，剛好疊在一起）。
			</>
		);
	} else if (mode === 'dot' && longK && k3base && k3base.score !== null && k3.score !== null) {
		note = (
			<>
				k<sub>3</sub> 的方向沒變、只是變長 {LONG_FACTOR} 倍，內積就從 <span className={styles.num}>{fmtScore(k3base.score, 'dot')}</span> 變成{' '}
				<span className={styles.num}>{fmtScore(k3.score, 'dot')}</span>，權重從 {pctOf(base!, LONG_KEY)} 變成 {pctOf(res, LONG_KEY)}
				{k3.best && !k3base.best ? '，跑到第一' : ''}。
				{k3base.score > 0 ? '長的向量在內積下占便宜；' : k3base.score < 0 ? '它和 q 夾角超過 90°，拉長反而讓分數更低；' : '它和 q 垂直，拉長還是 0；'}
				換成餘弦相似度看看。
				{doubleQ ? ` q 也放大了 ${Q_FACTOR} 倍，所有分數再變 ${Q_FACTOR} 倍。` : ''}
			</>
		);
	} else if (mode === 'dot' && doubleQ && base) {
		const top = bestNames[0];
		note = (
			<>
				q 放大 {Q_FACTOR} 倍，每個分數都變 {Q_FACTOR} 倍，Softmax 變得更尖：分數最高的 <KName i={top} /> 從 {pctOf(base, top)} 變成 {pctOf(res, top)}，就像把溫度調低。
			</>
		);
	} else if (mode === 'cos') {
		note = (
			<>
				餘弦相似度只在 −1 到 1 之間，分數差距小，Softmax 之後權重比較平均。試試「把 k<sub>3</sub> 拉長 {LONG_FACTOR} 倍」或「q 放大 {Q_FACTOR} 倍」：餘弦相似度不會變。
			</>
		);
	} else {
		note = (
			<>
				分數最高的是 {nameList(bestNames)}，{bestNames.length > 1 ? `同分，各拿到 ${pctOf(res, bestNames[0])}` : `拿到 ${pctOf(res, bestNames[0])}`} 的權重。內積是正的：和 q 方向接近；0：垂直；負的：偏向相反，權重幾乎是 0。
			</>
		);
	}

	const shownSum = res.ok ? res.keys.reduce((s, k) => s + Number(fmtFixed(k.weight! * 100, 1)), 0) : 0;
	const sumDiffers = res.ok && Math.abs(shownSum - 100) > 1e-9;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="查詢向量打分數互動示範">
			<div className={styles.group}>
				<p className={styles.title}>查詢向量 q 對 4 支 key 打分數</p>
				<p className={`${styles.small} ${styles.muted}`}>
					4 支紫色的 key 固定不動。q 一開始是 (1, 1)：<KName i={0} /> 方向接近、<KName i={1} /> 垂直、<KName i={2} /> 有點像、<KName i={3} /> 方向相反。拖動藍色箭頭的尖端，或點圖上任一點（每格 0.5）。
				</p>
			</div>

			<div className={styles.row}>
				<span className={styles.small} id={`${uid}-mode`}>
					分數用
				</span>
				<div className={styles.chips} role="group" aria-labelledby={`${uid}-mode`}>
					<button type="button" className={styles.chip} aria-pressed={mode === 'dot'} onClick={() => setMode('dot')}>
						內積
					</button>
					<button type="button" className={styles.chip} aria-pressed={mode === 'cos'} onClick={() => setMode('cos')}>
						餘弦相似度
					</button>
				</div>
			</div>
			<div className={styles.chips}>
				<button type="button" className={styles.chip} aria-pressed={longK} onClick={() => setLongK((v) => !v)}>
					把 k<sub>3</sub> 拉長 {LONG_FACTOR} 倍
				</button>
				<button type="button" className={styles.chip} aria-pressed={doubleQ} onClick={toggleDouble}>
					q 放大 {Q_FACTOR} 倍
				</button>
				<button type="button" className={styles.button} onClick={reset}>
					重設
				</button>
			</div>

			<div className={styles.qsLayout}>
				<div className={styles.plotCol}>
					<div className={styles.row}>
						<span className={styles.small}>{doubleQ ? '放大前的 q =' : 'q ='}</span>
						<span className={styles.qInputs}>
							(
							<label className={styles.srOnly} htmlFor={`${uid}-x`}>
								q 的第 1 個數字（x）
							</label>
							<input
								id={`${uid}-x`}
								className={styles.input}
								type="number"
								step={0.5}
								min={bounds.xMin}
								max={bounds.xMax}
								value={inputValue(0)}
								onFocus={() => setEditing({ axis: 0, text: String(q[0]) })}
								onChange={(e) => onInput(0, e.currentTarget.value)}
								onBlur={() => setEditing(null)}
							/>
							,
							<label className={styles.srOnly} htmlFor={`${uid}-y`}>
								q 的第 2 個數字（y）
							</label>
							<input
								id={`${uid}-y`}
								className={styles.input}
								type="number"
								step={0.5}
								min={bounds.yMin}
								max={bounds.yMax}
								value={inputValue(1)}
								onFocus={() => setEditing({ axis: 1, text: String(q[1]) })}
								onChange={(e) => onInput(1, e.currentTarget.value)}
								onBlur={() => setEditing(null)}
							/>
							)
						</span>
						{doubleQ ? <span className={`${styles.small} ${styles.textQ}`}>打分數用 {qName} = {fmtVec2(res.q)}</span> : null}
					</div>
					<p className={`${styles.small} ${styles.muted}`}>
						x 從 {fmtNum(bounds.xMin)} 到 {fmtNum(bounds.xMax)}、y 從 {fmtNum(bounds.yMin)} 到 {fmtNum(bounds.yMax)}，每格 0.5；方向鍵可以微調。
					</p>
					<div className={styles.plotWrap} ref={wrapRef}>
						<svg
							ref={svgRef}
							className={styles.plot}
							viewBox={`0 0 ${W} ${H}`}
							role="img"
							aria-label={`座標圖：藍色箭頭 ${qName} = ${fmtVec2(res.q)}；紫色箭頭 ${res.keys.map((k, i) => `k${i + 1} = ${fmtVec2(k.k)}`).join('、')}。${res.ok ? (allTie ? '四個分數一樣。' : `分數最高的是 ${bestNames.map((i) => `k${i + 1}`).join('、')}。`) : ''}`}
							onPointerDown={onDown}
							onPointerMove={onMove}
							onPointerUp={onUp}
							onPointerCancel={onUp}
						>
							{GRID_X.map((g) => (
								<line key={`gx${g}`} className={styles.gridLine} x1={sx(g)} y1={sy(PLOT.yMax)} x2={sx(g)} y2={sy(PLOT.yMin)} />
							))}
							{GRID_Y.map((g) => (
								<line key={`gy${g}`} className={styles.gridLine} x1={sx(PLOT.xMin)} y1={sy(g)} x2={sx(PLOT.xMax)} y2={sy(g)} />
							))}
							<line className={styles.axisLine} x1={sx(PLOT.xMin)} y1={oy} x2={sx(PLOT.xMax)} y2={oy} />
							<line className={styles.axisLine} x1={ox} y1={sy(PLOT.yMin)} x2={ox} y2={sy(PLOT.yMax)} />
							<path className={styles.axisArrow} d={`M${sx(PLOT.xMax) + 2} ${oy} l-9 -4.5 v9 z`} />
							<path className={styles.axisArrow} d={`M${ox} ${sy(PLOT.yMax) - 2} l-4.5 9 h9 z`} />
							<text className={`${styles.axisName} ${styles.halo}`} x={sx(PLOT.xMax) - 2} y={oy + 18} textAnchor="end">
								x
							</text>
							<text className={`${styles.axisName} ${styles.halo}`} x={ox + 9} y={sy(PLOT.yMax) + 12} textAnchor="start">
								y
							</text>
							{/* 刻度數字放在圖的下緣和左緣，不和靠近座標軸的箭頭搶位置 */}
							{TICKS_X.map((t) => (
								<text key={`tx${t}`} className={`${styles.tickText} ${styles.halo}`} x={sx(t)} y={H - PAD - 4} textAnchor="middle">
									{fmtNum(t)}
								</text>
							))}
							{TICKS_Y.map((t) => (
								<text key={`ty${t}`} className={`${styles.tickText} ${styles.halo}`} x={PAD + 4} y={sy(t) + 4} textAnchor="start">
									{fmtNum(t)}
								</text>
							))}

							{/* 4 支 key */}
							{keyArrows.map(({ a }, i) => {
								if (!a) return null;
								return (
									<g key={`k${i}`} className={isBest(i) ? styles.keyBest : styles.key}>
										<line {...a.line} />
										<path d={a.head} />
									</g>
								);
							})}
							{/* 拉長前的 k₃ 尖端 */}
							{longK ? <circle className={styles.ghostKey} cx={sx(KEYS[LONG_KEY].v[0])} cy={sy(KEYS[LONG_KEY].v[1])} r={4.5} /> : null}

							{/* q：把手是箭頭尖端後面的淡色圓，箭頭畫在上面 */}
							<circle className={styles.handleHit} cx={qTip[0]} cy={qTip[1]} r={22} />
							<circle className={styles.handle} cx={qTip[0]} cy={qTip[1]} r={qArrow ? 13 : 9} />
							{qArrow ? (
								<g className={styles.query}>
									<line {...qArrow.line} />
									<path d={qArrow.head} />
								</g>
							) : null}
							{doubleQ && !qZero ? <circle className={styles.ghostQ} cx={sx(q[0])} cy={sy(q[1])} r={4.5} /> : null}
							{/* 名字最後畫，疊在所有箭頭上面 */}
							{keyArrows.map(({ a, label }, i) => {
								if (!a) return null;
								return (
									<g key={`kl${i}`} className={isBest(i) ? styles.keyBest : styles.key}>
										<text className={styles.halo} x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="central">
											k
											<tspan dy="0.3em" fontSize="0.75em">
												{i + 1}
											</tspan>
										</text>
									</g>
								);
							})}
							{(() => {
								const [lx, ly] = qLabelPos();
								return (
									<text className={`${styles.qLabel} ${styles.halo}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central">
										{qName}
									</text>
								);
							})()}
						</svg>
					</div>
					{longK || doubleQ ? <p className={`${styles.small} ${styles.muted}`}>空心小圓是拉長／放大之前的尖端。</p> : null}

				</div>

				<div className={styles.readout}>
					<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
						{qName} = {fmtVec2(res.q)}。
						{res.ok
							? `分數：${res.keys.map((k, i) => `k${i + 1} ${fmtScore(k.score!, mode)}`).join('，')}。權重：${res.keys.map((k, i) => `k${i + 1} ${fmtPct(k.weight!)}`).join('，')}。`
							: 'q 是零向量，算不出餘弦相似度。'}
					</p>
					<p className={styles.title}>{mode === 'dot' ? '內積' : '餘弦相似度'} → Softmax → 權重</p>
					<p className={`${styles.small} ${styles.muted}`}>
						{mode === 'dot' ? (
							<>每支 key 和 {qName} 對應位置相乘，再加起來。</>
						) : (
							<>
								<span className={styles.num}>cos θ =</span>{' '}
								<span className={styles.num}>
									k<sub>i</sub>·{qName} ÷ (<Norm>k<sub>i</sub></Norm> × <Norm>{qName}</Norm>)
								</span>
								，θ 是兩支箭頭的夾角。
							</>
						)}
					</p>
					<ul className={styles.keyList}>
						{res.keys.map((k, i) => {
							const terms = `${fmtFactor(k.k[0])}×${fmtFactor(res.q[0])} + ${fmtFactor(k.k[1])}×${fmtFactor(res.q[1])}`;
							const dotText = fmtFixed(k.dot, 1);
							const w = k.weight;
							const bw = base?.keys[i].weight ?? null;
							return (
								<li key={i} className={`${styles.keyCard} ${isBest(i) ? styles.keyCardBest : ''}`}>
									<p className={styles.keyHead}>
										<KName i={i} />
										<span className={styles.num}>= {fmtVec2(k.k)}</span>
										{isBest(i) ? <span className={styles.badge}>分數最高</span> : null}
									</p>
									{mode === 'dot' ? (
										<p className={styles.calcSmall}>
											<span className={styles.nowrap}>
												k<sub>{i + 1}</sub>·{qName}
											</span>{' '}
											<span className={styles.nowrap}>= {terms}</span>{' '}
											<span className={styles.nowrap}>
												= <strong>{dotText}</strong>
											</span>
										</p>
									) : k.cos === null ? (
										<p className={`${styles.calcSmall} ${styles.bad}`}>q 是零向量，算不出來</p>
									) : (
										<p className={styles.calcSmall}>
											<span className={styles.nowrap}>
												{dotText} ÷ ({fmtFixed(k.norm, 3)} × {fmtFixed(res.qNorm, 3)})
											</span>{' '}
											<span className={styles.nowrap}>
												= <strong>{fmtFixed(k.cos, 3)}</strong>
											</span>{' '}
											<span className={`${styles.nowrap} ${styles.muted}`}>（θ = {fmtFixed(k.angle!, 0)}°）</span>
										</p>
									)}
									<div className={styles.barRow}>
										<span className={styles.bar} aria-hidden="true">
											{bw !== null ? <span className={styles.barGhost} style={{ width: `${bw * 100}%` }} /> : null}
											{w !== null ? <span className={styles.barFill} style={{ width: `${w * 100}%` }} /> : null}
										</span>
										<span className={styles.pct}>{w === null ? '—' : fmtPct(w)}</span>
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			</div>

			{res.ok ? (
				<p className={`${styles.small} ${styles.muted}`}>
					權重 = Softmax(分數)：每個分數先減掉最大的分數 <span className={styles.num}>{fmtScore(res.maxScore!, mode)}</span>（數值穩定，e 的次方最大是 1，不會溢位），取 e 的次方，再除以總和；四個權重加起來是 100%
					{sumDiffers ? '（每一項四捨五入到小數點後一位，加起來可能差 0.1%）' : ''}。{base ? '虛線框是還沒拉長／放大時的權重。' : ''}
				</p>
			) : null}

			<p className={noteClass}>
				{note}
			</p>
			<p className={styles.ok}>這就是之後注意力的骨架：內積 → 分數 → Softmax → 權重。</p>
		</section>
	);
}
