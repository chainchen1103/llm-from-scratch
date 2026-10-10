---
title: 關於
description: 這個系列的目標、網站與 notebook 的使用方式、授權，以及如何回報問題。
---

## 系列目標

這個系列想陪你從「會用 LLM」走到「真的懂 LLM」。走完全部內容之後，希望你能做到這四件事：

1. **讀懂論文**：看到一篇新的 LLM 論文，能理解它想解決什麼問題、方法怎麼運作、數學怎麼推導。
2. **重現實驗**：把論文裡的方法親手實作出來，跑出相近的結果。
3. **定位失敗原因**：模型訓練不起來或結果不如預期時，知道該從哪裡開始檢查。
4. **提出有實驗證據的新方法**：有了新點子，能設計公平的實驗，用實驗結果說明它是不是真的有效。

為了達成這些目標，我們幾乎所有東西都從零開始實作，而且常常刻意「弄壞它」：拿掉某個設計、把某個參數調壞，看看模型會怎麼失敗。

## 怎麼使用這個網站

- 先到[學習路線](/roadmap/)看看整個系列的規劃。第一次學建議按照順序走，因為後面的集數會用到前面親手實作的東西。
- 每一集推出後，頁面上會有影片、圖文教學，以及對應 notebook 的連結。
- 推薦的順序是：先看影片抓住整體概念，再讀圖文教學補齊細節，最後打開 notebook 自己動手跑一遍。

## 怎麼使用 notebook

notebook 是可以邊讀邊執行程式的互動文件，副檔名是 `.ipynb`。所有 notebook 都放在 [GitHub 儲存庫（repo）](https://github.com/chainchen1103/llm-from-scratch) 的 `notebooks/` 資料夾，每一集一個子資料夾，例如 `notebooks/ep01/`。

### 方法一：Google Colab

1. 點 notebook 開頭的「Open in Colab」徽章，會在瀏覽器裡開啟 Google Colab。
2. 從上到下依序執行每一個儲存格。
3. 想保留自己的修改，記得選「檔案 → 在雲端硬碟中儲存複本」。

不需要在電腦上安裝任何東西。需要 GPU 的集數，可以在「執行階段 → 變更執行階段類型」裡選擇 GPU。

### 方法二：在自己的電腦上執行

```bash
git clone https://github.com/chainchen1103/llm-from-scratch.git
cd llm-from-scratch/notebooks
```

接著用 Jupyter 或 VS Code 開啟想看的 notebook。每個 notebook 的第一個程式碼儲存格會安裝固定版本的套件，確保你跑出來的結果和教學一致。建議替這個系列建立一個獨立的虛擬環境，避免和電腦上其他專案的套件版本互相干擾。

## 授權

- **程式碼**：採用 [MIT 授權](https://github.com/chainchen1103/llm-from-scratch/blob/main/LICENSE)。你可以自由使用、修改、散布，只要保留著作權與授權聲明。
- **內容**：採用[創用 CC 姓名標示-非商業性-相同方式分享 4.0 國際（CC BY-NC-SA 4.0）](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hant)授權，完整條款見 repo 中的 [LICENSE-CONTENT](https://github.com/chainchen1103/llm-from-scratch/blob/main/LICENSE-CONTENT)。歡迎在非商業用途下分享與改作，請標示出處；改作後的作品也請用相同的授權釋出。

## 意見回饋

發現錯字、程式跑不動，或有哪裡看不懂嗎？歡迎到 [GitHub Issues](https://github.com/chainchen1103/llm-from-scratch/issues) 回報。附上是哪一集、哪一段或哪一個儲存格，以及完整的錯誤訊息，會讓問題更快被解決。也非常歡迎你分享想看的主題或改進建議！
