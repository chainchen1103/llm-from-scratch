import { useId, useState, type ReactNode } from 'react';
import styles from './Ep06Table.module.css';
import { cellText, conditional, condText, diffText, getTable, NEXT, PREV, realTable, tableDiff, totalText, type Pick } from './ep06-table.ts';

/**
 * 聯合機率表 → 條件機率（工具二的示範表）。
 * 列是前一個字 A（很、不），欄是下一個字 B（冷、熱、好），右邊一欄、下面一列是邊際機率。
 * 點一列：只看那一列，再除以那一列的總和，得到條件分佈 P(B | A)；點一欄：除以那一欄的總和，得到 P(A | B)。
 * 「如果獨立」把每一格換成 P(A) P(B)（np.outer），每一格下面標出「真實 − 如果獨立」差多少；
 * 條件分佈的虛線是另一張表的值（真實的表 ↔ 如果獨立）。
 */

const eq = (exact: boolean) => (exact ? '=' : '≈');

export default function JointTableDemo() {
	const [pick, setPick] = useState<Pick>({ kind: 'row', i: 0 });
	const [indep, setIndep] = useState(false);
	const uid = useId();
	const legendId = `${uid}-legend`;

	const table = getTable(indep);
	const real = realTable();
	const diff = tableDiff();
	const c = conditional(pick, indep);
	const isRow = pick.kind === 'row';
	const rowPicked = (i: number) => pick.kind === 'row' && pick.i === i;
	const colPicked = (j: number) => pick.kind === 'col' && pick.j === j;

	// P(冷 | 很)、P(很 | 冷)
	const condName = (label: string) => `P(${label} | ${c.given})`;
	const varName = isRow ? '下一個字' : '前一個字';
	const givenSumText = cellText(c.givenSum);
	const otherMarginal = (label: string) => `P(${label})`;
	const sumParts = c.items.map((it) => condText(it.value));
	const sumOk = condText(c.sum) === '1.000';

	// ----- 說明 -----
	let note: ReactNode;
	if (!indep && pick.kind === 'row') {
		const i = pick.i;
		const k = 1 - i;
		const o = conditional({ kind: 'row', i: k }, false);
		// 兩列差最多的那個字（「好」：0.417 對 0.750）
		let best = 0;
		c.items.forEach((it, j) => {
			if (Math.abs(it.value - o.items[j].value) > Math.abs(c.items[best].value - o.items[best].value)) best = j;
		});
		const w = NEXT[best];
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>前一個字不同，下一個字的分佈就不同：</span>同樣是「{w}」，前一個字是「{PREV[i]}」時{' '}
				<span className={styles.nowrap}>
					{condName(w)} {eq(c.items[best].exact)} {condText(c.items[best].value)}
				</span>
				，是「{PREV[k]}」時{' '}
				<span className={styles.nowrap}>
					P({w} | {PREV[k]}) {eq(o.items[best].exact)} {condText(o.items[best].value)}
				</span>
				（點「{PREV[k]}」看看）。如果獨立，兩列除完都會是 <span className={styles.nowrap}>P({w}) = {condText(real.colSums[best])}</span>（虛線）。
			</p>
		);
	} else if (!indep && pick.kind === 'col') {
		const j = pick.j;
		const back = conditional({ kind: 'row', i: 0 }, false).items[j];
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>方向反過來，是另一個問題：</span>
				<span className={styles.nowrap}>
					P(很 | {NEXT[j]}) {eq(c.items[0].exact)} {condText(c.items[0].value)}
				</span>{' '}
				是「已經知道下一個字是『{NEXT[j]}』，前一個字是『很』的機率」，不是{' '}
				<span className={styles.nowrap}>
					P({NEXT[j]} | 很) {eq(back.exact)} {condText(back.value)}
				</span>
				。直線 | 右邊是已經知道的事，換邊就要除以另一個總和。
			</p>
		);
	} else {
		const d00 = diffText(diff[0][0]);
		const dist = isRow ? NEXT.map((_, j) => cellText(real.colSums[j])).join(', ') : PREV.map((_, i) => cellText(real.rowSums[i])).join(', ');
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>不獨立：</span>真實的表和「如果獨立」的表不一樣（例如 P(很, 冷) 是 {cellText(real.cells[0][0])}，不是{' '}
				{cellText(table.cells[0][0])}，差 {d00}），所以前一個字和下一個字不獨立。如果真的獨立，不管{isRow ? '前一個字是「很」還是「不」' : '下一個字是什麼'}，除完都是同一個分佈{' '}
				<span className={styles.nowrap}>
					P({varName}) = ({dist})
				</span>
				：知道了也沒用。真實的表除完不是這樣（虛線）。
			</p>
		);
	}

	const summary =
		`${indep ? '如果獨立的表' : '真實的表'}，選了「${c.given}」這一${isRow ? '列' : '欄'}：` +
		c.items.map((it) => `${condName(it.label)} ${eq(it.exact)} ${condText(it.value)}`).join('、') +
		`，加起來是 1。${indep ? '真實的表算出來是 ' + c.items.map((it) => condText(it.other)).join('、') + '。' : ''}`;

	const head = (j: number) => (
		<button
			type="button"
			className={styles.headBtn}
			aria-pressed={colPicked(j)}
			aria-label={`選「${NEXT[j]}」這一欄：看 P(前一個字 | ${NEXT[j]})`}
			onClick={() => setPick({ kind: 'col', j })}
		>
			{NEXT[j]}
		</button>
	);

	return (
		<section className={`not-content ${styles.demo}`} aria-label="聯合機率表與條件機率互動示範">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>
					聯合機率表 → 條件機率<span className={styles.demoTag}>示範數字</span>
				</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`}>
					點列的名字（很、不）看條件分佈 P(下一個字 | 前一個字)：只看那一列，再除以那一列的總和。點欄的名字（冷、熱、好）看反過來的 P(前一個字 | 下一個字)：除以那一欄的總和。
				</p>
			</div>

			<div className={styles.row}>
				<button type="button" className={`${styles.chip} ${styles.toggle}`} aria-pressed={indep} onClick={() => setIndep((v) => !v)}>
					如果獨立：每一格換成 P(A) P(B)
				</button>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.tableWrap}>
				<table className={styles.joint} aria-describedby={indep ? legendId : undefined}>
					<caption>
						{indep ? (
							<>
								<span className={styles.pickText}>如果獨立</span>：每一格是 P(A) P(B)（那一列的總和 × 那一欄的總和）；小字是真實的表減掉這張表
							</>
						) : (
							<>每一格是聯合機率 P(A, B)：前一個字是這一列、而且下一個字是這一欄</>
						)}
					</caption>
					<thead>
						<tr>
							<th scope="col" className={styles.corner}>
								<span className={styles.srOnly}>前一個字 A ＼ 下一個字 B</span>
								<span aria-hidden="true">
									A ＼ B
								</span>
							</th>
							{NEXT.map((w, j) => (
								<th key={w} scope="col" className={colPicked(j) ? styles.picked : undefined}>
									{head(j)}
								</th>
							))}
							<th scope="col" className={`${styles.marginHead} ${styles.marginCol}`}>
								<span className={styles.mono}>P(A)</span>
								<br />
								<span className={styles.nowrap}>列的</span>
								<wbr />
								<span className={styles.nowrap}>總和</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{PREV.map((a, i) => (
							<tr key={a}>
								<th scope="row" className={rowPicked(i) ? styles.picked : undefined}>
									<button
										type="button"
										className={styles.headBtn}
										aria-pressed={rowPicked(i)}
										aria-label={`選「${a}」這一列：看 P(下一個字 | ${a})`}
										onClick={() => setPick({ kind: 'row', i })}
									>
										{a}
									</button>
								</th>
								{NEXT.map((b, j) => {
									const d = diff[i][j];
									const dt = diffText(d);
									const tone = dt.startsWith('+') ? 'more' : dt.startsWith('−') ? 'less' : 'same';
									const cls = [styles.cell, rowPicked(i) || colPicked(j) ? styles.picked : '', indep ? (tone === 'more' ? styles.cellMore : tone === 'less' ? styles.cellLess : '') : '']
										.filter(Boolean)
										.join(' ');
									return (
										<td key={b} className={cls}>
											<span className={styles.cellValue}>{cellText(table.cells[i][j])}</span>
											{indep ? (
												<span className={`${styles.cellDiff} ${styles[tone]}`}>
													<span className={styles.srOnly}>真實的表是 {cellText(real.cells[i][j])}，差 </span>
													{dt}
												</span>
											) : null}
										</td>
									);
								})}
								<td className={`${styles.cell} ${styles.marginCol} ${rowPicked(i) ? styles.divisor : ''}`}>
									<span className={styles.cellValue}>{cellText(table.rowSums[i])}</span>
								</td>
							</tr>
						))}
						<tr className={styles.marginRow}>
							<th scope="row" className={styles.marginHead}>
								<span className={styles.mono}>P(B)</span>
								<br />
								<span className={styles.nowrap}>欄的</span>
								<wbr />
								<span className={styles.nowrap}>總和</span>
							</th>
							{NEXT.map((b, j) => (
								<td key={b} className={`${styles.cell} ${colPicked(j) ? styles.divisor : ''}`}>
									<span className={styles.cellValue}>{cellText(table.colSums[j])}</span>
								</td>
							))}
							<td className={`${styles.cell} ${styles.marginCol}`}>
								<span className={styles.cellValue}>{totalText(table.total)}</span>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			{indep ? (
				<div className={styles.legend} id={legendId}>
					<span className={styles.legendItem}>
						<span className={styles.swMore} />
						真實的比較大（+）
					</span>
					<span className={styles.legendItem}>
						<span className={styles.swLess} />
						真實的比較小（−）
					</span>
					<span>邊際機率（列和欄的總和）兩張表一樣</span>
				</div>
			) : null}

			<div className={styles.calc}>
				<p className={styles.calcTitle}>
					<span className={styles.pickText}>
						P({varName} | {c.given})
					</span>
					：只看「{c.given}」那一{isRow ? '列' : '欄'}，再除以那一{isRow ? '列' : '欄'}的總和{' '}
					<span className={styles.nowrap}>
						P({c.given}) = {givenSumText}
					</span>
					{indep ? '（如果獨立的表）' : ''}
				</p>
				<p className={`${styles.formula} ${styles.muted}`}>{isRow ? 'P(B | A) = P(A, B) / P(A)' : 'P(A | B) = P(A, B) / P(B)'}</p>
				<div className={styles.bars}>
					{c.items.map((it) => {
						const pos = `${(it.other * 100).toFixed(2)}%`;
						return (
							<div key={it.label} className={styles.barRow}>
								<span className={styles.barLabel}>{condName(it.label)}</span>
								<span className={styles.track} aria-hidden="true">
									<span className={styles.fill} style={{ width: `${(it.value * 100).toFixed(2)}%` }} />
									<span className={styles.marker} style={{ left: pos }} />
								</span>
								<span className={styles.barValue}>{condText(it.value)}</span>
								<span className={styles.barCalc}>
									<span>
										= {cellText(it.num)} / {givenSumText} {eq(it.exact)} {condText(it.value)}
									</span>
									<span>
										{indep ? (
											<>
												真實的表：{condText(it.other)}
											</>
										) : (
											<>
												如果獨立：{otherMarginal(it.label)} = {condText(it.other)}
											</>
										)}
									</span>
								</span>
							</div>
						);
					})}
				</div>
				<p className={styles.formula}>
					加起來：{sumParts.join(' + ')} {sumOk ? '= 1' : `≈ ${condText(c.sum)}`}
				</p>
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={styles.swFill} />
						{indep ? '如果獨立的表除出來的' : '真實的表除出來的'}
					</span>
					<span className={styles.legendItem}>
						<span className={styles.swMarker} />
						{indep ? '真實的表除出來的' : `如果獨立會是 P(${varName})`}
					</span>
				</div>
			</div>

			{note}
		</section>
	);
}
