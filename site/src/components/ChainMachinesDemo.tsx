import { Fragment, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import styles from './Ep05Chain.module.css';
import {
	chain,
	chainText,
	CMP_DIGITS,
	fmtFixed,
	fmtTrim,
	sciParts,
	snapX,
	wrongCompare,
	X_DEFAULT,
	X_MAX,
	X_MIN,
	X_STEP,
} from './ep05-chain.ts';

/**
 * 三台機器串起來：y = ln((x² + 1)³) 拆成 u = x² + 1 → v = u³ → y = ln v。
 * 每台機器上方是它的輸入，下方是它的局部導數（在「自己的輸入」那一點算），三個局部導數相乘就是 dy/dx，
 * 再和數值導數（中央差分，h = 1e-5）對照。
 * 打開「錯誤版本」：外層的導數都在 x 算（3x²、1/x），結果錯幾倍、錯在哪一台，用珊瑚色標出來。
 *
 * 寬的時候三台機器橫排，窄的時候（手機）直排；用 container query 量的是元件自己的寬度。
 */

type Val = { text: string; exact: boolean };

/** 「=」或「≈」（四捨五入過的數字用 ≈） */
const eq = (v: Val) => (v.exact ? '=' : '≈');

/** 給 <input> 用的寫法：負號用一般的「-」，去掉尾巴的 0（1、1.3，和其他元件的輸入格一樣） */
const fmtInput = (v: number) => fmtTrim(v, 1).replace('−', '-');

/** 一格在直排（手機）和橫排時的位置 */
const at = (mRow: number, mCol: number, dRow: number, dCol: number) =>
	({ '--m-row': mRow, '--m-col': mCol, '--d-row': dRow, '--d-col': dCol }) as CSSProperties;

/** 第 i 台（1、2、3）的機器、箭頭、局部導數、乘號的位置 */
const POS = (i: number) => ({
	machine: at(2 * i - 1, 1, 1, 2 * i - 1),
	arrow: at(2 * i, 1, 1, 2 * i),
	local: at(2 * i - 1, 2, 2, 2 * i - 1),
	op: at(2 * i, 2, 2, 2 * i),
});
const OUT_POS = at(7, 1, 1, 7);
const ANSWER_POS = at(7, 2, 2, 7);

/** 科學記號：4.7 × 10⁻¹¹ */
function Sci({ v, sig = 2 }: { v: number; sig?: number }) {
	const { mant, exp } = sciParts(v, sig);
	if (exp === 0) return <span className={styles.nowrap}>{mant}</span>;
	return (
		<span className={styles.nowrap}>
			{mant} × 10<sup>{String(exp).replace('-', '−')}</sup>
		</span>
	);
}

/** 數值導數：和鏈鎖律一樣的位數用綠色加粗 */
function Digits({ text, against }: { text: string; against: string | null }) {
	let n = 0;
	if (against !== null) while (n < text.length && n < against.length && text[n] === against[n]) n++;
	return (
		<span className={styles.nowrap}>
			<span className={styles.digitsSame}>{text.slice(0, n)}</span>
			<span>{text.slice(n)}</span>
		</span>
	);
}

/** 代進局部導數的數字：正確版本是這台的輸入（黃底），錯誤版本是 x（珊瑚色底）；負數加括號 */
function Sub({ text, wrong = false }: { text: string; wrong?: boolean }) {
	const inner = <span className={wrong ? styles.wrongVal : styles.inVal}>{text}</span>;
	return text.startsWith('−') ? <>({inner})</> : inner;
}

export default function ChainMachinesDemo() {
	const [x, setX] = useState(X_DEFAULT);
	const [wrong, setWrong] = useState(false);
	const [xText, setXText] = useState<string | null>(null);
	const uid = useId();
	const sliderId = `${uid}-x`;
	const inputId = `${uid}-xin`;

	const c = useMemo(() => chain(x), [x]);
	const t = chainText(c);
	const cmp = wrongCompare(c);
	const x0 = x === 0;

	const onXInput = (raw: string) => {
		setXText(raw);
		const v = Number(raw);
		if (raw.trim() === '' || !Number.isFinite(v)) return;
		setX(snapX(v));
	};

	// ----- 三個局部導數（正確版本／錯誤版本） -----
	const [l1, l2, l3] = t.local;
	const [, w2, w3] = t.wrongLocal;
	const locals: { label: ReactNode; lines: ReactNode[]; value: ReactNode; hint?: ReactNode; isWrong: boolean }[] = [
		{
			label: '局部導數',
			lines: [
				<>du/dx = 2x</>,
				<>
					= 2 × <Sub text={t.x} />
				</>,
			],
			value: (
				<>
					{eq(l1)} <span className={styles.localValue}>{l1.text}</span>
				</>
			),
			hint: wrong ? <span className={styles.muted}>輸入本來就是 x，這台沒錯</span> : undefined,
			isWrong: false,
		},
		wrong
			? {
					label: '錯誤：在 x 算',
					lines: [
						<>3u² → 3x²</>,
						<>
							= 3 × <Sub text={t.x} wrong />²
						</>,
					],
					value: (
						<>
							{eq(w2!)} <span className={styles.localValue}>{w2!.text}</span>
						</>
					),
					hint: (
						<>
							應該代 u = <span className={styles.nowrap}>{t.u}</span>
						</>
					),
					isWrong: true,
				}
			: {
					label: '局部導數',
					lines: [
						<>dv/du = 3u²</>,
						<>
							= 3 × <Sub text={t.u} />²
						</>,
					],
					value: (
						<>
							{eq(l2)} <span className={styles.localValue}>{l2.text}</span>
						</>
					),
					isWrong: false,
				},
		wrong
			? {
					label: '錯誤：在 x 算',
					lines: [
						<>1/v → 1/x</>,
						<>
							= 1/<Sub text={t.x} wrong />
						</>,
					],
					value: w3 ? (
						<>
							{eq(w3)} <span className={styles.localValue}>{w3.text}</span>
						</>
					) : (
						<span className={styles.answerNone}>算不出來</span>
					),
					hint: (
						<>
							應該代 v {eq(t.v)} <span className={styles.nowrap}>{t.v.text}</span>
						</>
					),
					isWrong: true,
				}
			: {
					label: '局部導數',
					lines: [
						<>dy/dv = 1/v</>,
						<>
							{eq(t.v)} 1/<Sub text={t.v.text} />
						</>,
					],
					value: (
						<>
							{eq(l3)} <span className={styles.localValue}>{l3.text}</span>
						</>
					),
					isWrong: false,
				},
	];

	const machines = [
		{ inName: 'x', inText: t.x, inEq: '=', rule: 'u = x² + 1', out: 'u' },
		{ inName: 'u', inText: t.u, inEq: '=', rule: 'v = u³', out: 'v' },
		{ inName: 'v', inText: t.v.text, inEq: eq(t.v), rule: 'y = ln v', out: 'y' },
	];

	// ----- 乘積 -----
	const prodVal = wrong ? t.wrongProd : t.prod;
	const prodSpoken = wrong ? (t.wrongProd ? `${eq(t.wrongProd)} ${t.wrongProd.text}` : '算不出來') : `${eq(t.prod)} ${t.prod.text}`;

	// ----- 比對 -----
	const chainCmp = fmtFixed(c.prod, CMP_DIGITS);
	const ndCmp = fmtFixed(c.nd, CMP_DIGITS);
	const wrongCmp = c.wrongProd === null ? null : fmtFixed(c.wrongProd, CMP_DIGITS);
	const diff = c.nd - c.prod;

	// 錯幾倍
	let timesText = '';
	if (cmp && cmp.kind === 'times') {
		const r = `${cmp.exact ? ' ' : '約 '}${cmp.text}`;
		timesText = cmp.ratio === 2 ? '錯一倍（是正確答案的 2 倍）' : cmp.ratio > 1 ? `是正確答案的${r} 倍` : `只有正確答案的${r} 倍`;
	} else if (cmp && cmp.kind === 'sign') timesText = '連正負號都錯了';

	let note: ReactNode;
	if (!wrong && x0) {
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>x = 0 是谷底：</span>第 1 台的局部導數 2x = 0，後面乘什麼都是 0；數值導數也剛好是 0（左右對稱）。
			</p>
		);
	} else if (!wrong) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>外層的導數在內層的輸出那一點算：</span>第 2 台的 3u² 代 <span className={styles.nowrap}>u = {t.u}</span>、第 3 台的 1/v 代{' '}
				<span className={styles.nowrap}>
					v {eq(t.v)} {t.v.text}
				</span>
				（都不是 <span className={styles.nowrap}>x = {t.x}</span>）。所以要先往前算一遍，記下每一台的輸入。
			</p>
		);
	} else if (x0) {
		note = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>1/0 算不出來：</span>錯誤版本的第 3 台代 x = 0，1/x 沒有意義；但這裡其實是谷底，正確的導數是 0。
			</p>
		);
	} else {
		const near = cmp?.kind === 'times' && Math.abs(cmp.ratio - 1) < 0.1;
		note = (
			<p className={styles.bad}>
				<span className={styles.tagWord}>{timesText}：</span>第 2 台的輸入是 <span className={styles.nowrap}>u = {t.u}</span>、第 3 台的輸入是{' '}
				<span className={styles.nowrap}>
					v {eq(t.v)} {t.v.text}
				</span>
				，錯誤版本卻都代 <span className={styles.nowrap}>x = {t.x}</span>，得到{t.wrongProd!.exact ? ' ' : '約 '}{t.wrongProd!.text}；正確答案{t.prod.exact ? '是 ' : '約 '}{t.prod.text}。
				{near ? '這一點剛好很接近，只是巧合：換一個 x 就差很多。' : ''}
			</p>
		);
	}

	const summary =
		`x = ${t.x}：第 1 台輸出 u = ${t.u}，第 2 台輸出 v ${eq(t.v)} ${t.v.text}，第 3 台輸出 y ${eq(t.y)} ${t.y.text}。` +
		`局部導數 ${l1.text}、${l2.text}、${l3.text}，相乘 dy/dx ${eq(t.prod)} ${t.prod.text}；數值導數 ${ndCmp}。` +
		(wrong ? `錯誤版本（外層導數都在 x 算）：${t.wrongLocal[0]!.text}、${w2!.text}、${w3 ? w3.text : '1/0 算不出來'}，相乘 ${prodSpoken}${timesText ? `，${timesText}` : ''}。` : '');

	return (
		<section className={`not-content ${styles.demo}`} aria-label="三台機器與鏈鎖律互動示範">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>
					三台機器串起來：<span className={styles.nowrap}>y = ln((x² + 1)³)</span>
				</p>
				<p className={`${styles.small} ${styles.muted}`}>每台機器的局部導數只看自己的輸入（黃底的數字）。三個局部導數一路相乘，就是 dy/dx。</p>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={sliderId}>
						x = <span className={styles.value}>{t.x}</span>
					</label>
					<span className={`${styles.muted} ${styles.small}`}>拖動滑桿，或按方向鍵一次 0.1</span>
				</div>
				<input
					id={sliderId}
					className={styles.slider}
					type="range"
					min={X_MIN}
					max={X_MAX}
					step={X_STEP}
					value={x}
					aria-valuetext={`x = ${t.x}`}
					onChange={(e) => {
						setX(snapX(Number(e.currentTarget.value)));
						setXText(null);
					}}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>−2</span>
					<span>0</span>
					<span>2</span>
				</div>
				<div className={styles.numRow}>
					<span className={styles.numField}>
						<label htmlFor={inputId} className={styles.small}>
							或直接輸入 x（−2 到 2）
						</label>
						<input
							id={inputId}
							type="number"
							className={styles.num}
							step={X_STEP}
							min={X_MIN}
							max={X_MAX}
							value={xText ?? fmtInput(x)}
							onChange={(e) => onXInput(e.currentTarget.value)}
							onBlur={() => setXText(null)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') setXText(null);
							}}
						/>
					</span>
					<button type="button" className={`${styles.chip} ${styles.toggle} ${styles.toggleWrong}`} aria-pressed={wrong} onClick={() => setWrong((v) => !v)}>
						錯誤版本：外層導數都在 x 算
					</button>
				</div>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			<div className={styles.flowWrap}>
				<div className={styles.flow}>
					{machines.map((m, k) => {
						const i = k + 1;
						const pos = POS(i);
						const L = locals[k];
						const opText = i < 3 ? '×' : '=';
						return (
							<Fragment key={m.out}>
								<div className={`${styles.machine} ${L.isWrong ? styles.machineWrong : ''}`} style={pos.machine}>
									<p className={styles.inlet}>
										<span className={styles.inletLabel}>輸入</span>
										<span className={styles.inletValue}>
											{m.inName} {m.inEq} <span className={styles.inVal}>{m.inText}</span>
										</span>
									</p>
									<p className={styles.rule}>
										<span className={styles.ruleText}>{m.rule}</span>
										<span className={styles.ruleTag}>第 {i} 台</span>
									</p>
								</div>
								<div className={styles.arrow} style={pos.arrow} aria-hidden="true">
									<span className={styles.arrowName}>{m.out}</span>
								</div>
								<div className={`${styles.local} ${L.isWrong ? styles.localWrong : ''}`} style={pos.local}>
									<p className={styles.localLabel}>{L.label}</p>
									{L.lines.map((ln, j) => (
										<p key={j} className={styles.localLine}>
											{ln}
										</p>
									))}
									<p className={styles.localLine}>{L.value}</p>
									{L.hint ? <p className={styles.localHint}>{L.hint}</p> : null}
								</div>
								<div className={styles.op} style={pos.op} aria-hidden="true">
									{opText}
								</div>
							</Fragment>
						);
					})}
					<div className={styles.outlet} style={OUT_POS}>
						<span className={styles.inletLabel}>輸出</span>
						<span className={styles.inletValue}>
							y {eq(t.y)} {t.y.text}
						</span>
					</div>
					<div className={`${styles.answer} ${wrong ? styles.answerWrong : ''}`} style={ANSWER_POS}>
						<span className={styles.localLabel}>{wrong ? '錯誤版本' : 'dy/dx'}</span>
						{prodVal ? (
							<span className={styles.answerValue}>
								{eq(prodVal)} {prodVal.text}
							</span>
						) : (
							<span className={styles.answerNone}>算不出來</span>
						)}
					</div>
				</div>
			</div>

			<div className={styles.calc}>
				<p className={styles.calcTitle}>
					對照：數值導數（中央差分，<span className={styles.nowrap}>h = 1e-5</span>）
				</p>
				<div className={styles.cmpGrid}>
					{wrong ? (
						<>
							<span className={`${styles.cmpName} ${styles.wrongText}`}>錯誤版本</span>
							<span className={styles.wrongText}>{wrongCmp ?? '算不出來（1/0）'}</span>
						</>
					) : (
						<>
							<span className={`${styles.cmpName} ${styles.localText}`}>鏈鎖律</span>
							<span className={styles.result}>{chainCmp}</span>
						</>
					)}
					<span className={styles.cmpName}>數值導數</span>
					<Digits text={ndCmp} against={wrong ? wrongCmp : chainCmp} />
					{wrong ? (
						<>
							<span className={styles.cmpName}>結果</span>
							<span className={`${styles.cmpName} ${styles.wrongText}`}>{x0 ? '錯誤版本算不出來' : `對不上，${cmp?.kind === 'times' && cmp.ratio === 2 ? '錯一倍' : timesText}`}</span>
						</>
					) : (
						<>
							<span className={styles.cmpName}>相差</span>
							<span>
								{diff === 0 ? '0' : <Sci v={Math.abs(diff)} />}
								<span className={`${styles.cmpName} ${styles.muted}`}>{diff === 0 ? '（剛好一樣）' : '（數值導數本身的誤差）'}</span>
							</span>
						</>
					)}
				</div>
				<p className={`${styles.small} ${styles.muted}`}>
					數值導數不用推公式，直接算 <span className={styles.nowrap}>(f(x + h) − f(x − h))</span> <span className={styles.nowrap}>/ (2h)</span>；只準到小數點後大約 10 位。
				</p>
			</div>

			{note}
		</section>
	);
}
