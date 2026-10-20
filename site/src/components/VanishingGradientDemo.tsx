import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './Ep05Chain.module.css';
import { placeLabel, plotFrame, pointBox, polylineBoxes, textWidth, type Box, type Spot } from './ep04-calc.ts';
import {
	altProd,
	altSeriesLog10,
	clampN,
	decades,
	exitPoint,
	fmtR,
	layerTickStep,
	LOG_MAX,
	LOG_MIN,
	N_DEFAULT,
	N_MAX,
	N_MIN,
	productExact,
	productText,
	R_DEFAULT,
	R_MAX,
	R_MIN,
	R_STEP,
	rPow,
	seriesLog10,
	snapR,
	type ProductText,
} from './ep05-chain.ts';

/**
 * 很多層一路相乘（弄壞它 5）：每層的局部導數都是 r，n 層乘起來是 rⁿ。
 * 縱軸是對數刻度（每一格乘 10），rⁿ 在上面是一條直線：r 比 1 小就一路往下（梯度消失），比 1 大就一路往上（梯度爆炸）。
 * 另一個選項「一半 0.5、一半 1.5」交替相乘：平均是 1，乘積卻越來越小。
 * 只看連乘本身，不談怎麼避免。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

type Mode = 'same' | 'alt';
type Pt = [number, number];

const DEFAULT_W = 560;
const PADS = { l: 50, r: 16, t: 30, b: 46 };
const plotHeight = (w: number) => Math.round(Math.min(380, Math.max(280, w * 0.62)));
const R_PRESETS = [0.5, 0.9, 1, 1.1, 1.5];
const REFS = [0.5, 1, 1.5];
const Y_LABELS = [10, 5, 0, -5, -10, -15, -20];
/** 縱軸上下各多留一點：10¹⁰ 和 10⁻²⁰ 的格線不貼著外框 */
const Y_VIEW = { yMin: LOG_MIN - 0.6, yMax: LOG_MAX + 0.6 };
/** n 不超過這個數時，每一層畫一個點 */
const DOTS_MAX = 40;

const sup = (k: number) => String(k).replace('-', '−');

/** 連乘的結果：0.00515 或 8.88 × 10⁻¹⁶ */
function Prod({ p }: { p: ProductText }) {
	if (p.kind === 'plain') return <span className={styles.nowrap}>{p.text}</span>;
	return (
		<span className={styles.nowrap}>
			{p.mant} × 10<sup>{sup(p.exp)}</sup>
		</span>
	);
}

/** SVG 裡的寫法（上標用 tspan） */
function SvgProd({ p }: { p: ProductText }) {
	if (p.kind === 'plain') return <>{p.text}</>;
	return (
		<>
			{p.mant} × 10
			<tspan dy="-0.45em" fontSize="0.75em">
				{sup(p.exp)}
			</tspan>
		</>
	);
}

const prodWidthText = (p: ProductText) => (p.kind === 'plain' ? p.text : `${p.mant} × 10${sup(p.exp)}`);

/** 給螢幕閱讀器念的：8.88 乘 10 的負 16 次方 */
const prodSpoken = (p: ProductText) => (p.kind === 'plain' ? p.text : `${p.mant} 乘 10 的 ${p.exp < 0 ? `負 ${-p.exp}` : p.exp} 次方`);

/** 10 的次方（座標軸的刻度） */
const SvgPow10 = ({ k }: { k: number }) =>
	k === 0 ? (
		<>1</>
	) : (
		<>
			10
			<tspan dy="-0.45em" fontSize="0.75em">
				{sup(k)}
			</tspan>
		</>
	);

