import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import styles from './Ep07Info.module.css';
import {
	entropyView,
	isUniform,
	numSpoken,
	P4_UNITS,
	parseUnits,
	PRESETS4,
	pText,
	questions,
	redistribute,
	snapDrag4,
	stepUnits,
	sureIndex,
	surpText,
	TOKENS4,
	unitsInput,
	type NumText,
	type Unit,
} from './ep07-info.ts';

/**
 * 驚訝程度與熵（工具二）：下一個 token 只有 4 種可能（冷、熱、晴、暖），拖動每一根長條的高度（機率）。
 * 每個 token 下面是它的驚訝程度 −log₂ p（p 是 ½ 的次方時，就是要問幾題）；p = 0 是 ∞（不會發生），不算進熵。
 * 下面的長條把每一項 p × (−log p) 接起來，總長就是熵；長條的全長是均勻時的最大值 log 4。
 * 拖動一個機率時，其他幾個照開始拖那一刻的比例分剩下的機率，加起來一直是 1。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 560;
const PADS = { l: 38, r: 6, t: 28, b: 4 };
const plotHeight = (w: number) => Math.round(Math.min(200, Math.max(160, w * 0.36)));
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
const Y_LABELS = ['0', '0.25', '0.5', '0.75', '1'];
const NO_TEXTS: (string | null)[] = [null, null, null, null];

const logName = (unit: Unit) => (unit === 'bit' ? '−log₂ p' : '−ln p');
const maxName = (unit: Unit) => (unit === 'bit' ? 'log₂ 4' : 'ln 4');

/** 驚訝程度：1.000 或 ∞ */
function Surp({ t }: { t: NumText }) {
	if (t.kind === 'inf') return <span className={`${styles.surp} ${styles.surpInf}`}>∞</span>;
	return <span className={styles.surp}>{t.kind === 'plain' ? t.text : ''}</span>;
}

const sameUnits = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

