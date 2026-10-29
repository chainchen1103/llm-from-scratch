import { Fragment, useEffect, useId, useRef, useState } from 'react';
import styles from './Ep07Loss.module.css';
import { plotFrame } from './ep04-calc.ts';
import {
	G_Z_MAX,
	G_Z_MIN,
	G_Z_STEP,
	GQ_DIGITS,
	GRAD_PRESETS,
	gradInfo,
	gzText,
	NEAR_ZERO,
	numSpoken,
	probText,
	ratioText,
	sigFixed,
	signedText,
	snapZ,
	TOKENS,
	vecText,
	type GradPreset,
	type LossKind,
	type NumText,
} from './ep07-loss.ts';

/**
 * Softmax＋交叉熵的梯度 q − y。
 * 三個分數 z 經 Softmax 變成機率 q，點選正確答案（one-hot y）；箭頭是負梯度：交叉熵是 y − q，
 * 均方誤差是 −(2/3)(q − y) 這一列乘上 Softmax 的 Jacobian diag(q) − q qᵀ。兩種箭頭用同樣的比例尺（長度 1 是滿格），
 * 另一種損失的箭頭畫成虛線，方便比較。很有把握卻答錯時，均方誤差的箭頭被 Jacobian 壓到幾乎是 0（弄壞它 2）。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 600;
const sup = (k: number) => String(k).replace('-', '−');
const LOSSES: { key: LossKind; label: string }[] = [
	{ key: 'ce', label: '交叉熵' },
	{ key: 'mse', label: '均方誤差' },
];

function Num({ t }: { t: NumText }) {
	if (t.kind === 'inf') return <span className={styles.nowrap}>∞</span>;
	if (t.kind === 'plain') return <span className={styles.nowrap}>{t.text}</span>;
	return (
		<span className={styles.nowrap}>
			{t.mant} × 10<sup>{sup(t.exp)}</sup>
		</span>
	);
}

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

/** Jacobian 的格子：4 位小數；小到四捨五入會變成 0.0000 的寫成「≈ 0」（表格才不會太寬，螢幕閱讀器念出實際的值） */
function JacCell({ v }: { v: number }) {
	const t = vecText(v);
	if (t.kind !== 'sci') return <Num t={t} />;
	return (
		<span className={styles.nowrap} aria-label={numSpoken(t)}>
			≈ 0
		</span>
	);
}

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

const sameZ = (a: readonly number[], b: readonly number[]) => a.every((v, i) => v === b[i]);

/** 箭頭：從 (x, y0) 往上（v > 0）或往下，長度 |v| × A */
function Arrow({ x, y0, v, A, ghost }: { x: number; y0: number; v: number; A: number; ghost?: boolean }) {
	const len = Math.min(1, Math.abs(v)) * A;
	const dir = v > 0 ? -1 : 1;
	const tip = y0 + dir * len;
	if (ghost) {
		// 太短的虛線看起來像雜點，不畫
		if (len < 10) return null;
		const head = Math.min(9, len * 0.6);
		return (
			<g aria-hidden="true">
				<line className={styles.ghostShaft} x1={x} y1={y0} x2={x} y2={tip - dir * head} />
				<polyline className={styles.ghostHead} points={`${x - 6},${tip - dir * head} ${x},${tip} ${x + 6},${tip - dir * head}`} />
			</g>
		);
	}
	if (len < 4) return <circle className={styles.zeroDot} cx={x} cy={y0} r={3.5} />;
	const head = Math.min(11, len);
	return (
		<g aria-hidden="true">
			{len > head ? <line className={styles.arrowShaft} x1={x} y1={y0} x2={x} y2={tip - dir * (head - 1)} /> : null}
			<path className={styles.arrow} d={`M${x - 8} ${tip - dir * head} L${x} ${tip} L${x + 8} ${tip - dir * head} Z`} />
		</g>
	);
}

type PlotProps = {
	width: number;
	q: number[];
	z: number[];
	correct: number;
	push: number[];
	ghost: number[];
	label: string;
};

