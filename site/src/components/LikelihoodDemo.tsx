import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import styles from './Ep06Coin.module.css';
import { placeLabel, plotFrame, pointBox, polylineBoxes, textWidth, toPath, type Box, type Spot } from './ep04-calc.ts';
import {
	binom,
	clampLkK,
	clampLkN,
	countHeads,
	fmtFixed,
	fmtInt,
	fmtP,
	hatOnGrid,
	hatSnap,
	likAxis,
	likCurve,
	likelihood,
	likShort,
	likText,
	LK_K_DEFAULT,
	LK_N_DEFAULT,
	LK_N_MAX,
	LK_N_MIN,
	logAxis,
	logCurve,
	logLikelihood,
	logShort,
	logText,
	P_DEFAULT,
	P_STEP,
	pHat,
	shuffleFlips,
	slopeSide,
	snapP,
	spreadFlips,
	likTextExact,
	logTextExact,
	pIndex,
	type NumText,
	type Ticks,
} from './ep06-coin.ts';

/**
 * 概似函數（工具四）：資料是丟 n 次、k 次正面的某一串，拖動參數 p，
 * 左邊看 L(p) = p^k (1 − p)^(n−k)（這一串照這個順序丟出來的機率），右邊看 log L(p) = k ln p + (n − k) ln(1 − p)。
 * 兩張圖的最大值都在 p̂ = k/n（珊瑚色虛線）：取 log 之後，山頂的位置不變。
 * 全部正面（或全部反面）時，最大值在端點 p = 1（或 0）；另一端 L = 0、log L = −∞。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

type Pt = [number, number];
type Kind = 'lik' | 'log';

const DEFAULT_W = 320;
const plotHeight = (w: number) => Math.round(Math.min(290, Math.max(220, w * 0.72)));
const X_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const X_GRID = Array.from({ length: 11 }, (_, i) => i / 10);
const PRESETS: { n: number; k: number; label: string }[] = [
	{ n: 10, k: 7, label: '本集的資料：10 次、7 次正面' },
	{ n: 3, k: 3, label: '3 次都是正面' },
	{ n: 30, k: 21, label: '30 次、21 次正面' },
];
/** 一排超過這麼多次時，正、反畫小一點 */
const SMALL_FLIPS = 15;

const sup = (k: number) => String(k).replace('-', '−');

/** 數字：0.0022235661、7.50141 × 10⁻⁵、−∞ */
function Num({ t }: { t: NumText }) {
	if (t.kind === 'neginf') return <span className={styles.nowrap}>−∞</span>;
	if (t.kind === 'plain') return <span className={styles.nowrap}>{t.text}</span>;
	return (
		<span className={styles.nowrap}>
			{t.mant} × 10<sup>{sup(t.exp)}</sup>
		</span>
	);
}

