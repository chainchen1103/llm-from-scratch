import { useId, useState } from 'react';
import styles from './Ep01Demos.module.css';
import { fmtValue, softmaxNaive, softmaxStable } from './ep01-arrays.ts';

/**
 * Softmax 溢位互動示範：同一組分數，比較「直接照公式」和「先減掉最大值」兩種寫法。
 * 瀏覽器的數字和 NumPy 預設的 float64 是同一種格式，所以壞掉的方式也一模一樣。
 */

const PRESETS: { z: number[]; label: string }[] = [
	{ z: [1, 2, 3], label: '一般的分數 [1, 2, 3]' },
	{ z: [1000, 1001, 1002], label: '很大的分數 [1000, 1001, 1002]' },
	{ z: [-1000, -1001, -1002], label: '很小的分數 [-1000, -1001, -1002]' },
];

const isBroken = (xs: number[]) => xs.some((v) => !Number.isFinite(v));

export default function SoftmaxDemo() {
	const [text, setText] = useState(['1000', '1001', '1002']);
	const baseId = useId();

	const parsed = text.map((t) => Number(t.trim()));
	const valid = text.every((t) => t.trim() !== '') && parsed.every((v) => Number.isFinite(v));
	const naive = valid ? softmaxNaive(parsed) : null;
	const stable = valid ? softmaxStable(parsed) : null;
	const broken = naive ? isBroken(naive.p) : false;

	let why = '';
	if (naive && broken) {
		if (naive.e.some((v) => v === Infinity)) why = '有分數太大：e 的 710 次方以上就超過電腦小數能表示的最大值（大約 1.8 × 10³⁰⁸），變成 inf；inf ÷ inf 是 nan。';
		else if (naive.sum === 0) why = '分數都太小：e 的 −746 次方以下會小到變成 0（下溢 underflow），分母是 0；0 ÷ 0 是 nan。';
		else why = '計算過程出現了 inf 或 nan。';
	}

	const set = (i: number, v: string) => setText((prev) => prev.map((t, k) => (k === i ? v : t)));
	const current = valid ? parsed.join(',') : '';

	return (
		<section className={`not-content ${styles.demo}`} aria-label="Softmax 溢位互動示範">
			<div className={styles.group}>
				<p className={styles.title}>選一組分數，或自己輸入</p>
				<div className={styles.chips}>
					{PRESETS.map((p) => (
						<button key={p.label} type="button" className={styles.chip} aria-pressed={current === p.z.join(',')} onClick={() => setText(p.z.map(String))}>
							{p.label}
						</button>
					))}
				</div>
				<div className={styles.row}>
					{text.map((t, i) => (
						<span key={i} className={styles.row}>
							<label className={styles.label} htmlFor={`${baseId}-${i}`}>
								z<sub>{i + 1}</sub>
							</label>
							<input
								id={`${baseId}-${i}`}
								className={`${styles.input} ${styles.inputNarrow}`}
								inputMode="decimal"
								value={t}
								onChange={(e) => set(i, e.currentTarget.value)}
								spellCheck={false}
								autoComplete="off"
							/>
						</span>
					))}
				</div>
			</div>

			{!naive || !stable ? (
				<p className={styles.error} role="status">
					請在三個格子都填入數字。
				</p>
			) : (
				<>
					<div className={styles.cols}>
						<div className={`${styles.panel} ${broken ? styles.panelBad : ''}`}>
							<p className={styles.title}>直接照公式</p>
							<pre className={styles.code}>{'e = np.exp(z)\np = e / e.sum()'}</pre>
							<div className={styles.scroll}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th scope="col">z</th>
											<th scope="col">e^z</th>
											<th scope="col">機率</th>
										</tr>
									</thead>
									<tbody>
										{parsed.map((z, i) => (
											<tr key={i}>
												<td>{fmtValue(z)}</td>
												<td className={Number.isFinite(naive.e[i]) && naive.e[i] !== 0 ? '' : styles.bad}>{fmtValue(naive.e[i])}</td>
												<td className={Number.isFinite(naive.p[i]) ? '' : styles.bad}>{fmtValue(naive.p[i])}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<p className={styles.small}>
								分母 Σe^z = <span className={`${styles.mono} ${Number.isFinite(naive.sum) && naive.sum !== 0 ? '' : styles.bad}`}>{fmtValue(naive.sum)}</span>
							</p>
						</div>

						<div className={`${styles.panel} ${styles.panelGood}`}>
							<p className={styles.title}>先減掉最大值</p>
							<pre className={styles.code}>{'e = np.exp(z - z.max())\np = e / e.sum()'}</pre>
							<div className={styles.scroll}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th scope="col">z − max</th>
											<th scope="col">e^(z − max)</th>
											<th scope="col">機率</th>
										</tr>
									</thead>
									<tbody>
										{parsed.map((_, i) => (
											<tr key={i}>
												<td>{fmtValue(stable.shifted[i])}</td>
												<td>{fmtValue(stable.e[i])}</td>
												<td>{fmtValue(stable.p[i])}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<p className={styles.small}>
								最大值 = <span className={styles.mono}>{fmtValue(stable.max)}</span>，分母 = <span className={styles.mono}>{fmtValue(stable.sum)}</span>（至少是 1）
							</p>
						</div>
					</div>

					<p className={broken ? styles.error : styles.ok} aria-live="polite">
						{broken ? `直接照公式壞掉了。${why}先減掉最大值的寫法照樣算得出正確的機率。` : '兩種寫法的結果一樣：每個分數減掉同一個數，Softmax 的結果不變。試試看很大或很小的分數。'}
					</p>
				</>
			)}
		</section>
	);
}
