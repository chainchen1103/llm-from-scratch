import { Fragment, useId, useState, type CSSProperties } from 'react';
import styles from './Ep03Matrix.module.css';
import { fmtFactor, fmtMat, fmtNum, fmtShape, fmtVec, matmul, matmulSteps, MATMUL_EXAMPLES, shapeOf } from './ep03-matrix.ts';

/**
 * 矩陣乘法逐格步進：C = L @ R 的每一格都是「L 的一列 · R 的一欄」。
 * 經典排法：左邊的矩陣在左下、右邊的矩陣在右上，C 在右下，C 的每一格剛好對齊它用到的那一列和那一欄。
 * 每按一次「下一格」，亮起 C 的一格和它用到的列（藍）、欄（紫），並寫出這一格的內積算式。
 */

const EXAMPLES = MATMUL_EXAMPLES.map((ex) => ({ ...ex, steps: matmulSteps(ex.L, ex.R), C: matmul(ex.L, ex.R) }));
/** 每個例子的名字和結果的形狀，例如「A @ B 是 (2, 2)」 */
const RESULT_SHAPES = EXAMPLES.map((e) => `${e.left} @ ${e.right} 是 ${fmtShape(shapeOf(e.C))}`);

/** 把格子放到 CSS grid 的第幾列、第幾欄（從 1 數） */
const at = (row: number | string, col: number | string): CSSProperties => ({ gridRow: row, gridColumn: col });

/** 矩陣寫成 [[1, 2, 3], [4, 5, 6]]：只在列和列之間折行，手機上才不會撐破版面 */
const MatText = ({ M }: { M: number[][] }) => (
	<span className={styles.mono}>
		[
		{M.map((r, i) => (
			<Fragment key={i}>
				{i > 0 ? ' ' : ''}
				<span className={styles.nowrap}>
					[{r.map(fmtNum).join(', ')}]{i < M.length - 1 ? ',' : ''}
				</span>
			</Fragment>
		))}
		]
	</span>
);

