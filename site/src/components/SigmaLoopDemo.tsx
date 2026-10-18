import { useId, useState, type ReactNode } from 'react';
import styles from './Ep02Sums.module.css';
import { SIGMA_X, sigmaLoop, type LoopMode } from './ep02-sums.ts';

/**
 * Σ 和 for 迴圈逐步對照：x = (3, 1, 4, 1, 5)，選加總的範圍 a 到 b，
 * 按「下一步」一次加一項，同時標出數學的 x_i、Python 的 x[i − 1] 和正在執行的那一行程式。
 * 「常見錯誤」示範數學從 1 數、Python 從 0 數時，差一個會發生什麼事（結果和 Python 實際執行一致）。
 */

const X = SIGMA_X;
const IDX = X.map((_, k) => k + 1);

const MODES: { key: LoopMode; label: string; code: string }[] = [
	{ key: 'correct', label: '正確', code: 'range(a - 1, b)' },
	{ key: 'skipFirst', label: '常見錯誤', code: 'range(a, b)' },
	{ key: 'shifted', label: '常見錯誤', code: 'range(a, b + 1)' },
];

/** x 加下標，例如 x₃ */
const Xi = ({ k, className }: { k: ReactNode; className?: string }) => (
	<span className={className ?? styles.mvar}>
		x<sub>{k}</sub>
	</span>
);

const list = (ks: number[]) =>
	ks.map((k, n) => (
		<span key={k}>
			{n > 0 ? '、' : ''}
			<Xi k={k} /> = {X[k - 1]}
		</span>
	));

