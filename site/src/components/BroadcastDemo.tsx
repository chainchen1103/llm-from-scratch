import { useId, useState } from 'react';
import styles from './Ep01Demos.module.css';
import { broadcast, fmtShape, MAX_DIM, MAX_NDIM, parseShape, size, source, type Shape } from './ep01-arrays.ts';

/**
 * 廣播 broadcasting 互動示範：
 * 輸入兩個形狀，靠右對齊逐維比較，標出被延伸的維度；
 * 結果是一維或二維時，畫出 A、B 延伸後的格子（虛線是「虛擬複製」）和 A + B。
 */

const PRESETS: { a: Shape; b: Shape; label: string }[] = [
	{ a: [2, 3], b: [3], label: '(2, 3) 和 (3,)' },
	{ a: [2, 3], b: [2, 1], label: '(2, 3) 和 (2, 1)' },
	{ a: [2, 3], b: [2], label: '(2, 3) 和 (2,)' },
	{ a: [3], b: [3, 1], label: '(3,) 和 (3, 1)' },
	{ a: [2, 3], b: [], label: '(2, 3) 和一個數字' },
];

function Grid({ result, render, label }: { result: Shape; render: (r: number[]) => { value: number; className: string }; label: string }) {
	const rows = result.length === 2 ? result[0] : 1;
	const cols = result.length >= 1 ? result[result.length - 1] : 1;
	const cells = [];
	for (let i = 0; i < rows; i++)
		for (let j = 0; j < cols; j++) {
			const r = result.length === 2 ? [i, j] : result.length === 1 ? [j] : [];
			const { value, className } = render(r);
			cells.push(
				<span key={`${i}-${j}`} className={`${styles.cell} ${className}`}>
					{value}
				</span>,
			);
		}
	return (
		<div className={styles.grid} style={{ gridTemplateColumns: `repeat(${cols}, auto)` }} role="img" aria-label={label}>
			{cells}
		</div>
	);
}

