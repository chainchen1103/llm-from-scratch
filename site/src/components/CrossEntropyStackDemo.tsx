import { Fragment, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import styles from './Ep07Loss.module.css';
import { plotFrame, textWidth } from './ep04-calc.ts';
import {
	COUNTS,
	fmtFixed,
	gradStep,
	H_DATA,
	inUnit,
	isStart,
	klGone,
	lossText,
	numSpoken,
	P_HAT,
	P_HAT_TEXT,
	pplText,
	probText,
	Q_MAX,
	Q_MIN,
	roundingGap,
	snapQ,
	snapQInput,
	stackState,
	stackTicks,
	stepQ,
	STACK_MAX_NAT,
	STEP_SIZE,
	TOKENS,
	withProb,
	Z_DIGITS,
	Z_START,
	type NumText,
	type Unit,
} from './ep07-loss.ts';

/**
 * 交叉熵＝熵＋KL 散度（本集重點）。
 * 資料固定是 EP06 的玩具資料（冷 5、熱 2、好 3），比例 p̂ = (0.5, 0.2, 0.3)；模型的 q 是三個分數 z 經 Softmax。
 * 左邊比較 p̂ 和 q 的長條（q 可以拖），右邊是堆疊長條：下層是熵 H(p̂)（固定），上層是 KL 散度，整根是交叉熵 H(p̂, q)。
 * 「用負梯度走一步」把 z 換成 z − 1.0 × (q − p̂)，步伐固定為 1，數字和本集的表一樣。
 *
 * 拖動一個 q 時，另外兩個照原本的比例縮放、加起來維持 1；在 Softmax 裡這等於只改那個 token 的分數。
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 320;
const plotHeight = (w: number) => Math.round(Math.min(250, Math.max(220, w * 0.66)));
const sup = (k: number) => String(k).replace('-', '−');
const UNITS: Unit[] = ['nat', 'bit'];

/** 數字：1.0598、4.54 × 10⁻⁵、∞ */
function Num({ t }: { t: NumText }) {
	if (t.kind === 'inf') return <span className={styles.nowrap}>∞</span>;
	if (t.kind === 'plain') return <span className={styles.nowrap}>{t.text}</span>;
	return (
		<span className={styles.nowrap}>
			{t.mant} × 10<sup>{sup(t.exp)}</sup>
		</span>
	);
}

/** SVG 裡的寫法（上標用 tspan） */
function SvgNum({ t }: { t: NumText }) {
	if (t.kind === 'inf') return <>∞</>;
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

const numWidthText = (t: NumText) => (t.kind === 'inf' ? '∞' : t.kind === 'plain' ? t.text : `${t.mant} × 10${sup(t.exp)}`);

/** (a, b, c)：每一格可以是科學記號；太窄時在逗號後面折行 */
function Tuple({ ts }: { ts: NumText[] }) {
	return (
		<span className={styles.tuple}>
			(
			{ts.map((t, i) => (
				<Fragment key={i}>
					{i > 0 ? ', ' : null}
					<Num t={t} />
				</Fragment>
			))}
			)
		</span>
	);
}

/** p̂（HTML）：p 上面戴帽子 */
const Hat = () => <span className={styles.hat}>p</span>;

/** 上一步的虛線：和現在差太少（畫出來疊在一起）或超出圖的上緣時不畫，圖例也不放 */
const prevVisible = (prevCe: number | null, ce: number): prevCe is number => prevCe !== null && prevCe <= STACK_MAX_NAT && Math.abs(prevCe - ce) > 0.005;

/** 一組數字寫成 (a, b, c) */
const tuple = (xs: string[]) => `(${xs.join(', ')})`;
const zFmt = (v: number) => fmtFixed(v, Z_DIGITS);

/** 量一個元素的實際寬度 */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
	const ref = useRef<T>(null);
	const [w, setW] = useState(DEFAULT_W);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const update = () => {
			const v = Math.round(el.getBoundingClientRect().width);
			if (v > 0) setW(v);
		};
		update();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, w];
}

// ---------- 左邊：p̂ 和 q 的長條（q 可以拖） ----------

type BarsProps = {
	width: number;
	q: number[];
	z: number[];
	label: string;
	describedBy: string;
	onPick: (i: number, v: number) => void;
};

