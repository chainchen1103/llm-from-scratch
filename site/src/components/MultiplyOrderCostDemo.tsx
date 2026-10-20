import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './Ep05Jacobian.module.css';
import {
	clampDepth,
	clampWidth,
	cost,
	cumulative,
	decadeRange,
	DEPTH_MAX,
	DEPTH_MIN,
	DEPTH_START,
	fmtFixed,
	fmtInt,
	fmtIntText,
	fmtRatio,
	placeLabel,
	plotFrame,
	pointBox,
	polylineBoxes,
	sci3,
	segmentBoxes,
	textWidth,
	WIDTH_CHOICES,
	WIDTH_MAX,
	WIDTH_MIN,
	WIDTH_START,
	zhApprox,
	type Box,
	type Spot,
} from './ep05-jacobian.ts';

/**
 * 同一串 Jacobian 相乘 J_loss · J_L ⋯ J₂ · J₁，兩種順序的乘法次數（每層當成一個 d × d 的方陣，J_loss 是一列）：
 * 從輸入端開始，每一步是矩陣 × 矩陣（d³ 次），共 (L − 1) × d³ + d² 次；
 * 從輸出端倒著乘，每一步是一列 × 矩陣（d² 次），共 L × d² 次。
 * 下面的對數圖是每乘一次之後累計的乘法次數；再下面是兩種做法每一步手上拿的東西。
 *
 * 數字用 BigInt 算（最多約 3.2 × 10¹²，number 也精確，但 BigInt 不用擔心）。
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 560;
const PADS = { l: 46, r: 16, t: 16, b: 40 };
const plotHeight = (w: number) => Math.round(Math.min(320, Math.max(230, w * 0.52)));
/** 手上拿的東西：畫幾格（d 比這個大時只是示意） */
const HOLD_CELLS = 12;
const HOLD_SIZE = 132;

type Pt = [number, number];

/** 科學記號（有效數字 3 位）：1.65 × 10¹⁰ */
function Sci({ n }: { n: bigint }) {
	const { mant, exp } = sci3(n);
	if (exp < 4) return <span className={styles.nowrap}>{fmtInt(n)}</span>;
	return (
		<span className={styles.nowrap}>
			{mant} × 10<sup>{exp}</sup>
		</span>
	);
}

/** 中文的大約數：（約 165 億）；1 萬以下不寫 */
function Zh({ n }: { n: bigint }) {
	const z = zhApprox(n);
	if (!z) return null;
	return <span className={styles.nowrap}>（{z.approx ? '約 ' : ''}{z.text}）</span>;
}

/** 一串 Jacobian：J_loss · J_L ⋯ J₁（層數少時全部寫出來） */
function Chain({ L }: { L: number }) {
	const J = (k: number | string) => (
		<>
			J<sub>{k}</sub>
		</>
	);
	return (
		<span className={styles.nowrap}>
			{J('loss')} · {L === 1 ? J(1) : L === 2 ? <>{J(2)} · {J(1)}</> : <>{J(L)} ⋯ {J(1)}</>}
		</span>
	);
}

/** 大數字的另外兩種寫法：≈ 1.65 × 10¹⁰（約 165 億）；1 萬以下不寫 */
function Approx({ n }: { n: bigint }) {
	if (n < BigInt(10000)) return null;
	return (
		<p className={`${styles.small} ${styles.muted}`}>
			≈ <Sci n={n} />
			<Zh n={n} />
		</p>
	);
}

/** SVG 裡的 10 的次方：1、10、10²…（上標用 tspan） */
const SvgPow10 = ({ k }: { k: number }) =>
	k === 0 ? (
		<>1</>
	) : k === 1 ? (
		<>10</>
	) : (
		<>
			10
			<tspan dy="-0.45em" fontSize="0.75em">
				{k}
			</tspan>
		</>
	);

