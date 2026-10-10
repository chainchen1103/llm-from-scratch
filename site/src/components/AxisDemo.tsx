import { useState } from 'react';
import styles from './Ep01Demos.module.css';
import { AXIS_M, axisResult, type Axis, type Op } from './ep01-arrays.ts';

/**
 * axis 互動示範：2 × 3 矩陣，切換運算、axis、keepdims，
 * 用顏色標出「哪些數字被合在一起」，並顯示和 NumPy 一樣的輸出與形狀。
 */

const M = AXIS_M;
const COLS = M[0].length;

const OPS: { key: Op; label: string }[] = [
	{ key: 'sum', label: 'sum 加總' },
	{ key: 'mean', label: 'mean 平均' },
	{ key: 'max', label: 'max 最大值' },
	{ key: 'argmax', label: 'argmax 最大值的位置' },
];
const AXES: { key: Axis; label: string }[] = [
	{ key: 'none', label: '不指定' },
	{ key: 0, label: 'axis=0' },
	{ key: 1, label: 'axis=1' },
	{ key: -1, label: 'axis=-1' },
];
const GROUP_CLASS = [styles.g0, styles.g1, styles.g2];

const fmtShape = (s: number[]) => (s.length === 0 ? '()（單一數字）' : s.length === 1 ? `(${s[0]},)` : `(${s.join(', ')})`);

export default function AxisDemo() {
	const [op, setOp] = useState<Op>('sum');
	const [axis, setAxis] = useState<Axis>(0);
	const [keepdims, setKeepdims] = useState(false);

	const ax = axis === -1 ? 1 : axis;
	const { shape, call, output } = axisResult(op, axis, keepdims);
	// 這個格子屬於第幾組（-1 表示全部同一組）
	const group = (i: number, j: number) => (ax === 'none' ? -1 : ax === 0 ? j : i);

	// max／argmax：標出被選中的格子
	const picked = (i: number, j: number) => {
		if (op !== 'max' && op !== 'argmax') return false;
		if (ax === 'none') return M[i][j] === Math.max(...M.flat());
		if (ax === 0) return M[i][j] === Math.max(...M.map((row) => row[j]));
		return M[i][j] === Math.max(...M[i]);
	};


	let explain: string;
	if (ax === 'none') explain = '沒有指定 axis：全部 6 個數字合在一起，結果是單一數字。';
	else if (ax === 0) explain = '第 0 維（2 列）被壓掉：同一欄上下兩個數字合在一起（同一個顏色），剩下 3 個結果。';
	else explain = '第 1 維（每列 3 個）被壓掉：同一列左右三個數字合在一起（同一個顏色），剩下 2 個結果。';
	if (axis === -1) explain = `axis=-1 是「最後一維」，對這個二維陣列就是 axis=1。${explain}`;
	if (op === 'argmax' && ax === 'none') explain += '注意：不指定 axis 時，argmax 回傳的是把陣列攤平之後的位置（從 0 數到 5）。';
	if (keepdims) explain += ax === 'none' ? 'keepdims=True：兩個維度都留下來、長度變成 1。' : 'keepdims=True：被壓掉的維度留下來、長度變成 1。';

	return (
		<section className={`not-content ${styles.demo}`} aria-label="axis 互動示範">
			<div className={styles.group}>
				<p className={styles.title}>運算</p>
				<div className={styles.chips}>
					{OPS.map((o) => (
						<button key={o.key} type="button" className={styles.chip} aria-pressed={op === o.key} onClick={() => setOp(o.key)}>
							{o.label}
						</button>
					))}
				</div>
			</div>
			<div className={styles.group}>
				<p className={styles.title}>沿著哪一維</p>
				<div className={styles.row}>
					<div className={styles.chips}>
						{AXES.map((a) => (
							<button key={String(a.key)} type="button" className={styles.chip} aria-pressed={axis === a.key} onClick={() => setAxis(a.key)}>
								{a.label}
							</button>
						))}
					</div>
					<label className={styles.toggle}>
						<input type="checkbox" checked={keepdims} onChange={(e) => setKeepdims(e.currentTarget.checked)} />
						keepdims=True
					</label>
				</div>
			</div>

			<div className={styles.scroll}>
				<div className={styles.grids}>
					<div className={styles.gridBlock}>
						<div className={styles.grid} style={{ gridTemplateColumns: `repeat(${COLS}, auto)` }} role="img" aria-label="矩陣 m，形狀 (2, 3)，同一個顏色的數字會被合在一起">
							{M.map((row, i) =>
								row.map((v, j) => {
									const g = group(i, j);
									return (
										<span key={`${i}-${j}`} className={`${styles.cell} ${g === -1 ? styles.gAll : GROUP_CLASS[g]} ${picked(i, j) ? styles.picked : ''}`}>
											{v}
										</span>
									);
								}),
							)}
						</div>
						<span className={styles.caption}>m，形狀 (2, 3)</span>
					</div>
					<span className={styles.op}>→</span>
					<div className={styles.gridBlock}>
						<pre className={styles.code} aria-live="polite">{`>>> ${call}\n${output}`}</pre>
						<span className={styles.caption}>形狀 {fmtShape(shape)}</span>
					</div>
				</div>
			</div>

			<p className={`${styles.muted} ${styles.small}`}>{explain}</p>
		</section>
	);
}
