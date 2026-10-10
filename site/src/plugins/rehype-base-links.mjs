/**
 * rehype 外掛：替 Markdown / MDX 內文裡「以 / 開頭的站內連結與圖片」自動加上 Astro 的 base。
 *
 * 網站部署在 https://chainchen1103.github.io/llm-from-scratch/，
 * 寫內文時只要寫 `[學習路線](/roadmap/)`，輸出就會變成 `/llm-from-scratch/roadmap/`。
 * 已經帶有 base 的連結、外部連結（https://、//）與錨點（#）都不會被改動。
 *
 * @param {{ base: string }} options
 */
export default function rehypeBaseLinks({ base }) {
	const prefix = base.replace(/\/+$/, '');
	if (!prefix) return () => {};

	/** @param {unknown} value */
	const withBase = (value) => {
		if (typeof value !== 'string') return value;
		if (!value.startsWith('/') || value.startsWith('//')) return value;
		if (value === prefix || value.startsWith(`${prefix}/`)) return value;
		return `${prefix}${value}`;
	};

	/** @param {any} node */
	const walk = (node) => {
		if (node.type === 'element' && node.properties) {
			if (node.tagName === 'a') node.properties.href = withBase(node.properties.href);
			if (node.tagName === 'img') node.properties.src = withBase(node.properties.src);
		}
		if (Array.isArray(node.children)) node.children.forEach(walk);
	};

	return (tree) => walk(tree);
}
