# 選擇題練習 PWA

純靜態網站(HTML + CSS + JS，不需要編譯)，可以「加入主畫面」變成手機 App，安裝後可離線練習。

## 本機執行

```bash
python3 -m http.server 8000
```

打開 <http://localhost:8000>。不能直接雙擊 `index.html`，因為瀏覽器不允許 `file://` 讀取 JSON。

## 裝到手機

PWA 必須用 **HTTPS** 提供(localhost 例外)，把整個資料夾放到 GitHub Pages、Netlify、Cloudflare Pages 等靜態空間即可。

- iPhone：Safari 開網址 → 分享 → 加入主畫面
- Android：Chrome 開網址 → 選單 → 安裝應用程式 / 加到主畫面

## 檔案結構

```
index.html, style.css, app.js   網站本體
sw.js                           Service Worker(離線快取)
manifest.webmanifest, icons/    PWA 設定與圖示
data/index.json                 題庫清單
data/banks/*.json               題庫，一個檔案一個題庫
media/                          題目用的圖片(.jpg / .png / .svg)
```

## 新增題庫

1. 在 `data/banks/` 新增一個 JSON 檔(格式見下)。
2. 把路徑加進 `data/index.json` 的 `banks`。

## 題庫 JSON 格式

```jsonc
{
  "id": "bangye-python125",
  "title": "APCS Python 程式識讀 125 題",
  "source": {                       // 題庫預設來源，每題會自動帶入
    "name": "bangye",
    "author": "吳邦一",
    "url": "https://www.facebook.com/groups/359446638362710/user/631493240/"
  },
  "questions": [
    {
      "id": "bangye-001",           // 全站唯一，作答紀錄用它當 key，發布後不要改
      "sourceRef": "Q.001",         // 原始出處的題號
      "tags": ["變數與基本運算", "整數除法"],
      "difficulty": "易",           // 易 / 中 / 難
      "stem": [ /* 內容區塊 */ ],
      "options": ["16 11", "..."],  // 依序為 (A)(B)(C)...，可以是字串或內容區塊陣列
      "answer": "B",
      "explanation": [ /* 內容區塊 */ ],
      "shuffleOptions": false,      // 選填，設 false 時這題的選項不打亂(例如選項有大小順序)
      "source": { }                 // 選填，覆蓋題庫預設來源的部分欄位
    }
  ]
}
```

### 打亂選項

勾選「打亂選項順序」時，文字以「以上」開頭的選項(以上皆是、以上皆非、以上皆非或執行錯誤…)會固定在原位，其餘選項互相打亂。`answer` 一律寫 JSON 裡的原始代號，網站會自動換算成畫面上的代號。解說裡若寫到「(B)」這類代號，打亂後會對不上，建議解說直接寫選項內容。

### 內容區塊

`stem`、`explanation` 以及每個選項都可以是「內容區塊陣列」，可以混合文字、程式碼與圖片：

```jsonc
{ "type": "text",  "text": "輸出為何？" }
{ "type": "code",  "lang": "python", "code": "a = 5\nprint(a)" }
{ "type": "image", "src": "media/tree-01.png", "alt": "二元樹", "caption": "圖一", "width": 240 }
{ "type": "image", "src": "media/graph-02.svg", "alt": "有向圖" }
{ "type": "svg",   "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" ...>...</svg>", "alt": "..." }
```

- `image` 支援 `.jpg`、`.png`、`.svg`、`.webp` 等瀏覽器能顯示的格式，檔案放在 `media/`。
- `svg` 可直接把 SVG 原始碼寫進 JSON，不用另存檔案(記得加 `xmlns`)。
- `width` 可省略；數字表示 px，也可以寫 `"60%"`。

選項用圖片的例子：

```json
"options": [
  [{ "type": "image", "src": "media/q12-a.png", "alt": "選項 A 的樹" }],
  [{ "type": "image", "src": "media/q12-b.png", "alt": "選項 B 的樹" }],
  "以上皆非"
]
```

## 更新網站後

修改 `index.html` / `style.css` / `app.js` 後，把 `sw.js` 裡的 `CACHE_NAME` 版本號加 1，已安裝的手機才會換新版。題庫 JSON 和 `media/` 的圖片是「先抓網路」，不需要改版本號。

## 目前收錄

- bangye：吳邦一《APCS Python 程式識讀 125 題》(08/25/2025 修正版) Q.001–Q.010，答案與說明取自原文件解答部分。
