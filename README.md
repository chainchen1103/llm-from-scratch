# 從零學 LLM

> 系列名稱暫定。

從底層數學開始，親手實作神經網路與 Transformer，一路到現代 LLM（大型語言模型，Large Language Model）的訓練、推論與部署。這是一套給初學者的繁體中文教學系列。

**網站：<https://chainchen1103.github.io/llm-from-scratch/>**

## 這個系列的特色

- **從零實作**：從 NumPy 和最基本的數學出發，親手把神經網路、Transformer 寫出來，每一條公式都對應到看得懂的程式碼。
- **每集三件套**：每一集都有一支影片、一篇圖文教學，以及一份可以直接執行的 notebook。
- **刻意「弄壞它」**：做出能動的版本之後，故意拿掉某個設計、把參數調壞，從失敗中理解模型為什麼能動。

## 學習路線

全系列共 10 部、62 集，預計每週推出一集。完整的集數列表請見網站上的[學習路線](https://chainchen1103.github.io/llm-from-scratch/roadmap/)。

| 部 | 主題 | 集數 |
| --- | --- | --- |
| 第 0 部 | 序章 | EP00 |
| 第 1 部 | 數學與工具基礎 | EP01–EP08 |
| 第 2 部 | 從零打造神經網路 | EP09–EP16 |
| 第 3 部 | 語言模型基礎 | EP17–EP21 |
| 第 4 部 | Transformer 全解析 | EP22–EP30 |
| 第 5 部 | 規模化與預訓練 | EP31–EP37 |
| 第 6 部 | 後訓練與對齊 | EP38–EP45 |
| 第 7 部 | 推論與部署 | EP46–EP51 |
| 第 8 部 | 可解釋性與除錯 | EP52–EP55 |
| 第 9 部 | 研究方法與畢業專題 | EP56–EP61 |

## 內容結構

```text
llm-from-scratch/
├── notebooks/        各集的 Jupyter notebook，每集一個資料夾（notebooks/epXX/）
├── site/             教學網站（Astro + Starlight）
│   └── src/content/docs/   網站上的圖文教學
├── .github/workflows/      自動建置並部署網站到 GitHub Pages
├── LICENSE           程式碼授權（MIT）
└── LICENSE-CONTENT   內容授權（CC BY-NC-SA 4.0）
```

### 執行 notebook

- **Google Colab**：點 notebook 開頭的「Open in Colab」徽章，在瀏覽器裡就能執行，不用安裝任何東西。
- **自己的電腦**：`git clone` 這個 repo 之後，用 Jupyter 或 VS Code 開啟 `notebooks/` 底下的檔案。

notebook 的撰寫慣例請見 [notebooks/README.md](notebooks/README.md)。

### 在本機預覽網站

需要 Node.js 22.12 以上版本。

```bash
cd site
npm ci
npm run dev       # 開發模式：http://localhost:4321/llm-from-scratch/
npm run build     # 建置正式版本到 site/dist/
npm run preview   # 預覽建置結果
```

推送到 `main` 分支後，GitHub Actions 會自動建置並部署到 GitHub Pages。

## 授權

這個 repo 採用雙授權：

| 適用範圍 | 授權 | 檔案 |
| --- | --- | --- |
| 程式碼（包含 notebook 裡的程式碼與網站原始碼） | [MIT License](https://opensource.org/license/mit) | [LICENSE](LICENSE) |
| 內容（文字、圖片、影片，包含 notebook 裡的說明文字） | [創用 CC 姓名標示-非商業性-相同方式分享 4.0 國際（CC BY-NC-SA 4.0）](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hant) | [LICENSE-CONTENT](LICENSE-CONTENT) |

簡單來說：程式碼可以自由使用、修改與散布（包含商業用途），只要保留著作權與授權聲明；教學內容歡迎在非商業用途下分享與改作，請標示出處，改作後也請以相同授權釋出。

## 意見回饋

發現錯字、程式跑不動，或有看不懂的地方，歡迎到 [GitHub Issues](https://github.com/chainchen1103/llm-from-scratch/issues) 回報。附上集數、段落或儲存格位置，以及完整的錯誤訊息，會讓問題更快被解決。
