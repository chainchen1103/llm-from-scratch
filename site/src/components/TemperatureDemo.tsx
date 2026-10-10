import { useEffect, useId, useMemo, useRef, useState } from 'react';
import styles from './TemperatureDemo.module.css';

/** 使用者輸入的句子，模型要猜下一個字。 */
const PROMPT = '今天天氣很';

/**
 * 溫度 T = 1 時，模型對下一個字的機率分佈。
 * 真實模型有好幾萬個候選 token；這裡只取 5 個具體的字示意，並把它們當成全部候選來計算
 * （不放「其他」這種合併項：它是許多小機率 token 的總和，不能當成單一 logit 套用溫度）。
 */
const CANDIDATES = [
	{ token: '好', p: 0.62 },
	{ token: '熱', p: 0.21 },
	{ token: '冷', p: 0.09 },
	{ token: '悶', p: 0.04 },
	{ token: '棒', p: 0.04 },
] as const;

/** logits：z_i = ln(p_i)。T = 1 時 softmax(z) 會還原成上面的機率。 */
const LOGITS = CANDIDATES.map((c) => Math.log(c.p));

const T_MIN = 0;
const T_MAX = 2;
const T_STEP = 0.05;
const T_DEFAULT = 1;
const HISTORY_SIZE = 10;

/**
 * 帶溫度的 softmax：p_i = exp(z_i / T) / Σ_j exp(z_j / T)。
 * T = 0 時視為貪婪解碼（greedy decoding）：機率最高的候選為 100%，其餘為 0。
 */
export function softmaxWithTemperature(logits: readonly number[], temperature: number): number[] {
	if (temperature <= 0) {
		const best = logits.indexOf(Math.max(...logits));
		return logits.map((_, i) => (i === best ? 1 : 0));
	}
	const scaled = logits.map((z) => z / temperature);
	// 先減掉最大值再取 exp，避免 T 很小時數值溢位。
	const max = Math.max(...scaled);
	const exps = scaled.map((s) => Math.exp(s - max));
	const sum = exps.reduce((a, b) => a + b, 0);
	return exps.map((e) => e / sum);
}

/** 依機率分佈抽出一個索引。 */
function sampleIndex(probs: readonly number[]): number {
	const r = Math.random();
	let cumulative = 0;
	for (let i = 0; i < probs.length; i++) {
		cumulative += probs[i];
		if (r < cumulative) return i;
	}
	// 浮點誤差讓總和略小於 1 時，退回最後一個機率大於 0 的候選。
	for (let i = probs.length - 1; i >= 0; i--) if (probs[i] > 0) return i;
	return 0;
}

const formatPercent = (p: number) => `${(p * 100).toFixed(1)}%`;
const formatT = (t: number) => t.toFixed(2);

function describeTemperature(t: number): string {
	if (t === 0) return '（貪婪解碼，greedy decoding：永遠選機率最高的字）';
	if (t < 1) return '（比較保守）';
	if (t > 1) return '（比較隨機）';
	return '（原始分佈）';
}

type Sample = { id: number; token: string };

export default function TemperatureDemo() {
	const [temperature, setTemperature] = useState(T_DEFAULT);
	const [history, setHistory] = useState<Sample[]>([]);
	const [nextId, setNextId] = useState(1);
	const sliderId = useId();
	const hintId = useId();
	const chartTitleId = useId();
	const sliderRef = useRef<HTMLInputElement>(null);

	// client:visible 的元件要捲到畫面上才開始載入；使用者如果在載入完成前就拖了滑桿，
	// 載入完成時把狀態對齊滑桿目前的位置，避免滑桿和數字不一致。
	useEffect(() => {
		const value = Number(sliderRef.current?.value);
		if (Number.isFinite(value) && value >= T_MIN && value <= T_MAX) setTemperature(value);
	}, []);

	const probs = useMemo(() => softmaxWithTemperature(LOGITS, temperature), [temperature]);
	const latest = history[0];

	const handleSample = () => {
		const token = CANDIDATES[sampleIndex(probs)].token;
		setHistory((prev) => [{ id: nextId, token }, ...prev].slice(0, HISTORY_SIZE));
		setNextId((n) => n + 1);
	};

	const valueText = `溫度 ${formatT(temperature)}${describeTemperature(temperature)}，「好」的機率 ${formatPercent(probs[0])}`;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="溫度互動示範">
			<p className={styles.prompt}>
				<span className={styles.promptLabel}>輸入</span>
				<span className={styles.promptText}>
					{PROMPT}
					<span className={latest ? styles.tokenFilled : styles.tokenEmpty}>
						{latest ? latest.token : '？'}
					</span>
				</span>
			</p>

			<div className={styles.control}>
				<div className={styles.controlHeader}>
					<label htmlFor={sliderId} className={styles.label}>
						溫度 T
					</label>
					<output htmlFor={sliderId} className={styles.value} aria-hidden="true">
						{formatT(temperature)}
						<span className={styles.valueNote}>{describeTemperature(temperature)}</span>
					</output>
				</div>
				<input
					ref={sliderRef}
					id={sliderId}
					className={styles.slider}
					type="range"
					min={T_MIN}
					max={T_MAX}
					step={T_STEP}
					value={temperature}
					aria-valuetext={valueText}
					aria-describedby={hintId}
					onChange={(e) => setTemperature(Number(e.currentTarget.value))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>0（保守）</span>
					<span>1</span>
					<span>2（隨機）</span>
				</div>
			</div>

			<p id={chartTitleId} className={styles.chartTitle}>
				下一個字的機率
			</p>
			<ul className={styles.bars} aria-labelledby={chartTitleId}>
				{CANDIDATES.map((c, i) => (
					<li key={c.token} className={styles.row}>
						<span className={styles.token}>{c.token}</span>
						<span className={styles.track} aria-hidden="true">
							<span
								className={i === 0 ? styles.barHighlight : styles.bar}
								style={{ width: `${probs[i] * 100}%` }}
							/>
						</span>
						<span className={styles.percent}>{formatPercent(probs[i])}</span>
					</li>
				))}
			</ul>

			<div className={styles.sampleArea}>
				<button type="button" className={styles.button} onClick={handleSample}>
					抽一次
				</button>
				<p className={styles.result} aria-live="polite">
					{latest ? (
						<>
							抽到：<strong className={styles.resultToken}>{latest.token}</strong>
						</>
					) : (
						'按下按鈕，依照目前的機率抽一個字。'
					)}
				</p>
			</div>

			<div className={styles.history}>
				<span className={styles.historyLabel}>最近 {HISTORY_SIZE} 次：</span>
				{history.length === 0 ? (
					<span className={styles.historyEmpty}>還沒有抽樣紀錄</span>
				) : (
					<ol className={styles.historyList} aria-label={`最近 ${history.length} 次抽樣結果，最新的在最前面`}>
						{history.map((s) => (
							<li key={s.id} className={styles.chip}>
								{s.token}
							</li>
						))}
					</ol>
				)}
			</div>

			<p id={hintId} className={styles.hint}>
				{'溫度越低，機率越集中在「好」，回答保守又穩定；溫度越高，分佈越平均，其他字也更有機會被抽中，回答就更隨機。' +
					'真實模型有好幾萬個候選 token，這裡只取 5 個示意，把它們當成全部候選來計算。'}
			</p>
		</section>
	);
}
