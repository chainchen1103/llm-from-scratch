import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import styles from './Ep07Info.module.css';
import { textWidth } from './ep04-calc.ts';
import {
	clampK,
	fmtInt,
	isMeasured,
	K_DEFAULT,
	K_MAX,
	K_MIN,
	K_STOPS,
	kProbs,
	nearestKStop,
	nllAxisMax,
	nllText,
	nllTicks,
	numSpoken,
	parseUnits,
	PP_MIN_UNITS,
	pplStats,
	pplText,
	probText,
	probTicks,
	pText,
	SENT_TOKENS,
	SENT_UNITS,
	snapNll,
	stepUnits,
	unitsInput,
	VOCAB,
	type NumText,
} from './ep07-info.ts';

/**
 * 困惑度（工具五）：示範句「今天／天／氣／很／冷」每一步正確 token 拿到的機率。
 * 每一格一根綠色長條，長度是 −ln p（這一格的損失，nat）；虛線是平均，就是損失。
 * 困惑度 e^損失；e^(−損失) 是正確 token 機率的幾何平均，約 1/困惑度。
 * 「K 個一樣可能」：每一格的機率都是 1/K，損失是 ln K，困惑度剛好是 K。
 *
 * 橫軸是 −ln p（nat），下面另外標出對應的機率 1、0.1、0.01⋯⋯（每一大格乘 1/10）。
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

type Mode = 'sent' | 'k';

const DEFAULT_W = 560;
const LABEL_W = 54;
const PAD_R = 14;
const ROW = 36;
const BAR_H = 14;
const ROWS_TOP = 44;
const N = SENT_TOKENS.length;
const ROWS_BOTTOM = ROWS_TOP + N * ROW;
const H = ROWS_BOTTOM + 70;
const ALL_LOW = Array.from({ length: N }, () => PP_MIN_UNITS);
const ALL_ONE = Array.from({ length: N }, () => 1000);
const NO_TEXTS: (string | null)[] = Array.from({ length: N }, () => null);
const K_CHIPS: { k: number; label: string }[] = [
	{ k: 2, label: '2：公平硬幣' },
	{ k: 6, label: '6：公平骰子' },
	{ k: VOCAB, label: '151,936：什麼都沒學' },
];

const sup = (k: number) => String(k).replace('-', '−');
const same = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

/** 數字：0.174、6.58 × 10⁻⁶ */
function Num({ t }: { t: NumText }) {
	if (t.kind === 'inf') return <span className={styles.nowrap}>∞</span>;
	if (t.kind === 'plain') return <span className={styles.nowrap}>{t.text}</span>;
	return (
		<span className={styles.nowrap}>
			{t.mant} × 10<sup>{sup(t.exp)}</sup>
		</span>
	);
}

