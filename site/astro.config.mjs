// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import rehypeBaseLinks from './src/plugins/rehype-base-links.mjs';
import { REPO_URL, SITE_BASE, SITE_DESCRIPTION, SITE_ORIGIN, SITE_TITLE } from './src/consts.ts';

// https://astro.build/config
export default defineConfig({
	site: SITE_ORIGIN,
	base: SITE_BASE,

	markdown: {
		// Astro 7 預設的 Markdown 處理器是 Sätteri；remark / rehype 外掛要掛在
		// @astrojs/markdown-remark 的 unified() 處理器上（舊的 markdown.remarkPlugins 已 deprecated）。
		// .md 與 .mdx（透過 Starlight 內建的 @astrojs/mdx）都會套用這組外掛。
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [
				rehypeKatex,
				[rehypeBaseLinks, { base: SITE_BASE }],
			],
		}),
	},

	integrations: [
		starlight({
			title: SITE_TITLE,
			description: SITE_DESCRIPTION,
			// 單一語系：繁體中文（台灣）放在根目錄，網址不帶語系前綴。
			defaultLocale: 'root',
			locales: {
				root: { label: '繁體中文', lang: 'zh-TW' },
			},
			favicon: '/favicon.svg',
			// 404 頁面改由 src/pages/404.astro 提供（繁中文案、回首頁按鈕）。
			disable404Route: true,
			social: [{ icon: 'github', label: 'GitHub', href: REPO_URL }],
			customCss: [
				'@fontsource-variable/noto-sans-tc',
				'@fontsource-variable/jetbrains-mono',
				'katex/dist/katex.min.css',
				'./src/styles/theme.css',
			],
			// 首頁大標與 hero 按鈕連結由這支 route middleware 統一處理。
			routeMiddleware: './src/routeData.ts',
			sidebar: [
				{ label: '學習路線', slug: 'roadmap' },
				{ label: '關於', slug: 'about' },
				{ label: '課程', items: [{ autogenerate: { directory: 'episodes' } }] },
			],
		}),
		react(),
	],
});