function ProbBars({ width, q, z, label, describedBy, onPick }: BarsProps) {
	const [drag, setDrag] = useState<number | null>(null);
	const dragId = useRef<number | null>(null);
	const H = plotHeight(width);
	const fr = plotFrame(width, H, { xMin: 0, xMax: 3, yMin: 0, yMax: 1 }, { l: 30, r: 4, t: 24, b: 46 });
	const { sx, sy } = fr;
	const gw = sx(1) - sx(0);
	const bw = Math.min(32, gw * 0.3);
	const gap = 4;

	// ----- 拖動（Pointer Events：滑鼠、觸控、觸控筆都適用） -----
	const local = (e: ReactPointerEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return { x: (e.clientX - r.left) * (width / r.width), y: (e.clientY - r.top) * (H / r.height) };
	};
	const valueAt = (py: number) => snapQ((fr.bottom - py) / (fr.bottom - fr.top));
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const { x, y } = local(e);
		const i = Math.max(0, Math.min(2, Math.floor((x - fr.left) / gw)));
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		setDrag(i);
		onPick(i, valueAt(y));
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragId.current !== e.pointerId || drag === null) return;
		onPick(drag, valueAt(local(e).y));
	};
	const endDrag = () => {
		dragId.current = null;
		setDrag(null);
	};

	return (
		<svg
			className={`${styles.plot} ${styles.draggable} ${drag !== null ? styles.grabbing : ''}`}
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
			{Array.from({ length: 11 }, (_, k) => k / 10).map((g) => (
				<line key={g} className={g === 0.5 || g === 1 ? styles.grid : styles.gridMinor} x1={fr.left} y1={sy(g)} x2={fr.right} y2={sy(g)} />
			))}
			{[0, 0.5, 1].map((t) => (
				<text key={t} className={styles.tickText} x={fr.left - 6} y={sy(t) + 4} textAnchor="end">
					{String(t)}
				</text>
			))}
			<line className={styles.axisLine} x1={fr.left} y1={fr.bottom} x2={fr.right} y2={fr.bottom} />
			{TOKENS.map((tok, i) => {
				const cx = sx(i + 0.5);
				const px = cx - gap / 2 - bw;
				const qx = cx + gap / 2;
				const qy = sy(q[i]);
				const qt = probText(q[i]);
				const active = drag === i;
				return (
					<g key={tok}>
						<rect className={styles.barData} x={px} y={sy(P_HAT[i])} width={bw} height={fr.bottom - sy(P_HAT[i])} />
						<rect className={styles.barModel} x={qx} y={qy} width={bw} height={Math.max(0, fr.bottom - qy)} />
						{active ? <rect className={styles.dragRing} x={qx - 5} y={qy - 7} width={bw + 10} height={14} rx={7} /> : null}
						<rect className={`${styles.grip} ${active ? styles.gripActive : ''}`} x={qx - 3} y={qy - 3.5} width={bw + 6} height={7} rx={3.5} />
						<text className={`${styles.dataText} ${styles.halo}`} x={px + bw / 2} y={sy(P_HAT[i]) - 7} textAnchor="middle" style={{ fontSize: 12.5 }}>
							{P_HAT_TEXT[i]}
						</text>
						<text className={`${styles.modelText} ${styles.halo}`} x={qx + bw / 2} y={qy - 9} textAnchor="middle" style={{ fontSize: 12.5 }}>
							<SvgNum t={qt} />
						</text>
						<text className={styles.tokenText} x={cx} y={fr.bottom + 19} textAnchor="middle">
							{tok}
						</text>
						<text className={styles.subText} x={cx} y={fr.bottom + 37} textAnchor="middle">
							z = {zFmt(z[i])}
						</text>
					</g>
				);
			})}
		</svg>
	);
}

// ---------- 右邊：堆疊長條（熵＋KL＝交叉熵） ----------

type StackProps = {
	width: number;
	unit: Unit;
	ce: number;
	kl: number;
	prevCe: number | null;
	label: string;
};