function GradPlot({ width, q, z, correct, push, ghost, label }: PlotProps) {
	const A = 58;
	const probH = 104;
	// 上面留一行給「機率 q」，機率是 1 的時候數字才不會碰到它；箭頭區上面也留一行給標題
	const pads = { l: 34, r: 6, t: 40 };
	const probTop = pads.t;
	const probBottom = probTop + probH;
	const y0 = probBottom + 94 + A;
	const H = y0 + A + 26;
	const fr = plotFrame(width, H, { xMin: 0, xMax: 3, yMin: 0, yMax: 1 }, { l: pads.l, r: pads.r, t: probTop, b: H - probBottom });
	const { sx, sy } = fr;
	const colW = sx(1) - sx(0);
	const pbw = Math.min(46, colW * 0.42);

	return (
		<svg className={styles.plot} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={label}>
			{/* 機率的格線與刻度 */}
			{[0, 0.5, 1].map((t) => (
				<g key={`p${t}`}>
					<line className={t === 0 ? styles.axisLine : styles.gridMinor} x1={fr.left} y1={sy(t)} x2={fr.right} y2={sy(t)} />
					<text className={styles.tickText} x={fr.left - 6} y={sy(t) + 4} textAnchor="end">
						{String(t)}
					</text>
				</g>
			))}
			<text className={styles.axisTitle} x={fr.left - 6} y={probTop - 26} textAnchor="start" style={{ fontSize: 12 }}>
				機率 q
			</text>

			{/* 箭頭的格線與刻度：長度 1 是滿格 */}
			<line className={styles.gridMinor} x1={fr.left} y1={y0 - A} x2={fr.right} y2={y0 - A} />
			<line className={styles.gridMinor} x1={fr.left} y1={y0 + A} x2={fr.right} y2={y0 + A} />
			<line className={styles.baseLine} x1={fr.left} y1={y0} x2={fr.right} y2={y0} />
			{[
				[1, '+1'],
				[0, '0'],
				[-1, '−1'],
			].map(([v, t]) => (
				<text key={`a${t}`} className={styles.tickText} x={fr.left - 6} y={y0 - (v as number) * A + 4} textAnchor="end">
					{t}
				</text>
			))}
			<text className={styles.axisTitle} x={fr.left - 6} y={y0 - A - 30} textAnchor="start" style={{ fontSize: 12 }}>
				負梯度（箭頭）
			</text>

			{TOKENS.map((tok, i) => {
				const cx = sx(i + 0.5);
				const isC = i === correct;
				const qy = sy(q[i]);
				const v = push[i];
				const ax = cx + 7;
				const near = Math.abs(v) < NEAR_ZERO;
				const len = Math.min(1, Math.abs(v)) * A;
				const tip = v > 0 ? y0 - len : y0 + len;
				return (
					<g key={tok}>
						{isC ? <rect className={styles.target} x={cx - pbw / 2 - 4} y={sy(1)} width={pbw + 8} height={sy(0) - sy(1)} /> : null}
						<rect className={isC ? styles.barCorrect : styles.barOther} x={cx - pbw / 2} y={qy} width={pbw} height={Math.max(0, sy(0) - qy)} />
						<text className={`${styles.probText} ${styles.halo}`} x={cx} y={Math.max(probTop - 6, qy - 7)} textAnchor="middle" style={{ fontSize: 12.5 }}>
							<SvgNum t={probText(q[i], GQ_DIGITS)} />
						</text>
						<text className={isC ? `${styles.tokenText}` : styles.tokenText} x={cx} y={probBottom + 21} textAnchor="middle">
							{tok}
							{isC ? (
								<tspan className={styles.correctText} dx="0.3em" style={{ fontSize: 12 }}>
									正確
								</tspan>
							) : null}
						</text>
						<text className={styles.subText} x={cx} y={probBottom + 40} textAnchor="middle">
							z = {gzText(z[i])}
						</text>

						<Arrow x={cx - 9} y0={y0} v={ghost[i]} A={A} ghost />
						<Arrow x={ax} y0={y0} v={v} A={A} />
						{near ? (
							<>
								<text className={`${styles.pushText} ${styles.halo}`} x={ax} y={y0 - 12} textAnchor="middle" style={{ fontSize: 12.5 }}>
									<SvgNum t={signedText(v)} />
								</text>
								<text className={`${styles.subText} ${styles.halo}`} x={ax} y={y0 + 19} textAnchor="middle">
									幾乎是 0
								</text>
							</>
						) : (
							<text className={`${styles.pushText} ${styles.halo}`} x={ax} y={v > 0 ? tip - 9 : tip + 18} textAnchor="middle" style={{ fontSize: 12.5 }}>
								<SvgNum t={signedText(v)} />
							</text>
						)}
					</g>
				);
			})}
		</svg>
	);
}