/** 手上拿的東西：rows × cols 個格子（最多 HOLD_CELLS），寬度固定 */
function Hold({ rows, cols, kind, label }: { rows: number; cols: number; kind: 'in' | 'out'; label: string }) {
	const nc = Math.min(cols, HOLD_CELLS);
	const nr = Math.min(rows, HOLD_CELLS);
	const cell = HOLD_SIZE / nc;
	const w = HOLD_SIZE;
	const h = cell * nr;
	const cells: ReactNode[] = [];
	for (let i = 0; i < nr; i++)
		for (let j = 0; j < nc; j++) cells.push(<rect key={`${i}-${j}`} className={kind === 'in' ? styles.cellIn : styles.cellOut} x={1 + j * cell} y={1 + i * cell} width={cell} height={cell} />);
	return (
		<svg className={styles.holdSvg} width={w + 2} height={h + 2} viewBox={`0 0 ${w + 2} ${h + 2}`} role="img" aria-label={label}>
			{cells}
			<rect className={kind === 'in' ? styles.holdFrameIn : styles.holdFrameOut} x={1} y={1} width={w} height={h} />
		</svg>
	);
}

/** 寬度的數字輸入：2 到 4096 的整數；離開輸入格後格子裡改成限制後的數字 */
function WidthField({ value, onValue, id }: { value: number; onValue: (v: number) => void; id: string }) {
	const [text, setText] = useState<string | null>(null);
	return (
		<input
			id={id}
			type="number"
			className={`${styles.num} ${styles.numWide}`}
			inputMode="numeric"
			step={1}
			min={WIDTH_MIN}
			max={WIDTH_MAX}
			value={text ?? String(value)}
			onChange={(e) => {
				const raw = e.currentTarget.value;
				setText(raw);
				const v = Number(raw);
				if (raw.trim() !== '' && Number.isFinite(v)) onValue(clampWidth(v));
			}}
			onBlur={() => setText(null)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') setText(null);
			}}
		/>
	);
}