function StackBar({ width, unit, ce, kl, prevCe, label }: StackProps) {
	const H = plotHeight(width);
	const fr = plotFrame(width, H, { xMin: 0, xMax: 1, yMin: 0, yMax: STACK_MAX_NAT }, { l: 32, r: 4, t: 24, b: 46 });
	const { sy } = fr;
	const over = !(ce <= STACK_MAX_NAT);
	const ceTop = over ? STACK_MAX_NAT : ce;
	const bw = Math.min(52, Math.max(40, (fr.right - fr.left) * 0.22));
	const x0 = fr.left + 12;
	const x1 = x0 + bw;
	const yH = sy(H_DATA);
	const yCe = sy(ceTop);
	const yBase = fr.bottom;

	// 三個標籤：照高度排，彼此至少隔 19 px
	const lx = x1 + 18;
	const want = [yCe, (yCe + yH) / 2, (yH + yBase) / 2];
	const ys = [Math.max(fr.top - 6, want[0])];
	ys.push(Math.max(want[1], ys[0] + 19));
	ys.push(Math.max(want[2], ys[1] + 19));
	const shift = Math.max(0, ys[2] - (yBase - 6));
	for (let k = 0; k < 3; k++) ys[k] -= shift;

	const ceT = lossText(inUnit(ce, unit));
	const klT = lossText(inUnit(Math.max(0, kl), unit));
	const hT = lossText(inUnit(H_DATA, unit));
	const labels: { name: string; t: NumText; cls: string; anchorY: number }[] = [
		{ name: '交叉熵', t: ceT, cls: styles.labelCE, anchorY: want[0] },
		{ name: 'KL 散度', t: klT, cls: styles.labelKL, anchorY: want[1] },
		{ name: '熵', t: hT, cls: styles.labelH, anchorY: want[2] },
	];
	// 很窄的螢幕放不下時，字縮小一點（最小 11 px）
	const widest = Math.max(...labels.map((l) => textWidth(`${l.name} ${numWidthText(l.t)}`, 13)));
	const fs = Math.max(11, Math.min(13, (13 * (width - 2 - lx)) / widest));
	const ticks = stackTicks(unit);
	const showPrev = prevVisible(prevCe, ce);
	const roomInside = yBase - yH > 40;

	return (
		<svg className={styles.plot} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={label}>
			{ticks.map((t) => (
				<line key={t.label} className={styles.grid} x1={fr.left} y1={sy(t.nat)} x2={x1 + 8} y2={sy(t.nat)} />
			))}
			{ticks.map((t) => (
				<text key={`t${t.label}`} className={styles.tickText} x={fr.left - 6} y={sy(t.nat) + 4} textAnchor="end">
					{t.label}
				</text>
			))}
			<text className={styles.axisTitle} x={fr.left - 6} y={fr.top - 12} textAnchor="start" style={{ fontSize: 12.5 }}>
				{unit}
			</text>
			<line className={styles.axisLine} x1={fr.left} y1={yBase} x2={x1 + 8} y2={yBase} />

			<rect className={styles.segH} x={x0} y={yH} width={bw} height={yBase - yH} />
			{yH - yCe > 0 ? <rect className={styles.segKL} x={x0} y={yCe} width={bw} height={yH - yCe} /> : null}
			<line className={styles.ceLine} x1={x0 - 4} y1={yCe} x2={x1 + 4} y2={yCe} />
			{over ? <path className={styles.overMark} d={`M${(x0 + x1) / 2} ${fr.top - 14} l-7 10 h14 z`} /> : null}
			{showPrev ? <line className={styles.prevLine} x1={x0 - 8} y1={sy(prevCe as number)} x2={x1 + 8} y2={sy(prevCe as number)} /> : null}
			{roomInside ? (
				<text className={styles.segText} x={(x0 + x1) / 2} y={(yH + yBase) / 2 + 5} textAnchor="middle" style={{ fontSize: 12.5 }}>
					資料
				</text>
			) : null}

			{labels.map((l, k) => (
				<g key={l.name}>
					<polyline className={styles.leader} points={`${x1 + 3},${l.anchorY} ${lx - 10},${l.anchorY} ${lx - 4},${ys[k]}`} />
					<text x={lx} y={ys[k]} dominantBaseline="central" style={{ fontSize: fs }}>
						<tspan className={styles.labelName}>{l.name}</tspan>
						<tspan className={l.cls} dx="0.35em">
							<SvgNum t={l.t} />
						</tspan>
					</text>
				</g>
			))}
			<text className={styles.subText} x={(x0 + x1) / 2} y={yBase + 19} textAnchor="middle">
				損失
			</text>
		</svg>
	);
}

// ---------- 主元件 ----------

