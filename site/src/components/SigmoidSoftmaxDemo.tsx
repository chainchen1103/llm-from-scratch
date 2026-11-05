import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './Ep08Lr.module.css';
import { plotFrame } from './ep04-calc.ts';
import { expText, probText, sigmoidCurve, sigmoidInfo, snapZ, Z_DEFAULT, Z_MAX, Z_MIN, Z_PRESETS, Z_STEP, zText } from './ep08-lr.ts';

/**
 * sigmoid 就是兩個類別的 Softmax：拖動「冷」的分數 z（−6 到 6），「熱」的分數固定是 0。
 * 左邊是 S 形曲線 σ(z) 上的點，右邊是 Softmax([z, 0]) 的兩根長條：「冷」和點一樣高（就是 σ(z)），
 * 「熱」是 1 − σ(z)。兩邊共用同一個縱軸，虛線把點和「冷」的長條頂端連起來。
 *
 * viewBox 跟著實際寬度（1 單位 = 1 px），字和線條在手機上也維持原本的大小。
 */

const DEFAULT_W = 600;
const PADS = { l: 38, r: 6, t: 46, b: 62 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
const Y_LABELS = ['0', '0.25', '0.5', '0.75', '1'];
const Z_TICKS = [-6, -4, -2, 0, 2, 4, 6];
const CURVE = sigmoidCurve(240);
const sup = (k: number) => String(k).replace('-', '−');

export default function SigmoidSoftmaxDemo() {
	const [z, setZ] = useState(Z_DEFAULT);
	const [W, setW] = useState(DEFAULT_W);
	const [dragging, setDragging] = useState(false);
	const [hover, setHover] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const dragId = useRef<number | null>(null);
	const uid = useId();
	const sliderId = `${uid}-z`;
	const hintId = `${uid}-hint`;
	const presetId = `${uid}-presets`;

	// 量座標圖的實際寬度
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const update = () => {
			const w = Math.round(el.getBoundingClientRect().width);
			if (w > 0) setW(w);
		};
		update();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// ----- 版面：左邊 S 形曲線、右邊兩根長條，共用縱軸 -----
	const H = Math.round(Math.min(330, Math.max(270, W * 0.5)));
	const barsW = Math.round(Math.min(210, Math.max(92, W * 0.3)));
	const gap = W < 420 ? 14 : 22;
	const curveRight = W - PADS.r - barsW - gap;
	const fr = plotFrame(curveRight + PADS.r, H, { xMin: Z_MIN, xMax: Z_MAX, yMin: 0, yMax: 1 }, PADS);
	const { sx, sy } = fr;
	const barsLeft = curveRight + gap;
	const colW = barsW / 2;
	const barW = Math.min(58, colW * 0.6);
	const barX = (i: number) => barsLeft + (i + 0.5) * colW;
	const wideCurve = curveRight - PADS.l >= 230;

	const info = sigmoidInfo(z);
	const pT = probText(info.p);
	const qT = probText(info.q);
	const zT = zText(z);
	const nzT = zText(-z);
	const P: [number, number] = [sx(z), sy(info.p)];

	// ----- 拖動（Pointer Events：滑鼠、觸控、觸控筆都適用）：在圖上左右拖，z 跟著手指 -----
	const localXY = (e: ReactPointerEvent<SVGSVGElement>): [number, number] => {
		const r = e.currentTarget.getBoundingClientRect();
		return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
	};
	const zFromX = (px: number) => snapZ(fr.fromX(Math.min(fr.right, Math.max(fr.left, px))));
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const [px] = localXY(e);
		if (px > curveRight + gap / 2) return; // 長條那一邊不能拖
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragId.current = e.pointerId;
		setDragging(true);
		setZ(zFromX(px));
	};
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const [px, py] = localXY(e);
		if (dragId.current !== e.pointerId) {
			if (e.pointerType === 'mouse') setHover(Math.hypot(px - P[0], py - P[1]) <= 22);
			return;
		}
		setZ(zFromX(px));
	};
	const endDrag = () => {
		dragId.current = null;
		setDragging(false);
	};

	// ----- 說明 -----
	let note;
	if (z === 0) {
		note = (
			<p className={styles.ok}>
				<span className={styles.tagWord}>z = 0：</span>兩個分數一樣，Softmax 平分，「冷」「熱」各 0.5。S 形曲線在這裡最陡，斜率 σ(z)(1 − σ(z)) 是最大的 0.25。
			</p>
		);
	} else if (Math.abs(z) >= 5) {
		note = (
			<p className={styles.note}>
				<span className={styles.tagWord}>很有把握：</span>「冷」的分數比「熱」{z > 0 ? '高' : '低'} {zText(Math.abs(z))}，「冷」的機率 {pT} {z > 0 ? '幾乎是 1' : '幾乎是 0'}。曲線在這裡幾乎是平的（斜率只有 {probText(info.slope)}）：z 再{z > 0 ? '變大' : '變小'}，機率也幾乎不變。
			</p>
		);
	} else {
		note = (
			<p className={styles.plain}>
				<span className={styles.tagWord}>只看分數的差：</span>「冷」的分數比「熱」{z > 0 ? '高' : '低'} {zText(Math.abs(z))}，所以「冷」的機率 {pT} 比 0.5 {z > 0 ? '大' : '小'}。z 越大越靠近 1、越小越靠近 0；這裡的斜率是 {probText(info.slope)}。
			</p>
		);
	}

	const summary = `「冷」的分數 z = ${zT}、「熱」的分數 0。Softmax([${zT}, 0]) = [${pT}, ${qT}]：「冷」的機率 σ(${zT}) = ${pT}，「熱」的機率 1 − σ(z) = ${qT}。`;
	const presetOn = (v: number) => z === v;

	return (
		<section className={`not-content ${styles.demo}`} aria-label="sigmoid 就是兩個類別的 Softmax：拖動分數 z，看 S 形曲線上的點和 Softmax 的兩根長條">
			<div className={styles.group}>
				<p className={`${styles.title} ${styles.balance}`}>sigmoid 就是兩個類別的 Softmax</p>
				<p className={`${styles.small} ${styles.muted} ${styles.pretty}`} id={hintId}>
					「冷」的分數是 z、「熱」的分數固定是 0。在圖上左右拖動，或用下面的滑桿改 z：左邊是 S 形曲線上的點，右邊是 Softmax([z, 0]) 的兩根長條，「冷」那一根和點一樣高。
				</p>
			</div>

			<div className={styles.group}>
				<span className={styles.controlLabel} id={presetId}>
					本集的表：z =
				</span>
				<div className={styles.chips} role="group" aria-labelledby={presetId}>
					{Z_PRESETS.map((v) => (
						<button key={v} type="button" className={`${styles.chip} ${styles.chipMono}`} aria-pressed={presetOn(v)} onClick={() => setZ(v)}>
							{sup(v)}
						</button>
					))}
				</div>
			</div>

			<div className={styles.plotWrap} ref={wrapRef}>
				<svg
					className={`${styles.plot} ${styles.draggable} ${dragging ? styles.grabbing : ''}`}
					viewBox={`0 0 ${W} ${H}`}
					role="img"
					aria-label={`左邊是 S 形曲線 σ(z)，點在 z = ${zT}，高度 ${pT}；右邊是 Softmax([${zT}, 0]) 的兩根長條：冷 ${pT}、熱 ${qT}。冷的長條和點一樣高。左右拖動可以改 z。`}
					aria-describedby={hintId}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
					onLostPointerCapture={endDrag}
					onPointerLeave={() => setHover(false)}
				>
					<text className={styles.axisTitle} x={4} y={14} textAnchor="start">
						機率
					</text>
					{Y_TICKS.map((t, k) => (
						<g key={t}>
							<line className={t === 0 ? styles.axis : styles.gridMinor} x1={fr.left} y1={sy(t)} x2={W - PADS.r} y2={sy(t)} />
							<text className={styles.tickText} x={fr.left - 6} y={sy(t) + 4} textAnchor="end">
								{Y_LABELS[k]}
							</text>
						</g>
					))}
					{Z_TICKS.map((t) => (
						<g key={`z${t}`}>
							<line className={t === 0 ? styles.axis : styles.gridMinor} x1={sx(t)} y1={fr.top} x2={sx(t)} y2={fr.bottom} />
							<text className={styles.tickText} x={sx(t)} y={fr.bottom + 17} textAnchor="middle">
								{sup(t)}
							</text>
						</g>
					))}
					<text className={styles.axisTitle} x={(fr.left + curveRight) / 2} y={fr.bottom + 36} textAnchor="middle">
						「冷」的分數 z
					</text>

					{/* S 形曲線 */}
					<path className={styles.curve} d={CURVE.map(([a, b], i) => `${i === 0 ? 'M' : 'L'}${sx(a).toFixed(2)} ${sy(b).toFixed(2)}`).join(' ')} />
					<text className={`${styles.coldText} ${styles.halo}`} x={sx(-5.6)} y={sy(0.9)} textAnchor="start">
						{wideCurve ? (
							<>
								σ(z) = 1 / (1 + e
								<tspan dy="-0.45em" fontSize="0.75em">
									−z
								</tspan>
								<tspan dy="0.45em">)</tspan>
							</>
						) : (
							'σ(z)'
						)}
					</text>

					{/* 點 → 「冷」的長條頂端 */}
					<line className={styles.guideV} x1={P[0]} y1={P[1]} x2={P[0]} y2={fr.bottom} />
					<line className={styles.guide} x1={P[0]} y1={P[1]} x2={barX(0) - barW / 2} y2={P[1]} />

					{/* 右邊：Softmax([z, 0]) */}
					<line className={styles.divider} x1={curveRight + gap / 2} y1={fr.top - 16} x2={curveRight + gap / 2} y2={fr.bottom + 50} />
					<text className={styles.axisTitle} x={barsLeft + barsW / 2} y={14} textAnchor="middle">
						Softmax([z, 0])
					</text>
					{[0, 1].map((i) => {
						const v = i === 0 ? info.p : info.q;
						const x = barX(i);
						const y = sy(v);
						return (
							<g key={i}>
								<rect className={styles.barTrack} x={x - barW / 2} y={sy(1)} width={barW} height={sy(0) - sy(1)} rx={3} />
								<rect className={i === 0 ? styles.barCold : styles.barHot} x={x - barW / 2} y={y} width={barW} height={Math.max(0, sy(0) - y)} rx={3} />
								<text className={`${i === 0 ? styles.coldText : styles.hotText} ${styles.halo}`} x={x} y={Math.min(y - 7, sy(0) - 7)} textAnchor="middle">
									{i === 0 ? pT : qT}
								</text>
								<rect className={styles.tokenRect} x={x - 16} y={fr.bottom + 6} width={32} height={22} rx={5} />
								<text className={styles.tokenText} x={x} y={fr.bottom + 22} textAnchor="middle">
									{i === 0 ? '冷' : '熱'}
								</text>
								<text className={styles.subText} x={x} y={fr.bottom + 44} textAnchor="middle">
									{i === 0 ? `z = ${zT}` : '0'}
								</text>
							</g>
						);
					})}

					{/* 可以拖的點 */}
					<circle className={styles.zHandle} cx={P[0]} cy={P[1]} r={13} />
					{dragging || hover ? <circle className={styles.zRing} cx={P[0]} cy={P[1]} r={18} /> : null}
					<circle className={styles.zDot} cx={P[0]} cy={P[1]} r={6.5} />
				</svg>
				<p className={styles.hint}>虛線：曲線上的點和「冷」的長條一樣高。黃色方塊是兩個類別，下面是它們的分數（「熱」固定是 0）。</p>
			</div>

			<div className={styles.group}>
				<div className={styles.sliderHeader}>
					<label className={styles.title} htmlFor={sliderId}>
						「冷」的分數 z = <span className={styles.value}>{zT}</span>
					</label>
					<span className={`${styles.small} ${styles.muted}`}>方向鍵一次 0.1</span>
				</div>
				<input
					id={sliderId}
					className={styles.slider}
					type="range"
					min={Z_MIN}
					max={Z_MAX}
					step={Z_STEP}
					value={z}
					aria-valuetext={`z = ${zT}，冷的機率 ${pT}，熱的機率 ${qT}`}
					onChange={(e) => setZ(snapZ(Number(e.currentTarget.value)))}
				/>
				<div className={styles.scale} aria-hidden="true">
					<span>−6</span>
					<span>0</span>
					<span>6</span>
				</div>
			</div>

			<div className={styles.calc}>
				<p className={styles.calcTitle}>兩個分數 [z, 0] 做 Softmax，取「冷」那一格</p>
				<p className={styles.deriv}>
					<span>
						p = e<sup>z</sup> / (e<sup>z</sup> + e<sup>0</sup>)
					</span>
					<span>
						= {expText(info.ez)} / ({expText(info.ez)} + 1)
					</span>
					<span>
						= <span className={`${styles.result} ${styles.big} ${styles.coldName}`}>{probText(info.sm[0])}</span>
					</span>
				</p>
				<p className={styles.deriv}>
					<span>
						&#8195;= 1 / (1 + e<sup>−z</sup>)
					</span>
					<span>= 1 / (1 + {expText(info.enz)})</span>
					<span>
						= <span className={`${styles.result} ${styles.big} ${styles.coldName}`}>{pT}</span> = σ({zT})
					</span>
				</p>
				<p className={styles.deriv}>
					<span>「熱」：1 − σ(z)</span>
					<span>= 1 − {pT}</span>
					<span>
						= <span className={`${styles.result} ${styles.big} ${styles.hotName}`}>{qT}</span> = σ({nzT})
					</span>
				</p>
				<p className={styles.derivNote}>
					中間那一步是上下同除以 e<sup>z</sup>（e<sup>z</sup> = {expText(info.ez)}、e<sup>−z</sup> = {expText(info.enz)}）。「熱」的分數可以固定是 0，因為 Softmax 只看分數的差；把兩個分數對調，就是 z 換成 −z，所以「熱」的機率是 σ(−z)。
				</p>
			</div>

			<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{summary}
			</p>

			{note}
		</section>
	);
}
