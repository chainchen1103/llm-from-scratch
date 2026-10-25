import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import styles from './Ep06Coin.module.css';
import { placeLabel, plotFrame, pointBox, polylineBoxes, textWidth, type Box } from './ep04-calc.ts';
import {
	clampCoinN,
	COIN_N_DEFAULT,
	COIN_N_MAX,
	COIN_N_MIN,
	COIN_SEEDS,
	COIN_STOPS,
	COIN_TABLE_NS,
	coinCurveNs,
	coinRun,
	coinStat,
	firstFlips,
	fmtInt,
	nearestStop,
} from './ep06-coin.ts';

/**
 * 丟硬幣（工具一）：固定 seed 丟 n 次，看前 n 次裡正面的比例，和它離 0.5（正面的機率）有多遠。
 * 折線是「到目前為止」正面的比例，橫軸是次數（對數刻度，1 到 10 萬）：前面大幅跳動，次數越多越貼近 0.5（大數法則）。
 * 十萬次先丟好、算好累積和，拖動時只查表。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

type Pt = [number, number];

const DEFAULT_W = 560;
const PADS = { l: 44, r: 14, t: 28, b: 44 };
const plotHeight = (w: number) => Math.round(Math.min(330, Math.max(240, w * 0.52)));
const LOG_MAX = Math.log10(COIN_N_MAX);
const VIEW = { xMin: -0.12, xMax: LOG_MAX + 0.12, yMin: -0.04, yMax: 1.04 };
const CURVE_NS = coinCurveNs();
const X_TICKS: { v: number; label: string }[] = [
	{ v: 1, label: '1' },
	{ v: 10, label: '10' },
	{ v: 100, label: '100' },
	{ v: 1000, label: '1000' },
	{ v: 10_000, label: '1 萬' },
	{ v: 100_000, label: '10 萬' },
];
/** 每一大格裡的 2 倍、5 倍（淡淡的格線，對到滑桿停的地方） */
const X_MINOR = [0, 1, 2, 3, 4].flatMap((d) => [2 * 10 ** d, 5 * 10 ** d]);
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
const Y_LABELS: Record<number, string> = { 0: '0', 0.25: '0.25', 0.5: '0.5', 0.75: '0.75', 1: '1' };
/** 一排正、反最多畫幾次 */
const STRIP = 20;
/** 新的 seed 從這裡開始（前面幾個有按鈕） */
const SEED_MAX = 999;

const sideWord = (f: number) => (f === 1 ? '正面' : '反面');

