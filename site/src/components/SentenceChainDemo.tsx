import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import styles from './Ep06Table.module.css';
import {
	clampR,
	FORWARD,
	BACKWARD,
	logText,
	pow10Fixed,
	probParts,
	probSpoken,
	pyFloat,
	R_MAX,
	R_MIN,
	repeated,
	sentenceSteps,
	STEP_LOG_DIGITS,
	SUM_LOG_DIGITS,
	type Mode,
	type ProbParts,
} from './ep06-table.ts';

/**
 * 一句話的機率＝每一步的條件機率連乘（機率的鏈鎖律），實際上用 log 機率加總。
 * 「今天／天／氣／很／冷」每一步一根長條，下面是連乘到目前、log 機率加到目前。
 * 把句子重複 r 次：float64 直接連乘在某一次重複時下溢成 0，log 加總一直是普通的數字。
 * 「當成獨立」改用每個 token 單獨出現的機率直接相乘，這時詞序對調、機率不變；
 * 條件機率模式不能對調（反過來的句子每一步的前文都不一樣，要由模型算，這裡不編數字）。
 *
 * 寬的時候 5 步橫排、長條直立；窄的時候（手機）每一步一列、長條橫放。用 container query 量的是元件自己的寬度。
 */

const R_PRESETS = [1, 10, 50, 100, 200];

const sup = (k: number) => String(k).replace('-', '−');

/** 科學記號：1.5822 × 10⁻⁴；0 寫成 0。wrap：很窄的格子裡可以在「×」前面折行 */
function Sci({ p, wrap = false }: { p: ProbParts | null; wrap?: boolean }) {
	if (p === null) return <span className={styles.nowrap}>0</span>;
	if (p.exp === 0) return <span className={styles.nowrap}>{p.mant}</span>;
	if (wrap)
		return (
			<span className={styles.sciWrap}>
				<span className={styles.nowrap}>{p.mant}</span>{' '}
				<span className={styles.nowrap}>
					× 10<sup>{sup(p.exp)}</sup>
				</span>
			</span>
		);
	return (
		<span className={styles.nowrap}>
			{p.mant} × 10<sup>{sup(p.exp)}</sup>
		</span>
	);
}

/** 10 的 L 次方（從 log 換算回來的機率），3 位有效數字 */
function Pow10({ L }: { L: number }) {
	const { m, e } = pow10Fixed(L);
	return (
		<span className={styles.nowrap}>
			{m} × 10<sup>{sup(e)}</sup>
		</span>
	);
}

/** 給 <input> 用的寫法 */
const fmtInput = (v: number) => String(v);