export default function SigmaLoopDemo() {
	const [a, setA] = useState(1);
	const [b, setB] = useState(5);
	const [mode, setMode] = useState<LoopMode>('correct');
	const [phase, setPhase] = useState(0);
	const uid = useId();

	const plan = sigmaLoop(a, b, mode);
	const m = plan.steps.length;
	// phase 0：total = 0；1…m：第 phase 次迴圈；m + 1：跑完、print（出錯時停在出錯的那一步）
	const last = plan.error ? m : m + 1;
	const done = plan.steps.slice(0, Math.min(phase, m));
	const current = phase >= 1 && phase <= m ? plan.steps[phase - 1] : null;
	const crashed = current !== null && current.value === null;
	const finished = phase === last;
	const addedSoFar = done.filter((s) => s.value !== null);
	const addedIdx = addedSoFar.map((s) => s.i);
	const total = addedSoFar.length ? addedSoFar[addedSoFar.length - 1].total! : 0;
	const showGhost = plan.badIndex !== null && phase === m;

	const pickA = (v: number) => {
		setA(v);
		if (v > b) setB(v);
		setPhase(0);
	};
	const pickB = (v: number) => {
		setB(v);
		if (v < a) setA(v);
		setPhase(0);
	};
	const pickMode = (v: LoopMode) => {
		setMode(v);
		setPhase(0);
	};

	// ----- 數學式的每一項 -----
	const termClass = (t: number) => {
		if (current && current.value !== null && current.i + 1 === t) return styles.current;
		if (addedIdx.includes(t - 1)) return styles.added;
		if (finished || crashed) return styles.missing;
		return '';
	};

	// ----- 陣列的每一格 -----
	const cellClass = (j: number) => {
		const inRange = j + 1 >= a && j + 1 <= b;
		if (current && current.i === j) return `${styles.cell} ${styles.current}`;
		if (addedIdx.includes(j)) return `${styles.cell} ${inRange ? styles.added : styles.extra}`;
		if ((finished || crashed) && inRange) return `${styles.cell} ${styles.missing}`;
		return `${styles.cell} ${inRange ? styles.inRange : ''}`;
	};
	const cellTag = (j: number) => {
		const inRange = j + 1 >= a && j + 1 <= b;
		if (!(finished || crashed)) return null;
		if (inRange && !addedIdx.includes(j)) return <span className={`${styles.tag} ${styles.tagMissing}`}>漏加</span>;
		if (!inRange && addedIdx.includes(j)) return <span className={`${styles.tag} ${styles.tagExtra}`}>多加</span>;
		return null;
	};

	// ----- 程式碼 -----
	const lineClass = (key: string) => {
		if (phase === 0 && key === 'init') return styles.codeLineOn;
		if (current && key === 'body') return crashed ? styles.codeLineBad : styles.codeLineOn;
		if (current && key === 'for') return styles.codeLineSoft;
		if (finished && !plan.error && key === 'print') return styles.codeLineOn;
		return '';
	};
	const lines = [
		{ key: 'x', text: `x = np.array([${X.join(', ')}])` },
		{ key: 'init', text: 'total = 0' },
		{ key: 'for', text: `for i in range(${plan.start}, ${plan.stop}):` },
		{ key: 'body', text: '    total += x[i]' },
		{ key: 'print', text: 'print(total)' },
	];
	const modeInfo = MODES.find((x) => x.key === mode)!;

	// ----- 目前累計 -----
	const sumExpr = addedSoFar.length ? `${addedSoFar.map((s) => s.value).join(' + ')} = ${total}` : '0';
	// 「目前狀態」欄比較窄：要折行時從「=」前面折，「= 總和」不拆開
	const sumCell = addedSoFar.length ? (
		<>
			{addedSoFar.map((s) => s.value).join(' + ')} <span className={styles.num}>= {total}</span>
		</>
	) : (
		'0'
	);

	// ----- 說明文字 -----
	let status: ReactNode;
	let statusClass = styles.muted;
	if (phase === 0) {
		status = (
			<>
				先把 total 設成 0。按「下一步」，迴圈每跑一次就加一項：Python 的 <span className={styles.num}>x[i]</span> 是數學的 <Xi k={<><span className={styles.mvar}>i</span>+1</>} />。
			</>
		);
	} else if (crashed) {
		statusClass = styles.error;
		status = (
			<>
				<span className={styles.mono}>{plan.error}</span>
				<br />
				程式想拿數學的 <Xi k={plan.badIndex! + 1} />，寫成 <span className={styles.num}>x[{plan.badIndex}]</span>，但 Python 的 x 只有 <span className={styles.num}>x[0]</span> 到 <span className={styles.num}>x[{X.length - 1}]</span>。
				{plan.missing.length ? <>在出錯之前，已經少加了 {list(plan.missing)}。</> : null}
				一行的寫法 <span className={styles.num}>x[{plan.start}:{plan.stop}].sum()</span> 反而不會報錯：切片超出範圍的部分會被直接忽略，得到 {plan.sliceValue}（正確答案是 {plan.expected}），而且沒有任何警告。
			</>
		);
	} else if (current) {
		status = (
			<>
				第 {phase} 次迴圈：Python 的 i = {current.i}，對應數學的 <Xi k={current.i + 1} />；<span className={styles.num}>x[{current.i}] = {current.value}</span>，total = <span className={styles.num}>{sumExpr}</span>。
			</>
		);
	} else if (finished && plan.result === plan.expected && plan.missing.length === 0) {
		statusClass = styles.ok;
		status = (
			<>
				跑完了：total = {plan.result}，和 Σ 的結果一樣，也和一行的 <span className={styles.num}>x[{plan.start}:{plan.stop}].sum()</span> 一樣。
			</>
		);
	} else if (finished) {
		statusClass = styles.error;
		status = (
			<>
				跑完了：total = {plan.result}，但 Σ 應該是 {plan.expected}。
				{m === 0 ? <><span className={styles.num}>range({plan.start}, {plan.stop})</span> 是空的，迴圈一次都沒有跑。</> : null}
				{plan.missing.length ? <>少加了 {list(plan.missing)}</> : null}
				{plan.extra.length ? <>，多加了 {list(plan.extra)}</> : null}。程式不會報錯，只是答案錯了：這就是差一錯誤 off-by-one error。
			</>
		);
	}

	return (
		<section className={`not-content ${styles.demo}`} aria-label="Σ 和 for 迴圈逐步對照">
			<div className={styles.group}>
				<p className={styles.title}>加總的範圍</p>
				<div className={styles.row}>
					<span className={styles.small} id={`${uid}-a`}>
						從 <span className={styles.mvar}>i</span> = a 開始（下標）
					</span>
					<div className={styles.chips} role="group" aria-labelledby={`${uid}-a`}>
						{IDX.map((v) => (
							<button key={v} type="button" className={`${styles.chip} ${styles.chipNum}`} aria-pressed={a === v} aria-label={`a = ${v}`} onClick={() => pickA(v)}>
								{v}
							</button>
						))}
					</div>
				</div>
				<div className={styles.row}>
					<span className={styles.small} id={`${uid}-b`}>
						加到 b 為止（上標，包含 b）
					</span>
					<div className={styles.chips} role="group" aria-labelledby={`${uid}-b`}>
						{IDX.map((v) => (
							<button key={v} type="button" className={`${styles.chip} ${styles.chipNum}`} aria-pressed={b === v} aria-label={`b = ${v}`} onClick={() => pickB(v)}>
								{v}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className={styles.group}>
				<p className={styles.title} id={`${uid}-mode`}>
					翻成 Python 的寫法
				</p>
				<div className={styles.chips} role="group" aria-labelledby={`${uid}-mode`}>
					{MODES.map((md) => (
						<button key={md.key} type="button" className={styles.chip} aria-pressed={mode === md.key} onClick={() => pickMode(md.key)}>
							{md.label} <span className={styles.chipCode}>{md.code}</span>
						</button>
					))}
				</div>
				<p className={`${styles.muted} ${styles.small}`}>
					{mode === 'correct' ? (
						<>
							數學的第 <span className={styles.mvar}>i</span> 項 <Xi k={<span className={styles.mvar}>i</span>} /> 是 Python 的 <span className={styles.mono}>x[i - 1]</span>，所以開頭要減 1；range 不含結尾，停在 b，最後拿到的是 <span className={styles.mono}>x[b - 1]</span>，剛好是 <Xi k={<span className={styles.mvar}>b</span>} />。
						</>
					) : mode === 'skipFirst' ? (
						<>把數學的 a、b 直接抄進 range：開頭少減了 1，第一項被跳過。結尾碰巧是對的（range 不含 b，最後拿到 <span className={styles.mono}>x[b - 1]</span>）。</>
					) : (
						<>記得 range 不含結尾、所以寫 b + 1，卻忘了 Python 從 0 數：每一項都往後錯一格。b = 5 時，<span className={styles.mono}>x[5]</span> 根本不存在。</>
					)}
				</p>
			</div>

			<div className={`${styles.formula} ${styles.math}`}>
				<span className={styles.srOnly}>
					x i，i 從 {a} 加到 {b}，等於 {plan.terms.map((t) => X[t - 1]).join(' 加 ')}，等於 {plan.expected}。
				</span>
				<span className={styles.sigma} aria-hidden="true">
					<span className={styles.sigmaLimit}>{b}</span>
					<span className={styles.sigmaSym}>∑</span>
					<span className={styles.sigmaLimit}>
						<span className={styles.mvar}>i</span>={a}
					</span>
				</span>
				<span aria-hidden="true">
					<Xi k={<span className={styles.mvar}>i</span>} />
				</span>
				<span className={styles.eq} aria-hidden="true">
					=
				</span>
				<span className={styles.terms} aria-hidden="true">
					{plan.terms.map((t, n) => (
						<span key={t} className={styles.terms}>
							{n > 0 ? <span className={styles.plus}>+</span> : null}
							<span className={`${styles.term} ${termClass(t)}`}>
								<Xi k={t} className={styles.termSym} />
								<span className={styles.termVal}>{X[t - 1]}</span>
							</span>
						</span>
					))}
				</span>
				<span className={styles.result} aria-hidden="true">
					<span className={styles.eq}>=</span>
					<span className={styles.total}>{plan.expected}</span>
				</span>
			</div>

			<div className={styles.group}>
				<div className={styles.scroll}>
					<div className={styles.array} role="img" aria-label={`陣列 x = [${X.join(', ')}]，數學的 x1 到 x5 是 Python 的 x[0] 到 x[4]`}>
						{X.map((v, j) => (
							<div key={j} className={styles.slot}>
								<Xi k={j + 1} className={styles.cellMath} />
								<span className={cellClass(j)}>{v}</span>
								<span className={styles.cellPy}>x[{j}]</span>
								{cellTag(j)}
							</div>
						))}
						{showGhost ? (
							<div className={styles.slot}>
								<Xi k={X.length + 1} className={styles.cellMath} />
								<span className={`${styles.cell} ${styles.ghost}`}>?</span>
								<span className={styles.cellPy}>x[{X.length}]</span>
								<span className={`${styles.tag} ${styles.tagExtra}`}>不存在</span>
							</div>
						) : null}
					</div>
				</div>
				<div className={styles.legend} aria-hidden="true">
					<span className={styles.legendItem}>
						<span className={`${styles.swatch} ${styles.inRange}`} />Σ 要加的範圍
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.swatch} ${styles.current}`} style={{ outlineWidth: 2 }} />正在加
					</span>
					<span className={styles.legendItem}>
						<span className={`${styles.swatch} ${styles.added}`} />已經加進 total
					</span>
					<span className={styles.legendItem}>上面是數學的寫法，下面是 Python 的索引</span>
				</div>
			</div>

			<div className={styles.row}>
				<button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => setPhase((k) => Math.min(k + 1, last))} disabled={phase >= last}>
					下一步
				</button>
				<button type="button" className={styles.button} onClick={() => setPhase(last)} disabled={phase >= last}>
					一次跑完
				</button>
				<button type="button" className={styles.button} onClick={() => setPhase(0)} disabled={phase === 0}>
					重設
				</button>
			</div>

			<div className={styles.cols}>
				<div className={styles.panel}>
					<p className={styles.title}>for 迴圈</p>
					<pre className={styles.code} aria-label="Python 程式">
						{lines.map((l) => (
							<span key={l.key} className={`${styles.codeLine} ${lineClass(l.key)}`}>
								{l.text}
							</span>
						))}
						{finished && !plan.error ? <span className={styles.codeOut}>{plan.result}</span> : null}
						{crashed ? <span className={`${styles.codeOut} ${styles.codeOutBad}`}>{plan.error}</span> : null}
					</pre>
					<p className={`${styles.muted} ${styles.small}`}>
						<span className={styles.mono}>{modeInfo.code}</span>，把 a = {a}、b = {b} 代進去
					</p>
				</div>
				<div className={styles.panel}>
					<p className={styles.title}>目前狀態</p>
					<dl className={styles.state}>
						<dt>Python 的 i</dt>
						<dd>{current ? current.i : '—'}</dd>
						<dt>數學的 i</dt>
						<dd>{current ? current.i + 1 : '—'}</dd>
						<dt>x[i]</dt>
						<dd className={crashed ? styles.bad : ''}>{current ? (current.value ?? 'IndexError') : '—'}</dd>
						<dt>total</dt>
						<dd>{sumCell}</dd>
					</dl>
					<p className={styles.title}>NumPy 一行</p>
					<pre className={styles.code}>
						<span className={styles.codeLine}>
							x[{plan.start}:{plan.stop}].sum()   # {plan.sliceValue}
						</span>
					</pre>
				</div>
			</div>

			<p className={statusClass === styles.muted ? `${styles.muted} ${styles.small}` : statusClass} aria-live="polite">
				{status}
			</p>
		</section>
	);
}