export default function SoftmaxGradDemo() {
	const [z, setZ] = useState<number[]>(() => [...GRAD_PRESETS[0].z]);
	const [correct, setCorrect] = useState(GRAD_PRESETS[0].correct);
	const [loss, setLoss] = useState<LossKind>('ce');
	const [width, setWidth] = useState(DEFAULT_W);
	const plotRef = useRef<HTMLDivElement>(null);
	const uid = useId();
	const presetId = `${uid}-presets`;

	useEffect(() => {
		const el = plotRef.current;
		if (!el) return;
		const update = () => {
			const v = Math.round(el.getBoundingClientRect().width);
			if (v > 0) setWidth(v);
		};
		update();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const g = gradInfo(z, correct);
	const ce = loss === 'ce';
	const push = ce ? g.cePush : g.msePush;
	const ghost = ce ? g.msePush : g.cePush;
	const tokC = TOKENS[correct];
	const qC = g.q[correct];
	const argmax = g.q.indexOf(Math.max(...g.q));
	const wrongSure = qC < 0.01 && argmax !== correct;
	const rightSure = qC > 0.99;

	const applyPreset = (p: GradPreset) => {
		setZ([...p.z]);
		setCorrect(p.correct);
	};
	const presetOn = (p: GradPreset) => sameZ(z, p.z) && correct === p.correct;
	const setZi = (i: number, v: number) => setZ((cur) => cur.map((x, k) => (k === i ? snapZ(v) : x)));

	const qT = g.q.map((v) => probText(v, GQ_DIGITS));
	const ceT = probText(g.ce, 4);
	const mseT = probText(g.mse, 4);
	const pushT = push.map((v) => signedText(v));
	const cePushC = signedText(g.cePush[correct]);
	const msePushC = signedText(g.msePush[correct]);
	const jacMaxT = vecText(g.jacMax);
	const tinyJac = g.jac.some((row) => row.some((v) => vecText(v).kind === 'sci'));
	const upWrong = TOKENS.filter((_, i) => i !== correct && g.msePush[i] > 0);

	// ----- 說明 -----
	let note;
	if (wrongSure && ce) {
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>很有把握卻答錯：</span>正確答案「{tokC}」只拿到 <Num t={qT[correct]} />，交叉熵 <Num t={ceT} /> nat，它的箭頭 <Num t={cePushC} /> 接近 1：最需要改的時候推得最用力。切換成均方誤差看看。
			</p>
		);
	} else if (wrongSure) {
		note = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>均方誤差的箭頭幾乎消失：</span>損失 <Num t={mseT} /> 不小，梯度卻被 Jacobian 壓到幾乎是 0：Jacobian 最大的一格只有 <Num t={jacMaxT} />
				，對 q 的梯度 ⅔(q − y) 乘上去就幾乎是 0。交叉熵對 q 的梯度 −1/q<sub>{tokC}</sub> = {sigFixed(g.ceDq, 4)}，剛好抵掉 Jacobian 裡的 q<sub>{tokC}</sub>，留下 q − y（虛線）。越有把握地答錯，均方誤差越推不動（弄壞它 2）。
			</p>
		);
	} else if (rightSure) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>很有把握答對：</span>q ≈ y，箭頭都幾乎是 0，不用再改。
			</p>
		);
	} else if (ce) {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>正確答案的箭頭一定往上：</span>y − q 在「{tokC}」那一格是 1 − q<sub>{tokC}</sub> &gt; 0，分數被往上推；另外兩格是 −q，被往下壓，壓多少看它們自己的機率。
			</p>
		);
	} else {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>均方誤差的箭頭比較短：</span>每一格都乘過 Jacobian（最大的一格 <Num t={jacMaxT} />）。
				{upWrong.length > 0 ? `方向也不一定和交叉熵一樣：這裡錯的「${upWrong.join('」「')}」也被往上推。` : '正確答案還是往上推，其他往下壓。'}
			</p>
		);
	}

	const summary =
		`${ce ? '交叉熵' : '均方誤差'}，正確答案是${tokC}。q = ${qT.map(numSpoken).join('、')}；` +
		`損失 ${numSpoken(ce ? ceT : mseT)}${ce ? ' nat' : ''}；箭頭 ${TOKENS.map((t, i) => `${t} ${numSpoken(pushT[i])}`).join('、')}。`;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="Softmax 加交叉熵的梯度互動示範：調三個分數、點選正確答案，看每個分數被推往哪邊">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>每個分數被推往哪邊？損失對分數的梯度</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`}>
					三個分數 z 經 Softmax 變成機率 q；正確答案寫成 one-hot y。箭頭是負梯度：往負梯度走，分數照箭頭的方向動，往上是變大、往下是變小，長度 1 是滿格。
				</p>
			</div>

			<div className={styles.controls}>
				<fieldset className={styles.fieldset}>
					<legend className={styles.legendTitle}>正確答案</legend>
					<div className={styles.chips}>
						{TOKENS.map((t, i) => (
							<label key={t} className={`${styles.chip} ${styles.chipCorrect}`}>
								<input className={styles.radio} type="radio" name={`${uid}-correct`} value={i} checked={correct === i} onChange={() => setCorrect(i)} />
								<span>{t}</span>
							</label>
						))}
					</div>
				</fieldset>
				<fieldset className={styles.fieldset}>
					<legend className={styles.legendTitle}>損失</legend>
					<div className={styles.chips}>
						{LOSSES.map((l) => (
							<label key={l.key} className={styles.chip}>
								<input className={styles.radio} type="radio" name={`${uid}-loss`} value={l.key} checked={loss === l.key} onChange={() => setLoss(l.key)} />
								<span>{l.label}</span>
							</label>
						))}
					</div>
				</fieldset>
			</div>

			<div className={styles.group}>
				<span className={styles.legendTitle} id={presetId}>
					例子
				</span>
				<div className={styles.chips} role="group" aria-labelledby={presetId}>
					{GRAD_PRESETS.map((p) => (
						<button key={p.key} type="button" className={styles.chip} aria-pressed={presetOn(p)} onClick={() => applyPreset(p)}>
							{p.label}
						</button>
					))}
				</div>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.panel}>
				<div ref={plotRef}>
					<GradPlot
						width={width}
						q={g.q}
						z={z}
						correct={correct}
						push={push}
						ghost={ghost}
						label={`上面是 Softmax 的機率長條，正確答案是${tokC}；下面是每個分數的負梯度箭頭（${ce ? '交叉熵' : '均方誤差'}）：${TOKENS.map((t, i) => `${t} ${numSpoken(pushT[i])}`).join('、')}。`}
					/>
				</div>
				<div className={styles.legend}>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swCorrect}`} aria-hidden="true" />
						<span>正確答案的機率</span>
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swTarget}`} aria-hidden="true" />
						<span>y = 1（one-hot）</span>
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swPush}`} aria-hidden="true" />
						<span>{ce ? '交叉熵' : '均方誤差'}的箭頭</span>
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.sw} ${styles.swGhost}`} aria-hidden="true" />
						<span>虛線：{ce ? '均方誤差' : '交叉熵'}的箭頭（同樣的比例尺）</span>
					</span>
				</div>
			</div>

			<div className={styles.sliders}>
				{TOKENS.map((t, i) => {
					const id = `${uid}-z${i}`;
					return (
						<div key={t} className={styles.sliderBox}>
							<label className={styles.small} htmlFor={id}>
								{t}的分數 z<sub>{t}</sub> = <span className={styles.value}>{gzText(z[i])}</span>
							</label>
							<input
								id={id}
								className={styles.slider}
								type="range"
								min={G_Z_MIN}
								max={G_Z_MAX}
								step={G_Z_STEP}
								value={z[i]}
								aria-valuetext={`${t}的分數 ${gzText(z[i])}，機率 ${numSpoken(qT[i])}`}
								onChange={(e) => setZi(i, Number(e.currentTarget.value))}
							/>
							<div className={styles.scale} aria-hidden="true">
								<span>−8</span>
								<span>0</span>
								<span>8</span>
							</div>
						</div>
					);
				})}
			</div>

			<div className={styles.cols}>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>損失（正確答案是{tokC}）</p>
					<p className={styles.deriv}>
						<span className={ce ? styles.result : styles.muted}>交叉熵 −ln q<sub>{tokC}</sub> =</span>
						<span className={ce ? `${styles.result} ${styles.big}` : styles.muted}>
							<Num t={ceT} /> nat
						</span>
					</p>
					<p className={styles.deriv}>
						<span className={ce ? styles.muted : styles.result}>均方誤差 mean((q − y)²) =</span>
						<span className={ce ? styles.muted : `${styles.result} ${styles.big}`}>
							<Num t={mseT} />
						</span>
					</p>
					<p className={styles.derivNote}>
						交叉熵用 logsumexp(z) − z<sub>{tokC}</sub> 算，不會下溢；均方誤差是 3 個 (q − y)² 取平均。
					</p>
					<div className={styles.matWrap}>
						<table className={styles.mat}>
							<caption>
								Softmax 的 Jacobian diag(q) − q qᵀ（第 i 列第 j 欄是 ∂q<sub>i</sub>/∂z<sub>j</sub>
								{tinyJac ? '；≈ 0 是小到 4 位小數看不出來的數' : ''}）
							</caption>
							<thead>
								<tr>
									<th scope="col">
										<span className={styles.srOnly}>q 對 z</span>
									</th>
									{TOKENS.map((t) => (
										<th key={t} scope="col">
											z<sub>{t}</sub>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{g.jac.map((row, i) => (
									<tr key={i} className={ce && i === correct ? styles.matPick : undefined}>
										<th scope="row">q<sub>{TOKENS[i]}</sub></th>
										{row.map((v, j) => (
											<td key={j}>
												<JacCell v={v} />
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
				<div className={styles.calc}>
					<p className={styles.calcTitle}>箭頭怎麼來（{ce ? '交叉熵' : '均方誤差'}）</p>
					{ce ? (
						<>
							<p className={styles.deriv}>
								<span>y =</span>
								<span>({TOKENS.map((_, i) => (i === correct ? 1 : 0)).join(', ')})</span>
							</p>
							<p className={styles.deriv}>
								<span className={styles.qName}>q =</span>
								<Tuple ts={qT} />
							</p>
							<p className={styles.deriv}>
								<span>梯度 q − y =</span>
								<Tuple ts={g.ceGrad.map((v) => vecText(v))} />
							</p>
							<p className={styles.deriv}>
								<span className={styles.pushName}>箭頭 y − q =</span>
								<Tuple ts={pushT} />
							</p>
							<p className={styles.derivNote}>
								對 q 的梯度只有「{tokC}」那一格：−1/q<sub>{tokC}</sub> = {sigFixed(g.ceDq, 4)}。乘上 Jacobian 的「{tokC}」那一列（標色的列，每一格都帶著 q<sub>{tokC}</sub>），剛好抵掉，留下 q − y。
							</p>
						</>
					) : (
						<>
							<p className={styles.deriv}>
								<span>對 q 的梯度 ⅔(q − y) =</span>
								<Tuple ts={g.mseDq.map((v) => vecText(v))} />
							</p>
							<p className={styles.deriv}>
								<span>乘上 Jacobian：梯度 =</span>
								<Tuple ts={g.mseGrad.map((v) => vecText(v))} />
							</p>
							<p className={styles.deriv}>
								<span className={styles.pushName}>箭頭 −梯度 =</span>
								<Tuple ts={pushT} />
							</p>
							<p className={styles.derivNote}>一列 × Jacobian（EP05）：第 j 格是 Σ<sub>i</sub> ⅔(q<sub>i</sub> − y<sub>i</sub>) · q<sub>i</sub>(δ<sub>ij</sub> − q<sub>j</sub>)。Jacobian 的格子越小，箭頭越短。</p>
						</>
					)}
				</div>
			</div>

			<p className={styles.small}>
				<span className={styles.tagWord}>正確答案「{tokC}」的箭頭：</span>交叉熵 <Num t={cePushC} />、均方誤差 <Num t={msePushC} />
				{g.ratio !== null ? `，交叉熵約 ${ratioText(g.ratio)} 倍。` : '。'}
			</p>

			{note}
		</section>
	);
}
