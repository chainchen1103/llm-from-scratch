import { useId, useMemo, useState, type ReactNode } from 'react';
import styles from './Ep02Sums.module.css';
import { FLOAT32_MIN, FLOAT64_MIN, MAX_N, P_MAX, P_MIN, firstZero, fixed, pow10Parts, pyFloat, scaleDomain, shortFloat, simulateSeq } from './ep02-sums.ts';

/**
 * 連乘下溢 vs log 加總：每加一個 token，機率就再乘上 p。
 * 並排比較 float64 直接連乘、float32 直接連乘、log 機率加總。
 * 瀏覽器的數字就是 float64，float32 用 Math.fround 每一步存回去，所以結果是真的算出來的，和 NumPy 一模一樣。
 */

const PRESETS = [0.5, 0.1, 0.01];
const HISTORY = 6;
const LOG10_MIN32 = Math.log10(FLOAT32_MIN);
const LOG10_MIN64 = Math.log10(FLOAT64_MIN);

/** 10 的 e 次方，上標排版 */
const Pow10 = ({ L }: { L: number }) => {
	const { m, e } = pow10Parts(L);
	if (e === 0 && m === '1') return <>1</>;
	return (
		<>
			{m === '1' ? '' : `${m} × `}10<sup>{e < 0 ? `−${-e}` : e}</sup>
		</>
	);
};