/** SVG 裡的寫法（上標用 tspan） */
function SvgNum({ t }: { t: NumText }) {
	if (t.kind === 'neginf') return <>−∞</>;
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

const numWidthText = (t: NumText) => (t.kind === 'neginf' ? '−∞' : t.kind === 'plain' ? t.text : `${t.mant} × 10${sup(t.exp)}`);

/** 給螢幕閱讀器念的：7.50141 乘 10 的負 5 次方、負無限大 */
const numSpoken = (t: NumText) =>
	t.kind === 'neginf' ? '負無限大' : t.kind === 'plain' ? t.text : `${t.mant} 乘 10 的 ${t.exp < 0 ? `負 ${-t.exp}` : t.exp} 次方`;

/** p̂（HTML）：p 上面戴帽子 */
const Hat = () => <span className={styles.hat}>p</span>;

/** 次方：b⁷；次方是 1 時不寫 */
const Pow = ({ b, e }: { b: ReactNode; e: number }) => (
	<>
		{b}
		{e === 1 ? null : <sup>{e}</sup>}
	</>
);

type PlotProps = {
	kind: Kind;
	width: number;
	p: number;
	hat: number;
	curve: Pt[];
	ticks: Ticks;
	/** 目前的 p 的值（精確算的） */
	value: number;
	label: string;
	describedBy: string;
	onPick: (p: number) => void;
};

/** 一張座標圖：L(p) 或 log L(p)。點一下或拖動，p 就移到那裡 */
function CurvePlot({ kind, width, p, hat, curve, ticks, value, label, describedBy, onPick }: PlotProps) {
	const [dragging, setDragging] = useState(false);
	const dragId = useRef<number | null>(null);
	const uid = useId();
	const clipId = `lk-clip-${kind}-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const isLik = kind === 'lik';

	const H = plotHeight(width);
	const labelW = Math.max(...ticks.labels.map((l) => textWidth(l, 12.5)));
	const pads = { l: Math.max(30, Math.ceil(labelW) + 12), r: 12, t: 28, b: 40 };
	const span = ticks.hi - ticks.lo;
	const view = { xMin: -0.03, xMax: 1.03, yMin: ticks.lo - (isLik ? 0.04 : 0.02) * span, yMax: ticks.hi + 0.02 * span };
	const fr = plotFrame(width, H, view, pads);
	const { sx, sy } = fr;
	const path = toPath(curve, fr);

	// ----- 拖動（Pointer Events：滑鼠、觸控、觸控筆都適用） -----
	const toLocalX = (e: ReactPointerEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return (e.clientX - r.left) * (width / r.width);
	};
	const pick = (px: number) => onPick(snapP(fr.fromX(px)));
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		setDragging(true);
		pick(toLocalX(e));
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragId.current !== e.pointerId) return;
		pick(toLocalX(e));
	};
	const endDrag = () => {
		dragId.current = null;
		setDragging(false);
	};

	// ----- 目前的點、p̂ 的虛線 -----
	const inf = value === -Infinity;
	const cx = sx(p);
	const cy = inf ? fr.bottom : sy(value);
	const hx = sx(hat);
	const short = isLik ? likShort(value) : logShort(value);

	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 2, x1: fr.right - 2, y1: fr.bottom - 2 };
	const screen = curve.map(([x, y]) => [sx(x), sy(y)] as Pt).filter(([, y]) => y >= fr.top - 20 && y <= fr.bottom + 20);
	const avoid: Box[] = [...polylineBoxes(screen, 4), pointBox(cx, cy, 10), { x0: hx - 2, y0: fr.top, x1: hx + 2, y1: fr.bottom }, { x0: cx - 1.5, y0: fr.top, x1: cx + 1.5, y1: fr.bottom }];

	const hatText = '最大值';
	const hatW = textWidth(hatText, 13) + 6;
	const hatLab = placeLabel(
		[
			{ x: hx + 6, y: fr.bottom - 11, anchor: 'start' },
			{ x: hx - 6, y: fr.bottom - 11, anchor: 'end' },
			{ x: hx + 6, y: fr.top + 11, anchor: 'start' },
			{ x: hx - 6, y: fr.top + 11, anchor: 'end' },
			{ x: hx + 6, y: fr.bottom - 27, anchor: 'start' },
			{ x: hx - 6, y: fr.bottom - 27, anchor: 'end' },
		],
		hatW,
		16,
		avoid,
		bounds,
	);
	avoid.push(hatLab.box);

	const valW = textWidth(numWidthText(short), 13.5) + 6;
	const valCands: Spot[] = inf
		? [
				{ x: cx + 12, y: fr.bottom - 14, anchor: 'start' },
				{ x: cx - 12, y: fr.bottom - 14, anchor: 'end' },
				{ x: cx + 12, y: fr.bottom - 30, anchor: 'start' },
				{ x: cx - 12, y: fr.bottom - 30, anchor: 'end' },
			]
		: [
				{ x: cx + 10, y: cy - 15, anchor: 'start' },
				{ x: cx - 10, y: cy - 15, anchor: 'end' },
				{ x: cx + 10, y: cy + 15, anchor: 'start' },
				{ x: cx - 10, y: cy + 15, anchor: 'end' },
				{ x: cx + 12, y: cy, anchor: 'start' },
				{ x: cx - 12, y: cy, anchor: 'end' },
				{ x: cx + 12, y: cy - 30, anchor: 'start' },
				{ x: cx - 12, y: cy - 30, anchor: 'end' },
				{ x: cx + 12, y: cy + 30, anchor: 'start' },
				{ x: cx - 12, y: cy + 30, anchor: 'end' },
			];
	const valLab = placeLabel(valCands, valW, 18, avoid, bounds);

	const yTitle = isLik ? 'L(p)' : 'log L(p)';

	return (
		<svg
			className={`${styles.plot} ${styles.draggable} ${dragging ? styles.grabbing : ''}`}
			viewBox={`0 0 ${width} ${H}`}
			role="img"
			aria-label={label}
			aria-describedby={describedBy}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onLostPointerCapture={endDrag}
		>
			<defs>
				<clipPath id={clipId}>
					<rect x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
				</clipPath>
			</defs>

			{X_GRID.map((g, i) => (
				<line key={`gx${i}`} className={i % 2 === 0 ? styles.grid : styles.gridMinor} x1={sx(g)} y1={fr.top} x2={sx(g)} y2={fr.bottom} />
			))}
			{ticks.values.map((t) => (
				<line key={`gy${t}`} className={styles.grid} x1={fr.left} y1={sy(t)} x2={fr.right} y2={sy(t)} />
			))}
			<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
			{X_TICKS.map((t) => (
				<text key={`tx${t}`} className={styles.tickText} x={sx(t)} y={fr.bottom + 17} textAnchor="middle">
					{String(t)}
				</text>
			))}
			{ticks.values.map((t, i) => (
				<text key={`ty${t}`} className={styles.tickText} x={fr.left - 6} y={sy(t) + 4.5} textAnchor="end">
					{ticks.labels[i]}
				</text>
			))}
			<text className={styles.axisTitle} x={fr.left} y={fr.top - 10} textAnchor="start">
				{yTitle}
				{ticks.factorExp !== null ? (
					<>
						{'（× 10'}
						<tspan dy="-0.45em" fontSize="0.75em">
							{sup(ticks.factorExp)}
						</tspan>
						<tspan dy="0.45em">）</tspan>
					</>
				) : null}
			</text>
			<text className={styles.axisTitle} x={(fr.left + fr.right) / 2} y={fr.bottom + 35} textAnchor="middle" fontStyle="italic">
				p
			</text>

			<line className={styles.cursor} x1={cx} y1={fr.top} x2={cx} y2={fr.bottom} />
			<line className={styles.refLine} x1={hx} y1={fr.top} x2={hx} y2={fr.bottom} />
			<g clipPath={`url(#${clipId})`}>
				<path className={`${styles.curve} ${isLik ? '' : styles.curveLog}`} d={path} />
			</g>
			<text className={`${styles.refText} ${styles.halo}`} x={hatLab.spot.x} y={hatLab.spot.y} textAnchor={hatLab.spot.anchor} dominantBaseline="central" fontSize={13}>
				{hatText}
			</text>

			{dragging ? <circle className={styles.ring} cx={cx} cy={cy} r={12} /> : null}
			{inf ? (
				<path className={styles.infMark} d={`M${cx} ${fr.bottom + 1} l-7 -11 h14 z`} />
			) : (
				<circle className={`${styles.dot} ${isLik ? '' : styles.dotLog}`} cx={cx} cy={cy} r={6} />
			)}
			<text className={`${styles.dotText} ${isLik ? '' : styles.dotTextLog} ${styles.halo}`} x={valLab.spot.x} y={valLab.spot.y} textAnchor={valLab.spot.anchor} dominantBaseline="central" fontSize={13.5}>
				<SvgNum t={short} />
			</text>
		</svg>
	);
}

export default function LikelihoodDemo() {
	const [n, setN] = useState(LK_N_DEFAULT);
	const [k, setK] = useState(LK_K_DEFAULT);
	const [seq, setSeq] = useState(() => spreadFlips(LK_N_DEFAULT, LK_K_DEFAULT));
	const [round, setRound] = useState(0);
	const [shuffled, setShuffled] = useState(false);
	const [p, setP] = useState(P_DEFAULT);
	const [pText, setPText] = useState<string | null>(null);
	const [wL, setWL] = useState(DEFAULT_W);
	const [wG, setWG] = useState(DEFAULT_W);
	const lRef = useRef<HTMLDivElement>(null);
	const gRef = useRef<HTMLDivElement>(null);
	const uid = useId();
	const nId = `${uid}-n`;
	const kId = `${uid}-k`;
	const pId = `${uid}-p`;
	const pInputId = `${uid}-pi`;
	const hintId = `${uid}-hint`;
	const presetId = `${uid}-presets`;
	const stripId = `${uid}-strip`;

	// 量兩張圖的實際寬度
	useEffect(() => {
		const pairs: [HTMLDivElement | null, (w: number) => void][] = [
			[lRef.current, setWL],
			[gRef.current, setWG],
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

	// ----- 改變資料 -----
	const setData = (nn: number, kk: number) => {
		const n2 = clampLkN(nn);
		const k2 = clampLkK(kk, n2);
		setN(n2);
		setK(k2);
		setSeq(spreadFlips(n2, k2));
		setShuffled(false);
	};
	const reorder = () => {
		const res = shuffleFlips(seq, round);
		setSeq(res.seq);
		setRound(res.round + 1);
		setShuffled(true);
	};
	const pickP = (v: number) => {
		setP(snapP(v));
		setPText(null);
	};

	// ----- 計算 -----
	const hat = pHat(k, n);
	const L = likelihood(p, k, n);
	const G = logLikelihood(p, k, n);
	const Lhat = likelihood(hat, k, n);
	const Ghat = logLikelihood(hat, k, n);
	const Lt = likText(L);
	const Gt = logText(G);
	const LhatT = likText(Lhat);
	const GhatT = logText(Ghat);
	const lEq = likTextExact(pIndex(p), 100, k, n, Lt) ? '=' : '≈';
	const gEq = logTextExact(G) ? '=' : '≈';
	const lhEq = likTextExact(k, n, k, n, LhatT) ? '=' : '≈';
	const ghEq = logTextExact(Ghat) ? '=' : '≈';
	const tails = n - k;
	const side = slopeSide(p, k, n);
	const grid = hatOnGrid(k, n);
	const hatText = fmtFixed(hat, 4);
	const hatEq = (k * 10000) % n === 0 ? '=' : '≈';
	const atHat = p === hatSnap(k, n) && grid;
	const pt = fmtP(p);
	const qt = fmtP(1 - p);
	const arrangements = binom(n, k);
	const heads = countHeads(seq);

	const lCurve = useMemo(() => likCurve(k, n), [k, n]);
	const gCurve = useMemo(() => logCurve(k, n), [k, n]);
	const lTicks = useMemo(() => likAxis(k, n), [k, n]);
	const gTicks = useMemo(() => logAxis(k, n), [k, n]);

	// ----- 算式 -----
	const lFormula = (
		<>
			{k > 0 ? <Pow b={<span className={styles.var}>p</span>} e={k} /> : null}
			{k > 0 && tails > 0 ? ' ' : null}
			{tails > 0 ? (
				<Pow
					b={
						<>
							(1 − <span className={styles.var}>p</span>)
						</>
					}
					e={tails}
				/>
			) : null}
		</>
	);
	const lSubst = (
		<>
			{k > 0 ? <Pow b={pt} e={k} /> : null}
			{k > 0 && tails > 0 ? ' × ' : null}
			{tails > 0 ? <Pow b={qt} e={tails} /> : null}
		</>
	);
	const coef = (c: number) => (c === 1 ? '' : `${c} `);
	const gFormula = (
		<>
			{k > 0 ? (
				<>
					{coef(k)}ln <span className={styles.var}>p</span>
				</>
			) : null}
			{k > 0 && tails > 0 ? ' + ' : null}
			{tails > 0 ? (
				<>
					{coef(tails)}ln(1 − <span className={styles.var}>p</span>)
				</>
			) : null}
		</>
	);
	const lnArg = (s: string) => (s === '0.00' ? '0' : s);
	const gSubstParts = [k > 0 ? `= ${coef(k)}ln ${lnArg(pt)}` : '', tails > 0 ? `${k > 0 ? '+' : '='} ${coef(tails)}ln ${lnArg(qt)}` : ''].filter((s) => s !== '');
	const plainFormula = `${k > 0 ? `p${k === 1 ? '' : `^${k}`}` : ''}${k > 0 && tails > 0 ? ' ' : ''}${tails > 0 ? `(1 − p)${tails === 1 ? '' : `^${tails}`}` : ''}`;

	// ----- 說明 -----
	const allHeads = k === n;
	const allTails = k === 0;
	let sideNote: ReactNode;
	if (side === 0) sideNote = <span className={`${styles.status} ${styles.statusTop}`}>山頂：L 最大</span>;
	else if (side > 0) sideNote = <span className={`${styles.status} ${styles.statusSide}`}>在山頂左邊：往右，L 變大</span>;
	else sideNote = <span className={`${styles.status} ${styles.statusSide}`}>在山頂右邊：往左，L 變大</span>;

	let edgeNote: ReactNode = null;
	if (allHeads || allTails) {
		const end = allHeads ? 1 : 0;
		const other = allHeads ? 0 : 1;
		edgeNote = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>
					全部是{allHeads ? '正面' : '反面'}：最大值在端點 p = {end}。
				</span>
				L(p) = <Pow b={allHeads ? <span className={styles.var}>p</span> : <>(1 − <span className={styles.var}>p</span>)</>} e={n} /> 一路{allHeads ? '上坡' : '下坡'}，在 p = {end} 時 L = 1、log L = 0，所以 <Hat /> = {k} / {n} = {end}。另一端 p = {other} 時 L = 0，log L = ln 0：x 越靠近 0，ln x 越往下掉、沒有下限，所以寫成 −∞。只看到{allHeads ? '正面' : '反面'}，最大概似估計就說「{allHeads ? '反面' : '正面'}不可能」（弄壞它 4）。
			</p>
		);
	} else if (G === -Infinity) {
		edgeNote = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>
					p = {p === 0 ? 0 : 1}：這一串裡有{p === 0 ? '正面' : '反面'}，它的機率卻是 0。
				</span>
				這時 L = 0、log L = ln 0：x 越靠近 0，ln x 越往下掉、沒有下限，所以寫成 −∞。
			</p>
		);
	}

	const summary = `p = ${pt}：L = ${numSpoken(Lt)}，log L = ${numSpoken(Gt)}。資料是 ${n} 次裡 ${k} 次正面，最大值在 p hat = ${hatText}。`;
	const presetOn = (pr: { n: number; k: number }) => pr.n === n && pr.k === k;
	const smallFlips = n > SMALL_FLIPS;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="概似函數互動示範：拖動 p，看 L(p) 與 log L(p)">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>哪個 p 最能解釋這份資料？</p>
				<p className={`${styles.small} ${styles.muted}`}>
					資料固定：丟 n 次、k 次正面的一串。把 p 換來換去，看這份資料的機率 L(p)（概似函數）和它的 log。
				</p>
			</div>

			<div className={styles.group}>
				<p className={styles.title} id={presetId}>
					資料
				</p>
				<div className={styles.chips} role="group" aria-labelledby={presetId}>
					{PRESETS.map((pr) => (
						<button key={pr.label} type="button" className={styles.chip} aria-pressed={presetOn(pr)} onClick={() => setData(pr.n, pr.k)}>
							{pr.label}
						</button>
					))}
				</div>
				<div className={styles.sliderPair}>
					<div className={styles.group}>
						<label className={styles.small} htmlFor={nId}>
							丟的次數 n = <span className={styles.value}>{n}</span>
						</label>
						<input id={nId} className={styles.slider} type="range" min={LK_N_MIN} max={LK_N_MAX} step={1} value={n} aria-valuetext={`丟 ${n} 次`} onChange={(e) => setData(Number(e.currentTarget.value), k)} />
					</div>
					<div className={styles.group}>
						<label className={styles.small} htmlFor={kId}>
							正面的次數 k = <span className={styles.value}>{k}</span>
						</label>
						<input id={kId} className={styles.slider} type="range" min={0} max={n} step={1} value={k} aria-valuetext={`${k} 次正面、${tails} 次反面`} onChange={(e) => setData(n, Number(e.currentTarget.value))} />
					</div>
				</div>
			</div>

			<div className={styles.group}>
				<p className={styles.small} id={stripId}>
					這一串：<span className={styles.tagWord}>{k} 次正面、{tails} 次反面</span>。每個正面乘 p、每個反面乘 1 − p，全部乘起來就是 <span className={styles.nowrap}>L(p) = {lFormula}</span>。
				</p>
				<ol className={styles.flips} aria-labelledby={stripId}>
					{seq.map((f, i) => (
						<li key={i} className={`${styles.flip} ${smallFlips ? styles.flipSmall : ''} ${f === 1 ? styles.flipHead : ''}`} aria-label={`第 ${i + 1} 次：${f === 1 ? '正面' : '反面'}`}>
							{f === 1 ? '正' : '反'}
						</li>
					))}
				</ol>
				<div className={styles.numRow}>
					<button type="button" className={styles.chip} disabled={k === 0 || k === n} onClick={reorder}>
						換一種順序
					</button>
					<span className={`${styles.small} ${styles.muted}`}>
						{k === 0 || k === n
							? '全部一樣，只有一種順序。'
							: shuffled
								? `順序換了，還是 ${heads} 次正面：L(p) 和 log L(p) 一模一樣。`
								: '只看有幾次正面，順序不影響 L(p)：乘法的順序可以對調。'}
					</span>
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={pId}>
						參數 <span className={styles.var}>p</span> = <span className={styles.value}>{pt}</span>
					</label>
					<span className={`${styles.muted} ${styles.small}`}>拖動滑桿或圖，或按方向鍵一次 0.01</span>
				</div>
				<input
					id={pId}
					className={styles.slider}
					type="range"
					min={0}
					max={1}
					step={P_STEP}
					value={p}
					aria-valuetext={`p = ${pt}，L = ${numSpoken(Lt)}，log L = ${numSpoken(Gt)}`}
					onChange={(e) => pickP(Number(e.currentTarget.value))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>0</span>
					<span>0.5</span>
					<span>1</span>
				</div>
				<div className={styles.numRow}>
					<label htmlFor={pInputId} className={styles.small}>
						或直接輸入 p（0 到 1）
					</label>
					<input
						id={pInputId}
						type="number"
						className={`${styles.num} ${styles.numNarrow}`}
						inputMode="decimal"
						min={0}
						max={1}
						step={P_STEP}
						value={pText ?? pt}
						onChange={(e) => {
							const raw = e.currentTarget.value;
							setPText(raw);
							const v = Number(raw);
							if (raw.trim() !== '' && Number.isFinite(v)) setP(snapP(v));
						}}
						onBlur={() => setPText(null)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') setPText(null);
						}}
					/>
					<button type="button" className={styles.chip} aria-pressed={atHat} onClick={() => pickP(hatSnap(k, n))}>
						{grid ? (
							<>
								跳到最大值 <Hat />
							</>
						) : (
							<>
								跳到最大值 <Hat /> 附近
							</>
						)}
					</button>
				</div>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.pair}>
				<div className={styles.panel}>
					<p className={styles.panelTitle}>
						<span className={styles.curveName}>概似函數</span>
						<span className={styles.panelFormula}>L(p) = {lFormula}</span>
					</p>
					<div ref={lRef}>
						<CurvePlot
							kind="lik"
							width={wL}
							p={p}
							hat={hat}
							curve={lCurve}
							ticks={lTicks}
							value={L}
							describedBy={hintId}
							onPick={pickP}
							label={`L(p) = ${plainFormula} 的圖，p 從 0 到 1。最大值在 p hat = ${hatText}，L = ${numSpoken(LhatT)}。目前 p = ${pt}，L = ${numSpoken(Lt)}。`}
						/>
					</div>
				</div>
				<div className={styles.panel}>
					<p className={styles.panelTitle}>
						<span className={styles.logName}>log 概似</span>
						<span className={styles.panelFormula}>log L(p) = {gFormula}</span>
					</p>
					<div ref={gRef}>
						<CurvePlot
							kind="log"
							width={wG}
							p={p}
							hat={hat}
							curve={gCurve}
							ticks={gTicks}
							value={G}
							describedBy={hintId}
							onPick={pickP}
							label={`log L(p) 的圖，p 從 0 到 1，越靠近端點越往下掉。最大值在同一個 p hat = ${hatText}，log L = ${numSpoken(GhatT)}。目前 p = ${pt}，log L = ${numSpoken(Gt)}。`}
						/>
					</div>
				</div>
			</div>
			<div className={styles.legend}>
				<span className={styles.legendItem}>
					<span className={styles.swRef} aria-hidden="true" />
					<span>
						<Hat /> = k / n {hatEq} {hatText}：兩張圖的山頂在同一個 p（ln 是遞增函數）
					</span>
				</span>
			</div>
			<p className={styles.hint} id={hintId}>
				在任一張圖上點一下或左右拖動，就是改變 p。
			</p>

			<div className={styles.cols}>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>目前 p = {pt}</p>
					<p className={styles.deriv}>
						<span className={styles.curveName}>L({pt})</span>
						<span>= {lSubst}</span>
						<span>
							{lEq}{' '}
							<span className={`${styles.result} ${styles.big}`}>
								<Num t={Lt} />
							</span>
						</span>
					</p>
					<p className={styles.deriv}>
						<span className={styles.logName}>log L({pt})</span>
						{gSubstParts.map((s, i) => (
							<span key={i}>{s}</span>
						))}
						<span>
							{gEq}{' '}
							<span className={`${styles.result} ${styles.big}`}>
								<Num t={Gt} />
							</span>
						</span>
					</p>
					{sideNote}
				</div>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>
						最大值：<Hat /> = k / n = {k} / {n} {hatEq} {hatText}
					</p>
					<div className={styles.kv}>
						<span className={`${styles.kvName} ${styles.curveName}`}>
							L(<Hat />)
						</span>
						<span className={styles.kvValue}>
							{lhEq} <Num t={LhatT} />
						</span>
						<span className={`${styles.kvName} ${styles.logName}`}>
							log L(<Hat />)
						</span>
						<span className={styles.kvValue}>
							{ghEq} <Num t={GhatT} />
						</span>
					</div>
					{!grid ? (
						<p className={`${styles.small} ${styles.muted}`}>
							{k} / {n} 不是 0.01 的倍數，p 停不到這裡；最接近的是 {fmtP(hatSnap(k, n))}。
						</p>
					) : null}
				</div>
			</div>

			{edgeNote}

			<p className={styles.note}>
				<span className={styles.tagWord}>這是照這個順序丟出這一串的機率；</span>不管順序要再乘一個和 p 無關的排法數
				{arrangements > 1 ? `（${k} 正 ${tails} 反有 ${fmtInt(arrangements)} 種），整條曲線只是放大 ${fmtInt(arrangements)} 倍` : `（全部${k === n ? '正面' : '反面'}只有 1 種排法）`}，最大值的位置不變。
			</p>
		</section>
	);
}
