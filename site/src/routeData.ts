import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { SITE_TITLE } from './consts';

/** 把以 / 開頭的站內路徑加上 Astro 的 base（例如 /roadmap/ → /llm-from-scratch/roadmap/）。 */
function withBase(href: string): string {
	const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
	if (!base || !href.startsWith('/') || href.startsWith('//')) return href;
	if (href === base || href.startsWith(`${base}/`)) return href;
	return `${base}${href}`;
}

/**
 * Starlight route middleware：
 * 1. 首頁 hero 沒有寫 title 時，用 consts.ts 的 SITE_TITLE 當大標，系列改名只要改一個地方。
 * 2. hero 按鈕的站內連結自動加上 base，frontmatter 裡寫 /roadmap/ 就好。
 * 3. 首頁的 <title> 與 og:title 直接用 SITE_TITLE（不是「首頁 | …」），
 *    分享到 LINE、Facebook 時預覽才會顯示系列名稱。
 */
export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	const { hero } = route.entry.data;
	if (!hero) return;
	hero.title ??= SITE_TITLE;
	for (const action of hero.actions) {
		action.link = withBase(action.link);
	}

	if (route.id === '') {
		for (const tag of route.head) {
			if (tag.tag === 'title') tag.content = SITE_TITLE;
			if (tag.tag === 'meta' && tag.attrs?.property === 'og:title') tag.attrs.content = SITE_TITLE;
		}
	}
});
