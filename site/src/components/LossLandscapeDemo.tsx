import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './Ep08Logit.module.css';
import {
	contourLabels,
	correctAt,
	cutTemp,
	cutText,
	accText,
	DEFAULT_STEPS,
	Descent,
	FEATURES,
	fmtFixed,
	fmtInt,
	FLOOR,
	FLOOR_LOSS,
	inputText,
	isMarkStep,
	LAND_LR,
	landFrame,
	landscapeContours,
	LEVELS,
	lossAt,
	lossText,
	N_DAYS,
	overlapArea,
	paramText,
	shortText,
	snapStart,
	START_PRESETS,
	START_STEP,
	STEP_CHOICES,
	stepsText,
	stepWord,
	TICKS,
	textWidth,
	vecText,
	VIEWS,
	type Box,
	type Frame,
	type Mode,
	type Vec,
} from './ep08-logit.ts';

/**
 * 損失地形（工具四）：示範資料 40 天的平均二元交叉熵 loss(w, b) 畫成等高線。
 * 點（或拖）圖上任何地方當起點，畫出梯度下降的路徑（標準化時學習率 1）：從哪裡出發都走到同一個谷底。
 * 切換成「不標準化」（直接用氣溫當特徵）時，地形變成又長又窄、斜著放的谷，學習率只能用 0.01，
 * 要快轉到 10 萬步才走到分界 21.38 度。快轉在瀏覽器裡分段算（每一格畫面算幾千步），不會卡住畫面。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 560;
/** 一開始馬上算完的步數（標準化的 3,000 步不到幾毫秒） */
const SYNC_STEPS = 3000;
/** 之後每一格畫面算幾步 */
const CHUNK = 4000;
/** 之前的路徑最多留幾條 */
const MAX_GHOSTS = 4;
const MODES: { key: Mode; label: string }[] = [
	{ key: 'std', label: '標準化：(氣溫 − 20) ÷ 10' },
	{ key: 'raw', label: '不標準化：直接用氣溫' },
];

function makeRun(mode: Mode, start: Vec, target: number): Descent {
	const d = new Descent(mode, start, LAND_LR[mode], 4096);
	d.advance(target, SYNC_STEPS);
	return d;
}

type Ghost = { run: Descent; upto: number; key: number };

const r2 = (v: number) => Math.round(Math.max(-1e5, Math.min(1e5, v)) * 100) / 100;

/** 路徑：畫面上離上一個點不到 1.2 px 的步省略；第 1–9、10、20、… 步畫點 */
function pathGeom(run: Descent, upto: number, fr: Frame): { d: string; marks: Vec[]; end: Vec } {
	const parts: string[] = [];
	const marks: Vec[] = [];
	let lx = 0;
	let ly = 0;
	const n = Math.min(upto, run.n);
	for (let k = 0; k <= n; k++) {
		const x = fr.sx(run.ws[k]);
		const y = fr.sy(run.bs[k]);
		if (k === 0 || k === n || Math.hypot(x - lx, y - ly) >= 1.2) {
			parts.push(`${k === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`);
			lx = x;
			ly = y;
		}
		if (isMarkStep(k)) marks.push([x, y]);
	}
	return { d: parts.join(' '), marks, end: [fr.sx(run.ws[n]), fr.sy(run.bs[n])] };
}

/** 五角星（中心 x、y，外半徑 r） */
function starPath(x: number, y: number, r: number): string {
	const pts: string[] = [];
	for (let i = 0; i < 10; i++) {
		const a = -Math.PI / 2 + (i * Math.PI) / 5;
		const rr = i % 2 === 0 ? r : r * 0.45;
		pts.push(`${r2(x + rr * Math.cos(a))} ${r2(y + rr * Math.sin(a))}`);
	}
	return `M${pts.join(' L')} Z`;
}

/** 分界氣溫的寫法 */
function cutWords(mode: Mode, w: number, b: number): { text: string; sub: string } {
	const c = cutTemp(mode, w, b);
	const formula = mode === 'std' ? '20 − 10b ÷ w' : '−b ÷ w';
	if (c === null) return { text: '沒有分界', sub: 'w = 0：每天的機率都一樣' };
	if (Math.abs(c) > 999) return { text: '很遠', sub: 'w 幾乎是 0：S 形幾乎是平的' };
	if (w > 0) return { text: `${cutText(c)} °C`, sub: `${formula}；w > 0，比它熱才判「冷」` };
	return { text: `${cutText(c)} °C`, sub: `${formula}：比它冷就判「冷」` };
}

