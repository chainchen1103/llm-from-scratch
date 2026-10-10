/**
 * 網站的共用設定集中在這裡。
 *
 * 系列名稱還沒定案：要改名時只需要改 SITE_TITLE，
 * 網站標題、分頁標題與首頁大標都會跟著更新。
 */

/** 系列（網站）名稱，暫定。 */
export const SITE_TITLE = '從零學 LLM';

/** 網站描述，用於 <meta name="description"> 與社群分享預覽。 */
export const SITE_DESCRIPTION =
	'從底層數學開始，親手實作神經網路與 Transformer，一路到現代 LLM 的訓練、推論與部署。';

/** GitHub Pages 的網域（Astro 的 `site`）。 */
export const SITE_ORIGIN = 'https://chainchen1103.github.io';

/** 網站部署在網域下的子路徑（Astro 的 `base`），等於 repo 名稱。 */
export const SITE_BASE = '/llm-from-scratch';

/** 公開 repo 網址，用於頁首的 GitHub 連結。 */
export const REPO_URL = 'https://github.com/chainchen1103/llm-from-scratch';