export default function MatmulStepper() {
	const [exIdx, setExIdx] = useState(0);
	const [k, setK] = useState(0); // 已經算了幾格
	const groupId = useId();

	const ex = EXAMPLES[exIdx];
	const { left, right, L, R, steps, C } = ex;
	const [m, n] = shapeOf(L);
	const [, p] = shapeOf(R);
	const total = steps.length;
	const cur = k > 0 ? steps[k - 1] : null;
	const done = k === total;

	const pick = (i: number) => {
		setExIdx(i);
		setK(0);
	};

	// grid：第 1 欄是列的索引，接著 L 的 n 欄、一條空隙、R 和 C 的 p 欄
	//       第 1 列是 R 的名字，第 2 列是欄的索引，接著 R 的 n 列、L 和 C 的名字、L 和 C 的 m 列
	const colL = (kk: number) => 2 + kk;
	const colR = (j: number) => n + 3 + j;
	const rowR = (kk: number) => 3 + kk;
	const rowL = (i: number) => n + 4 + i;
	const gridStyle: CSSProperties = {
		gridTemplateColumns: `auto repeat(${n}, var(--ep03-cell-w)) var(--ep03-block-gap) repeat(${p}, var(--ep03-cell-w))`,
		gridTemplateRows: `auto auto repeat(${n}, var(--ep03-cell-h)) auto repeat(${m}, var(--ep03-cell-h))`,
	};

	const isDone = (i: number, j: number) => i * p + j < k;
	const cellC = (i: number, j: number) => {
		if (cur && cur.i === i && cur.j === j) return `${styles.cell} ${styles.cellCurrent}`;
		if (isDone(i, j)) return `${styles.cell} ${styles.cellDone}`;
		return `${styles.cell} ${styles.cellPending}`;
	};

	const shapeL = fmtShape([m, n]);
	const shapeR = fmtShape([n, p]);
	const shapeC = fmtShape([m, p]);
	const pyCall = cur ? `${left}[${cur.i}] @ ${right}[:, ${cur.j}]` : '';

	return (
		<section className={`not-content ${styles.demo}`} aria-label="矩陣乘法逐格步進">
			<div className={styles.group}>
				<p className={styles.title} id={groupId}>
					換一組形狀
				</p>
				<div className={styles.chips} role="group" aria-labelledby={groupId}>
					{EXAMPLES.map((e, i) => (
						<button key={e.key} type="button" className={styles.chip} aria-pressed={i === exIdx} onClick={() => pick(i)}>
							{e.left} @ {e.right}
							<span className={styles.chipSub}>
								{fmtShape(shapeOf(e.L))} @ {fmtShape(shapeOf(e.R))}
							</span>
						</button>
					))}
				</div>
			</div>

			{/* 形狀：中間的 n 必須相同，結果是 (m, p) */}
			<div className={styles.shapeBox}>
				<p className={styles.srOnly}>
					形狀 {shapeL} 乘 {shapeR} 得到 {shapeC}。中間的 {n} 必須相同。
				</p>
				<p className={styles.shapeLine} aria-hidden="true">
					<span className={styles.nowrap}>
						(<span className={styles.dimM}>{m}</span>,{' '}
						<span className={styles.same} data-label="必須相同">
							<span className={styles.dimN}>{n}</span>) @ (<span className={styles.dimN}>{n}</span>
						</span>
						, <span className={styles.dimP}>{p}</span>)
					</span>{' '}
					<span className={styles.nowrap}>
						<span className={styles.arrow}>→</span> (<span className={styles.dimM}>{m}</span>, <span className={styles.dimP}>{p}</span>)
					</span>
				</p>
				<p className={`${styles.small} ${styles.muted}`}>
					{left} 有 {m} 列 {n} 欄，{right} 有 {n} 列 {p} 欄。{left} 的欄數要等於 {right} 的列數（都是 {n}），每一格才能做內積；C 的形狀是（{left} 的列數, {right} 的欄數）。
				</p>
			</div>

			<div className={styles.scroll}>
				<div
					className={styles.mgrid}
					style={gridStyle}
					role="img"
					aria-label={`${left} = ${fmtMat(L)}，${right} = ${fmtMat(R)}，C = ${left} @ ${right} 已算 ${k} 格，共 ${total} 格${cur ? `；目前是 C[${cur.i}, ${cur.j}]，用 ${left} 的第 ${cur.i + 1} 列和 ${right} 的第 ${cur.j + 1} 欄` : ''}`}
				>
					{/* 目前這一格的十字：L 的那一列一路延伸到 C，R 的那一欄一路延伸到 C */}
					{cur ? (
						<>
							<span className={styles.bandRow} style={at(rowL(cur.i), `2 / ${colR(cur.j) + 1}`)} />
							<span className={styles.bandCol} style={at(`${rowR(0)} / ${rowL(cur.i) + 1}`, colR(cur.j))} />
						</>
					) : null}

					<span className={styles.matName} style={at(1, `${colR(0)} / span ${p}`)}>
						{right} <span className={styles.matShape}>{shapeR}</span>
					</span>
					{Array.from({ length: p }, (_, j) => (
						<span key={`cj${j}`} className={`${styles.idx} ${cur?.j === j ? styles.idxB : ''}`} style={at(2, colR(j))}>
							{j}
						</span>
					))}
					{R.map((r, kk) =>
						r.map((v, j) => (
							<span key={`r${kk}-${j}`} className={`${styles.cell} ${cur?.j === j ? styles.cellB : ''}`} style={at(rowR(kk), colR(j))}>
								{fmtNum(v)}
							</span>
						)),
					)}

					<span className={styles.matName} style={at(rowL(0) - 1, `2 / span ${n}`)}>
						{left} <span className={styles.matShape}>{shapeL}</span>
					</span>
					<span className={styles.matName} style={at(rowL(0) - 1, `${colR(0)} / span ${p}`)}>
						C <span className={styles.matShape}>{shapeC}</span>
					</span>
					{L.map((_, i) => (
						<span key={`ci${i}`} className={`${styles.idx} ${cur?.i === i ? styles.idxA : ''}`} style={at(rowL(i), 1)}>
							{i}
						</span>
					))}
					{L.map((r, i) =>
						r.map((v, kk) => (
							<span key={`l${i}-${kk}`} className={`${styles.cell} ${cur?.i === i ? styles.cellA : ''}`} style={at(rowL(i), colL(kk))}>
								{fmtNum(v)}
							</span>
						)),
					)}
					{C.map((r, i) =>
						r.map((v, j) => (
							<span key={`c${i}-${j}`} className={cellC(i, j)} style={at(rowL(i), colR(j))}>
								{isDone(i, j) ? fmtNum(v) : '?'}
							</span>
						)),
					)}
				</div>
			</div>
			<p className={`${styles.small} ${styles.muted}`}>
				灰色小字是 Python 的索引（從 0 數）：{left} 的第 1 列是 <span className={styles.num}>{left}[0]</span>，{right} 的第 1 欄是 <span className={styles.num}>{right}[:, 0]</span>。
			</p>

			{/* 不能按的按鈕用 aria-disabled（不用 disabled）：按到最後一格時鍵盤焦點才不會不見；在不能按的狀態下按了也不會改變任何東西 */}
			<div className={styles.row}>
				<button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => setK((x) => Math.min(x + 1, total))} aria-disabled={done}>
					下一格
				</button>
				<button type="button" className={styles.button} onClick={() => setK((x) => Math.max(x - 1, 0))} aria-disabled={k === 0}>
					上一格
				</button>
				<button type="button" className={styles.button} onClick={() => setK(total)} aria-disabled={done}>
					全部算完
				</button>
				<button type="button" className={styles.button} onClick={() => setK(0)} aria-disabled={k === 0}>
					重設
				</button>
			</div>

			<div className={styles.formulaBox} aria-live="polite" aria-atomic="true">
				{cur ? (
					<>
						<p className={styles.srOnly}>
							C[{cur.i}, {cur.j}] 等於 {left} 的第 {cur.i + 1} 列和 {right} 的第 {cur.j + 1} 欄的內積：
							{cur.row.map((a, kk) => `${fmtNum(a)} 乘 ${fmtNum(cur.col[kk])}`).join(' 加 ')}，等於 {fmtNum(cur.value)}。
						</p>
						<p className={styles.calc} aria-hidden="true">
							<span className={styles.nowrap}>
								<strong>
									C[{cur.i}, {cur.j}]
								</strong>{' '}
								=
							</span>{' '}
							<span className={styles.nowrap}>
								<span className={styles.textA}>
									{left} 的第 {cur.i + 1} 列
								</span>{' '}
								·{' '}
								<span className={styles.textB}>
									{right} 的第 {cur.j + 1} 欄
								</span>
							</span>
						</p>
						<p className={styles.calc} aria-hidden="true">
							<span className={styles.nowrap}>
								= <span className={styles.textA}>{fmtVec(cur.row)}</span> · <span className={styles.textB}>{fmtVec(cur.col)}</span>
							</span>
						</p>
						<p className={styles.calc} aria-hidden="true">
							<span className={styles.nowrap}>=</span>{' '}
							{cur.row.map((a, kk) => (
								<span key={kk} className={styles.nowrap}>
									{kk > 0 ? '+ ' : ''}
									<span className={styles.textA}>{fmtFactor(a)}</span>×<span className={styles.textB}>{fmtFactor(cur.col[kk])}</span>{' '}
								</span>
							))}
							<span className={styles.nowrap}>
								= <strong className={styles.calcResult}>{fmtNum(cur.value)}</strong>
							</span>
						</p>
						<p className={`${styles.small} ${styles.muted}`}>
							Python 寫成 <span className={styles.num}>{pyCall}</span>。索引從 0 數，所以 <span className={styles.num}>C[{cur.i}, {cur.j}]</span> 是數學說的第 {cur.i + 1} 列、第 {cur.j + 1} 欄。
						</p>
					</>
				) : (
					<p className={styles.small}>
						按「下一格」開始。C 的每一格都是 {left} 的一列和 {right} 的一欄做內積：<span className={styles.num}>C[i, j]</span> = {left} 的第 i + 1 列 · {right} 的第 j + 1 欄（i、j 是 Python 的索引，從 0 數）。
					</p>
				)}
			</div>

			<p className={styles.count}>
				<span>
					已算 <span className={styles.countNum}>{k}</span> / {total} 格
				</span>
				<span className={`${styles.small} ${styles.muted}`}>
					每格 {n} 次乘法，共 {m} × {n} × {p} = {m * n * p} 次乘法（目前做了 {k * n} 次）
				</span>
			</p>

			{done ? (
				<p className={styles.ok}>
					全部算完：C = {left} @ {right} = <MatText M={C} />，和 NumPy 算的一樣。
					{exIdx === 0
						? '試試「換一組形狀」：同樣兩個矩陣，順序對調會怎樣？'
						: `同樣兩個矩陣，${RESULT_SHAPES[0]}，${RESULT_SHAPES[1]}：順序對調，連形狀都不一樣，矩陣乘法的順序不能隨便換。`}
				</p>
			) : null}
		</section>
	);
}