export default function CoinFlipDemo() {
	const [n, setN] = useState(COIN_N_DEFAULT);
	const [seed, setSeed] = useState(0);
	const [nText, setNText] = useState<string | null>(null);
	const [W, setW] = useState(DEFAULT_W);
	const [dragging, setDragging] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const dragId = useRef<number | null>(null);
	const uid = useId();
	const clipId = `cf-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const nId = `${uid}-n`;
	const nInputId = `${uid}-ni`;
	const seedLabelId = `${uid}-seed`;
	const hintId = `${uid}-hint`;

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

	const run = useMemo(() => coinRun(seed), [seed]);
	const st = coinStat(run, n);
	const tails = n - st.k;
	const eq = st.exact ? '=' : '≈';

	const pickN = (v: number) => {
		setN(clampCoinN(v));
		setNText(null);
	};

	// ----- 座標圖 -----
	const H = plotHeight(W);
	const fr = plotFrame(W, H, VIEW, PADS);
	const { sx, sy } = fr;
	const lx = (m: number) => sx(Math.log10(m));

	// 前 n 次的折線（畫面座標）：先算好每個取樣點，拖動 n 時只要截到 n
	const allPts = useMemo(() => {
		const f = plotFrame(W, H, VIEW, PADS);
		return CURVE_NS.map((m) => [f.sx(Math.log10(m)), f.sy(run.cum[m] / m)] as Pt);
	}, [run, W, H]);
	let cut = 0;
	while (cut < CURVE_NS.length && CURVE_NS[cut] < n) cut++;
	const pts: Pt[] = [...allPts.slice(0, cut), [lx(n), sy(st.ratio)]];
	const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
	const cur: Pt = [lx(n), sy(st.ratio)];

	// 拖動（Pointer Events：滑鼠、觸控、觸控筆都適用）：點圖上任一處，n 就移到那個次數
	const toLocal = (e: ReactPointerEvent<SVGSVGElement>): Pt => {
		const r = e.currentTarget.getBoundingClientRect();
		const k = W / r.width;
		return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
	};
	const moveTo = (px: number) => {
		const x = Math.min(LOG_MAX, Math.max(0, fr.fromX(px)));
		pickN(Math.round(10 ** x));
	};
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const [px, py] = toLocal(e);
		if (px < fr.left - 10 || px > fr.right + 10 || py < fr.top - 10 || py > fr.bottom + 10) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		setDragging(true);
		moveTo(px);
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragId.current !== e.pointerId) return;
		moveTo(toLocal(e)[0]);
	};
	const endDrag = () => {
		dragId.current = null;
		setDragging(false);
	};

	// 標籤：目前的比例、機率 0.5 的名字，避開折線和點
	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 2, x1: fr.right - 2, y1: fr.bottom - 2 };
	const avoid: Box[] = [...polylineBoxes(pts, 4), pointBox(cur[0], cur[1], 10), { x0: fr.left, y0: sy(0.5) - 2, x1: fr.right, y1: sy(0.5) + 2 }];
	const curLabelW = textWidth(st.ratioText, 14) + 6;
	const curLab = placeLabel(
		[
			{ x: cur[0] + 10, y: cur[1] - 16, anchor: 'start' },
			{ x: cur[0] - 10, y: cur[1] - 16, anchor: 'end' },
			{ x: cur[0] + 10, y: cur[1] + 16, anchor: 'start' },
			{ x: cur[0] - 10, y: cur[1] + 16, anchor: 'end' },
			{ x: cur[0] - 12, y: cur[1] - 32, anchor: 'end' },
			{ x: cur[0] - 12, y: cur[1] + 32, anchor: 'end' },
			{ x: cur[0] + 12, y: cur[1] - 32, anchor: 'start' },
			{ x: cur[0] + 12, y: cur[1] + 32, anchor: 'start' },
		],
		curLabelW,
		18,
		avoid,
		bounds,
	);
	avoid.push(curLab.box);
	const refLabelText = '機率 0.5';
	const refLabelW = textWidth(refLabelText, 13) + 6;
	const refLab = placeLabel(
		[
			{ x: fr.right - 6, y: sy(0.5) - 12, anchor: 'end' },
			{ x: fr.right - 6, y: sy(0.5) + 12, anchor: 'end' },
			{ x: fr.left + 6, y: sy(0.5) + 12, anchor: 'start' },
			{ x: fr.left + 6, y: sy(0.5) - 12, anchor: 'start' },
			{ x: (fr.left + fr.right) / 2, y: sy(0.5) + 12, anchor: 'middle' },
		],
		refLabelW,
		16,
		avoid,
		bounds,
	);

	// ----- 文字 -----
	const nt = fmtInt(n);
	let trend: ReactNode;
	if (st.trend === 'first') {
		trend = (
			<>
				第 1 次是{sideWord(st.last)}：比例是 <span className={styles.mono}>{st.ratioText}</span>，離 0.5 有 <span className={styles.mono}>{st.distText}</span>。
			</>
		);
	} else {
		const word = st.trend === 'closer' ? '更近了' : st.trend === 'farther' ? '更遠了' : '一樣遠';
		// 次數很多時，多丟一次只讓比例變一點點，5 位小數看不出來
		const tiny = st.prevRatioText === st.ratioText;
		trend = tiny ? (
			<>
				第 {nt} 次是{sideWord(st.last)}：比例只變了不到 0.00001（5 位小數看不出來），離 0.5 <span className={styles.tagWord}>{st.trend === 'same' ? '一樣遠' : `稍微${word}`}</span>
				。次數越多，多丟一次的影響越小。
			</>
		) : (
			<>
				第 {nt} 次是{sideWord(st.last)}：比例從 <span className={styles.mono}>{st.prevRatioText}</span> 變成 <span className={styles.mono}>{st.ratioText}</span>，離 0.5 <span className={styles.tagWord}>{word}</span>。
			</>
		);
	}

	const strip = firstFlips(run, STRIP);
	const summary = `seed ${seed}，丟 ${nt} 次：正面 ${fmtInt(st.k)} 次，比例 ${eq === '=' ? '' : '約 '}${st.ratioText}，和 0.5 的距離 ${st.distText}。`;
	const stopIdx = nearestStop(n);
	const onStop = COIN_STOPS[stopIdx] === n;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="丟硬幣互動示範：次數越多，正面的比例越靠近 0.5">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>丟越多次，正面的比例越靠近 0.5 嗎？</p>
				<p className={`${styles.small} ${styles.muted}`}>
					公平的硬幣，正面的機率是 0.5。用固定 seed 的亂數丟 n 次，看前 n 次裡正面的比例。橫軸是對數刻度：每一大格乘 10。
				</p>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={nId}>
						丟的次數 n = <span className={styles.value}>{nt}</span>
					</label>
					<span className={`${styles.muted} ${styles.small}`}>拖動滑桿，或按方向鍵跳到下一格（1、2、5、10⋯⋯）</span>
				</div>
				<input
					id={nId}
					className={styles.slider}
					type="range"
					min={0}
					max={COIN_STOPS.length - 1}
					step={1}
					value={stopIdx}
					aria-valuetext={`丟 ${nt} 次${onStop ? '' : `（最接近 ${fmtInt(COIN_STOPS[stopIdx])} 那一格）`}`}
					onChange={(e) => pickN(COIN_STOPS[Number(e.currentTarget.value)])}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>1</span>
					<span>10</span>
					<span>100</span>
					<span>1000</span>
					<span>1 萬</span>
					<span>10 萬</span>
				</div>
				<div className={styles.numRow}>
					<label htmlFor={nInputId} className={styles.small}>
						或直接輸入次數（1 到 100,000）
					</label>
					<input
						id={nInputId}
						type="number"
						className={styles.num}
						inputMode="numeric"
						min={COIN_N_MIN}
						max={COIN_N_MAX}
						step={1}
						value={nText ?? String(n)}
						onChange={(e) => {
							const raw = e.currentTarget.value;
							setNText(raw);
							const v = Number(raw);
							if (raw.trim() !== '' && Number.isFinite(v)) setN(clampCoinN(v));
						}}
						onBlur={() => setNText(null)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') setNText(null);
						}}
					/>
					<button type="button" className={styles.chip} disabled={n >= COIN_N_MAX} onClick={() => pickN(n + 1)}>
						多丟 1 次
					</button>
				</div>
			</div>

			<div className={styles.controlRow}>
				<span className={styles.controlLabel} id={seedLabelId}>
					seed
				</span>
				<div className={styles.chips} role="group" aria-labelledby={seedLabelId}>
					{COIN_SEEDS.map((s) => (
						<button key={s} type="button" className={`${styles.chip} ${styles.chipMono}`} aria-pressed={seed === s} aria-label={`seed ${s}`} onClick={() => setSeed(s)}>
							{s}
						</button>
					))}
					<button type="button" className={styles.chip} onClick={() => setSeed((s) => (s >= SEED_MAX ? 0 : s + 1))}>
						換一個 seed{seed > COIN_SEEDS[COIN_SEEDS.length - 1] ? `（目前 ${seed}）` : ''}
					</button>
				</div>
				<span className={`${styles.small} ${styles.muted}`}>同一個 seed，每次丟出來都一樣</span>
			</div>

			<div className={styles.group}>
				<p className={`${styles.small} ${styles.muted}`} id={`${uid}-strip`}>
					前 {STRIP} 次的結果{n < STRIP ? `（淡的是第 ${n + 1} 次以後，還沒丟到）` : ''}
				</p>
				<ol className={styles.flips} aria-labelledby={`${uid}-strip`}>
					{strip.map((f, i) => (
						<li key={i} className={`${styles.flip} ${styles.flipSmall} ${f === 1 ? styles.flipHead : ''} ${i >= n ? styles.flipLater : ''}`} aria-label={`第 ${i + 1} 次：${sideWord(f)}${i >= n ? '（還沒丟到）' : ''}`}>
							{f === 1 ? '正' : '反'}
						</li>
					))}
					{n > STRIP ? (
						<li className={styles.flipsMore} aria-hidden="true">
							⋯ 後面還有 {fmtInt(n - STRIP)} 次
						</li>
					) : null}
				</ol>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.plotWide} ref={wrapRef}>
				<svg
					className={`${styles.plot} ${styles.draggable} ${dragging ? styles.grabbing : ''}`}
					viewBox={`0 0 ${W} ${H}`}
					role="img"
					aria-label={`折線圖：橫軸是丟的次數（對數刻度，1 到 10 萬），縱軸是到目前為止正面的比例（0 到 1），珊瑚色虛線是機率 0.5。目前丟了 ${nt} 次，比例 ${st.ratioText}。`}
					aria-describedby={hintId}
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

					{/* 格線：每一大格（乘 10）一條，2 倍、5 倍淡一點 */}
					{X_MINOR.map((m) => (
						<line key={`gm${m}`} className={styles.gridMinor} x1={lx(m)} y1={fr.top} x2={lx(m)} y2={fr.bottom} />
					))}
					{X_TICKS.map((t) => (
						<line key={`gx${t.v}`} className={styles.grid} x1={lx(t.v)} y1={fr.top} x2={lx(t.v)} y2={fr.bottom} />
					))}
					{Y_TICKS.map((t) => (
						<line key={`gy${t}`} className={styles.grid} x1={fr.left} y1={sy(t)} x2={fr.right} y2={sy(t)} />
					))}
					<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
					{X_TICKS.map((t) => (
						<text key={`tx${t.v}`} className={styles.tickText} x={lx(t.v)} y={fr.bottom + 18} textAnchor="middle">
							{t.label}
						</text>
					))}
					{Y_TICKS.map((t) => (
						<text key={`ty${t}`} className={styles.tickText} x={fr.left - 6} y={sy(t) + 4.5} textAnchor="end">
							{Y_LABELS[t]}
						</text>
					))}
					<text className={styles.axisTitle} x={fr.left} y={fr.top - 10} textAnchor="start">
						到目前為止，正面的比例
					</text>
					<text className={styles.axisTitle} x={(fr.left + fr.right) / 2} y={fr.bottom + 38} textAnchor="middle">
						丟的次數（對數刻度）
					</text>

					<line className={styles.cursor} x1={cur[0]} y1={fr.top} x2={cur[0]} y2={fr.bottom} />
					<g clipPath={`url(#${clipId})`}>
						<line className={styles.refLine} x1={fr.left} y1={sy(0.5)} x2={fr.right} y2={sy(0.5)} />
						<path className={`${styles.curve} ${styles.curveThin}`} d={path} />
					</g>
					<text className={`${styles.refText} ${styles.halo}`} x={refLab.spot.x} y={refLab.spot.y} textAnchor={refLab.spot.anchor} dominantBaseline="central" fontSize={13}>
						{refLabelText}
					</text>
					{dragging ? <circle className={styles.ring} cx={cur[0]} cy={cur[1]} r={12} /> : null}
					<circle className={styles.dot} cx={cur[0]} cy={cur[1]} r={6} />
					<text className={`${styles.dotText} ${styles.halo}`} x={curLab.spot.x} y={curLab.spot.y} textAnchor={curLab.spot.anchor} dominantBaseline="central">
						{st.ratioText}
					</text>
				</svg>
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={styles.swCurve} />
						前 m 次裡正面的比例（m 從 1 到 {nt}）
					</span>
					<span className={styles.legendItem}>
						<span className={styles.swRef} />
						機率 0.5
					</span>
				</div>
				<p className={styles.hint} id={hintId}>
					也可以在圖上點一下或左右拖動，直接選丟的次數。
				</p>
			</div>

			<div className={styles.cols}>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>
						seed {seed}，丟 {nt} 次
					</p>
					<div className={styles.kv}>
						<span className={styles.kvName}>正面</span>
						<span className={styles.kvValue}>
							<span>{fmtInt(st.k)} 次</span>
							<span className={styles.muted}>（反面 {fmtInt(tails)} 次）</span>
						</span>
						<span className={styles.kvName}>正面的比例</span>
						<span className={styles.kvValue}>
							<span>
								{fmtInt(st.k)} / {nt}
							</span>
							<span>
								{eq} <span className={`${styles.result} ${styles.big} ${styles.curveName}`}>{st.ratioText}</span>
							</span>
						</span>
						<span className={styles.kvName}>和 0.5 的距離</span>
						<span className={styles.kvValue}>
							<span className={styles.result}>{st.distText}</span>
						</span>
					</div>
					<p className={`${styles.small} ${styles.muted}`}>{trend}</p>
				</div>

				<table className={styles.table}>
					<caption>seed {seed}：前 n 次裡正面的比例</caption>
					<thead>
						<tr>
							<th scope="col">n</th>
							<th scope="col">正面</th>
							<th scope="col">比例</th>
							<th scope="col">離 0.5</th>
						</tr>
					</thead>
					<tbody>
						{COIN_TABLE_NS.map((m) => {
							const s = coinStat(run, m);
							const current = m === n;
							return (
								<tr key={m} className={current ? styles.current : undefined} aria-current={current ? 'true' : undefined}>
									<td>{fmtInt(m)}</td>
									<td>{fmtInt(s.k)}</td>
									<td>{s.ratioText}</td>
									<td>{s.distText}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<p className={styles.note}>
				<span className={styles.tagWord}>不是每多丟一次就更近，但次數越多，越穩定地靠近 0.5（大數法則）。</span>
				按幾次「多丟 1 次」：有時更近、有時更遠；把次數拉到 1 萬、10 萬，比例就只在 0.5 附近一點點的範圍裡晃。換一個 seed，前面跳動的樣子不一樣，最後一樣靠近 0.5。
			</p>
		</section>
	);
}