export default function CrossEntropyStackDemo() {
	const [z, setZ] = useState<number[]>(() => [...Z_START]);
	const [steps, setSteps] = useState(0);
	const [fromStart, setFromStart] = useState(true);
	const [prevCe, setPrevCe] = useState<number | null>(null);
	const [unit, setUnit] = useState<Unit>('nat');
	const [qText, setQText] = useState<(string | null)[]>([null, null, null]);
	const [barsRef, wBars] = useWidth<HTMLDivElement>();
	const [stackRef, wStack] = useWidth<HTMLDivElement>();
	const uid = useId();
	const hintId = `${uid}-hint`;
	const ruleId = `${uid}-rule`;

	const st = stackState(z);
	const ce = st.ce;
	const kl = st.kl;
	const ceT = lossText(inUnit(ce, unit));
	const hT = lossText(inUnit(H_DATA, unit));
	const klT = lossText(inUnit(Math.max(0, kl), unit));
	const pplT = pplText(st.ppl);
	const gap = roundingGap(H_DATA, Math.max(0, kl), ce, unit);
	const gone = klGone(kl);
	const qNums = st.q.map((v) => probText(v));
	const qTexts = qNums.map(numSpoken);
	const finite = Number.isFinite(ce);

	// ----- 操作 -----
	const pick = (i: number, v: number, fromInput = false) => {
		setZ((cur) => withProb(cur, i, fromInput ? snapQInput(v) : snapQ(v)));
		if (!fromInput) setQText([null, null, null]);
		setSteps(0);
		setFromStart(false);
		setPrevCe(null);
	};
	const reset = () => {
		setZ([...Z_START]);
		setSteps(0);
		setFromStart(true);
		setPrevCe(null);
		setQText([null, null, null]);
	};
	const step = () => {
		setPrevCe(ce);
		setZ((cur) => gradStep(cur));
		setSteps((s) => s + 1);
		setQText([null, null, null]);
	};

	const atStart = fromStart && steps === 0 && isStart(z);

	// ----- 說明 -----
	let note;
	if (!finite) {
		note = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>交叉熵是 ∞：</span>有一個 q 小到變成 0。資料裡會出現的 token，模型卻給它機率 0，−ln 0 是無限大（x 越靠近 0，−ln x 越大、沒有上限）。按「從 1/3 開始」重來。
			</p>
		);
	} else if (gone) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>損失降不到 0，最低是資料的熵。</span>KL 縮到 4 位小數看不出來，交叉熵停在 {ceT.kind === 'plain' ? ceT.text : ''} {unit}：q 幾乎等於資料的比例
				<span className={styles.nowrap}>
					{' '}
					<Hat /> = (0.5, 0.2, 0.3)
				</span>
				，梯度 q − <Hat /> 幾乎是 0，再走也幾乎不動。10 個位置裡冷、熱、好都有，資料本身就有不確定性，模型能壓掉的只有 KL。
			</p>
		);
	} else if (atStart) {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>從 1/3 開始：</span>三個分數都是 0，q = (1/3, 1/3, 1/3)。交叉熵比熵多出 KL {klT.kind === 'plain' ? klT.text : ''} {unit}。按「用負梯度走一步」，看 KL 怎麼縮。
			</p>
		);
	} else {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>熵那一層不動：</span>資料固定，熵 H(<Hat />) 一直是 {hT.kind === 'plain' ? hT.text : ''} {unit}；模型能改的只有 KL。q 越像 <Hat />，KL 越小。
			</p>
		);
	}

	const stepLabel = fromStart ? (
		<>
			從 1/3 開始的第 <span className={styles.stepCount}>{steps}</span> 步
		</>
	) : (
		<>
			從調過的位置走了 <span className={styles.stepCount}>{steps}</span> 步
		</>
	);

	const summary =
		`${fromStart ? `從 1/3 開始的第 ${steps} 步` : `從調過的位置走了 ${steps} 步`}：` +
		`q = ${tuple(qTexts)}，交叉熵 ${numSpoken(ceT)} ${unit}，等於熵 ${numSpoken(hT)} 加 KL 散度 ${numSpoken(klT)}，困惑度 ${numSpoken(pplT)}。` +
		(gone ? '損失降不到 0，最低是資料的熵。' : '');

	const pplBase = unit === 'nat' ? 'e' : '2';

	return (
		<section className={`not-content ${styles.demo}`} aria-label="交叉熵等於熵加 KL 散度互動示範：拖動模型的 q，或用負梯度一步一步走">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>交叉熵＝熵＋KL 散度：資料固定，只有 KL 會變</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`}>
					資料是 EP06 的 10 個 token：冷 {COUNTS[0]} 次、熱 {COUNTS[1]} 次、好 {COUNTS[2]} 次，比例 <Hat /> = (0.5, 0.2, 0.3) 固定不動。模型的 q 是三個分數 z 經 Softmax。損失就是交叉熵 H(<Hat />, q)。
				</p>
			</div>

			<fieldset className={styles.fieldset}>
				<legend className={styles.legendTitle}>單位</legend>
				<div className={styles.chips}>
					{UNITS.map((u) => (
						<label key={u} className={styles.chip}>
							<input className={styles.radio} type="radio" name={`${uid}-unit`} value={u} checked={unit === u} onChange={() => setUnit(u)} />
							<span>{u === 'nat' ? 'nat（ln）' : 'bit（log₂）'}</span>
						</label>
					))}
				</div>
			</fieldset>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.pair}>
				<div className={styles.panel}>
					<p className={styles.panelTitle}>
						資料 <Hat /> 和模型 q
					</p>
					<div ref={barsRef}>
						<ProbBars
							width={wBars}
							q={st.q}
							z={z}
							onPick={pick}
							describedBy={`${hintId} ${ruleId}`}
							label={`長條圖：冷、熱、好三個 token，資料的比例 p hat 是 0.5、0.2、0.3，模型的 q 是 ${qTexts.join('、')}。可以上下拖動 q 的長條。`}
						/>
					</div>
					<div className={styles.legend}>
						<span className={styles.legendItem}>
							<span className={`${styles.sw} ${styles.swData}`} aria-hidden="true" />
							<span>
								資料 <Hat />
								<span className={styles.dataTag}>EP06 玩具資料</span>
							</span>
						</span>
						<span className={styles.legendItem}>
							<span className={`${styles.sw} ${styles.swModel}`} aria-hidden="true" />
							<span>模型 q（可以拖）</span>
						</span>
					</div>
					<div className={styles.group}>
						<p className={styles.hint} id={hintId}>
							上下拖動藍色的 q 長條，或在格子裡輸入（方向鍵一次 0.01）：
						</p>
						<div className={styles.qInputs}>
							{TOKENS.map((tok, i) => (
								<label key={tok} className={styles.qField}>
									<span>
										q(<span className={styles.tagWord}>{tok}</span>)
									</span>
									<input
										className={styles.num}
										type="number"
										inputMode="decimal"
										min={0}
										max={1}
										step={0.001}
										value={qText[i] ?? fmtFixed(st.q[i], 3)}
										onChange={(e) => {
											const raw = e.currentTarget.value;
											setQText([0, 1, 2].map((k) => (k === i ? raw : null)));
											const v = Number(raw);
											if (raw.trim() !== '' && Number.isFinite(v)) pick(i, v, true);
										}}
										onBlur={() => setQText([null, null, null])}
										onKeyDown={(e) => {
											if (e.key === 'Enter') setQText([null, null, null]);
											if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
												// 自己算：框裡是 3 位小數（0.333），交給瀏覽器會一次只動 0.001
												e.preventDefault();
												setQText([null, null, null]);
												pick(i, stepQ(st.q[i], e.key === 'ArrowUp' ? 1 : -1), true);
											}
										}}
									/>
								</label>
							))}
						</div>
						<p className={`${styles.xs} ${styles.muted} ${styles.pretty}`} id={ruleId}>
							規則：拖動或輸入一個 q 時，另外兩個照原本的比例縮放，三個加起來維持 1（範圍 {Q_MIN} 到 {Q_MAX}）。這等於只改那個 token 的分數 z，另外兩個分數不動。
						</p>
					</div>
				</div>
				<div className={styles.panel}>
					<p className={styles.panelTitle}>
						損失＝交叉熵 H(<Hat />, q)
					</p>
					<div ref={stackRef}>
						<StackBar
							width={wStack}
							unit={unit}
							ce={ce}
							kl={kl}
							prevCe={prevCe}
							label={`堆疊長條：下層是熵 ${numSpoken(hT)} ${unit}，上層是 KL 散度 ${numSpoken(klT)} ${unit}，整根是交叉熵 ${numSpoken(ceT)} ${unit}。`}
						/>
					</div>
					<div className={styles.legend}>
						<span className={styles.legendItem}>
							<span className={`${styles.sw} ${styles.swData}`} aria-hidden="true" />
							<span>熵：資料本身的不確定性（不會變）</span>
						</span>
						<span className={styles.legendItem}>
							<span className={`${styles.sw} ${styles.swKL}`} aria-hidden="true" />
							<span>KL：模型猜錯多付的部分</span>
						</span>
						{!(ce <= STACK_MAX_NAT) ? (
							<span className={styles.legendItem}>
								<span className={`${styles.sw} ${styles.swOver}`} aria-hidden="true" />
								<span>交叉熵超出圖的範圍，長條只畫到上緣</span>
							</span>
						) : null}
						{prevVisible(prevCe, ce) ? (
							<span className={styles.legendItem}>
								<span className={`${styles.sw} ${styles.swPrev}`} aria-hidden="true" />
								<span>虛線：上一步的交叉熵</span>
							</span>
						) : null}
					</div>
					<div className={styles.train}>
						<div className={styles.chips}>
							<button type="button" className={styles.chip} onClick={reset}>
								從 1/3 開始
							</button>
							<button type="button" className={`${styles.chip} ${styles.action}`} onClick={step} disabled={!finite}>
								用負梯度走一步
							</button>
						</div>
						<p className={styles.small}>{stepLabel}</p>
						<p className={`${styles.xs} ${styles.muted} ${styles.pretty}`}>
							每一步：z 換成 z − {STEP_SIZE.toFixed(1)} × (q − <Hat />)。步伐固定為 1；一步該走多遠是 EP08 的事。
						</p>
					</div>
				</div>
			</div>

			<div className={styles.cols}>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>交叉熵＝熵＋KL（{unit}）</p>
					<p className={styles.deriv}>
						<span>
							<span className={styles.ceName}>H(<Hat />, q)</span> =
						</span>
						<span>
							<span className={styles.hName}>H(<Hat />)</span> +
						</span>
						<span className={styles.klName}>
							D(<Hat /> ‖ q)
						</span>
					</p>
					<p className={styles.deriv}>
						<span className={`${styles.result} ${styles.big}`}>
							<Num t={ceT} />
						</span>
						<span>=</span>
						<span className={styles.hName}>
							<Num t={hT} />
						</span>
						<span>+</span>
						<span className={styles.klName}>
							<Num t={klT} />
						</span>
					</p>
					{gap !== null ? (
						<p className={styles.derivNote}>
							各自四捨五入到 4 位小數：{hT.kind === 'plain' ? hT.text : ''} + {klT.kind === 'plain' ? klT.text : ''} = {gap}，和 {ceT.kind === 'plain' ? ceT.text : ''} 差在最後一位。
						</p>
					) : null}
					<p className={styles.deriv}>
						<span>困惑度 =</span>
						<span>
							{pplBase}
							<sup>{ceT.kind === 'plain' ? ceT.text : '∞'}</sup> =
						</span>
						<span className={`${styles.result} ${styles.big}`}>
							<Num t={pplT} />
						</span>
					</p>
					<p className={styles.derivNote}>
						最低是 {pplBase}
						<sup>{hT.kind === 'plain' ? hT.text : ''}</sup> = {fmtFixed(Math.exp(H_DATA), 3)}（q = <Hat /> 時）；{unit === 'nat' ? '換成 bit 是 2 的次方，結果一樣。' : '用 nat 是 e 的次方，結果一樣。'}
					</p>
				</div>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>分數 z 與下一步</p>
					<p className={styles.deriv}>
						<span>z =</span>
						<Tuple ts={st.z.map((v) => ({ kind: 'plain', text: zFmt(v) }))} />
					</p>
					<p className={styles.deriv}>
						<span className={styles.qName}>q = Softmax(z) =</span>
						<Tuple ts={qNums} />
					</p>
					<p className={styles.deriv}>
						<span>梯度 q − <Hat /> =</span>
						<Tuple ts={st.grad.map((v) => ({ kind: 'plain', text: zFmt(v) }))} />
					</p>
					<p className={styles.deriv}>
						<span>下一步的 z =</span>
						<Tuple ts={st.next.map((v) => ({ kind: 'plain', text: zFmt(v) }))} />
					</p>
					<p className={styles.derivNote}>
						q 比 <Hat /> 大的 token，分數被往下壓；比 <Hat /> 小的，被往上推。三個梯度加起來是 0，所以 z 的總和不變。
					</p>
				</div>
			</div>

			{note}
		</section>
	);
}