export default function PerplexityDemo() {
	const [mode, setMode] = useState<Mode>('sent');
	const [units, setUnits] = useState<number[]>(SENT_UNITS);
	const [texts, setTexts] = useState<(string | null)[]>(NO_TEXTS);
	const [k, setK] = useState(K_DEFAULT);
	const [kText, setKText] = useState<string | null>(null);
	const [active, setActive] = useState<number | null>(null);
	const [dragging, setDragging] = useState(false);
	const [W, setW] = useState(DEFAULT_W);
	const wrapRef = useRef<HTMLDivElement>(null);
	const dragId = useRef<number | null>(null);
	const dragRow = useRef(0);
	const uid = useId();
	const hintId = `${uid}-hint`;
	const presetId = `${uid}-presets`;
	const kId = `${uid}-k`;
	const kInputId = `${uid}-ki`;
	const kChipsId = `${uid}-kchips`;

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

	const kMode = mode === 'k';
	const ps = kMode ? kProbs(k) : units.map((u) => u / 1000);
	const st = pplStats(ps);
	const xMax = nllAxisMax(kMode);
	const left = LABEL_W;
	const right = W - PAD_R;
	const sx = (v: number) => left + (Math.min(v, xMax) / xMax) * (right - left);
	const meanX = sx(st.loss);
	const lossT = nllText(st.loss);
	const pplT = pplText(st.ppl);
	/** 寫在「1/…」裡的困惑度：去掉 .00（1/1,000、1/151,936），其他照原樣（1/5.76） */
	const pplInv = pplT.replace(/\.00$/, '');
	const geoT = probText(st.geo);
	const logSumT = nllText(st.logSum);

	// ----- 拖動（只有示範句模式；Pointer Events：滑鼠、觸控、觸控筆都適用） -----
	const localXY = (e: ReactPointerEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
	};
	const unitsFromX = (x: number) => snapNll(((x - left) / (right - left)) * xMax);
	const setRow = (i: number, u: number) => setUnits((prev) => prev.map((v, j) => (j === i ? u : v)));
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (kMode) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		const [x, y] = localXY(e);
		const i = Math.max(0, Math.min(N - 1, Math.floor((y - ROWS_TOP) / ROW)));
		dragRow.current = i;
		setActive(i);
		setDragging(true);
		setTexts(NO_TEXTS);
		setRow(i, unitsFromX(x));
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragId.current !== e.pointerId) return;
		const [x] = localXY(e);
		setRow(dragRow.current, unitsFromX(x));
	};
	const endDrag = () => {
		if (dragId.current === null) return;
		dragId.current = null;
		setDragging(false);
		setActive(null);
	};

	const pickSent = (u: number[]) => {
		setMode('sent');
		setTexts(NO_TEXTS);
		setUnits(u);
	};
	const pickK = (v: number) => {
		setK(clampK(v));
		setKText(null);
	};

	// ----- 座標軸 -----
	const ticks = nllTicks(kMode);
	const pTicks = probTicks(kMode);
	const pTickLabel = (exp: number): ReactNode =>
		exp >= -3 ? (
			String(10 ** exp)
		) : (
			<>
				10
				<tspan dy="-0.45em" fontSize="0.75em">
					{sup(exp)}
				</tspan>
			</>
		);

	// 平均的標籤：放在虛線正下方，太靠邊時往內收
	const meanLabel = `平均 ${lossT}`;
	const meanW = textWidth(meanLabel, 14);
	const meanLabelX = Math.max(left + meanW / 2, Math.min(right - meanW / 2, meanX));

	// ----- 說明 -----
	const pplNum = <span className={`${styles.mono} ${styles.nowrap}`}>{pplT}</span>;
	let note: ReactNode;
	if (kMode) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>{fmtInt(k)} 個一樣可能：</span>每一格的機率都是 1/{fmtInt(k)}，−ln p 都是 ln {fmtInt(k)} {k === 1 ? '=' : '≈'}{' '}
				<span className={`${styles.mono} ${styles.nowrap}`}>{lossT}</span>，平均也一樣；困惑度 e<sup>ln K</sup> 剛好是 K。
				{k === VOCAB ? '這就是什麼都沒學的模型：151,936 個 token 一樣可能，損失約 11.93 nat，困惑度 151,936。' : ''}
				{k === 2 ? '公平硬幣：像在 2 個選項之間猜。' : ''}
				{k === 6 ? '公平骰子：像在 6 個選項之間猜。' : ''}
				{k === 1 ? '只有 1 個選項：確定，困惑度最小是 1。' : ''}
			</p>
		);
	} else if (same(units, SENT_UNITS)) {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>示範句：</span>5 個條件機率連乘約 (1/5.76)<sup>5</sup>，就像每一步都從 5.76 個一樣可能的 token 裡猜中一個。只有「冷」0.293 是 EP00 實測，前四個是示範數字，所以 5.76 也只是示範。
			</p>
		);
	} else if (same(units, ALL_LOW)) {
		note = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>很有把握，卻答錯：</span>像文中那個每次都給 (0.001, 0.998, 0.001) 的模型，熵只有 0.023 bit，一點也不猶豫，正確 token 卻每次都只拿到 0.001。損失 {lossT} nat，困惑度 {pplNum}。
			</p>
		);
	} else if (same(units, ALL_ONE)) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>每一步都把機率 1 給正確 token：</span>每一格的 −ln p 都是 0，損失 0，困惑度最小是 1（完全確定，而且猜對）。
			</p>
		);
	} else {
		const minU = Math.min(...units);
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>困惑度 {pplNum}：</span>正確 token 平均（幾何平均）拿到約 1/{pplInv} 的機率，就像每一步都從 {pplT} 個一樣可能的 token 裡猜中一個。
				{minU <= 20 ? '只要有一格的機率很小，它的 −ln p 就很大，整個平均被拉高。' : ''}
			</p>
		);
	}

	const summary =
		`${kMode ? `K 個一樣可能，K = ${fmtInt(k)}` : `示範句，機率 ${units.map((u, i) => `${SENT_TOKENS[i]} ${pText(u)}`).join('、')}`}：` +
		`每一格的 −ln p ${st.nll.map(nllText).join('、')}；平均損失 ${lossT} nat，困惑度 ${pplT}，正確 token 平均拿到約 ${numSpoken(geoT)}。`;

	// 每一列：token、長條的端點、數字放右邊（放不下就放左上）
	const rows = SENT_TOKENS.map((tok, i) => {
		const yc = ROWS_TOP + i * ROW + ROW / 2;
		const xe = sx(st.nll[i]);
		const label = nllText(st.nll[i]);
		return { i, tok, yc, xe, label, tw: textWidth(tok, 15) + 14, rightSide: xe + 12 + textWidth(label, 14) <= right + PAD_R - 2, on: active === i };
	});

	const stopIdx = nearestKStop(k);
	const onStop = K_STOPS[stopIdx] === k;
	const kP = probText(1 / k);

	return (
		<section className={`not-content ${styles.demo}`} aria-label="困惑度互動示範：調一串正確 token 的機率，看損失和困惑度">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>困惑度＝有效的選項數</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`} id={hintId}>
					每一格是一個位置，數字是那一步<strong>正確 token</strong> 拿到的機率（各自獨立，不用加起來是 1）。{kMode ? '「K 個一樣可能」：每一格的機率都是 1/K，用滑桿或數字框選 K。' : '左右拖動綠色長條的端點，或在數字框輸入 0.001 到 1。'}
					困惑度量的是正確 token 平均拿到多少機率，不是模型自己有多猶豫。
				</p>
			</div>

			<div className={styles.chips} role="group" aria-labelledby={presetId}>
				<span className={styles.srOnly} id={presetId}>
					換一組機率
				</span>
				<button type="button" className={styles.chip} aria-pressed={!kMode && same(units, SENT_UNITS)} onClick={() => pickSent(SENT_UNITS)}>
					示範句
				</button>
				<button type="button" className={styles.chip} aria-pressed={!kMode && same(units, ALL_LOW)} onClick={() => pickSent(ALL_LOW)}>
					正確 token 都只拿到 0.001
				</button>
				<button type="button" className={styles.chip} aria-pressed={!kMode && same(units, ALL_ONE)} onClick={() => pickSent(ALL_ONE)}>
					都是 1
				</button>
				<button
					type="button"
					className={styles.chip}
					aria-pressed={kMode}
					onClick={() => {
						setMode('k');
						setTexts(NO_TEXTS);
					}}
				>
					K 個一樣可能
				</button>
			</div>

			{kMode ? (
				<div className={styles.group}>
					<div className={styles.sliderHeader}>
						<label className={styles.title} htmlFor={kId}>
							K = <span className={styles.value}>{fmtInt(k)}</span>
						</label>
						<span className={`${styles.muted} ${styles.small}`}>每一格的機率都是 1/K（方向鍵跳到下一格：1、2、3、4、6、10⋯⋯）</span>
					</div>
					<input
						id={kId}
						className={styles.slider}
						type="range"
						min={0}
						max={K_STOPS.length - 1}
						step={1}
						value={stopIdx}
						aria-valuetext={`K = ${fmtInt(k)}${onStop ? '' : `（最接近 ${fmtInt(K_STOPS[stopIdx])} 那一格）`}`}
						onChange={(e) => pickK(K_STOPS[Number(e.currentTarget.value)])}
					/>
					<div className={styles.scale} aria-hidden="true">
						<span>1</span>
						<span>100</span>
						<span>1 萬</span>
						<span>151,936</span>
					</div>
					<div className={styles.row}>
						<span className={styles.numField}>
							<label htmlFor={kInputId} className={styles.small}>
								或直接輸入 K（1 到 151,936）
							</label>
							<input
								id={kInputId}
								type="number"
								className={styles.num}
								inputMode="numeric"
								min={K_MIN}
								max={K_MAX}
								step={1}
								value={kText ?? String(k)}
								onChange={(e) => {
									const raw = e.currentTarget.value;
									setKText(raw);
									const v = Number(raw);
									if (raw.trim() !== '' && Number.isFinite(v)) setK(clampK(v));
								}}
								onBlur={() => setKText(null)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') setKText(null);
								}}
							/>
						</span>
						<div className={styles.chips} role="group" aria-labelledby={kChipsId}>
							<span className={styles.srOnly} id={kChipsId}>
								常見的 K
							</span>
							{K_CHIPS.map((c) => (
								<button key={c.k} type="button" className={styles.chip} aria-pressed={k === c.k} onClick={() => pickK(c.k)}>
									{c.label}
								</button>
							))}
						</div>
					</div>
				</div>
			) : null}

			<div className={styles.group}>
				<div ref={wrapRef} className={styles.plotWrap}>
					<svg
						className={`${styles.plot} ${kMode ? '' : `${styles.draggable} ${styles.dragH}`} ${dragging ? styles.grabbing : ''}`}
						viewBox={`0 0 ${W} ${H}`}
						role="img"
						aria-label={`每一格的 −ln p：${SENT_TOKENS.map((t, i) => `${t} ${nllText(st.nll[i])}`).join('、')}；虛線是平均 ${lossT}。${kMode ? '' : '左右拖動可以改機率。'}`}
						aria-describedby={hintId}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						onLostPointerCapture={endDrag}
					>
						<text className={styles.axisTitle} x={0} y={14} textAnchor="start" fontSize={13}>
							−ln p：這一格的損失（nat）
						</text>
						{ticks.map((t) => (
							<g key={`t${t}`}>
								<line className={styles.grid} x1={sx(t)} y1={ROWS_TOP - 4} x2={sx(t)} y2={ROWS_BOTTOM + 4} />
								<text className={styles.tickText} x={sx(t)} y={ROWS_TOP - 10} textAnchor="middle">
									{t}
								</text>
							</g>
						))}
						<line className={styles.axisLine} x1={left} y1={ROWS_TOP - 4} x2={left} y2={ROWS_BOTTOM + 4} />

						{rows.map((r) => (
							<g key={`bar-${r.i}`}>
								<rect className={styles.tokenRect} x={LABEL_W - 8 - r.tw} y={r.yc - 12} width={r.tw} height={24} rx={5} />
								<text className={styles.tokenText} x={LABEL_W - 8 - r.tw / 2} y={r.yc} textAnchor="middle" dominantBaseline="central" fontSize={15}>
									{r.tok}
								</text>
								<rect className={styles.nllBar} x={left} y={r.yc - BAR_H / 2} width={Math.max(0, r.xe - left)} height={BAR_H} rx={2} />
							</g>
						))}

						{/* 平均的虛線畫在長條上面、端點和數字下面 */}
						<line className={styles.meanLine} x1={meanX} y1={ROWS_TOP - 4} x2={meanX} y2={ROWS_BOTTOM + 8} />
						{rows.map((r) => (
							<g key={`dot-${r.i}`}>
								{kMode ? null : <circle className={`${styles.nllDot} ${r.on ? styles.nllDotActive : ''}`} cx={r.xe} cy={r.yc} r={r.on ? 9 : 7.5} />}
								<text
									className={`${styles.nllText} ${styles.halo}`}
									x={r.rightSide ? r.xe + 12 : r.xe - 12}
									y={r.yc - (r.rightSide ? 0 : 15)}
									textAnchor={r.rightSide ? 'start' : 'end'}
									dominantBaseline="central"
								>
									{r.label}
								</text>
							</g>
						))}
						<text className={`${styles.meanText} ${styles.halo}`} x={meanLabelX} y={ROWS_BOTTOM + 20} textAnchor="middle">
							{meanLabel}
						</text>

						<line className={styles.axisLine} x1={left} y1={ROWS_BOTTOM + 30} x2={right} y2={ROWS_BOTTOM + 30} />
						{pTicks.map((t) => (
							<g key={`p${t.exp}`}>
								<line className={styles.axisLine} x1={sx(t.x)} y1={ROWS_BOTTOM + 30} x2={sx(t.x)} y2={ROWS_BOTTOM + 35} />
								<text className={styles.tickText} x={sx(t.x)} y={ROWS_BOTTOM + 49} textAnchor="middle">
									{pTickLabel(t.exp)}
								</text>
							</g>
						))}
						<text className={styles.axisTitle} x={0} y={ROWS_BOTTOM + 49} textAnchor="start" fontSize={13}>
							機率 p
						</text>
						<text className={styles.tickText} x={right} y={ROWS_BOTTOM + 66} textAnchor="end">
							往右每一大格，機率乘 1/10
						</text>
					</svg>
				</div>

				{kMode ? (
					<p className={`${styles.small} ${styles.muted}`}>
						每一格的機率都是 1/{fmtInt(k)} ≈ <Num t={kP} />，長條一樣長。
					</p>
				) : (
					<div className={styles.cellsGrid}>
						{units.map((u, i) => {
							const id = `${uid}-p${i}`;
							const measured = isMeasured(i, u);
							return (
								<div key={`${SENT_TOKENS[i]}-${i}`} className={styles.cell}>
									<span className={styles.token}>{SENT_TOKENS[i]}</span>
									<span className={`${styles.tag} ${measured ? styles.tagMeasured : ''}`}>{measured ? 'EP00 實測' : '示範'}</span>
									<label htmlFor={id} className={styles.srOnly}>
										第 {i + 1} 格「{SENT_TOKENS[i]}」的機率
									</label>
									<input
										id={id}
										type="number"
										className={styles.pInput}
										inputMode="decimal"
										min={PP_MIN_UNITS / 1000}
										max={1}
										step={0.001}
										value={texts[i] ?? unitsInput(u)}
										onFocus={() => setActive(i)}
										onChange={(e) => {
											const raw = e.currentTarget.value;
											setTexts((t) => t.map((_, j) => (j === i ? raw : null)));
											const v = parseUnits(raw, PP_MIN_UNITS);
											if (v !== null) setRow(i, v);
										}}
										onBlur={() => {
											setTexts(NO_TEXTS);
											setActive(null);
										}}
										onKeyDown={(e) => {
											if (e.key === 'Enter') setTexts(NO_TEXTS);
											if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
												e.preventDefault();
												setTexts(NO_TEXTS);
												setRow(i, stepUnits(u, e.key === 'ArrowUp' ? 1 : -1, PP_MIN_UNITS));
											}
										}}
									/>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<div className={styles.calc}>
				<p className={styles.calcTitle}>平均損失＝ log 機率加起來、取負號、除以 {N}</p>
				<p className={styles.formula}>
					{kMode ? (
						<span>
							{N} × ln(1/{fmtInt(k)}) = {logSumT}
						</span>
					) : (
						<>
							{units.map((u, i) => (
								<span key={i}>
									{i > 0 ? '+ ' : ''}ln {pText(u)}
								</span>
							))}
							<span>= {logSumT}</span>
						</>
					)}
				</p>
				<p className={styles.formula}>
					<span>
						{logSumT === '0.000' ? '0' : `(${logSumT})`} × (−1) ÷ {N} = <strong>{lossT} nat</strong>
					</span>
				</p>
			</div>

			<div className={styles.cols}>
				<div className={styles.panel}>
					<p className={styles.panelLabel}>平均損失</p>
					<p className={`${styles.bigValue} ${styles.bigNll}`}>{lossT} nat</p>
					<p className={styles.panelSub}>綠色長條的平均（虛線）</p>
				</div>
				<div className={`${styles.panel} ${styles.panelKey}`}>
					<p className={styles.panelLabel}>
						困惑度 e<sup>損失</sup>
					</p>
					<p className={styles.bigValue}>{pplT}</p>
					<p className={styles.panelSub}>
						<span className={styles.nowrap}>
							e<sup>{lossT}</sup> ≈ {pplT}
						</span>
						{kMode ? `，剛好是 K = ${fmtInt(k)}` : '：相當於在這麼多個一樣可能的 token 之間猜'}
					</p>
				</div>
				<div className={styles.panel}>
					<p className={styles.panelLabel}>正確 token 平均拿到</p>
					<p className={styles.bigValue}>
						<Num t={geoT} />
					</p>
					<p className={styles.panelSub}>
						<span className={styles.nowrap}>
							e<sup>−{lossT}</sup> ≈ 1/{pplInv}
						</span>
						：幾何平均（{N} 個機率連乘，再開 {N} 次方根）
					</p>
				</div>
			</div>

			{note}

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>
		</section>
	);
}