export default function VanishingGradientDemo() {
	const [r, setR] = useState(R_DEFAULT);
	const [n, setN] = useState(N_DEFAULT);
	const [mode, setMode] = useState<Mode>('same');
	const [W, setW] = useState(DEFAULT_W);
	const wrapRef = useRef<HTMLDivElement>(null);
	const uid = useId();
	const clipId = `vg-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const rId = `${uid}-r`;
	const nId = `${uid}-n`;
	const rGroupId = `${uid}-rp`;

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

	const alt = mode === 'alt';
	const product = alt ? altProd(n) : rPow(r, n);
	const pt = productText(product);
	const pEq = productExact(product, pt) ? '=' : '≈';
	const rt = fmtR(r);

	// ----- 座標圖 -----
	const H = plotHeight(W);
	const xPad = Math.max(0.03 * n, 0.05);
	const view = { xMin: -xPad, xMax: n + xPad, ...Y_VIEW };
	const fr = plotFrame(W, H, view, PADS);
	const { sx, sy } = fr;
	const logs = alt ? altSeriesLog10(n) : seriesLog10(r, n);
	const mainPts: Pt[] = logs.map((L, k) => [sx(k), sy(L)]);
	const toD = (pts: Pt[]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
	const exit = exitPoint(logs, view.yMin, view.yMax);
	const endPt: Pt = mainPts[n];

	const step = layerTickStep(n, W < 480 ? 5 : 8);
	const xTicks: number[] = [];
	for (let k = 0; k <= n; k += step) xTicks.push(k);

	// 標籤要避開的東西
	const bounds: Box = { x0: fr.left + 2, y0: fr.top + 2, x1: fr.right - 2, y1: fr.bottom - 2 };
	const avoid: Box[] = [...polylineBoxes(mainPts.filter(([, y]) => y >= fr.top - 20 && y <= fr.bottom + 20), 4)];

	// 主線的終點（或超出圖外的地方）
	let endEls: ReactNode;
	if (exit) {
		const ex: Pt = [sx(exit.k), exit.edge === 'top' ? fr.top : fr.bottom];
		const up = exit.edge === 'top';
		avoid.push(pointBox(ex[0], ex[1], 10));
		const label = '超出圖外';
		const w = textWidth(label, 13) + 6;
		const cands: Spot[] = [
			{ x: ex[0] - 10, y: ex[1] + (up ? 14 : -14), anchor: 'end' },
			{ x: ex[0] + 10, y: ex[1] + (up ? 14 : -14), anchor: 'start' },
			{ x: ex[0] - 10, y: ex[1] + (up ? 30 : -30), anchor: 'end' },
		];
		const lab = placeLabel(cands, w, 17, avoid, bounds);
		avoid.push(lab.box);
		endEls = (
			<g>
				<path className={styles.exitMark} d={up ? `M${ex[0]} ${ex[1] - 9} l-6.5 10 h13 z` : `M${ex[0]} ${ex[1] + 9} l-6.5 -10 h13 z`} />
				<text className={`${styles.mainText} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central" fontSize={13}>
					{label}
				</text>
			</g>
		);
	} else {
		avoid.push(pointBox(endPt[0], endPt[1], 10));
		const w = textWidth(prodWidthText(pt), 14) + 6;
		const [ex, ey] = endPt;
		const cands: Spot[] = [
			{ x: ex - 10, y: ey - 16, anchor: 'end' },
			{ x: ex - 10, y: ey + 16, anchor: 'end' },
			{ x: ex - 14, y: ey - 30, anchor: 'end' },
			{ x: ex - 14, y: ey + 30, anchor: 'end' },
			{ x: ex - 14, y: ey, anchor: 'end' },
		];
		const lab = placeLabel(cands, w, 18, avoid, bounds);
		avoid.push(lab.box);
		endEls = (
			<g>
				<circle className={styles.endDot} cx={ex} cy={ey} r={6} />
				<text className={`${styles.mainText} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central">
					<SvgProd p={pt} />
				</text>
			</g>
		);
	}

	// 參考線 r = 0.5、1、1.5：從第 0 層畫到第 n 層，名字放在終點或超出圖外的地方
	const refs = REFS.map((rr) => {
		const end = n * Math.log10(rr);
		const a: Pt = [sx(0), sy(0)];
		const b: Pt = [sx(n), sy(end)];
		let anchorPt: Pt = b;
		let cands: Spot[];
		const text = `r = ${fmtR(rr)}`;
		if (end < view.yMin || end > view.yMax) {
			const kk = (end < view.yMin ? view.yMin : view.yMax) / Math.log10(rr);
			const top = end > view.yMax;
			anchorPt = [sx(kk), top ? fr.top : fr.bottom];
			cands = [
				{ x: anchorPt[0] + 6, y: anchorPt[1] + (top ? 12 : -12), anchor: 'start' },
				{ x: anchorPt[0] - 8, y: anchorPt[1] + (top ? 12 : -12), anchor: 'end' },
				{ x: anchorPt[0] + 6, y: anchorPt[1] + (top ? 28 : -28), anchor: 'start' },
			];
		} else {
			cands = [
				{ x: b[0] - 6, y: b[1] + (rr < 1 ? 13 : -13), anchor: 'end' },
				{ x: b[0] - 6, y: b[1] + (rr < 1 ? -13 : 13), anchor: 'end' },
				{ x: b[0] - 6, y: b[1] + (rr < 1 ? 28 : -28), anchor: 'end' },
			];
		}
		return { rr, a, b, text, cands, anchorPt };
	});
	// 先放終點的標籤，再放參考線的名字（避開主線與彼此）；和主線重疊的那條（r 剛好是 0.5、1、1.5）不放名字
	const sameAsMain = (rr: number) => !alt && r === rr;
	const refLabels = refs.map((rf) => {
		if (sameAsMain(rf.rr)) return null;
		const lab = placeLabel(rf.cands, textWidth(rf.text, 12.5) + 6, 16, avoid, bounds);
		avoid.push(lab.box);
		return lab;
	});

	// ----- 文字 -----
	const regime = product < 1 ? 'vanish' : product > 1 ? 'explode' : 'same';
	const severe = (regime === 'vanish' && product < 0.01) || (regime === 'explode' && product > 100);
	let statusText: string;
	let statusCls: string;
	if (alt) {
		statusText = '要看乘積，不是平均';
		statusCls = product < 0.01 ? styles.statusBad : styles.statusMild;
	} else if (regime === 'same') {
		statusText = '剛好不變';
		statusCls = styles.statusOk;
	} else if (regime === 'vanish') {
		statusText = severe ? '梯度消失' : '越乘越小';
		statusCls = severe ? styles.statusBad : styles.statusMild;
	} else {
		statusText = severe ? '梯度爆炸' : '越乘越大';
		statusCls = severe ? styles.statusBad : styles.statusMild;
	}

	// 算式：n 個數相乘；分成幾段，太長時在段落之間折行
	const factorParts: string[] = (() => {
		const fs = alt ? Array.from({ length: Math.min(n, 4) }, (_, i) => (i % 2 === 0 ? '0.5' : '1.5')) : Array.from({ length: Math.min(n, 3) }, () => rt);
		const short = alt ? n <= 4 : n <= 3;
		if (short) return fs.map((f, i) => (i < fs.length - 1 ? `${f} ×` : f));
		if (alt) return ['0.5 × 1.5 ×', '0.5 × 1.5 ×', '…', `（${n} 個）`];
		return [`${rt} × ${rt} ×`, `… × ${rt}`, `（${n} 個）`];
	})();
	const pairs = Math.floor(n / 2);
	const odd = n % 2 === 1;
	let powerLine: ReactNode = null;
	if (alt && n >= 2) {
		powerLine = (
			<span>
				= 0.75<sup>{pairs}</sup>
				{odd ? ' × 0.5' : ''}
			</span>
		);
	} else if (!alt && n >= 2) {
		powerLine = (
			<span>
				= {rt}
				<sup>{n}</sup>
			</span>
		);
	}

	let note: ReactNode;
	if (alt) {
		note = (
			<p className={product < 0.01 ? styles.bad : styles.note}>
				<span className={styles.tagWord}>要看乘積，不是平均：</span>0.5 和 1.5 的平均是 1，但每一對 0.5 × 1.5 = 0.75，比 1 小。{n} 層乘起來{pEq === '=' ? '是' : '約'} <Prod p={pt} />
				，還是越乘越小{product < 0.01 ? '（梯度消失）' : ''}。
			</p>
		);
	} else if (regime === 'same') {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>剛好不變：</span>每層乘 1，乘幾層都是 1。只要偏離 1 一點點，層數一多就會累積：試試 0.9 和 1.1。
			</p>
		);
	} else if (regime === 'vanish') {
		note = severe ? (
			<p className={styles.bad}>
				<span className={styles.tagWord}>梯度消失：前面的層幾乎學不到。</span>每層乘 {rt}，{n} 層後只剩原本的 <Prod p={pt} />
				；從損失倒著乘回去，前面的層拿到的梯度幾乎是 0。
			</p>
		) : (
			<p className={styles.note}>
				<span className={styles.tagWord}>越乘越小：</span>每層乘 {rt}（比 1 小），{n} 層後剩原本的 <Prod p={pt} />
				。層數再多，就會變成梯度消失：前面的層幾乎學不到。
			</p>
		);
	} else {
		note = severe ? (
			<p className={styles.bad}>
				<span className={styles.tagWord}>梯度爆炸：參數一步就飛走。</span>每層乘 {rt}，{n} 層後放大成原本的 <Prod p={pt} /> 倍；梯度這麼大，參數照著改一步，就飛到很遠的地方。
			</p>
		) : (
			<p className={styles.note}>
				<span className={styles.tagWord}>越乘越大：</span>每層乘 {rt}（比 1 大），{n} 層後是原本的 <Prod p={pt} /> 倍。層數再多，就會變成梯度爆炸：參數一步就飛走。
			</p>
		);
	}

	const rows: { key: string; label: string; v: number; current: boolean }[] = [
		...R_PRESETS.map((rr) => ({ key: String(rr), label: fmtR(rr), v: rPow(rr, n), current: !alt && r === rr })),
		{ key: 'alt', label: '0.5、1.5 交替', v: altProd(n), current: alt },
	];

	const what = alt ? '0.5、1.5 交替' : `每層乘 ${rt}`;
	const summary = `${what}，${n} 層一路相乘 ${pEq} ${prodSpoken(pt)}：${statusText}。`;

	const pickR = (v: number) => {
		setR(v);
		setMode('same');
	};

	return (
		<section className={`not-content ${styles.demo}`} aria-label="很多層一路相乘：梯度消失與爆炸互動示範">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>很多層一路相乘：消失還是爆炸？</p>
				<p className={`${styles.small} ${styles.muted}`}>
					鏈鎖律把每一層的局部導數乘起來。假設每層都是 r，n 層就是 r<sup>n</sup>。縱軸是對數刻度：每一格乘 10，所以 r<sup>n</sup> 是一條直線。
				</p>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={rId}>
						每層的局部導數{' '}
						{alt ? (
							<span className={styles.value}>0.5、1.5 交替</span>
						) : (
							<>
								r = <span className={styles.value}>{rt}</span>
							</>
						)}
					</label>
					<span className={`${styles.muted} ${styles.small}`}>拖動滑桿，或按方向鍵一次 0.05</span>
				</div>
				<input
					id={rId}
					className={`${styles.slider} ${alt ? styles.sliderIdle : ''}`}
					type="range"
					min={R_MIN}
					max={R_MAX}
					step={R_STEP}
					value={r}
					aria-valuetext={alt ? `目前是 0.5、1.5 交替；拖動滑桿改回每層都是 r（r = ${rt}）` : `r = ${rt}`}
					onChange={(e) => pickR(snapR(Number(e.currentTarget.value)))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>0.5</span>
					<span>1</span>
					<span>1.5</span>
				</div>
				<div className={styles.chips} role="group" aria-labelledby={rGroupId}>
					<span className={styles.srOnly} id={rGroupId}>
						直接選每層的局部導數
					</span>
					{R_PRESETS.map((v) => (
						<button key={v} type="button" className={`${styles.chip} ${styles.chipMono}`} aria-pressed={!alt && r === v} aria-label={`每層都是 ${fmtR(v)}`} onClick={() => pickR(v)}>
							{fmtR(v)}
						</button>
					))}
					<button type="button" className={styles.chip} aria-pressed={alt} onClick={() => setMode('alt')}>
						一半 0.5、一半 1.5
					</button>
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={nId}>
						層數 n = <span className={styles.value}>{n}</span>
					</label>
					<span className={`${styles.muted} ${styles.small}`}>方向鍵一次 1 層</span>
				</div>
				<input
					id={nId}
					className={styles.slider}
					type="range"
					min={N_MIN}
					max={N_MAX}
					step={1}
					value={n}
					aria-valuetext={`${n} 層`}
					onChange={(e) => setN(clampN(Number(e.currentTarget.value)))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>{N_MIN}</span>
					<span>{N_MAX}</span>
				</div>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.plotWide} ref={wrapRef}>
				<svg
					className={styles.plot}
					viewBox={`0 0 ${W} ${H}`}
					role="img"
					aria-label={`對數座標圖：橫軸是層數，從 0 到 ${n}；縱軸是連乘的結果，從 10 的負 20 次方到 10 的 10 次方。灰色的參考線是每層乘 0.5、1、1.5。紫色線是${what}：${n} 層後 ${pEq} ${prodSpoken(pt)}${exit ? '（超出圖外）' : ''}。`}
				>
					<defs>
						<clipPath id={clipId}>
							<rect x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
						</clipPath>
					</defs>

					{/* 格線：每一格乘 10；每 5 格一條深一點 */}
					{decades().map((d) => (
						<line key={`gy${d}`} className={d % 5 === 0 ? styles.grid : styles.gridMinor} x1={fr.left} y1={sy(d)} x2={fr.right} y2={sy(d)} />
					))}
					{xTicks.map((k) => (
						<line key={`gx${k}`} className={styles.gridMinor} x1={sx(k)} y1={fr.top} x2={sx(k)} y2={fr.bottom} />
					))}
					<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
					{xTicks.map((k) => (
						<text key={`tx${k}`} className={styles.tickText} x={sx(k)} y={fr.bottom + 18} textAnchor="middle">
							{k}
						</text>
					))}
					{Y_LABELS.map((d) => (
						<text key={`ty${d}`} className={styles.tickText} x={fr.left - 6} y={sy(d) + 4.5} textAnchor="end">
							<SvgPow10 k={d} />
						</text>
					))}
					<text className={styles.axisTitle} x={fr.left} y={fr.top - 11} textAnchor="start">
						一路相乘的結果（對數刻度）
					</text>
					<text className={styles.axisTitle} x={(fr.left + fr.right) / 2} y={fr.bottom + 38} textAnchor="middle">
						層數
					</text>

					<g clipPath={`url(#${clipId})`}>
						{refs.map((rf) => (
							<line key={rf.rr} className={rf.rr === 1 ? styles.oneLine : styles.refLine} x1={rf.a[0]} y1={rf.a[1]} x2={rf.b[0]} y2={rf.b[1]} />
						))}
						<path className={styles.mainLine} d={toD(mainPts)} />
						{n <= DOTS_MAX ? mainPts.map(([x, y], k) => <circle key={k} className={styles.mainDot} cx={x} cy={y} r={2.75} />) : null}
					</g>
					{refs.map((rf, i) => {
						const lab = refLabels[i];
						return lab ? (
							<text key={`rl${rf.rr}`} className={`${styles.refText} ${styles.halo}`} x={lab.spot.x} y={lab.spot.y} textAnchor={lab.spot.anchor} dominantBaseline="central">
								{rf.text}
							</text>
						) : null;
					})}
					{endEls}
				</svg>
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={styles.swMain} />
						{alt ? '0.5、1.5 交替相乘' : `每層乘 ${rt}`}
					</span>
					<span className={styles.legendItem}>
						<span className={styles.swRef} />
						參考線：每層乘 0.5、1、1.5
					</span>
				</div>
			</div>

			<div className={styles.cols}>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>{n} 層一路相乘</p>
					<p className={`${styles.deriv} ${styles.mainName}`}>
						{factorParts.map((part, i) => (
							<span key={i}>{part}</span>
						))}
					</p>
					<p className={styles.deriv}>
						{powerLine}
						<span>
							{pEq}{' '}
							<span className={`${styles.result} ${styles.big}`}>
								<Prod p={pt} />
							</span>
						</span>
					</p>
					<span className={`${styles.status} ${statusCls}`}>{statusText}</span>
				</div>

				<table className={styles.table}>
					<caption>同樣 {n} 層，每層乘的數不同</caption>
					<thead>
						<tr>
							<th scope="col">每層乘</th>
							<th scope="col">{n} 層相乘</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => {
							const p = productText(row.v);
							return (
								<tr key={row.key} className={row.current ? styles.current : undefined} aria-current={row.current ? 'true' : undefined}>
									<td>{row.label}</td>
									<td>
										<Prod p={p} />
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{note}

			<p className={`${styles.small} ${styles.muted}`}>這裡只看連乘本身。怎麼避免梯度消失與爆炸，EP13 和 EP25（殘差連接）會再講。</p>
		</section>
	);
}
