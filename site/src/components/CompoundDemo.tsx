import { useId, useState } from 'react';
import styles from './Ep02Curves.module.css';
import { COMPOUND_STEPS, compound, E, fmtInt, fmtSig3, LINE_MAX, LINE_MIN, linePos, pyRepr } from './ep02-curves.ts';

/**
 * 用複利找到 e：存 1 元、年利率 100%，一年結算 n 次，年底拿回 (1 + 1/n)^n 元。
 * 選不同的 n，看結果在數線上越來越靠近 e，但永遠不會超過 e。
 * 數字和 Python 的 (1 + 1/n) ** n 逐位相同（見 ep02-curves.ts 的 powInt）。
 */

const VALUES = COMPOUND_STEPS.map(({ n }) => compound(n));
const TICKS = Array.from({ length: 16 }, (_, i) => LINE_MIN + i * 0.05); // 2.00, 2.05, …, 2.75
const TICK_LABELS = [2, 2.25, 2.5, 2.75];
const pct = (v: number) => `${(linePos(v) * 100).toFixed(3)}%`;

export default function CompoundDemo() {
	const [idx, setIdx] = useState(3); // n = 12
	const titleId = useId();
	const { n, period } = COMPOUND_STEPS[idx];
	const value = VALUES[idx];
	const nText = fmtInt(n);
	const rate = fmtSig3(100 / n);
	const gap = fmtSig3(E - value).text;

	const how =
		n === 1
			? '一年結算一次：年底一次拿到 100% 的利息，1 元變 2 元。'
			: `${period}結算一次：每次的利息是 1/${nText}（${rate.exact ? '' : '約 '}${rate.text}%），利息馬上加進本金，一年滾 ${nText} 次。`;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="複利找到 e 互動示範">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`} id={titleId}>
					存 1 元、年利率 100%，一年結算幾次（n）？
				</p>
				<div className={styles.chips} role="group" aria-labelledby={titleId}>
					{COMPOUND_STEPS.map((s, i) => (
						<button
							key={s.n}
							type="button"
							className={styles.chip}
							aria-pressed={i === idx}
							aria-label={`n = ${fmtInt(s.n)}，${s.period}結算一次`}
							onClick={() => setIdx(i)}
						>
							{fmtInt(s.n)}
						</button>
					))}
				</div>
			</div>

			<div className={styles.formulaBox} aria-live="polite">
				<p className={`${styles.small} ${styles.muted}`}>{how}</p>
				<p className={styles.srOnly}>
					(1 + 1/{nText}) 的 {nText} 次方 = {pyRepr(value)} 元
				</p>
				<p className={styles.formula} aria-hidden="true">
					<span className={styles.nowrap}>
						(1 + 1/{nText})<sup>{nText}</sup>
					</span>
					<span className={styles.nowrap}>
						= <span className={styles.result}>{pyRepr(value)}</span> 元
					</span>
				</p>
				<p className={styles.small}>
					和 e 還差 <span className={styles.mono}>{gap}</span>
				</p>
			</div>

			<div className={styles.line}>
				<div
					className={styles.lineInner}
					role="img"
					aria-label={`數線從 ${LINE_MIN} 到 ${LINE_MAX}：年底拿回 ${pyRepr(value)} 元，在 e（約 2.71828）的左邊`}
				>
					{TICKS.map((t, i) => (
						<span key={t} className={`${styles.tick} ${i % 5 === 0 ? '' : styles.tickMinor}`} style={{ left: pct(t) }} />
					))}
					{TICK_LABELS.map((t) => (
						<span key={t} className={styles.tickLabel} style={{ left: pct(t) }}>
							{t.toFixed(2)}
						</span>
					))}
					<span className={styles.eMark} style={{ left: pct(E) }}>
						<span className={styles.eLabel}>e ≈ 2.71828</span>
					</span>
					{VALUES.map((v, i) => (i === idx ? null : <span key={i} className={styles.ghost} style={{ left: pct(v) }} />))}
					<span className={styles.dot} style={{ left: pct(value) }} />
				</div>
			</div>

			<div className={styles.legend} aria-hidden="true">
				<span className={styles.legendItem}>
					<span className={styles.legendDot} />
					年底拿回的錢
				</span>
				<span className={styles.legendItem}>
					<span className={styles.legendGhost} />
					其他的 n
				</span>
				<span className={styles.legendItem}>
					<span className={styles.legendDash} />
					e = {pyRepr(E)}…
				</span>
			</div>

			<p className={styles.ok}>
				結算越頻繁，結果越接近 e，但不會無限變多：n 再大，年底拿回的錢都比 e 元少一點點。
				{n >= 365 ? '在這條數線上它已經和 e 疊在一起，差距要看上面的「還差」。' : ''}
			</p>
		</section>
	);
}