export default function BroadcastDemo() {
	const [textA, setTextA] = useState('(2, 3)');
	const [textB, setTextB] = useState('(3,)');
	const idA = useId();
	const idB = useId();

	const a = parseShape(textA);
	const b = parseShape(textB);
	const res = a && b ? broadcast(a, b) : null;

	const pick = (p: (typeof PRESETS)[number]) => {
		setTextA(fmtShape(p.a));
		setTextB(fmtShape(p.b));
	};

	const result = res?.result ?? null;
	const drawable = a && b && result && result.length <= 2 && result.every((d) => d <= MAX_DIM);
	const bothStretched = a && b && result && size(result) > Math.max(size(a), size(b));

	return (
		<section className={`not-content ${styles.demo}`} aria-label="廣播互動示範">
			<div className={styles.group}>
				<p className={styles.title}>選一組形狀，或自己輸入</p>
				<div className={styles.chips}>
					{PRESETS.map((p) => (
						<button
							key={p.label}
							type="button"
							className={styles.chip}
							aria-pressed={a !== null && b !== null && fmtShape(a) === fmtShape(p.a) && fmtShape(b) === fmtShape(p.b)}
							onClick={() => pick(p)}
						>
							{p.label}
						</button>
					))}
				</div>
				<div className={styles.row}>
					<label className={styles.label} htmlFor={idA}>
						A 的形狀
					</label>
					<input id={idA} className={styles.input} value={textA} onChange={(e) => setTextA(e.currentTarget.value)} spellCheck={false} autoComplete="off" />
					<label className={styles.label} htmlFor={idB}>
						B 的形狀
					</label>
					<input id={idB} className={styles.input} value={textB} onChange={(e) => setTextB(e.currentTarget.value)} spellCheck={false} autoComplete="off" />
				</div>
				<p className={`${styles.muted} ${styles.small}`}>
					格式像 (2, 3)、(3,) 或 ()（一個數字）。每個維度 1 到 {MAX_DIM}，最多 {MAX_NDIM} 維。
				</p>
			</div>

			{!a || !b ? (
				<p className={styles.error} role="status">
					看不懂{!a ? ' A ' : ''}{!a && !b ? '和' : ''}{!b ? ' B ' : ''}的形狀，請用 (2, 3) 這樣的格式。
				</p>
			) : (
				<>
					<div className={styles.group}>
						<p className={styles.title}>靠右對齊，一欄一欄比較</p>
						<div className={styles.scroll}>
							<table className={styles.align}>
								<tbody>
									<tr>
										<th scope="row">A</th>
										{res!.cols.map((c, k) => (
											<td key={k} className={c.da === null ? styles.dimMissing : `${styles.dimCell} ${c.stretchA ? styles.dimStretched : ''} ${c.out === null ? styles.dimBad : ''}`}>
												{c.da ?? '（1）'}
											</td>
										))}
									</tr>
									<tr>
										<th scope="row">B</th>
										{res!.cols.map((c, k) => (
											<td key={k} className={c.db === null ? styles.dimMissing : `${styles.dimCell} ${c.stretchB ? styles.dimStretched : ''} ${c.out === null ? styles.dimBad : ''}`}>
												{c.db ?? '（1）'}
											</td>
										))}
									</tr>
									<tr>
										<th scope="row">結果</th>
										{res!.cols.map((c, k) => (
											<td key={k} className={c.out === null ? `${styles.dimCell} ${styles.dimBad}` : styles.dimCell}>
												{c.out ?? '✗'}
											</td>
										))}
									</tr>
									<tr>
										<th scope="row" className={styles.muted}>
											規則
										</th>
										{res!.cols.map((c, k) => (
											<td key={k} className={styles.ruleCell}>
												{c.rule}
											</td>
										))}
									</tr>
								</tbody>
							</table>
						</div>
						{res!.cols.length === 0 ? <p className={`${styles.muted} ${styles.small}`}>兩個都是單一數字，直接相加。</p> : null}
					</div>

					<div aria-live="polite">
						{res!.ok ? (
							<p className={bothStretched ? styles.warn : styles.ok}>
								<span className={styles.mono}>
									{fmtShape(a)} + {fmtShape(b)} → {fmtShape(result!)}
								</span>
								{bothStretched ? '　兩邊都被延伸了，結果比 A、B 都大。如果你原本只想逐個相加減，這通常是 bug，而且不會有錯誤訊息。' : '　可以運算。'}
							</p>
						) : (
							<p className={styles.error}>
								<span className={styles.mono}>
									ValueError: operands could not be broadcast together with shapes {fmtShape(a).replace(/ /g, '')} {fmtShape(b).replace(/ /g, '')}
								</span>
								<br />
								靠右對齊後，有一欄兩邊長度不同、而且都不是 1，NumPy 不知道要怎麼延伸，只好報錯。
							</p>
						)}
					</div>

					{drawable ? (
						<div className={styles.group}>
							<p className={styles.title}>實際算算看（A 填 1、2、3⋯，B 填 10、20、30⋯）</p>
							<div className={styles.scroll}>
								<div className={styles.grids}>
									<div className={styles.gridBlock}>
										<Grid
											result={result!}
											label={`A 延伸成 ${fmtShape(result!)}`}
											render={(r) => {
												const s = source(a, r);
												return { value: s.flat + 1, className: `${styles.cellA} ${s.virtual ? styles.cellVirtual : ''}` };
											}}
										/>
										<span className={styles.caption}>A {fmtShape(a)}</span>
									</div>
									<span className={styles.op}>+</span>
									<div className={styles.gridBlock}>
										<Grid
											result={result!}
											label={`B 延伸成 ${fmtShape(result!)}`}
											render={(r) => {
												const s = source(b, r);
												return { value: (s.flat + 1) * 10, className: `${styles.cellB} ${s.virtual ? styles.cellVirtual : ''}` };
											}}
										/>
										<span className={styles.caption}>B {fmtShape(b)}</span>
									</div>
									<span className={styles.op}>=</span>
									<div className={styles.gridBlock}>
										<Grid
											result={result!}
											label={`A + B，形狀 ${fmtShape(result!)}`}
											render={(r) => ({ value: source(a, r).flat + 1 + (source(b, r).flat + 1) * 10, className: styles.cellResult })}
										/>
										<span className={styles.caption}>結果 {fmtShape(result!)}</span>
									</div>
								</div>
							</div>
							<p className={`${styles.muted} ${styles.small}`}>虛線的格子是延伸出來的「虛擬複製」：NumPy 不會真的複製資料，只是計算時重複使用同一個數字。</p>
						</div>
					) : res!.ok ? (
						<p className={`${styles.muted} ${styles.small}`}>結果超過二維或太大，這裡只比較形狀，不畫格子。</p>
					) : null}
				</>
			)}
		</section>
	);
}