export default function SurpriseEntropyDemo() {
	const [units, setUnits] = useState<number[]>(P4_UNITS);
	const [unit, setUnit] = useState<Unit>('bit');
	const [texts, setTexts] = useState<(string | null)[]>(NO_TEXTS);
	const [active, setActive] = useState<number | null>(null);
	const [dragging, setDragging] = useState(false);
	const [W, setW] = useState(DEFAULT_W);
	const wrapRef = useRef<HTMLDivElement>(null);
	const dragId = useRef<number | null>(null);
	const dragCol = useRef(0);
	/** 開始拖（或開始輸入）那一刻的機率：其他幾個照這時候的比例分 */
	const base = useRef<{ i: number; units: number[] } | null>(null);
	const uid = useId();
	const hintId = `${uid}-hint`;
	const presetId = `${uid}-presets`;
	const unitLabelId = `${uid}-unit`;

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

	const H = plotHeight(W);
	const left = PADS.l;
	const right = W - PADS.r;
	const top = PADS.t;
	const bottom = H - PADS.b;
	const colW = (right - left) / 4;
	const barW = Math.min(64, colW * 0.56);
	const sy = (p: number) => top + (1 - p) * (bottom - top);
	const cx = (i: number) => left + (i + 0.5) * colW;

	const setProb = (i: number, v: number) => {
		const b = base.current && base.current.i === i ? base.current.units : units;
		setUnits(redistribute(b, i, v));
	};

	// ----- 拖動（Pointer Events：滑鼠、觸控、觸控筆都適用） -----
	const localXY = (e: ReactPointerEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
	};
	const pFromY = (y: number) => snapDrag4((bottom - y) / (bottom - top));
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		const [x, y] = localXY(e);
		const i = Math.max(0, Math.min(3, Math.floor((x - left) / colW)));
		dragCol.current = i;
		base.current = { i, units };
		setActive(i);
		setDragging(true);
		setTexts(NO_TEXTS);
		setUnits(redistribute(units, i, pFromY(y)));
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragId.current !== e.pointerId || !base.current) return;
		const [, y] = localXY(e);
		setUnits(redistribute(base.current.units, dragCol.current, pFromY(y)));
	};
	const endDrag = () => {
		if (dragId.current === null) return;
		dragId.current = null;
		setDragging(false);
		setActive(null);
	};

	const pickPreset = (u: number[]) => {
		base.current = null;
		setTexts(NO_TEXTS);
		setUnits(u);
	};

	// ----- 熵 -----
	const ev = entropyView(units, unit);
	const sure = sureIndex(units);
	const uniform = isUniform(units);
	const zeros = units.map((u, i) => (u === 0 ? i : -1)).filter((i) => i >= 0);
	const surps = units.map((u) => surpText(u, unit));
	const lname = logName(unit);

	// 每一項接起來的長條：位置用「最大值」當全長
	const trackW = Math.max(1, W - 32);
	let acc = 0;
	const segs = units.map((u, i) => {
		const t = ev.terms[i];
		const leftPct = (acc / ev.max) * 100;
		const w = t === null ? 0 : t / ev.max;
		acc += t ?? 0;
		return { i, u, leftPct, widthPct: w * 100, px: w * trackW };
	});

	// 算式：H = 0.500 × 1.000 + …
	const termNodes: ReactNode[] = [];
	units.forEach((u, i) => {
		if (i > 0) termNodes.push(<span key={`p${i}`}>+</span>);
		const s = surps[i];
		termNodes.push(
			u === 0 ? (
				<span key={`t${i}`} className={styles.termSkip}>
					{TOKENS4[i]} 0 × ∞（不算）
				</span>
			) : (
				<span key={`t${i}`}>
					<span className={styles.termName}>{TOKENS4[i]}</span> {pText(u)} × {s.kind === 'plain' ? s.text : '∞'}
				</span>
			),
		);
	});
	const shownTerms = ev.termTexts.filter((t): t is string => t !== null);

	// ----- 說明 -----
	const ul = unit;
	let note: ReactNode;
	if (sure >= 0) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>一定是「{TOKENS4[sure]}」：</span>熵是 0，不用問。其他 token 的驚訝程度是 ∞（機率 0 的事真的發生了，會無限驚訝），但它們不會發生：0 × log 0 當成 0，不算進熵。
			</p>
		);
	} else if (uniform) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>均勻分佈：</span>4 個一樣可能，熵最大，是 {maxName(unit)} = {ev.maxText} {ul}
				{unit === 'bit' ? '：每個都要問 2 題' : ''}。熵量的是不確定性，越平越大。
			</p>
		);
	} else if (zeros.length > 0) {
		const names = zeros.map((i) => `「${TOKENS4[i]}」`).join('、');
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>{names}的機率是 0：</span>
				{lname} 是 ∞（不會發生的事真的發生了，會無限驚訝）。但它不會發生，這一項當成 0（0 × log 0 當成 0），不算進熵：多一個不可能的選項，猜謎不會變難。
			</p>
		);
	} else if (sameUnits(units, P4_UNITS)) {
		note = (
			<p className={styles.plain}>
				{unit === 'bit' ? (
					<>
						<span className={styles.tagWord}>常見的先問：</span>冷要問 1 題、熱 2 題、晴和暖 3 題，用機率加權平均是 1.75 題，比 4 個一樣可能的 2 題少。
					</>
				) : (
					<>
						<span className={styles.tagWord}>換成 nat：</span>只是單位不同，每個數都乘上 ln 2 ≈ 0.693，熵 1.75 bit 就是 1.2130 nat。
					</>
				)}
			</p>
		);
	} else if (Math.max(...units) >= 900) {
		const big = units.indexOf(Math.max(...units));
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>很集中：</span>「{TOKENS4[big]}」幾乎一定發生，驚訝程度很小；其他 token 雖然一出現就很驚訝，但很少發生，乘上機率後只占一點點。熵 {ev.hText} {ul}，離最大值很遠。
			</p>
		);
	} else {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>熵＝驚訝程度的平均：</span>每個 token 的 {lname} 用機率加權平均。分佈越平越大（最大是均勻的 {ev.maxText} {ul}），越集中越小（最小是 0）。
			</p>
		);
	}

	const summary =
		`機率 ${units.map((u, i) => `${TOKENS4[i]} ${pText(u)}`).join('、')}；` +
		`驚訝程度 ${surps.map((s, i) => `${TOKENS4[i]} ${numSpoken(s)}`).join('、')}（${ul}）；` +
		`熵 ${ev.hText} ${ul}，最大 ${ev.maxText} ${ul}。`;

	const presetOn = (u: number[]) => sameUnits(units, u);

	return (
		<section className={`not-content ${styles.demo}`} aria-label="驚訝程度與熵互動示範：拖動 4 個 token 的機率">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>
					4 個 token 的驚訝程度與熵<span className={styles.demoTag}>示範</span>
				</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`} id={hintId}>
					下一個 token 只有冷、熱、晴、暖 4 種可能。上下拖動長條，或在數字框輸入機率：
					<strong>其他三個照原本的比例分剩下的機率（原本都是 0 就平分），加起來一直是 1。</strong>
				</p>
			</div>

			<div className={styles.group}>
				<div className={styles.chips} role="group" aria-labelledby={presetId}>
					<span className={styles.srOnly} id={presetId}>
						換一組機率
					</span>
					{PRESETS4.map((pr) => (
						<button key={pr.key} type="button" className={styles.chip} aria-pressed={presetOn(pr.units)} onClick={() => pickPreset(pr.units)}>
							{pr.label}
						</button>
					))}
				</div>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={unitLabelId}>
						單位
					</span>
					<div className={styles.chips} role="group" aria-labelledby={unitLabelId}>
						<button type="button" className={styles.chip} aria-pressed={unit === 'bit'} onClick={() => setUnit('bit')}>
							bit（log₂）
						</button>
						<button type="button" className={styles.chip} aria-pressed={unit === 'nat'} onClick={() => setUnit('nat')}>
							nat（ln）
						</button>
					</div>
				</div>
			</div>

			<div className={styles.group}>
				<div ref={wrapRef} className={styles.plotWrap}>
					<svg
						className={`${styles.plot} ${styles.draggable} ${styles.dragV} ${dragging ? styles.grabbing : ''}`}
						viewBox={`0 0 ${W} ${H}`}
						role="img"
						aria-label={`4 個 token 的機率長條：${units.map((u, i) => `${TOKENS4[i]} ${pText(u)}`).join('、')}。上下拖動可以改機率。`}
						aria-describedby={hintId}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						onLostPointerCapture={endDrag}
					>
						<text className={styles.axisTitle} x={0} y={13} textAnchor="start" fontSize={13}>
							機率 p
						</text>
						{Y_TICKS.map((t, k) => (
							<g key={t}>
								<line className={styles.grid} x1={left} y1={sy(t)} x2={right} y2={sy(t)} />
								<text className={styles.tickText} x={left - 6} y={sy(t) + 4.5} textAnchor="end">
									{Y_LABELS[k]}
								</text>
							</g>
						))}
						<line className={styles.axisLine} x1={left} y1={bottom} x2={right} y2={bottom} />
						{units.map((u, i) => {
							const p = u / 1000;
							const x = cx(i);
							const on = active === i;
							return (
								<g key={TOKENS4[i]}>
									{u > 0 ? (
										<>
											<rect className={`${styles.pBar} ${on ? styles.pBarActive : ''}`} x={x - barW / 2} y={sy(p)} width={barW} height={Math.max(0, bottom - sy(p))} rx={3} />
											<rect className={`${styles.grip} ${on ? styles.gripActive : ''}`} x={x - barW * 0.3} y={sy(p) - 3} width={barW * 0.6} height={6} rx={3} />
										</>
									) : (
										<line className={styles.zeroLine} x1={x - barW / 2} y1={bottom - 1} x2={x + barW / 2} y2={bottom - 1} />
									)}
									<text className={`${styles.pText} ${styles.halo}`} x={x} y={sy(p) - 10} textAnchor="middle">
										{pText(u)}
									</text>
								</g>
							);
						})}
					</svg>
				</div>

				<div className={styles.colsGrid} style={{ paddingInlineStart: `${left}px`, paddingInlineEnd: `${PADS.r}px` } as CSSProperties}>
					{units.map((u, i) => {
						const q = unit === 'bit' ? questions(u) : null;
						const id = `${uid}-p${i}`;
						return (
							<div key={TOKENS4[i]} className={styles.col}>
								<span className={styles.token}>{TOKENS4[i]}</span>
								<label htmlFor={id} className={styles.srOnly}>
									「{TOKENS4[i]}」的機率
								</label>
								<input
									id={id}
									type="number"
									className={styles.pInput}
									inputMode="decimal"
									min={0}
									max={1}
									step={0.001}
									value={texts[i] ?? unitsInput(u)}
									onFocus={() => {
										base.current = { i, units };
										setActive(i);
									}}
									onChange={(e) => {
										const raw = e.currentTarget.value;
										setTexts((t) => t.map((_, j) => (j === i ? raw : null)));
										const v = parseUnits(raw);
										if (v !== null) setProb(i, v);
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
											setProb(i, stepUnits(u, e.key === 'ArrowUp' ? 1 : -1));
										}
									}}
								/>
								<span className={styles.surpLabel} aria-hidden="true">
									{lname}
								</span>
								<Surp t={surps[i]} />
								<span className={styles.surpNote}>{u === 0 ? '不會發生' : q === null ? '' : q === 0 ? '不用問' : `要問 ${q} 題`}</span>
							</div>
						);
					})}
				</div>
				<p className={styles.colLegend}>
					數字框是機率 p（方向鍵一次加減 0.01）；下面是驚訝程度 {lname}（{ul}）
					{unit === 'bit' ? '，p 是 ½ 的次方時，就是要問幾題' : ''}。
				</p>
			</div>

			<div className={styles.hPanel}>
				<div className={styles.hHead}>
					<p className={styles.title}>熵 H(p)：驚訝程度的期望值</p>
					<p className={styles.hValue}>
						{ev.hText} {ul}
					</p>
				</div>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`}>
					每個 token 的驚訝程度乘上它的機率，接起來。虛線框的全長是均勻時的最大值 {maxName(unit)}。
				</p>
				<div className={styles.hTrack} role="img" aria-label={`熵 ${ev.hText} ${ul}，最大 ${ev.maxText} ${ul}，還差 ${ev.gapText} ${ul}`}>
					{segs.map((s) =>
						s.widthPct > 0 ? (
							<span key={s.i} className={styles.seg} style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%` }}>
								{s.px >= 26 ? TOKENS4[s.i] : ''}
							</span>
						) : null,
					)}
				</div>
				<div className={styles.hScale}>
					<span>0</span>
					<span className={styles.hScaleMax}>
						最大 {maxName(unit)} = {ev.maxText} {ul}（均勻）
					</span>
				</div>
				<p className={styles.formula} aria-label="熵的算式">
					<span>H =</span>
					{termNodes}
				</p>
				<p className={styles.formula}>
					<span>=</span>
					{shownTerms.length > 1 ? (
						<>
							{shownTerms.map((t, k) => (
								<span key={k}>
									{k > 0 ? '+ ' : ''}
									{t}
								</span>
							))}
							<span>{ev.sumMatches ? '=' : '≈'}</span>
						</>
					) : null}
					<span className={styles.entText}>
						{ev.hText} {ul}
					</span>
				</p>
				<p className={styles.small}>
					{ev.gapText === '0.0000' ? (
						<>已經是最大值：再平也平不過均勻分佈。</>
					) : (
						<>
							離最大值還差 <span className={`${styles.mono} ${styles.nowrap}`}>{ev.gapText}</span> {ul}。
						</>
					)}
				</p>
			</div>

			{note}

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>
		</section>
	);
}