export default function MultiplyOrderCostDemo() {
	const [d, setD] = useState(WIDTH_START);
	const [L, setL] = useState(DEPTH_START);
	const [W, setW] = useState(DEFAULT_W);
	const wrapRef = useRef<HTMLDivElement>(null);
	const uid = useId();
	const clipId = `moc-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const widthId = `${uid}-width`;
	const depthId = `${uid}-depth`;

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

	const c = useMemo(() => cost(d, L), [d, L]);
	const cum = useMemo(() => cumulative(d, L), [d, L]);
	const ratio = fmtRatio(c);
	const dt = fmtInt(d);
	const d2t = fmtInt(c.d2);
	const d3t = fmtInt(c.d3);

	// ----- 對數圖：累計乘法次數 -----
	const H = plotHeight(W);
	const [lo, hi] = decadeRange(c.d2, c.fromIn);
	const view = { xMin: 0.5, xMax: L + 0.5, yMin: lo - 0.15, yMax: hi + 0.15 };
	const fr = plotFrame(W, H, view, PADS);
	const { sx, sy } = fr;
	const ptsIn: Pt[] = cum.map((s) => [sx(s.k), sy(Math.log10(s.fromIn))]);
	const ptsOut: Pt[] = cum.map((s) => [sx(s.k), sy(Math.log10(s.fromOut))]);
	const path = (pts: Pt[]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
	const stepPx = sx(2) - sx(1);
	const showDots = stepPx >= 9;
	const decades = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
	// 橫軸刻度：1，和 step 的倍數；最後一定有 L
	const step = [1, 2, 4, 6, 8, 12].find((s) => s * stepPx >= 28) ?? 12;
	const xTicks = [1];
	for (let k = step; k <= L; k += step) if ((k - xTicks[xTicks.length - 1]) * stepPx >= 26) xTicks.push(k);
	if (xTicks[xTicks.length - 1] !== L) {
		if ((L - xTicks[xTicks.length - 1]) * stepPx < 26 && xTicks.length > 1) xTicks.pop();
		xTicks.push(L);
	}

	const endIn = ptsIn[ptsIn.length - 1];
	const endOut = ptsOut[ptsOut.length - 1];
	const gapPx = endOut[1] - endIn[1];
	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 1, x1: fr.right - 2, y1: fr.bottom - 1 };
	const avoid: Box[] = [...polylineBoxes(ptsIn, 4), ...polylineBoxes(ptsOut, 4), pointBox(endIn[0], endIn[1], 7), pointBox(endOut[0], endOut[1], 7)];
	if (gapPx >= 24) avoid.push(...segmentBoxes([endIn[0], endIn[1]], [endOut[0], endOut[1]], 4));
	const gapText = `差${ratio.approx ? '約' : ''} ${ratio.text} 倍`;
	const gapLabel =
		gapPx >= 24
			? placeLabel(
					[
						{ x: endIn[0] - 10, y: (endIn[1] + endOut[1]) / 2, anchor: 'end' },
						{ x: endIn[0] - 10, y: endIn[1] + (endOut[1] - endIn[1]) * 0.35, anchor: 'end' },
						{ x: endIn[0] - 10, y: endIn[1] + (endOut[1] - endIn[1]) * 0.65, anchor: 'end' },
					],
					textWidth(gapText, 13) + 6,
					18,
					avoid,
					bounds,
				)
			: null;
	if (gapLabel) avoid.push(gapLabel.box);
	const inName = '從輸入端';
	const outName = '從輸出端';
	const nameW = textWidth(inName, 14) + 6;
	const midK = Math.max(1, Math.round(L * 0.45));
	const midIn = ptsIn[midK - 1];
	const midOut = ptsOut[midK - 1];
	const inLabel = placeLabel(
		[
			{ x: midIn[0], y: midIn[1] - 16, anchor: 'middle' },
			{ x: endIn[0] - 12, y: endIn[1] - 15, anchor: 'end' },
			{ x: ptsIn[0][0] + 6, y: ptsIn[0][1] - 16, anchor: 'start' },
			{ x: midIn[0], y: midIn[1] + 16, anchor: 'middle' },
		],
		nameW,
		18,
		avoid,
		bounds,
	);
	avoid.push(inLabel.box);
	const outLabel = placeLabel(
		[
			{ x: midOut[0], y: midOut[1] + 17, anchor: 'middle' },
			{ x: endOut[0] - 12, y: endOut[1] + 15, anchor: 'end' },
			{ x: ptsOut[0][0] + 6, y: ptsOut[0][1] + 16, anchor: 'start' },
			{ x: midOut[0], y: midOut[1] - 16, anchor: 'middle' },
		],
		nameW,
		18,
		avoid,
		bounds,
	);

	// ----- 文字 -----
	const summary = `寬度 ${dt}、${L} 層：從輸入端 ${fmtInt(c.fromIn)} 次乘法，從輸出端 ${fmtInt(c.fromOut)} 次，${ratio.approx ? '約 ' : ''}${ratio.text} 倍。`;
	const exactRatio = c.ratioExact ? fmtInt(c.fromIn / c.fromOut) : fmtIntText(fmtFixed(c.ratio, 2));
	const preset = WIDTH_CHOICES.includes(d);
	const holdNote = d > HOLD_CELLS ? `（格子只是示意，真的是 ${dt} × ${dt} 格）` : '';

	return (
		<section className={`not-content ${styles.demo}`} aria-label="兩種乘法順序的成本互動示範">
			<div className={styles.group}>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={`${uid}-wl`}>
						寬度 d
					</span>
					<div className={styles.chips} role="group" aria-labelledby={`${uid}-wl`}>
						{WIDTH_CHOICES.map((v) => (
							<button key={v} type="button" className={`${styles.chip} ${styles.chipMono}`} aria-pressed={d === v} aria-label={`寬度 ${v}${v === 896 ? '（EP00 的模型）' : ''}`} onClick={() => setD(v)}>
								{v}
							</button>
						))}
					</div>
				</div>
				<div className={styles.numRow}>
					<label htmlFor={widthId} className={styles.small}>
						或輸入 {WIDTH_MIN} 到 {fmtInt(WIDTH_MAX)} 的整數
					</label>
					<WidthField id={widthId} value={d} onValue={setD} />
					<span className={`${styles.small} ${styles.muted}`}>{d === 896 ? 'EP00 的 Qwen2.5-0.5B：每個 token 是 896 維向量' : preset ? '' : '自訂的寬度'}</span>
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={depthId}>
						層數 L = <span className={styles.value}>{L}</span>
					</label>
					<span className={`${styles.muted} ${styles.small}`}>拖動滑桿，或按方向鍵一次 1 層{L === 24 ? '（EP00 的模型是 24 層）' : ''}</span>
				</div>
				<input
					id={depthId}
					className={styles.slider}
					type="range"
					min={DEPTH_MIN}
					max={DEPTH_MAX}
					step={1}
					value={L}
					aria-valuetext={`${L} 層`}
					onChange={(e) => setL(clampDepth(Number(e.currentTarget.value)))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>{DEPTH_MIN}</span>
					<span>24</span>
					<span>{DEPTH_MAX}</span>
				</div>
			</div>

			<p className={`${styles.small} ${styles.muted}`}>
				損失對輸入的梯度是一長串 Jacobian 相乘：<Chain L={L} />（從右往左是{L > 1 ? `第 1 層到第 ${L} 層` : '第 1 層'}、再到損失）。每層當成一個 ({dt}, {dt}) 的方陣，J<sub>loss</sub> 是 (1, {dt}) 的一列。矩陣相乘可以決定先算哪兩個相鄰的（結合律），兩種順序算出來的梯度一樣，乘法次數差很多。
			</p>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.readoutCols}>
				<div className={`${styles.costCard} ${styles.costIn}`}>
					<p className={styles.costHead}>
						<span className={styles.costName}>從輸入端開始</span>
						<span className={`${styles.small} ${styles.muted}`}>
							{L > 1 ? (
								<>
									先算 J<sub>2</sub> J<sub>1</sub>，再一路往左乘
								</>
							) : (
								<>只有 J<sub>1</sub>：直接算 J<sub>loss</sub> J<sub>1</sub></>
							)}
						</span>
					</p>
					<p className={styles.small}>
						每一步是<span className={styles.tagWord}>矩陣 × 矩陣</span>：({dt}, {dt}) @ ({dt}, {dt}) 是 d³ = <span className={`${styles.mono} ${styles.nowrap}`}>{d3t}</span> 次
						<Zh n={c.d3} />
					</p>
					<p className={`${styles.small} ${styles.muted}`}>
						{L > 1 ? (
							<>
								共 {L - 1} 次矩陣 × 矩陣（J<sub>1</sub> 不用乘），最後一次一列 × 矩陣：
							</>
						) : (
							'只有最後一次一列 × 矩陣：'
						)}
					</p>
					<div className={styles.rhs}>
						<span>(L − 1) × d³ + d²</span>
					</div>
					<div className={styles.rhs}>
						<span>
							= {L - 1} × {d3t}
						</span>
						<span>+ {d2t}</span>
					</div>
					<p className={styles.bigNum}>
						<span className={styles.nowrap}>= {fmtInt(c.fromIn)}</span> <span className={styles.unit}>次</span>
					</p>
					<Approx n={c.fromIn} />
				</div>

				<div className={`${styles.costCard} ${styles.costOut}`}>
					<p className={styles.costHead}>
						<span className={styles.costName}>從輸出端倒著乘</span>
						<span className={`${styles.small} ${styles.muted}`}>
							先算 J<sub>loss</sub> J<sub>{L}</sub>，再一路往右乘
						</span>
					</p>
					<p className={styles.small}>
						每一步是<span className={styles.tagWord}>一列 × 矩陣</span>：(1, {dt}) @ ({dt}, {dt}) 是 d² = <span className={`${styles.mono} ${styles.nowrap}`}>{d2t}</span> 次
						<Zh n={c.d2} />
					</p>
					<p className={`${styles.small} ${styles.muted}`}>共 {L} 次一列 × 矩陣：</p>
					<div className={styles.rhs}>
						<span>L × d²</span>
					</div>
					<div className={styles.rhs}>
						<span>
							= {L} × {d2t}
						</span>
					</div>
					<p className={styles.bigNum}>
						<span className={styles.nowrap}>= {fmtInt(c.fromOut)}</span> <span className={styles.unit}>次</span>
					</p>
					<Approx n={c.fromOut} />
				</div>
			</div>

			<div className={styles.ratioBox}>
				<p className={styles.small}>
					<span className={styles.tagWord}>從輸入端的乘法次數是從輸出端的</span>
				</p>
				<p>
					<span className={styles.ratioNum}>
						{ratio.approx ? '約 ' : ''}
						<span className={styles.ratioDigits}>{ratio.text}</span> 倍
					</span>
				</p>
				<p className={`${styles.small} ${styles.muted}`}>
					{fmtInt(c.fromIn)} ÷ {fmtInt(c.fromOut)} = ((L − 1) × d + 1) ÷ L = ({L - 1} × {dt} + 1) ÷ {L} {c.ratioExact ? '=' : '≈'} {exactRatio}
					{L > 1 ? '：層數越多，越接近寬度 d。' : '。'}
				</p>
				<p className={styles.small}>
					<span className={styles.tagWord}>粗估</span>（每層各乘一次）：L × d³ = <span className={`${styles.mono} ${styles.nowrap}`}>{fmtInt(c.roughIn)}</span> 對 L × d² = <span className={`${styles.mono} ${styles.nowrap}`}>{fmtInt(c.roughOut)}</span>，剛好差 d = {dt} 倍。
				</p>
				{L === 1 ? (
					<p className={styles.plain}>只有 1 層時，兩種順序都只是一次一列 × 矩陣，一樣多（粗估把每層都算成 d³，在這裡不準）。</p>
				) : null}
			</div>

			<div className={styles.plotWide} ref={wrapRef}>
				<p className={styles.title}>每乘一次之後，累計的乘法次數</p>
				<p className={`${styles.small} ${styles.muted}`}>縱軸是對數刻度：往上一格多 10 倍。從輸入端每一步加 d³，從輸出端每一步只加 d²，兩條線一直差 d 倍左右。</p>
				<svg
					className={styles.plot}
					viewBox={`0 0 ${W} ${H}`}
					role="img"
					aria-label={`對數刻度的圖：橫軸是第幾次相乘（1 到 ${L}），縱軸是累計乘法次數。灰色線是從輸入端，最後 ${fmtInt(c.fromIn)} 次；珊瑚色線是從輸出端，最後 ${fmtInt(c.fromOut)} 次，${gapText}。`}
				>
					<defs>
						<clipPath id={clipId}>
							<rect x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
						</clipPath>
					</defs>
					{decades.map((k) => (
						<g key={k}>
							<line className={styles.grid} x1={fr.left} y1={sy(k)} x2={fr.right} y2={sy(k)} />
							<text className={styles.tickText} x={fr.left - 6} y={sy(k) + 4.5} textAnchor="end">
								<SvgPow10 k={k} />
							</text>
						</g>
					))}
					{xTicks.map((k) => (
						<g key={k}>
							<line className={styles.grid} x1={sx(k)} y1={fr.top} x2={sx(k)} y2={fr.bottom} />
							<text className={styles.tickText} x={sx(k)} y={fr.bottom + 17} textAnchor="middle">
								{k}
							</text>
						</g>
					))}
					<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
					<text className={styles.tickText} x={(fr.left + fr.right) / 2} y={fr.bottom + 35} textAnchor="middle">
						第幾次相乘
					</text>

					<g clipPath={`url(#${clipId})`}>
						<path className={styles.lineIn} d={path(ptsIn)} />
						<path className={styles.lineOut} d={path(ptsOut)} />
					</g>
					{showDots
						? cum.map((s, i) => (
								<g key={s.k}>
									<circle className={styles.dotIn} cx={ptsIn[i][0]} cy={ptsIn[i][1]} r={3.25} />
									<circle className={styles.dotOut} cx={ptsOut[i][0]} cy={ptsOut[i][1]} r={3.25} />
								</g>
							))
						: null}
					<circle className={styles.dotIn} cx={endIn[0]} cy={endIn[1]} r={5} />
					<circle className={styles.dotOut} cx={endOut[0]} cy={endOut[1]} r={5} />

					{/* 最後的差距：上下兩個箭頭 */}
					{gapPx >= 24 ? (
						<g>
							<line className={styles.gapArrow} x1={endIn[0]} y1={endIn[1] + 8} x2={endOut[0]} y2={endOut[1] - 8} />
							<path className={styles.gapHead} d={`M${endIn[0]} ${endIn[1] + 6} l-4 8 h8 z`} />
							<path className={styles.gapHead} d={`M${endOut[0]} ${endOut[1] - 6} l-4 -8 h8 z`} />
						</g>
					) : null}
					{gapLabel ? (
						<text className={`${styles.gapText} ${styles.halo}`} x={gapLabel.spot.x} y={gapLabel.spot.y} textAnchor={gapLabel.spot.anchor} dominantBaseline="central">
							{gapText}
						</text>
					) : null}
					<text className={`${styles.lineInText} ${styles.halo}`} x={inLabel.spot.x} y={inLabel.spot.y} textAnchor={inLabel.spot.anchor as Spot['anchor']} dominantBaseline="central">
						{inName}
					</text>
					<text className={`${styles.lineOutText} ${styles.halo}`} x={outLabel.spot.x} y={outLabel.spot.y} textAnchor={outLabel.spot.anchor} dominantBaseline="central">
						{outName}
					</text>
				</svg>
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={styles.swIn} />
						從輸入端：每一步 + d³ = {d3t}
					</span>
					<span className={styles.legendItem}>
						<span className={styles.swOut} />
						從輸出端：每一步 + d² = {d2t}
					</span>
				</div>
			</div>

			<div className={styles.group}>
				<p className={styles.title}>每一步手上拿的東西</p>
				<div className={styles.holds}>
					<div className={styles.hold}>
						<div className={styles.holdFig}>
							<Hold rows={d} cols={d} kind="in" label={`${dt} × ${dt} 的矩陣`} />
						</div>
						<p className={styles.small}>
							<span className={styles.inText}>從輸入端</span>：一整個 {dt} × {dt} 的矩陣，<span className={styles.nowrap}>{d2t} 個數</span>
							。「這一層的每個數字對每個輸入的影響」。
						</p>
					</div>
					<div className={styles.hold}>
						<div className={styles.holdFig}>
							<Hold rows={1} cols={d} kind="out" label={`一列 ${dt} 個數`} />
						</div>
						<p className={styles.small}>
							<span className={styles.predText}>從輸出端</span>：只是一列，<span className={styles.nowrap}>{dt} 個數</span>。「損失對這一層每個數字的影響」。
						</p>
					</div>
				</div>
				{holdNote ? <p className={`${styles.small} ${styles.muted}`}>{holdNote}</p> : null}
			</div>

			<p className={styles.note}>
				<span className={styles.tagWord}>這只是示意：</span>真實模型的一層不只一個方陣（注意力、前饋網路裡都有好幾個線性層），實作上也不把 Jacobian 建出來。但「倒著乘，每一步只拿著一列」不變。
			</p>
		</section>
	);
}