/** (w, b) 的寫法：不標準化時 w 很小，多寫一位 */
const wText = (mode: Mode, w: number) => (mode === 'raw' ? fmtFixed(w, 4) : paramText(w));
const pointText = (mode: Mode, p: Vec) => `(${wText(mode, p[0])}, ${paramText(p[1])})`;

export default function LossLandscapeDemo() {
	const [mode, setMode] = useState<Mode>('std');
	const [target, setTarget] = useState(DEFAULT_STEPS.std);
	const [run, setRun] = useState<Descent>(() => makeRun('std', [0, 0], DEFAULT_STEPS.std));
	const [ghosts, setGhosts] = useState<Ghost[]>([]);
	const [, setTick] = useState(0);
	const [draft, setDraft] = useState<[string, string]>(['0', '0']);
	const [dragging, setDragging] = useState(false);
	const [width, setWidth] = useState(DEFAULT_W);
	const wrapRef = useRef<HTMLDivElement>(null);
	const dragId = useRef<number | null>(null);
	const runRef = useRef(run);
	runRef.current = run;
	const ghostKey = useRef(0);
	const uid = useId();
	const clipId = `land-clip-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const hintId = `${uid}-hint`;
	const modeId = `${uid}-mode`;
	const startId = `${uid}-start`;
	const stepsId = `${uid}-steps`;

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

	// 還沒走到目標步數：每一格畫面再算 CHUNK 步（快轉）
	useEffect(() => {
		if (run.n >= target || run.blowUp !== null) return;
		let raf = 0;
		const loop = () => {
			const done = run.advance(target, CHUNK);
			setTick((t) => t + 1);
			if (!done) raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [run, target]);

	const fr = landFrame(mode, width);
	const view = VIEWS[mode];
	const contours = useMemo(() => landscapeContours(mode), [mode]);
	const floor = FLOOR[mode];
	const floorPx: Vec = [fr.sx(floor[0]), fr.sy(floor[1])];

	const contourPaths = useMemo(
		() =>
			contours.map((c) => ({
				level: c.level,
				d: c.lines.map((line) => line.map(([w, b], i) => `${i === 0 ? 'M' : 'L'}${r2(fr.sx(w))} ${r2(fr.sy(b))}`).join(' ')).join(' '),
			})),
		[contours, width],
	);
	const labels = useMemo(() => {
		const avoid: Box[] = [{ x0: floorPx[0] - 12, y0: floorPx[1] - 30, x1: floorPx[0] + 12, y1: floorPx[1] + 12 }];
		return contourLabels(mode, contours, fr, avoid);
	}, [contours, width]);

	const ghostGeoms = useMemo(
		() => ghosts.map((g) => ({ key: g.key, ...pathGeom(g.run, g.upto, fr), start: [fr.sx(g.run.start[0]), fr.sy(g.run.start[1])] as Vec })),
		[ghosts, width, mode],
	);

	const shown = Math.min(run.n, target);
	const computing = run.n < target && run.blowUp === null;
	const geom = pathGeom(run, shown, fr);
	const startPx: Vec = [fr.sx(run.start[0]), fr.sy(run.start[1])];
	const [wNow, bNow] = run.at(shown);
	const xs = FEATURES[mode];
	const lossNow = lossAt(xs, wNow, bNow);
	const correct = correctAt(xs, wNow, bNow);
	const cut = cutWords(mode, wNow, bNow);
	const blown = run.blowUp !== null;

	// ----- 操作 -----
	const startAt = (p: Vec, keepOld: boolean) => {
		const s = snapStart(mode, p);
		const cur = runRef.current;
		if (!keepOld && s[0] === cur.start[0] && s[1] === cur.start[1]) return;
		if (keepOld && !(s[0] === cur.start[0] && s[1] === cur.start[1]) && cur.n > 0) {
			ghostKey.current += 1;
			const g: Ghost = { run: cur, upto: Math.min(cur.n, target), key: ghostKey.current };
			setGhosts((gs) => [...gs, g].slice(-MAX_GHOSTS));
		}
		const next = makeRun(mode, s, target);
		runRef.current = next;
		setRun(next);
		setDraft([inputText(s[0]), inputText(s[1])]);
	};

	const pickMode = (m: Mode) => {
		if (m === mode) return;
		setMode(m);
		setTarget(DEFAULT_STEPS[m]);
		setGhosts([]);
		const next = makeRun(m, [0, 0], DEFAULT_STEPS[m]);
		runRef.current = next;
		setRun(next);
		setDraft(['0', '0']);
	};

	const draftPoint = (): Vec | null => {
		const w = Number(draft[0]);
		const b = Number(draft[1]);
		if (draft[0].trim() === '' || draft[1].trim() === '' || !Number.isFinite(w) || !Number.isFinite(b)) return null;
		return snapStart(mode, [w, b]);
	};
	const submitDraft = (e: FormEvent) => {
		e.preventDefault();
		const p = draftPoint();
		if (p) startAt(p, true);
	};
	const dp = draftPoint();
	const showDraft = dp !== null && !(dp[0] === run.start[0] && dp[1] === run.start[1]);

	// ----- 點、拖（Pointer Events：滑鼠、觸控、觸控筆都適用） -----
	const toLocal = (e: ReactPointerEvent<SVGSVGElement>): Vec => {
		const r = e.currentTarget.getBoundingClientRect();
		const k = width / r.width;
		return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
	};
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		setDragging(true);
		startAt(fr.fromScreen(...toLocal(e)), true);
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragId.current !== e.pointerId) return;
		startAt(fr.fromScreen(...toLocal(e)), false);
	};
	const endDrag = () => {
		dragId.current = null;
		setDragging(false);
	};

	// ----- 起點、谷底的名字 -----
	const startLeft = startPx[0] > (fr.left + fr.right) / 2;
	const startLabelY = startPx[1] < fr.top + 22 ? startPx[1] + 20 : startPx[1] - 12;
	const starR = 9;
	// 等高線的數字壓到起點、終點或「起點」兩個字時先不寫（換起點後再出現）
	const near = (p: Vec, r: number): Box => ({ x0: p[0] - r, y0: p[1] - r, x1: p[0] + r, y1: p[1] + r });
	const startLabelW = textWidth('起點', 13) + 4;
	const startX = startPx[0] + (startLeft ? -10 : 10);
	const busy: Box[] = [
		near(startPx, 8),
		near(geom.end, 8),
		{ x0: startLeft ? startX - startLabelW : startX, y0: startLabelY - 14, x1: startLeft ? startX : startX + startLabelW, y1: startLabelY + 4 },
		...ghostGeoms.flatMap((g) => [near(g.start, 6), near(g.end, 5)]),
	];
	if (showDraft && dp) busy.push(near([fr.sx(dp[0]), fr.sy(dp[1])], 10));
	const shownLabels = labels.filter((l) => busy.every((b) => overlapArea(l.box, b) === 0));

	// ----- 文字 -----
	const atFloor = mode === 'std' && fmtFixed(wNow, 2) === fmtFixed(floor[0], 2) && fmtFixed(bNow, 2) === fmtFixed(floor[1], 2);
	const floorText = `(${fmtFixed(floor[0], 2)}, ${fmtFixed(floor[1], 2)})`;
	const ghostsAtFloor = ghosts.filter((g) => {
		const [w, b] = g.run.at(g.upto);
		return fmtFixed(w, 2) === fmtFixed(floor[0], 2) && fmtFixed(b, 2) === fmtFixed(floor[1], 2);
	}).length;
	const lr = LAND_LR[mode];
	const maxSteps = STEP_CHOICES[mode][STEP_CHOICES[mode].length - 1];
	const floorCut = cutTemp(mode, floor[0], floor[1]) as number;

	let note;
	if (blown) {
		note = (
			<p className={styles.bad}>
				<span className={styles.divTag}>發散</span> 參數在第 {fmtInt(run.blowUp as number)} 步變得非常大，停下來了。換一個起點試試。
			</p>
		);
	} else if (computing) {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>快轉中：</span>第 <span className={styles.stepCount}>{fmtInt(shown)}</span> 步，在瀏覽器裡一段一段算。
			</p>
		);
	} else if (mode === 'std') {
		note = atFloor ? (
			<p className={styles.ok}>
				<span className={styles.tagWord}>走到谷底 {floorText}，損失 {lossText(FLOOR_LOSS)}。</span>
				{ghostsAtFloor > 0 ? `之前的 ${ghostsAtFloor} 條灰色路徑也停在同一個地方：` : '換個地方再點一次：'}
				只有一個谷，從哪裡出發都走到同一個底，這種地形叫「凸」。
			</p>
		) : (
			<p className={styles.plain}>
				<span className={styles.tagWord}>第 {fmtInt(shown)} 步還沒到谷底 {floorText}。</span>
				{target < maxSteps ? `選「${stepWord(maxSteps)}」，看它走到哪裡。` : '再多走幾步。'}
			</p>
		);
	} else {
		note =
			shown >= maxSteps ? (
				<p className={styles.note}>
					<span className={styles.tagWord}>
						第 {stepsText(shown)}：分界 {cut.text}，損失 {lossText(lossNow)}，
					</span>
					還沒到谷底（分界 {cutText(floorCut)} °C、損失 {lossText(FLOOR_LOSS)}）。學習率只能用很小的 {lr}（上限約 2 ÷ 119 ≈ 0.017，學習率 1 一步就飛出去），沿著又長又窄的谷底每一步只挪一點點。標準化之後，學習率 1 走 3,000 步就到谷底。
				</p>
			) : (
				<p className={styles.note}>
					<span className={styles.tagWord}>又長又窄、斜著放的谷。</span>
					學習率只能用很小的 {lr}（上限約 2 ÷ 119 ≈ 0.017）：橫越窄的方向一下子就到谷底，沿著長的方向每一步只挪一點點，第 {fmtInt(shown)} 步分界才 {cut.text}。選「{stepWord(maxSteps)}」快轉。
				</p>
			);
	}

	const summary = computing
		? ''
		: `${mode === 'std' ? '標準化' : '不標準化'}，學習率 ${lr}，從 ${vecText(run.start)} 出發，第 ${fmtInt(shown)} 步：w = ${wText(mode, wNow)}，b = ${paramText(bNow)}，損失 ${lossText(lossNow)}，分界 ${cut.text.replace('°C', '度')}，準確率 ${accText(correct / N_DAYS)}。` +
			(atFloor ? '走到谷底。' : '');

	const ticks = TICKS[mode];
	const plotLabel =
		mode === 'std'
			? `示範資料的損失地形：橫軸 w 從 −10 到 2，縱軸 b 從 −4 到 4，灰色等高線是一樣高的地方，斜放的橢圓山谷，谷底在 ${floorText}。紫色是學習率 1 的梯度下降路徑，從 ${vecText(run.start)} 出發，第 ${fmtInt(shown)} 步在 ${pointText(mode, [wNow, bNow])}。`
			: `不標準化的損失地形：橫軸 w 從 −1.1 到 0.3，縱軸 b 從 −3 到 17，又長又窄、斜著放的谷，谷底在 (${fmtFixed(floor[0], 2)}, ${fmtFixed(floor[1], 2)})。紫色是學習率 0.01 的梯度下降路徑，從 ${vecText(run.start)} 出發，第 ${fmtInt(shown)} 步在 ${pointText(mode, [wNow, bNow])}。`;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="損失地形互動示範：點任何地方當起點，看梯度下降走到哪裡">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>
					損失地形：點任何地方當起點<span className={styles.demoTag}>示範資料</span>
				</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`}>
					示範資料 40 天的平均二元交叉熵 loss(w, b)。灰線是一樣高的地方（數字是損失，nat），紫色是梯度下降的路徑：學習率固定是 {mode === 'std' ? '1' : '0.01'}。
				</p>
			</div>

			<div className={styles.controls}>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={modeId}>
						特徵
					</span>
					<div className={styles.chips} role="group" aria-labelledby={modeId}>
						{MODES.map((m) => (
							<button key={m.key} type="button" className={styles.chip} aria-pressed={mode === m.key} onClick={() => pickMode(m.key)}>
								{m.label}
							</button>
						))}
					</div>
				</div>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={startId}>
						起點 (w, b)
					</span>
					<div className={styles.chips} role="group" aria-labelledby={startId}>
						{START_PRESETS[mode].map((p) => (
							<button
								key={p.label}
								type="button"
								className={styles.chip}
								aria-pressed={run.start[0] === p.p[0] && run.start[1] === p.p[1]}
								aria-label={`從 ${p.label} 出發`}
								onClick={() => startAt(p.p, true)}
							>
								{p.label}
							</button>
						))}
					</div>
				</div>
				<form className={styles.startForm} onSubmit={submitDraft} aria-label="輸入起點">
					<span className={`${styles.small} ${styles.muted}`}>或輸入：</span>
					<label className={styles.numField}>
						<span className={styles.varName}>w</span>
						<input
							className={styles.num}
							type="number"
							inputMode="decimal"
							step={START_STEP[mode][0]}
							min={view.wMin}
							max={view.wMax}
							value={draft[0]}
							aria-label={`起點的 w（${shortText(view.wMin)} 到 ${shortText(view.wMax)}）`}
							onChange={(e) => {
								const v = e.currentTarget.value;
								setDraft((d) => [v, d[1]]);
							}}
						/>
					</label>
					<label className={styles.numField}>
						<span className={styles.varName}>b</span>
						<input
							className={styles.num}
							type="number"
							inputMode="decimal"
							step={START_STEP[mode][1]}
							min={view.bMin}
							max={view.bMax}
							value={draft[1]}
							aria-label={`起點的 b（${shortText(view.bMin)} 到 ${shortText(view.bMax)}）`}
							onChange={(e) => {
								const v = e.currentTarget.value;
								setDraft((d) => [d[0], v]);
							}}
						/>
					</label>
					<button type="submit" className={`${styles.chip} ${styles.action}`} disabled={dp === null}>
						從這裡出發
					</button>
				</form>
				<div className={styles.controlRow}>
					<span className={styles.controlLabel} id={stepsId}>
						走到第幾步
					</span>
					<div className={styles.chips} role="group" aria-labelledby={stepsId}>
						{STEP_CHOICES[mode].map((n) => (
							<button key={n} type="button" className={styles.chip} aria-pressed={target === n} onClick={() => setTarget(n)}>
								{stepWord(n)}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className={styles.group}>
				<div ref={wrapRef} className={styles.plotWrap}>
					<svg
						className={`${styles.plot} ${styles.draggable} ${dragging ? styles.grabbing : ''}`}
						viewBox={`0 0 ${width} ${fr.height}`}
						role="img"
						aria-label={plotLabel}
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
						<rect className={styles.plotBg} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />

						{/* 刻度 */}
						{ticks.w.map((t) => (
							<g key={`w${t}`}>
								<line className={styles.gridMinor} x1={fr.sx(t)} y1={fr.top} x2={fr.sx(t)} y2={fr.bottom} />
								<text className={styles.tickText} x={fr.sx(t)} y={fr.bottom + 16} textAnchor="middle">
									{shortText(t)}
								</text>
							</g>
						))}
						{ticks.b.map((t) => (
							<g key={`b${t}`}>
								<line className={styles.gridMinor} x1={fr.left} y1={fr.sy(t)} x2={fr.right} y2={fr.sy(t)} />
								<text className={styles.tickText} x={fr.left - 6} y={fr.sy(t) + 4} textAnchor="end">
									{shortText(t)}
								</text>
							</g>
						))}
						<text className={styles.axisTitle} x={fr.right} y={fr.bottom + 34} textAnchor="end">
							{mode === 'std' ? 'w（權重）' : 'w（特徵是氣溫）'}
						</text>
						<text className={styles.axisTitle} x={4} y={14} textAnchor="start">
							b（偏差）
						</text>

						{/* 等高線 */}
						<g clipPath={`url(#${clipId})`}>
							{contourPaths.map((c) => (
								<path key={c.level} className={`${styles.contour} ${c.level === LEVELS[mode][0] ? styles.contourLow : ''}`} d={c.d} />
							))}
						</g>
						{shownLabels.map((l) => (
							<g key={l.level}>
								<rect className={styles.contourBg} x={l.box.x0} y={l.box.y0 + 1} width={l.box.x1 - l.box.x0} height={l.box.y1 - l.box.y0 - 2} rx={3} />
								<text className={styles.contourText} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central">
									{l.text}
								</text>
							</g>
						))}

						{/* 之前的路徑 */}
						<g clipPath={`url(#${clipId})`}>
							{ghostGeoms.map((g) => (
								<g key={g.key}>
									<path className={styles.ghostPath} d={g.d} />
									<circle className={styles.ghostDot} cx={g.start[0]} cy={g.start[1]} r={4} />
									<circle className={styles.ghostDot} cx={g.end[0]} cy={g.end[1]} r={3} />
								</g>
							))}
						</g>

						{/* 現在的路徑 */}
						<g clipPath={`url(#${clipId})`}>
							<path className={styles.path} d={geom.d} />
							{geom.marks.map(([x, y], i) => (
								<circle key={i} className={styles.pathDot} cx={x} cy={y} r={2.6} />
							))}
						</g>
						<circle className={styles.startRing} cx={startPx[0]} cy={startPx[1]} r={6} />
						<circle className={styles.nowDot} cx={geom.end[0]} cy={geom.end[1]} r={5.5} />
						<text className={`${styles.pointText} ${styles.halo}`} x={startPx[0] + (startLeft ? -10 : 10)} y={startLabelY} textAnchor={startLeft ? 'end' : 'start'}>
							起點
						</text>
						{/* 谷底 */}
						<path className={styles.star} d={starPath(floorPx[0], floorPx[1], starR)} />
						<text className={`${styles.starText} ${styles.halo}`} x={floorPx[0]} y={floorPx[1] - starR - 6} textAnchor="middle">
							谷底
						</text>
						{showDraft && dp ? <circle className={styles.draftRing} cx={fr.sx(dp[0])} cy={fr.sy(dp[1])} r={8} /> : null}

						<rect className={styles.frameLine} x={fr.left} y={fr.top} width={fr.right - fr.left} height={fr.bottom - fr.top} />
					</svg>
				</div>
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swContour}`} />
						等高線（數字是損失）
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swPath}`} />
						梯度下降的路徑
					</span>
					{ghosts.length > 0 ? (
						<span className={styles.legendItem}>
							<span className={`${styles.sw} ${styles.swGhost}`} />
							之前的路徑
						</span>
					) : null}
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swStar}`} />
						谷底 {mode === 'std' ? floorText : `(${fmtFixed(floor[0], 2)}, ${fmtFixed(floor[1], 2)})`}
					</span>
				</div>
				<p className={styles.hint} id={hintId}>
					點一下圖上任何地方（或按著拖動）當起點；之前的路徑留成灰色，最多 {MAX_GHOSTS} 條。路徑上的點是第 1–9、10、20、…、100、200、… 步：點越擠，步伐越小。
				</p>
				{ghosts.length > 0 ? (
					<div className={styles.chips}>
						<button type="button" className={styles.chip} onClick={() => setGhosts([])}>
							清除之前的路徑
						</button>
					</div>
				) : null}
			</div>

			<div className={styles.group}>
				<p className={styles.small}>
					學習率 {lr}，從 {vecText(run.start)} 出發，第 <span className={styles.stepCount}>{fmtInt(shown)}</span> 步
					{computing ? '（快轉中）' : ''}
				</p>
				<div className={styles.stats}>
					<div className={styles.stat}>
						<span className={styles.statLabel}>參數</span>
						<span className={`${styles.statValue} ${styles.pathValue}`}>
							<span className={styles.nowrap}>w = {wText(mode, wNow)}</span> <span className={styles.nowrap}>b = {paramText(bNow)}</span>
						</span>
						<span className={styles.statSub}>谷底 {mode === 'std' ? floorText : `(${fmtFixed(floor[0], 2)}, ${fmtFixed(floor[1], 2)})`}</span>
					</div>
					<div className={styles.stat}>
						<span className={styles.statLabel}>損失</span>
						<span className={`${styles.statValue} ${styles.lossValue}`}>{lossText(lossNow)}</span>
						<span className={styles.statSub}>谷底 {lossText(FLOOR_LOSS)}</span>
					</div>
					<div className={styles.stat}>
						<span className={styles.statLabel}>分界氣溫</span>
						<span className={styles.statValue}>{cut.text}</span>
						<span className={styles.statSub}>{cut.sub}</span>
					</div>
					<div className={styles.stat}>
						<span className={styles.statLabel}>準確率</span>
						<span className={`${styles.statValue} ${styles.accValue}`}>{accText(correct / N_DAYS)}</span>
						<span className={styles.statSub}>
							{correct}／{N_DAYS} 天猜對
						</span>
					</div>
				</div>
			</div>

			{note}

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>
		</section>
	);
}
