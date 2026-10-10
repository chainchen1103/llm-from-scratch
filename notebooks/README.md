# Notebooks

這裡放每一集搭配的 Jupyter notebook。每份 notebook 都能在 Google Colab 或自己的電腦上，從上到下直接執行。

## 資料夾結構

每集一個資料夾，用兩位數集數命名：

```text
notebooks/
├── ep00/
├── ep01/
│   └── ep01_numpy_shapes.ipynb
├── ep02/
└── ...
```

- 資料夾名稱：`epXX`（`ep00`～`ep61`），和網站上的集數一致。
- 檔名：以集數開頭，後面接簡短的英文主題，使用小寫與底線，例如 `ep01_numpy_shapes.ipynb`。檔名避免中文與空白，Colab 連結和指令列比較不容易出問題。
- 同一集需要多份 notebook 時，加上順序：`ep09_autograd_part1.ipynb`、`ep09_autograd_part2.ipynb`。

## 撰寫慣例

### 1. 開頭放「Open in Colab」徽章

第一個儲存格是 Markdown，包含標題、這一集的簡介，以及 Colab 徽章：

```markdown
# EP01 開發環境與 NumPy 入門

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/chainchen1103/llm-from-scratch/blob/main/notebooks/ep01/ep01_numpy_shapes.ipynb)
```

徽章連結的路徑要和實際檔案路徑完全相同（`blob/main/notebooks/epXX/檔名.ipynb`）。

### 2. 由上到下可以完整執行

- 送出前先「重新啟動並全部執行」（Restart & Run All），確認從頭到尾沒有錯誤。
- 不依賴執行順序被打亂的狀態，也不依賴只存在自己電腦上的檔案。
- 需要隨機性的地方固定亂數種子（random seed），讓結果可以重現。
- 需要下載資料時，在 notebook 裡用程式下載，並註明資料來源與授權。
- 需要 GPU 的 notebook，在開頭說明，並提醒讀者在 Colab 切換執行階段類型。

### 3. 相依套件版本固定

第一個程式碼儲存格負責安裝套件，**每個套件都寫明確的版本號**，確保每個人跑出來的結果一致：

```python
%pip install -q "numpy==2.3.4" "matplotlib==3.10.7"
```

（版本號只是示意，請以實際測試過的版本為準。）

接著印出實際使用的版本，方便讀者回報問題時對照：

```python
import sys, numpy as np
print("Python", sys.version.split()[0], "| NumPy", np.__version__)
```

### 4. 輸出清乾淨再 commit

commit 前清除所有儲存格的輸出與執行次數，讓 diff 乾淨、repo 不會被圖片和大量輸出塞滿：

```bash
jupyter nbconvert --clear-output --inplace notebooks/epXX/*.ipynb
```

也可以安裝 [nbstripout](https://github.com/kynan/nbstripout)，讓 git 在 commit 時自動清除輸出：

```bash
pip install nbstripout
nbstripout --install
```

## 授權

notebook 裡的**程式碼**採用 [MIT 授權](../LICENSE)；**說明文字與圖片**採用 [CC BY-NC-SA 4.0](../LICENSE-CONTENT)。
