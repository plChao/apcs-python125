---
name: pdf-to-quiz-json
description: 把 PDF 裡的選擇題(例如 APCS Python 程式識讀題本)轉成本專案選擇題練習網站的題庫 JSON，並逐題確認答案、回報題目或解答有誤的地方。使用者說「把 PDF 題目轉 json」「從 PDF 加第 N 到 M 題」「匯入題目」「新增題庫」時使用。
---

# PDF 選擇題 → 題庫 JSON

三個步驟都要做，順序固定：**1. 轉 JSON → 2. 確認答案 → 3. 回報有誤的題目**。
題庫格式以專案根目錄的 `README.md` 為準(題庫 JSON 格式、內容區塊、打亂選項)。

## 0. 先確認範圍

- 哪一份 PDF、哪幾題(例如 Q.011–Q.020)。沒講就問。
- 要放進哪個題庫檔：已有題庫就**附加**到 `data/banks/<id>.json` 的 `questions`，不要覆蓋已有題目；新題庫要建新檔並加進 `data/index.json`。
- 來源資訊(`source.name`、`author`、`url`)：沿用題庫層級的 `source`；新題庫要問使用者。

## 1. 轉 JSON

### 1-1 抽文字並看原圖

```bash
python3 -I .claude/skills/pdf-to-quiz-json/scripts/extract_pdf.py <pdf> --find "Q.011" --find "Q.020"  # 找題號在第幾頁
python3 -I .claude/skills/pdf-to-quiz-json/scripts/extract_pdf.py <pdf> --pages 6-8 --render <scratchpad>/pages
```

- `--pages` 印出那幾頁的文字；`--render` 另外把那幾頁存成 PNG。
- **文字抽取會丟失縮排、填空底線、上標(例如 O(n2) 其實是 O(n²))**，所以每一頁都要用 Read 看 PNG 對照，程式碼縮排以圖片為準。
- 題本常分「題目(無解答)」與「解答」兩部分，答案、說明、出題用意、難度要到解答部分找。
- 跨頁的題目(選項接到下一頁)要把兩頁合起來看。

### 1-2 寫成 JSON

每題的對應方式：

| PDF | JSON |
| --- | --- |
| `Q.011` | `"id": "<題庫前綴>-011"`、`"sourceRef": "Q.011"` |
| 程式碼 | `stem` 裡的 `{ "type": "code", "lang": "python", "code": ... }`，**逐字照抄，縮排用 4 個空白** |
| 題目文字(輸出為何？…) | `stem` 裡的 `{ "type": "text" }` |
| 「若輸入為以下內容」的輸入 | `{ "type": "code", "lang": "text", "role": "stdin", "code": "hello py\n123 45" }`，放在說明文字之後；`role: "stdin"` 讓驗證腳本拿來當輸入 |
| (A)…(E) | `options` 字串陣列，去掉 `(A)` 前綴與行尾空白 |
| 解答 | `answer`：大寫字母 |
| 說明 | `explanation` 的 text 區塊，**不要寫「(B)」這類選項代號**(選項會被打亂)，改寫成選項內容或直接刪掉代號 |
| 出題用意 | 拆成 `tags`，盡量沿用題庫裡已有的 tag 名稱(先 grep 現有 tags) |
| 難度 | `difficulty`：易 / 中 / 難 |
| 圖片 | 存到 `media/<題庫前綴>-<題號>-<n>.png`(或 .svg)，用 `{ "type": "image", "src", "alt" }` 引用 |

注意：

- **題目程式碼保留原文命名**(`a`、`b`、`q`…)，不套用型別前綴命名規範，因為這是引用別人的題目。
- 選項有大小順序、或「以上」以外的選項互相參照時，加 `"shuffleOptions": false`。
- 只修正 PDF 抽取造成的亂碼與排版問題；**不要自己修改題意或答案**，有疑問的放到步驟 3 回報。

### 1-3 檢查 JSON

```bash
python3 -I -c "import json,sys; json.load(open(sys.argv[1]))" data/banks/<id>.json
```

## 2. 確認答案

```bash
python3 -I .claude/skills/pdf-to-quiz-json/scripts/verify_answers.py data/banks/<id>.json --from Q.011 --to Q.020
```

腳本會把每題的 python 程式碼(加上 `role: "stdin"` 的輸入)實際執行，比對輸出與每個選項：

| 狀態 | 意思 | 要做的事 |
| --- | --- | --- |
| `OK` | 執行結果等於標示的答案 | 無 |
| `MISMATCH` | 執行結果符合另一個選項，或標示的答案不符而沒有「以上皆非」可對應 | 先檢查是不是自己抄錯(縮排、符號)，再對照 PDF 原圖；確定 PDF 本身有誤才回報 |
| `NO_MATCH` | 執行結果不等於任何選項，標示答案也不是「以上皆非」 | 同上 |
| `SKIP` | 沒辦法直接執行(填空、問時間複雜度、問變數內容而非輸出…) | **自己逐步推理**確認答案，必要時寫一小段測試程式驗證，在回報中寫出推理結論 |

比對規則：會忽略 list 內部 `,` 後面與括號旁的空白(題本說明裡「不區別沒有分隔作用的空白」)；程式丟出例外時視為「執行錯誤」。

## 3. 回報有誤的題目

全部做完後，給使用者一份回報，**只列有問題的題目**，沒有問題就說「N 題答案全部確認無誤」。每個問題寫：

- 題號(`sourceRef`)
- 問題類型：答案錯誤 / 題目程式有誤(例如必定執行錯誤但不是考點) / 選項重複或沒有正確選項 / 說明與答案矛盾 / 文字錯字
- 證據：實際執行輸出或推理過程
- JSON 目前怎麼處理：**預設照 PDF 原樣收錄**，並在該題加上 `"note": "<問題說明>"` 欄位(網站不顯示，只給維護者看)；是否修改答案由使用者決定

另外回報這次新增了哪些題目、哪些 tag 是新的。

## 4. 收尾

- 修改了題庫 JSON 不需要改 `sw.js` 的版本號(題庫是先抓網路)。
- 用 `./run.sh` 開 http://localhost:8001 抽查一兩題的顯示(尤其是有圖片或縮排複雜的題目)。