export default function SentenceChainDemo() {
	const [mode, setMode] = useState<Mode>('cond');
	const [reversed, setReversed] = useState(false);
	const [r, setR] = useState(1);
	const [rText, setRText] = useState<string | null>(null);
	const uid = useId();
	const sliderId = `${uid}-r`;
	const inputId = `${uid}-rin`;
	const hintId = `${uid}-hint`;
	const presetId = `${uid}-presets`;

	const indep = mode === 'indep';
	const rev = indep && reversed;
	const steps = useMemo(() => sentenceSteps(mode, rev), [mode, rev]);
	const rep = useMemo(() => repeated(mode, rev, r), [mode, rev, r]);
	// 當成獨立時，兩種詞序都算出來比一比
	const fwd = useMemo(() => (indep ? repeated('indep', false, r) : null), [indep, r]);
	const bwd = useMemo(() => (indep ? repeated('indep', true, r) : null), [indep, r]);
	const order = rev ? BACKWARD : FORWARD;
	const sentence = order.join('');

	const prodP = probParts(rep.prod, rep.prodSig);
	const zero = rep.zero;
	const logOneText = logText(rep.logOne, SUM_LOG_DIGITS);

	const setRClamped = (v: number) => {
		setR(clampR(v));
	};
	const onRInput = (raw: string) => {
		setRText(raw);
		const v = Number(raw);
		if (raw.trim() === '' || !Number.isFinite(v)) return;
		setRClamped(v);
	};

	const toggleIndep = () => {
		setMode((m) => (m === 'cond' ? 'indep' : 'cond'));
		setReversed(false);
	};

	// ----- 每一步 -----
	// P(冷 | 今天天氣很)：太窄時在「|」後面折行
	const condLabel = (token: string, context: string): ReactNode =>
		indep || context === '' ? (
			<span className={styles.nowrap}>P({token})</span>
		) : (
			<>
				<span className={styles.nowrap}>P({token} |</span> <span className={styles.nowrap}>{context})</span>
			</>
		);

	// ----- 程式 -----
	const codeLines: string[] = indep ? ['seq = [p_single[t]', `       for t in ${rev ? 'backward' : 'forward'}]`, `p = np.tile(seq, ${r})`] : [`p = np.tile(p_cond, ${r})`];

	// ----- 說明 -----
	let note: ReactNode;
	const nTok = rep.n;
	if (indep) {
		const same = fwd && bwd ? (
			<>
				「今天天氣很冷」和「冷很氣天今天」{r > 1 ? `重複 ${r} 次` : ''}的機率一樣
				{fwd.prod > 0 ? (
					<>
						，都是 <Sci p={probParts(fwd.prod, fwd.prodSig)} />
					</>
				) : (
					'（都下溢成 0，log 加總也一樣）'
				)}
			</>
		) : null;
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>當成獨立，就看不到順序：</span>每個 token 直接用自己單獨出現的機率相乘，不看前面是什麼。{same}
				：乘法可以交換順序，所以詞序對調，機率不變。換成條件機率，每一步都要看前文，順序才有意義。
			</p>
		);
	} else if (rep.underflow && zero) {
		note = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>下溢：</span>直接連乘在第 {zero.rep} 次重複（整句第 {zero.index} 個 token）變成 0。從這裡開始，句子再長都是 0，沒辦法比較哪一句比較可能。log 加總還是{' '}
				<span className={`${styles.mono} ${styles.nowrap}`}>{logText(rep.logSum, SUM_LOG_DIGITS)}</span>，很普通的數字：所以實際計算都用 log 機率。
			</p>
		);
	} else if (rep.subnormal) {
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>快要下溢了：</span>連乘已經小到 float64 快存不下（比 2.2 × 10<sup>−308</sup> 還小以後，數字越小，能存的有效位數越少）：存下來的是{' '}
				<Sci p={prodP} />，真正的值約 <Pow10 L={rep.log10} />（從 log 加總換算）。再加長一點看看。
			</p>
		);
	} else if (r === 1) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>機率的鏈鎖律：</span>一句話的機率＝每一步「給定前面所有 token，下一個是這個 token」的條件機率連乘，
				<span className={styles.nowrap}>
					約 <Sci p={prodP} />
				</span>
				。log 機率一步一步加起來是 <span className={`${styles.mono} ${styles.nowrap}`}>{logOneText}</span>，換算回去是同一個機率。試試把句子加長。
			</p>
		);
	} else {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>句子越長，連乘越小：</span>
				{nTok} 個 token 乘起來約 <Sci p={prodP} />；log 加總只是 <span className={`${styles.mono} ${styles.nowrap}`}>{logText(rep.logSum, SUM_LOG_DIGITS)}</span>
				這樣的普通數字。再加長，連乘會下溢成 0。
			</p>
		);
	}

	const summary =
		`${indep ? '當成獨立' : '條件機率'}，詞序「${sentence}」，重複 ${r} 次（${nTok} 個 token）：` +
		`直接連乘 ${rep.underflow ? '下溢成 0' : `約 ${probSpoken(prodP)}`}；log 加總 ${logText(rep.logSum, SUM_LOG_DIGITS)}。`;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="一句話的機率：條件機率連乘與 log 加總互動示範">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>一句話的機率＝每一步的條件機率連乘</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`}>
					{indep ? (
						<>當成獨立：每一步改用這個 token 單獨出現的機率（示範數字），不看前面是什麼。</>
					) : (
						<>
							每一根長條是「給定前面所有 token，下一個是這個 token」的條件機率；P(今天) 是一句話用「今天」開頭的機率。只有最後一步是 EP00 的實測，其他是示範數字。
						</>
					)}
				</p>
			</div>

			<div className={styles.group}>
				<div className={styles.row}>
					<button type="button" className={`${styles.chip} ${styles.toggle}`} aria-pressed={indep} onClick={toggleIndep}>
						當成獨立：不看前文
					</button>
					<button
						type="button"
						className={styles.chip}
						aria-pressed={rev}
						aria-disabled={!indep}
						aria-describedby={!indep ? hintId : undefined}
						onClick={() => {
							if (indep) setReversed((v) => !v);
						}}
					>
						詞序對調：{rev ? '冷很氣天今天' : '今天天氣很冷'} ⇄ {rev ? '今天天氣很冷' : '冷很氣天今天'}
					</button>
				</div>
				{!indep ? (
					<p id={hintId} className={`${styles.small} ${styles.muted} ${styles.pretty}`}>
						詞序對調只在「當成獨立」時能用：條件機率要看前文；反過來的句子每一步的前文都不一樣，要由模型算。
					</p>
				) : null}
			</div>

			<div className={styles.stepsWrap}>
				<div className={styles.steps}>
					<div className={styles.rowLabels} aria-hidden="true">
						<span>token</span>
						<span>{indep ? '單獨的機率' : '條件機率'}</span>
						<span>機率（0 到 1）</span>
						<span>數字</span>
						<span>連乘到目前</span>
						<span>
							<span className={styles.nowrap}>log 機率</span> <span className={styles.nowrap}>加到目前</span>
						</span>
					</div>
					{steps.map((s) => (
						<div key={`${s.t}-${s.token}`} className={styles.step}>
							<span className={styles.stepChip}>
								<span className={styles.stepT}>t = {s.t}</span>
								<span className={styles.token}>{s.token}</span>
							</span>
							<span className={styles.stepCond}>{condLabel(s.token, s.context)}</span>
							<span className={styles.stepBar}>
								<span className={styles.vTrack} aria-hidden="true">
									<span className={`${styles.vFill} ${s.measured ? styles.vFillMeasured : ''}`} style={{ '--p': `${(s.p * 100).toFixed(2)}%` } as CSSProperties} />
								</span>
								<span className={styles.stepP}>{s.pText}</span>
							</span>
							<span className={`${styles.stepTag} ${s.measured ? styles.stepTagMeasured : ''}`}>{s.measured ? 'EP00 實測' : '示範'}</span>
							<span className={styles.stepNums}>
								<span className={styles.stepProd}>
									<span className={styles.inlineLabel}>連乘到目前</span>
									<Sci p={probParts(s.prod, s.prodSig)} wrap />
								</span>
								<span className={styles.stepLog}>
									<span className={styles.inlineLabel}>log 加到目前</span>
									<span className={styles.nowrap}>{logText(s.cumLn, STEP_LOG_DIGITS)}</span>
								</span>
							</span>
						</div>
					))}
				</div>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={sliderId}>
						把句子加長：重複 <span className={styles.value}>{r}</span> 次
					</label>
					<span className={`${styles.muted} ${styles.small}`}>
						共 {nTok} 個 token（方向鍵一次加減 1）
					</span>
				</div>
				<input
					id={sliderId}
					className={styles.slider}
					type="range"
					min={R_MIN}
					max={R_MAX}
					step={1}
					value={r}
					aria-valuetext={`重複 ${r} 次，共 ${nTok} 個 token`}
					onChange={(e) => {
						setRClamped(Number(e.currentTarget.value));
						setRText(null);
					}}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>{R_MIN}</span>
					<span>{R_MAX}</span>
				</div>
				<div className={styles.row}>
					<span className={styles.numField}>
						<label htmlFor={inputId} className={styles.small}>
							或直接輸入（{R_MIN} 到 {R_MAX}）
						</label>
						<input
							id={inputId}
							type="number"
							className={styles.num}
							step={1}
							min={R_MIN}
							max={R_MAX}
							value={rText ?? fmtInput(r)}
							onChange={(e) => onRInput(e.currentTarget.value)}
							onBlur={() => setRText(null)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') setRText(null);
							}}
						/>
					</span>
					<div className={styles.chips} role="group" aria-labelledby={presetId}>
						<span className={styles.srOnly} id={presetId}>
							重複幾次
						</span>
						{R_PRESETS.map((v) => (
							<button
								key={v}
								type="button"
								className={`${styles.chip} ${styles.chipMono}`}
								aria-pressed={r === v}
								aria-label={`重複 ${v} 次`}
								onClick={() => {
									setRClamped(v);
									setRText(null);
								}}
							>
								{v}
							</button>
						))}
					</div>
					<button
						type="button"
						className={styles.chip}
						disabled={!zero || r === zero.rep}
						onClick={() => {
							if (zero) setRClamped(zero.rep);
							setRText(null);
						}}
					>
						跳到連乘變成 0 的那一次
					</button>
				</div>
				<p className={`${styles.small} ${styles.muted}`}>只是為了看下溢：假設每一次重複都用同樣的 5 個機率。</p>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.cols}>
				<div className={`${styles.panel} ${rep.underflow ? styles.panelBad : ''}`}>
					<p className={styles.title}>float64 直接連乘</p>
					<p className={styles.cardSub}>NumPy 預設的小數格式（瀏覽器的數字也是）；np.tile 是整串重複 {r} 次</p>
					<pre className={styles.code} aria-label="Python 程式與印出來的結果">
						{codeLines.map((ln) => (
							<span key={ln} className={styles.codeLine}>
								{ln}
							</span>
						))}
						<span className={styles.codeLine}>print(np.prod(p))</span>
						<span className={`${styles.codeLine} ${styles.codeComment}`}># {pyFloat(rep.prod)}</span>
					</pre>
					<p className={`${styles.bigValue} ${rep.underflow ? styles.bigValueBad : ''}`}>
						<Sci p={prodP} />
					</p>
					{rep.underflow && zero ? (
						<>
							<p className={`${styles.badge} ${styles.badgeBad}`}>
								下溢：第 {zero.rep} 次重複的第 {zero.t} 個 token「{zero.token}」變成 0
							</p>
							<p className={`${styles.muted} ${styles.small}`}>
								前一個 token 時是 <Sci p={probParts(zero.before, 1)} />
								（Python 印出 <span className={styles.mono}>{pyFloat(zero.before)}</span>），已經擠在能存的最小正數旁邊。
							</p>
						</>
					) : rep.subnormal ? (
						<p className={`${styles.badge} ${styles.badgeMild}`}>快存不下了：只剩很少幾位數字是準的</p>
					) : (
						<p className={`${styles.muted} ${styles.small}`}>
							能存的最小正數約 5 × 10<sup>−324</sup>
						</p>
					)}
				</div>

				<div className={`${styles.panel} ${styles.panelGood}`}>
					<p className={styles.title}>log 機率加總 Σ ln p</p>
					<p className={styles.cardSub}>一樣是 float64，只是改成加 ln p</p>
					<pre className={styles.code} aria-label="Python 程式與印出來的結果">
						<span className={styles.codeLine}>print(np.sum(np.log(p)))</span>
						<span className={`${styles.codeLine} ${styles.codeComment}`}># {pyFloat(rep.logSum)}</span>
					</pre>
					<p className={`${styles.bigValue} ${styles.bigValueLog}`}>{logText(rep.logSum, SUM_LOG_DIGITS)}</p>
					{r > 1 ? (
						<p className={styles.small}>
							≈ {r} × 一句的 log 機率（<span className={styles.mono}>{logOneText}</span>）
						</p>
					) : null}
					<p className={styles.small}>
						換算回機率：約 <Pow10 L={rep.log10} />
						{rep.underflow ? '，float64 存不下，但 log 機率照樣能比大小' : ''}
					</p>
				</div>
			</div>

			{indep && fwd && bwd ? (
				<div className={styles.group}>
					<table className={styles.table}>
						<caption>兩種詞序比一比{r > 1 ? `（重複 ${r} 次）` : ''}</caption>
						<thead>
							<tr>
								<th scope="col">詞序</th>
								<th scope="col">直接連乘</th>
								<th scope="col">log 加總</th>
							</tr>
						</thead>
						<tbody>
							{[
								{ key: 'f', name: FORWARD.join(''), v: fwd, now: !rev },
								{ key: 'b', name: BACKWARD.join(''), v: bwd, now: rev },
							].map((row) => (
								<tr key={row.key} className={row.now ? styles.tableNow : undefined} aria-current={row.now ? 'true' : undefined}>
									<td>{row.name}</td>
									<td>
										<Sci p={probParts(row.v.prod, row.v.prodSig)} />
										<span className={styles.pyOut}>印出 {pyFloat(row.v.prod)}</span>
									</td>
									<td>{logText(row.v.logSum, SUM_LOG_DIGITS)}</td>
								</tr>
							))}
						</tbody>
					</table>
					{pyFloat(fwd.prod) !== pyFloat(bwd.prod) ? (
						<p className={`${styles.small} ${styles.muted} ${styles.pretty}`}>四捨五入後一模一樣；Python 印出來的最後幾位不同，是捨入誤差（乘的順序不同，每一步捨入的地方不同）。</p>
					) : null}
				</div>
			) : null}

			{note}
		</section>
	);
}