export default function SequenceProbDemo() {
	const [p, setP] = useState(0.1);
	const [ns, setNs] = useState<number[]>([0]);
	const sliderId = useId();
	const titleId = useId();
	const labelId = useId();

	const n = ns[ns.length - 1];
	const states = useMemo(() => simulateSeq(p, ns), [p, ns]);
	const cur = states[states.length - 1];
	const zeros = useMemo(() => firstZero(p), [p]);
	const lnP = Math.log(p);

	const goTo = (target: number) => {
		const t = Math.min(MAX_N, target);
		if (t <= n) return;
		setNs((prev) => [...prev, t].slice(-HISTORY));
	};
	const add = (k: number) => goTo(n + k);
	const next0 = cur.zero32 === null ? zeros.f32 : cur.zero64 === null ? zeros.f64 : null;
	const reset = () => setNs([0]);

	// 刻度：位置是「10 的幾次方」，0 在最左邊
	const { span, step } = scaleDomain(cur.log10);
	const pos = (L: number) => Math.min(100, (-L / span) * 100);
	const ticks: number[] = [];
	for (let t = 0; t <= span; t += step) ticks.push(-t);
	const mp = pos(cur.log10);
	const labelStyle = mp < 14 ? { left: `${Math.max(mp, 0)}%`, transform: 'translateX(-0.6rem)' } : mp > 86 ? { left: `${mp}%`, transform: 'translateX(calc(-100% + 0.6rem))' } : { left: `${mp}%`, transform: 'translateX(-50%)' };

	let note: ReactNode;
	let noteClass = `${styles.muted} ${styles.small}`;
	if (n === 0) {
		note = <>還沒有 token：機率從 1 開始。按「加 1 個 token」，每加一個，機率就再乘上 p = {p}。</>;
	} else if (cur.zero64 !== null) {
		noteClass = styles.error;
		note = (
			<>
				float64 在第 {cur.zero64} 個 token 變成 0：從這裡開始，不管句子多長，直接連乘算出來的機率都是 0，沒辦法比較哪一句比較可能。log 加總還是 <span className={styles.num}>{fixed(cur.sumLn, 2)}</span>，很普通的數字，比大小一樣準。
			</>
		);
	} else if (cur.zero32 !== null) {
		noteClass = styles.warn;
		note = (
			<>
				float32 在第 {cur.zero32} 個 token 就變成 0 了；float64 還撐得住（目前是 <span className={styles.num}>{pyFloat(cur.f64)}</span>），但也越來越接近它的下限。繼續加看看。
			</>
		);
	} else {
		note = (
			<>
				連乘越來越小（目前是 <span className={styles.num}>{pyFloat(cur.f64)}</span>）；log 加總一路往下，但只是 <span className={styles.num}>{fixed(cur.sumLn, 2)}</span> 這樣的普通數字。
			</>
		);
	}

	return (
		<section className={`not-content ${styles.demo}`} aria-label="連乘下溢與 log 加總互動示範">
			<div className={styles.group}>
				<p className={styles.title} id={titleId}>
					每一個 token 的機率 p
				</p>
				<div className={styles.row}>
					<div className={styles.chips} role="group" aria-labelledby={titleId}>
						{PRESETS.map((v) => (
							<button key={v} type="button" className={`${styles.chip} ${styles.chipNum}`} aria-pressed={p === v} onClick={() => setP(v)}>
								{v}
							</button>
						))}
					</div>
					<label className={styles.small} htmlFor={sliderId} id={labelId}>
						或拖動滑桿
					</label>
					<input
						id={sliderId}
						className={styles.slider}
						type="range"
						min={Math.round(P_MIN * 100)}
						max={Math.round(P_MAX * 100)}
						step={1}
						value={Math.round(p * 100)}
						aria-labelledby={`${titleId} ${labelId}`}
						aria-valuetext={`p = ${p}`}
						onChange={(e) => setP(Number(e.currentTarget.value) / 100)}
					/>
					<span className={styles.pValue}>p = {p.toFixed(2)}</span>
				</div>
				<p className={`${styles.muted} ${styles.small}`}>
					滑桿從 {P_MIN} 到 {P_MAX}。（p 比 0.5 大時，連乘到最後不會剛好變成 0，而是卡在一個極小的數、再乘也不變；一樣存不下真正的機率。）
				</p>
			</div>

			<div className={styles.row}>
				<button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => add(1)} disabled={n >= MAX_N}>
					加 1 個 token
				</button>
				<button type="button" className={styles.button} onClick={() => add(10)} disabled={n >= MAX_N}>
					加 10 個
				</button>
				<button type="button" className={styles.button} onClick={() => add(100)} disabled={n >= MAX_N}>
					加 100 個
				</button>
				<button type="button" className={styles.button} onClick={() => next0 !== null && goTo(next0)} disabled={next0 === null}>
					跳到下一個變成 0 的地方
				</button>
				<button type="button" className={styles.button} onClick={reset} disabled={n === 0}>
					重設
				</button>
			</div>

			<p className={styles.count}>
				<span aria-live="polite">
					已有 <span className={styles.countNum}>{n}</span> 個 token
				</span>
				<span className={`${styles.muted} ${styles.small}`}>整句的機率是 p 連乘 {n} 次；下面卡片裡黃底的那行程式，每加一個 token 就跑一次</span>
			</p>

			<div className={styles.cards}>
				<div className={`${styles.panel} ${cur.zero64 !== null ? styles.panelBad : ''}`}>
					<p className={styles.title}>float64 直接連乘</p>
					<p className={styles.cardSub}>NumPy 預設的小數格式（瀏覽器的數字也是）</p>
					<pre className={styles.code} aria-label="Python 程式">
						<span className={styles.codeLine}>prob = 1.0</span>
						<span className={`${styles.codeLine} ${styles.codeLineSoft}`}>prob *= p</span>
					</pre>
					<p className={`${styles.bigValue} ${cur.f64 === 0 ? styles.bigValueBad : ''}`}>
						{pyFloat(cur.f64)}
					</p>
					{cur.zero64 !== null ? (
						<>
							<p className={`${styles.badge} ${styles.badgeBad}`}>下溢：第 {cur.zero64} 個 token 變成 0</p>
							<p className={`${styles.muted} ${styles.small}`}>前一個 token 時是 <span className={styles.num}>{pyFloat(cur.before64!)}</span>，已經擠在能存的最小正數旁邊。</p>
						</>
					) : (
						<p className={`${styles.muted} ${styles.small}`}>能存的最小正數約 <span className={styles.num}>{shortFloat(FLOAT64_MIN)}</span></p>
					)}
				</div>

				<div className={`${styles.panel} ${cur.zero32 !== null ? styles.panelBad : ''}`}>
					<p className={styles.title}>float32 直接連乘</p>
					<p className={styles.cardSub}>PyTorch 預設的小數格式</p>
					<pre className={styles.code} aria-label="Python 程式">
						<span className={styles.codeLine}>prob = np.float32(1.0)</span>
						<span className={`${styles.codeLine} ${styles.codeLineSoft}`}>prob *= np.float32(p)</span>
					</pre>
					<p className={`${styles.bigValue} ${cur.f32 === 0 ? styles.bigValueBad : ''}`}>{pyFloat(cur.f32, true)}</p>
					{cur.zero32 !== null ? (
						<>
							<p className={`${styles.badge} ${styles.badgeBad}`}>下溢：第 {cur.zero32} 個 token 變成 0</p>
							<p className={`${styles.muted} ${styles.small}`}>前一個 token 時是 <span className={styles.num}>{pyFloat(cur.before32!, true)}</span>。</p>
						</>
					) : (
						<p className={`${styles.muted} ${styles.small}`}>能存的最小正數約 <span className={styles.num}>{shortFloat(FLOAT32_MIN)}</span></p>
					)}
				</div>

				<div className={`${styles.panel} ${styles.panelGood} ${styles.cardWide}`}>
					<p className={styles.title}>log 機率加總 Σ ln p</p>
					<p className={styles.cardSub}>一樣是 float64，只是改成加 ln p</p>
					<pre className={styles.code} aria-label="Python 程式">
						<span className={styles.codeLine}>log_prob = 0.0</span>
						<span className={`${styles.codeLine} ${styles.codeLineSoft}`}>log_prob += np.log(p)</span>
					</pre>
					<p className={styles.bigValue}>{fixed(cur.sumLn, 2)}</p>
					<p className={styles.small}>
						= n × ln p = <span className={styles.num}>{n} × ({fixed(lnP, 4)})</span> = <span className={styles.num}>{fixed(cur.nLnP, 2)}</span>
					</p>
					<p className={styles.small}>
						換算回機率：約 <Pow10 L={cur.log10} />
						{cur.zero64 !== null ? '，float64 存不下，但 log 機率照樣能比大小' : ''}
					</p>
				</div>
			</div>

			<div className={styles.group}>
				<p className={styles.title}>真正的機率有多小？</p>
				<p className={`${styles.muted} ${styles.small}`}>
					下面的刻度是「10 的幾次方」（log 刻度）：每加一個 token，點就往右走一樣的距離，這就是「對數把乘法變成加法」。點走進黃色區，float32 就存不下；走進紅色斜線區，float64 也存不下。
				</p>
				<div className={styles.scale}>
					<div
						className={styles.scaleTrack}
						role="img"
						aria-label={`真正的機率約 ${pow10Parts(cur.log10).m} 乘 10 的 ${pow10Parts(cur.log10).e} 次方；float32 的下限約 10 的 −45 次方，float64 的下限約 10 的 −324 次方`}
					>
						<span className={styles.zone32} style={{ left: `${pos(LOG10_MIN32)}%`, width: `${pos(LOG10_MIN64) - pos(LOG10_MIN32)}%` }} />
						<span className={styles.zone64} style={{ left: `${pos(LOG10_MIN64)}%` }} />
						<span className={styles.wall} style={{ left: `${pos(LOG10_MIN32)}%` }} />
						<span className={styles.wall} style={{ left: `${pos(LOG10_MIN64)}%` }} />
						<span className={styles.marker} style={{ left: `${mp}%` }} />
						<span className={styles.markerLabel} style={labelStyle}>
							≈ <Pow10 L={cur.log10} />
						</span>
					</div>
					<div className={styles.ticks} aria-hidden="true">
						{ticks.map((t, k) => (
							<span key={t} className={`${styles.tick} ${k % 2 === 1 ? styles.tickMinor : ''}`} style={{ left: `${pos(t)}%` }}>
								{t === 0 ? '1' : <Pow10 L={t} />}
							</span>
						))}
					</div>
					<div className={styles.legend} aria-hidden="true">
						<span className={styles.legendItem}>
							<span className={`${styles.swatch} ${styles.zoneOk}`} />
							兩種都存得下
						</span>
						<span className={styles.legendItem}>
							<span className={`${styles.swatch} ${styles.zone32}`} style={{ position: 'static' }} />
							float32 存不下（比 {shortFloat(FLOAT32_MIN)} 小）
						</span>
						<span className={styles.legendItem}>
							<span className={`${styles.swatch} ${styles.zone64}`} style={{ position: 'static' }} />
							float64 也存不下（比 {shortFloat(FLOAT64_MIN)} 小）
						</span>
					</div>
				</div>
			</div>

			<div className={styles.group}>
				<p className={styles.title}>紀錄（最近 {HISTORY} 次）</p>
				<div className={styles.scroll}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th scope="col">token 數</th>
								<th scope="col">float64 連乘</th>
								<th scope="col">float32 連乘</th>
								<th scope="col">Σ ln p</th>
							</tr>
						</thead>
						<tbody>
							{states.map((s) => (
								<tr key={s.n} className={s.n === n ? styles.rowNow : ''}>
									<td>{s.n}</td>
									<td className={s.f64 === 0 ? styles.bad : ''}>{shortFloat(s.f64)}</td>
									<td className={s.f32 === 0 ? styles.bad : ''}>{shortFloat(s.f32)}</td>
									<td>{fixed(s.sumLn, 2)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className={`${styles.muted} ${styles.small}`}>表格裡的數字取 3 位有效數字；上面卡片裡的是 Python 會印出來的完整寫法。</p>
			</div>

			<p className={noteClass} aria-live="polite">
				{note}
			</p>
		</section>
	);
}
