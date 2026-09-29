# Tra cứu — panel, trường content, API zionle

Tài liệu phụ của [SKILL.md](SKILL.md). Mở khi viết scene mới hoặc kéo số.

## 1. Mười một panel

`visual.type` chọn component ở `src/scenes/index.tsx`. Trường in đậm là **bắt buộc**.

| `type` | Vẽ gì | Trường |
|---|---|---|
| `candles` | Nến tháng trong kênh giá log, có dấu chạm biên | `caption`, `touches[]` (năm), `bands[]` (`year`, `label`, `accent`, `drop`) |
| `macd` | MACD(12,26,9) tính từ cùng chuỗi giá | `caption`, `note`, `peakLabel` |
| `rsi` | Giá ở khung trên, khung dưới là bộ dao động 0-100 với ngưỡng 70/30 | `caption`, `note`, `highlightZone`, `marks[]` (`month`, `label`, `accent`), `divergence` (`from`, `to`, `label`) |
| `pictogram` | Lưới người, n/tổng được tô | **`rows`**, **`columns`**, **`filledPercent`**, **`accent`** |
| `bars` | Thanh ngang mảnh chạy tới tỉ lệ của nó, in `%` làm tròn | **`bars[]`** (`label`, `percent`, `accent`) |
| `list` | Dòng có chip icon, hiện lần lượt | **`items[]`** (`icon`, `text`), **`accent`**, `chipShape` |
| `cards` | Hai thẻ cảnh báo cạnh nhau | **`cards[]`** (`title`, `body`), **`accent`** |
| `zigzag` | Bậc thang đi xuống, có chú thích "hy vọng / chần chừ" | **`topLabel`**, **`endLabel`**, **`upLabel`**, **`downLabel`**, **`steps`** |
| `riskReward` | Khoản lời nhỏ đặt cạnh khoản lỗ lớn, vẽ đúng tỉ lệ | **`left`**, **`right`** (mỗi cái `label` + `value`) |
| `image` | **Mặc định cho nến, chart và mọi scene về xu hướng giá** (người dùng chốt 2026-09-22/23): ảnh chụp terminal hoặc FireAnt trong cùng khung panel, có chip nguồn, caption, **mark vẽ dần theo beat**, quét mở màn và đẩy zoom nhẹ — hoặc **máy quay theo beat** khi có `shots` | **`src`** (dưới `public/`), `caption`, `source`, `fit` (`cover`/`contain`), `focus`, `zoom` (`false` để tắt đẩy), `sourceCorner`, `annotations[]` (`kind` box/circle/arrow/label/**hline**/**vline**, toạ độ PHẦN 0..1 của ảnh, `label`/`text`, `accent`, `beat`), `shots[]` (`beat`, `x`, `y`, `zoom` 1..4, `move`, `cut` — xem dưới), `crop` {x,y,w,h} (phần ảnh hiện, tỉ lệ 1,42 của `LAYOUT.imagePanel`), `masks[]` {x,y,w,h,color} + `maskColor` (che chữ giao diện của trang nguồn), mỗi mark nhận thêm `until` (beat cuối nó hiện) và `label` nhận `anchor` |
| `outro` | Thẻ chào cuối: nhận diện thương hiệu, kicker, pill, một dòng | **`brand`**, **`kicker`**, **`pill`**, **`line`**, `logo` |

Giá trị enum:

- `act`: `blue` · `maroon` · `amber` · `navy` — nền đổi theo mạch lập luận: phân tích → cảnh
  báo → việc cần làm → chào cuối.
- `accent`: `gold` · `red` · `green` · `white`
- `icon` (**chỉ `list`**): `check` · `warning` · `cross` · `up` · `down`. Vẽ bằng SVG ở
  `src/scenes/Icon.tsx` chứ không gõ ký tự — glyph ✓ và ⚠ thiếu ở vài weight của bộ vietnamese
  và rơi về font khác, nhìn như lỗi. `cards` luôn vẽ glyph `warning`, không đổi được từ content
  (`WarnCards.tsx:47` ghim cứng).

`candles`, `macd`, `rsi` đọc chuỗi giá dùng chung ở `src/lib/series.ts`; trường của chúng chỉ là
nhãn. Từ 2026-09-23 ba panel này TẮT mặc định: FireAnt đã có nến/RSI/MACD mọi khung trên dữ liệu
thật, còn ba panel này vẽ từ chuỗi tháng dựng lại. Chỉ dùng khi người dùng bảo đích danh. Nến và
chart là ảnh chụp (`image`, SKILL.md mục 1 và 1d); số suy ra đi vào `bars`/`pictogram`/`list`. Bảy panel còn lại lấy toàn bộ con số từ chính JSON — không cần dữ liệu tháng để VẼ. Nhưng
`content/vnindex-monthly.json` vẫn phải tồn tại và phải phủ `PEAK_MONTHS`/`TROUGH_MONTHS`, vì
`src/lib/series.ts` chạy ở module scope (xem mục 5).

**"Vẽ lên ảnh" làm trong Remotion, không làm trong FireAnt.** `annotations` của `image` là hộp
(`box`), vòng (`circle`), mũi tên (`arrow`), đoạn thẳng (`line` — trendline, hai biên kênh giá; `from`/`to`,
`dashed` cho đoạn chiếu, nhãn ở đầu `labelAt`), mức ngang (`hline`), mốc dọc (`vline`) và nhãn (`label`),
đặt theo phần (0..1) của vùng ảnh; `beat` là beat đầu tiên nó hiện, và nó
"vẽ" ra ngay khi beat đó bắt đầu (`beatFrame`). Đạo diễn NHÌN ảnh (Read) rồi đặt toạ độ; ảnh có
chú thích thì không đẩy zoom để mark không trượt. `verify` soát toạ độ trong 0..1, `beat` không vượt
số beat, và chữ trên nhãn phải truy về fact pack như mọi chữ khác. Lái công cụ vẽ của FireAnt bằng
chuột thì mong manh và không tái lập được — đừng.

Ví dụ đã render 2026-09-22 (ảnh `public/shots/vnindex-fireant-5y.png`, 687×514, `fit: contain`):

```json
"annotations": [
  {"kind": "circle", "x": 0.13, "y": 0.42, "r": 0.07, "label": "2022 · 1528", "accent": "gold", "beat": 0},
  {"kind": "arrow",  "from": [0.16, 0.50], "to": [0.26, 0.71], "accent": "red", "beat": 0},
  {"kind": "box",    "x": 0.73, "y": 0.12, "w": 0.15, "h": 0.20, "label": "2026 · 1933", "accent": "red", "beat": 1}
]
```

Toạ độ là phần của ẢNH (không phải của hộp panel): component tự quy đổi qua `fit`/`focus`, nên đổi
`cover`↔`contain` không làm mark trượt. `r` của `circle` tính theo cạnh ngắn của ảnh.

Một `line` cho trendline cần hai điểm (ngày, giá) đổi sang phần ảnh: đo trục giá ở mép phải (hai vạch
giá → `y = y0 + (p0 − p)/(p0 − p1) × (y1 − y0)`) và trục thời gian ở mép dưới (hai nhãn năm → x tuyến
tính theo tháng), rồi lấy mức của đường tại hai tháng đầu/cuối từ fact pack `channel.upper/lower`
(`atMonth` đã tính sẵn ở `through`, `laterPeaks`, `atLatest`, `projection`). Render still rồi soát
mắt: đường phải chạm đúng bóng nến ở các đỉnh/đáy đã ghim; lệch quá vài pixel là sai trục.

**Máy quay theo beat — `shots` (vox-director, từ 2026-09-28).** Một ảnh giữ 10 giây là khung chết;
vox-director (github.com/Alisa0808/vox-director, `references/beat-layer.md`) đổi khung mỗi 3–5 giây:
**wide định hướng → cận vào chi tiết lời đang gọi tên**. `shots` là danh sách khung, mỗi phần tử ứng
một beat (`beat` tăng dần, phần tử đầu `beat: 0`): `x`/`y` là TÂM khung theo phần của ẢNH (cùng hệ toạ
độ với `annotations`), `zoom` là độ phóng so với ảnh đã fit (1 = cả ảnh). Máy lướt 18 khung hình
(`easeInOut`, zoom nội suy hình học) từ khung trước sang khung mới khi beat bắt đầu, hoặc `cut: true`
cắt thẳng; trong lúc giữ khung thì trôi theo `move`:

| `move` | Trôi thế nào | Dùng khi |
|---|---|---|
| `push_in` (mặc định) | phóng thêm 6% | dồn sự chú ý, điểm ngoặt |
| `pull_out` | thu 6% về khung đặt | lùi ra cho thấy bối cảnh |
| `pan` | trượt ngang trái → phải 4% khung | đi theo thời gian (các chương timeline) |
| `tilt` | trượt dọc trên → dưới 4% khung | từ pane giá xuống pane chỉ báo |
| `static` | đứng yên | **chỉ cho khoảnh khắc payoff** — cái đứng yên báo "đây là ý chính" |

Quy tắc của vox-director: hai khung liền nhau (kể cả qua ranh giới scene) không cùng `move`; `static`
để dành cho payoff; cỡ khung suy từ `zoom` — `EST_WIDE` < 1,15 ≤ `WIDE` < 1,6 ≤ `MEDIUM` < 2,2 ≤ `CLOSE`
< 3 ≤ `DETAIL` (trang duyệt in đúng tên này). Khung bị kẹp để không lộ mép ảnh khi ảnh đã rộng hơn panel,
nên tâm đặt sát mép thì khung dừng ở mép (không phải lỗi). Mark nằm cùng lớp với ảnh nên đi theo máy;
nét và chữ của mark được bù `zoom^-0,6` để cận cảnh không phóng chữ gấp ba. Quét mở màn chạy trong toạ
độ MÀN HÌNH khi có `shots` — trong lớp đã phóng, khung đầu cận mép phải sẽ đen tới khi vạch quét tới nơi.
Có `shots` thì bỏ qua `zoom`/đẩy zoom cũ; `focus` chỉ còn đặt ảnh trong khung fit.

**Chụp FireAnt cho khung ảnh lớn (2026-09-28, người dùng yêu cầu ảnh rõ hơn).** Ở cửa sổ 1080×640 FireAnt
mở panel phải và chart chỉ rộng 687 px; ở `--size=1080x900` (cao tối đa là 1080×1813 — màn dọc trừ menu
bar) FireAnt thu panel phải thành dải tab, chart rộng ~925 px và có trục giá. Công thức đã chụp:
tháng `--size=1080x900 --range=5y --interval=M --pan=-125 --zoom-out=-3 --crop=full` (2013,5 → 2026 + vùng
tương lai trống bên phải — chỗ đặt nhãn); tuần `--size=1080x900 --range=1y --interval=W --crop=full`
(9/2025 → 9/2026). `--zoom-out` âm là zoom vào, neo giữa chart, nên pan trước để nến cuối về gần mép phải
sau khi zoom. Crop cả hai: px 62..1045 × 138..830 (tỉ lệ 1,42); masks: dòng tiêu đề/OHLC, chú giải Volume,
nút thu gọn, chú giải MACD (hai dải để không che đỉnh đường MACD), logo TradingView, bánh răng.

**Mark từ số liệu — hiệu chỉnh ảnh.** `scripts/calib_chart.py` dò cột nến theo màu trong pane giá, khớp
với N nến thật (`<shot>.bars.json`) và fit `x = last_x − d·(N−1−i)`, `y = a + b·giá` (lưu `<shot>.calib.json`,
đo 2026-09-28: sai số trung vị 0,5–0,8 px). Mark đặt từ (ngày, giá) qua hai hàm đó — không đo tay, và làm
mới số liệu chỉ cần chụp lại + chạy lại hiệu chỉnh. Màu nến: FireAnt (15,141,118)/(239,58,66), terminal
(16,185,129)/(239,68,68); pane MACD đọc từ nhãn trục. Nhãn tự trượt vào trong khung máy (10 px) nếu chạm
viền panel hay mép crop, kể cả khi đang zoom; nhãn của mark đã ra khỏi khung thì mờ đi.

Đo trên ảnh FireAnt 687×514 cũ (2026-09-28): thanh công cụ trên y 0,02–0,05, dòng OHLC y 0,10–0,125, chú
giải Volume y 0,15–0,17, chú giải MACD y 0,625–0,648, trục năm y ≈ 0,9, thanh chu kỳ y 0,955–0,975, thanh
công cụ trái x < 0,07, nền `#161921`. Vì thế `crop` ảnh tháng là {x 0,148 · y 0,128 · w 0,852 · h 0,802},
ảnh tuần {x 0,07 · y 0,128 · w 0,852 · h 0,802} (+ che nút thu gọn, logo TradingView, mép trục giá), ảnh
terminal 2712×1520 {x 0,159 · y 0 · w 0,796 · h 1} (bỏ trục giá theo nghìn bên phải); zoom ≥ 1,45 trên
terminal để khung không lấy vào pane RSI. Trong crop, vùng nhìn thấy ở `zoom` z là w/z × h/z của crop. Ảnh gốc chỉ 687 px ngang nên `zoom` ≥ 3
trên 1080p là hơi mềm — giữ cho payoff, còn lại ≤ 2,8. Nhãn `hline` (ở 8% hoặc 93% bề ngang ảnh) rơi ra
ngoài khung cận; khi đó để `hline` không nhãn và đặt `label` riêng ở chỗ khung nhìn thấy. Đạo diễn đặt
`shots` sau khi nhìn ảnh, như mark; worker KHÔNG đổi. Soát bằng `npm run review-page -- <Id>`: trang có
khung hình cho TỪNG beat và dòng "Máy quay" của từng scene.

**Chỉ `bands` của `candles` đánh chỉ số theo beat**: `bands[0]` hiện ở beat đầu, `bands[1]` ở
beat thứ hai (`CandleChart.tsx:44`). `marks` của `rsi` thì hiện HẾT, chỉ lệch nhau bằng độ trễ
khung hình (`pop(frame, fps, 58 + k * 12)`), không đọc `beatIndex`. `divergence`, khung callout
của `macd` và `endLabel` của `zigzag` chỉ hiện từ `beatIndex >= 1`.

## 2. Trường content, và ai sở hữu

```
Reel:  title*  scenes[]*  status  brief  facts  unsupported  disclaimer  ticker  footer  music  musicVolume
Scene: id*  role  eyebrow*  act*  duration*  beats[]*  visual*  narration  audio  sentenceStarts  headline
Beat:  at*  line1*  line2  accent  atSentence
```

| Trường | Ai viết | Ghi chú |
|---|---|---|
| `id`, `eyebrow`, `act`, `visual`, `narration` | người | `eyebrow: ""` là không có eyebrow |
| `atSentence`, `line1`, `line2`, `accent` | người | đây mới là thứ bạn thật sự thiết kế |
| `at` của beat có `atSentence` | người đặt áng chừng → **mọi lượt voiceover ghi đè** | đầu ra |
| `duration`, `at` của beat không neo | người đặt áng chừng → **`--retime` ghi đè** | đầu ra |
| `audio`, `sentenceStarts` | **chỉ script** | đừng sửa tay |
| `status` | `enrich.mjs` đặt `scaffolded`, merge đặt `enriched`, `approve.mjs` đặt `reviewed` | `build` từ chối khi chưa `reviewed` |
| `brief`, `facts` | `enrich.mjs` | đường dẫn tới brief và fact pack |
| `role` | `enrich.mjs` từ H2 của brief; merge giữ, worker không được đổi | vai của scene, một khoá của `arc.roles` (mục 6); verify và trang duyệt đọc nó. Đổi vai scene đã có giọng thì sửa `role`, KHÔNG sửa `id` — id là tên file giọng |
| `_brief`, `_words`, `_camera` | `enrich.mjs` | chỉ có trong bản scaffold: ý đồ, số chữ nhắm theo nhịp của vai (`arc.roles.<vai>.pace`), máy quay mặc định của vai cho scene ảnh (gợi ý, đạo diễn vẫn đặt `shots`); merge bỏ đi |
| `unsupported` | merge gom từ worker | mảng `{id, why}` ở CẤP REEL, không phải trong scene — người duyệt phải đọc hết |
| `headline` | người, hiếm | ghi đè baseline/cỡ chữ; chỉ `outro` dùng, vì nó còn disclaimer bên dưới |
| `ticker` | người, hoặc `enrich` khi brief có `ticker: daily` | cấp reel: `{symbol, timeframe, asOf, last, prev}` hoặc `false`; mặc định tính từ chuỗi giá (xem mục 3). `last`/`prev` ghi đè close; `verify` soi chúng với fact pack |
| `footer` | người | cấp reel: chuỗi thay dòng nguồn/miễn trừ, hoặc `false`; mặc định không nêu tên nguồn |

## 3. Bố cục — `src/theme.ts`

Khung và hộp panel nằm ở `layout` trong `src/shared/content-rules.json` — `verify` chấm theo
đó, nên đừng chép số ra đây. Mọi số đo gốc lấy từ video tham chiếu rồi quy về bề ngang 1080.

Baseline và gạch vàng thì chỉ có ở `src/theme.ts`:

```
ticker      baseline 326     gạch vàng   y 379, 54×4      headline 1  baseline 1419
eyebrow     baseline 446     panel       y 640..1200      headline 2  baseline 1545
footer      baseline 1628    (outro: disclaimer ở footnoteY thay footer)
```

Vùng an toàn dọc là `SAFE` trong `src/theme.ts` (288..1632): player vẽ UI của họ lên ~15% trên và
dưới, nên ticker và footer nằm sát mép trong của vùng đó, không nằm ngoài.

**Ticker và footer là khung của kênh tài chính, không phải của scene.** `SceneShell` vẽ chúng
trên mọi scene: ticker = `VN-INDEX · 1M · <close cuối> ▲/▼ <% đổi so tháng trước> · T9/2026`, tính
thẳng từ `content/vnindex-monthly.json`; footer = `Dữ liệu tới T9/2026 · Không phải khuyến nghị
đầu tư`. Ghi đè ở cấp reel: `ticker: {symbol, timeframe, asOf}` hoặc `ticker: false`;
`footer: "Nguồn: zionle.io.vn · ..."` hoặc `footer: false`. Chỉ ghi tên nguồn khi chuỗi giá THẬT
đến từ đó — chuỗi tháng hiện tại là bản dựng lại, nên footer mặc định không nêu nguồn. Scene
`outro` không có footer vì đã có disclaimer đầy đủ.

Màu chữ: vàng `#F3C019` · đỏ `#E5333A` · xanh lá `#2ECC71` · chữ phụ `#93A1AF`. Màu **mark**
(nến, histogram, mũi tên ticker) là cặp riêng `up #1FA377` / `down #EC5F38` — chọn bằng
validator của skill dataviz trên nền plot `#04060A` (ΔE mù màu 10,2; cặp xanh/đỏ thường chỉ 6,7).
Đừng dùng cặp đó cho chữ, và đừng dùng `red`/`green` của headline cho nến.

Chữ: **Be Vietnam Pro** (800 cho headline, 400-600 cho chữ thường) và **JetBrains Mono** cho
nhãn chart. Cả hai nạp kèm subset `vietnamese` — thiếu subset đó thì dấu chồng (Ổ, Ữ, Ặ) rơi
về font khác và lệch khỏi cap height.

Headline tự co để vừa cột 880. Chữ neo theo đường baseline chứ không theo hộp chữ, nên dòng bị
co vẫn nằm đúng đường quang học.

## 4. API zionle.io.vn

Base `https://zionle.io.vn/api`. Hợp đồng đọc từ bundle JS của site
(`assets/index-*.js`), không phải từ tài liệu.

| Endpoint | Cần `config_id` | Trả về |
|---|---|---|
| `GET /stocks/cache-info` | không | `{cached, cached_at, total_stocks}` — đã kiểm 2026-09-22: 1492 mã |
| `GET /analyze/{symbol}?config_id=` | có | `{symbol, processing_time_ms, timestamp, divergences[], trendlines[], signals[], price_history[]}` |
| `GET /config/{id}` | — | đọc một config |
| `POST /stocks/filter?config_id=` | có | danh sách mã đã lọc — **POST kèm body**, GET trả `404 page not found` |
| `POST /config` · `PUT /config/{id}` · `POST /stocks/recompute` | — | **ghi** — `scripts/fetch-market.mjs` không gọi |

`config_id` sinh ra ở phía trình duyệt và nằm trong localStorage key `trading-app_config-id`.
Hai lỗi khác nhau, đo trực tiếp 2026-09-22:

| Tình huống | Trả về |
|---|---|
| không gửi `config_id` | `400 {"error":"config_id is required"}` |
| gửi id sai hoặc đã hết hạn | `404 {"error":"configuration not found"}` |

Config mặc định mà frontend tạo cho khách mới:

```json
{"id": "<id>", "rsi_period": 14, "pivot_period": 5,
 "divergence": {"range_min": 30, "range_max": 70},
 "trendline": {"max_lines": 5, "proximity_percent": 3},
 "signal_days_threshold": 50, "telegram": {"enabled": false},
 "metrics_filter": [], "watchlist": []}
```

`signals[].type` là `<hướng>_<độ chắc>`. Giá trị thật quan sát được 2026-09-22:
`breakout_confirmed`, `breakdown_confirmed`, `breakdown_potential`. Frontend lọc hướng bằng
`includes("breakout")` / `includes("breakdown")`, độ chắc bằng `endsWith("_confirmed")` /
`endsWith("_potential")`. Giá trị lọc thứ tư ở giao diện là `watching`, tức là `_potential`.

### Hình dạng thật — đo 2026-09-22 với `config_id` của người dùng

```json
price_history[] : {"index":253,"date":"2026-09-22","open":1.7989,"high":1.81384,
                   "low":1.78762,"close":1.81069,"volume":354071111,"rsi":52.76}
divergences[]   : {"type":"bullish"|"bearish","is_early":false,
                   "divergence_points":[{"price":1.65279,"date":"2026-03-09"}, …]}
trendlines[]    : {"type":"uptrend_support"|"downtrend_resistance","data_points":[{date,price}, …]}
signals[]       : {"type":"breakdown_confirmed","price":1.65279,"time":"2026-03-09","price_line":2.0105}
```

**Ba điều phải biết trước khi dùng feed này:**

1. **Đây là feed NGÀY, khoảng một năm.** 254 dòng, `2025-09-15 .. 2026-09-22`. `start_date` và
   `end_date` bị BỎ QUA — gửi `start_date=2013-01-01` vẫn trả đúng 254 dòng. Gộp thành tháng chỉ
   ra 13 nến, trong khi panel `candles` và `macd` dựng cho ~13 năm. Dùng nó cho reel ngắn hạn
   (`--resample=none`), đừng dùng thay cho chuỗi tháng.
2. **Giá về đơn vị NGHÌN đồng.** Với cổ phiếu đó là cách yết bình thường (FPT 66,6 = 66.600đ).
   Với chỉ số thì là chia 1000 (VNINDEX 1,809 = 1809 điểm). `--scale=auto` nhân 1000 lại cho
   các mã chỉ số, `--scale=<số>` để tự ép. Volume KHÔNG bị chia.
3. **`rsi` đã tính sẵn từng dòng** — RSI ngày, không phải RSI tháng. `fetch-market.mjs` giữ lại
   giá trị CUỐI tháng khi gộp; trung bình RSI là vô nghĩa.

`signals_count` và `parameters` KHÔNG có trong response — frontend tự dựng hai trường đó ở
`getSignals()`. Đừng đọc chúng từ API.

**Trang đã tự tìm phân kỳ và trendline rồi.** `--signals` lưu cả ba mảng vào
`content/<mã>-analysis.json`. Dùng kết quả đó thay vì tự tính lại — video mà lệch với chính
trang nguồn là hỏng niềm tin.

### Lịch sử dài — SSI iBoard và DNSE Entrade

Terminal chỉ có ~1 năm ngày. Chuỗi tháng 13 năm lấy từ hai nguồn công khai, không cần auth, đo
2026-09-23 (3400 nến ngày từ 2013-01-02, giá y nhau tại mọi điểm ngoặt đã soát):

| `--source` | URL | Volume | Ghi chú |
|---|---|---|---|
| `ssi` (dùng cho chuỗi) | `iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D&symbol=VNINDEX&from=&to=` | khớp lệnh — trùng "KL khớp" của FireAnt | trả cả nến hôm nay đang chạy |
| `entrade` | `services.entrade.com.vn/chart-api/v2/ohlcs/index?symbol=VNINDEX&resolution=1D&from=&to=` | gồm thoả thuận — trùng "Tổng KL" của FireAnt | cổ phiếu dùng path `/stock` |

Không dùng được: VNDirect dchart (chỉ từ 2017-08, không có W/M), TCBS (Cloudflare), CafeF (tham số
khác). Mỗi lần ghi chuỗi có `<file>.meta.json` kèm (nguồn, ngày, số nến, đơn vị volume);
`src/lib/series.ts` đọc nó để footer ghi "Nguồn: SSI iBoard", `enrich` chép vào `facts.source`.

## 5. Neo kênh giá — cửa chặn cứng

`src/lib/series.ts` fit kênh qua các tháng ở `series.peakMonths` / `series.troughMonths` trong
`content-rules.json` — một chỗ duy nhất từ 2026-09-23, verify đọc cùng chỗ. `priceAt()` ném
`No candle for <tháng>` **ở module scope**, nên dải dữ liệu không phủ đủ là giết MỌI composition —
kể cả reel không có chart nào.

Với dữ liệu SSI thật: đỉnh `2018-04` (cao 1211), `2022-01` (1536), `2026-05` (1933,11 — đỉnh mọi
thời đại tới nay); đáy `2014-01` (503), `2020-03` (649), `2022-11` (874). Đổi nguồn dữ liệu thì soát
lại các tháng đó trước, rồi mới render.

## 7. Ảnh chụp trang web — `scripts/shoot.mjs`

Người dùng cho phép (2026-09-22) chụp ảnh **VN Trading Terminal** (zionle.io.vn) và **FireAnt**
(fireant.vn/charts) để đưa vào panel `image`, thay cho việc vẽ lại chart bằng Remotion khi trang
nguồn đã vẽ thứ cần nói (phân kỳ, trendline, tín hiệu, chart ngày của một mã, sổ lệnh…).

```bash
# terminal: mở /analyze với configId có sẵn (không tạo config mới), gõ mã vào ô tìm, cắt đúng khung chart
node scripts/shoot.mjs --site=zionle --page=analyze --symbol=HPG --viewport=1800x1000 --clip=canvases \
  --out=public/shots/hpg-analyze.png
# FireAnt: CHROME THẬT của người dùng (hồ sơ ghi ở `.shoot-profile`, đang đăng nhập) — mặc định cho site này
node scripts/shoot.mjs --site=fireant --symbol=VNINDEX --range=5y --out=public/shots/fireant-vnindex-5y.png
#   --range=5y|1y|6p|3p|1p|5n|1n bấm nút khung thời gian ở thanh dưới của chart (toạ độ đo ở 1080×640)
# FireAnt khung THÁNG 13 năm, nến mới nhất ở mép phải (đo 2026-09-23): range TRƯỚC interval, rồi kéo pane
node scripts/shoot.mjs --site=fireant --symbol=VNINDEX --range=5y --interval=M --pan=-330 --crop=chart --out=public/shots/vnindex-fireant-monthly.png
#   --range đặt lại cả độ phân giải (5y → 1W) nên script bấm range trước interval; đổi interval giữ SỐ NẾN
#   neo mép trái nên các năm gần nhất trôi khỏi mép phải → --pan=<pt> kéo pane (âm = kéo trái = xem ngày muộn hơn,
#   ~4,1pt/tháng sau 5y→M). --zoom-out lăn chuột thì neo vào con trỏ và vừa zoom vừa trôi — không tin được cho
#   khung dài; --reset-view (⌥R) chỉ đặt lại zoom, không kéo về nến cuối. Trục giá bị panel phải của FireAnt che,
#   nên mức giá đọc từ nến đã biết trong fact pack (xem mục 1, đoạn `line`).
# FireAnt không cần đăng nhập, không mở cửa sổ: headless
node scripts/shoot.mjs --site=fireant --symbol=VNINDEX --profile=none --viewport=1800x1000 --clip=canvases --out=…
# bất kỳ trang nào (DevTools): headless, hoặc --profile=<hồ sơ> trên BẢN SAO trạng thái đăng nhập (xem bảng)
node scripts/shoot.mjs --url=<url> [--profile=<hồ sơ>] [--wait-for=<css>] [--wait-text=<chữ>] [--click=x,y --type=<chữ>] \
  [--js=<file.js>] [--clip=<css>|canvases|x,y,w,h|full] [--scale=2] --out=public/shots/<tên>.png
# bất kỳ trang nào trong CHROME THẬT (đăng nhập thật): --real, tìm cửa sổ theo mảnh tiêu đề trang
node scripts/shoot.mjs --url=<url> --real --title-contains=<mảnh tiêu đề> [--symbol-box=x,y] --out=…
```

Mỗi ảnh đi kèm `public/shots/<tên>.json`: url, giờ chụp, viewport/vùng chụp, trình duyệt, hồ sơ.
`verify` FAIL khi `src` còn `TODO`, khi file thiếu, hoặc khi thiếu sidecar — ảnh không rõ nguồn
không được vào reel.

Ba cách mở trang:

| Chế độ | Khi nào | Ghi chú |
|---|---|---|
| `--real` (mặc định cho `fireant`): **Chrome thật** của người dùng, lái như video-factory | trang cần ĐÚNG đăng nhập của họ (FireAnt: layout, chỉ báo, watchlist đã lưu) | `scripts/shoot_real.py`, chạy bằng `../video-factory/.venv/bin/python`, dùng lại `steps/screen.py` của repo đó. Mở một **cửa sổ app** (`open -na "Google Chrome" --args --profile-directory=Default --app=<url>`) trong chính Chrome đang chạy: cùng cookie, không đụng tab của họ, đóng sau khi chụp. Chuột/phím bơm bằng CGEvent, ảnh bằng `screencapture`. Cần quyền Accessibility + Screen Recording. Đừng đụng chuột ~25s |
| mặc định (site khác): Chrome Headless Shell của Remotion, DevTools | trang công khai (terminal) | không cửa sổ, nhanh, `.chrome/_headless/` |
| `--profile=<hồ sơ>`: Chrome thật hiện cửa sổ trên **bản sao** trạng thái đăng nhập, DevTools | fallback cho site công khai muốn có localStorage của họ | bản sao ở `.chrome/<hồ sơ>/` (gitignore; Cookies, Local/Session Storage, IndexedDB, Preferences — không lịch sử/mật khẩu). Đo 2026-09-22: cookie giải mã được, `/api/auth/session` của FireAnt vẫn trả user, nhưng giao diện FireAnt vẫn hiện "Đăng nhập" — bản sao KHÔNG thay được đăng nhập thật (video-factory đo y vậy với Facebook). Vì thế mới có `--real` |

Những điều đã đo về đường `--real` (2026-09-22), đừng thử lại:

- Màn hình chính là 1080×1920 **dọc**, không retina: cửa sổ rộng tối đa 1080pt, ảnh 1:1 pixel.
  Cửa sổ app đặt 1080×640 → vùng trang 1080×607 (thanh tiêu đề đo được 33pt, script tự đo bằng
  dòng tối đầu tiên chứ không đoán).
- Tiêu đề cửa sổ app là `<trang> - <tên> (<hồ sơ>)`; cửa sổ thường là `<trang> - Google Chrome -
  <hồ sơ>`. Mảnh ` - Google Chrome - ` là thứ phân biệt cửa sổ của script với TAB của người dùng
  đang mở cùng site. Chỉ số cửa sổ của System Events đổi theo z-order mỗi khi có cửa sổ mới — luôn
  tra lại, chỉ đóng cửa sổ app đang AXMain và có `AXDocument` trùng URL.
- `Cmd+W` KHÔNG đóng cửa sổ app; đóng bằng nút AXCloseButton.
- Chart FireAnt là iframe TradingView: **cú click đầu vào iframe chỉ để lấy focus** (ô mã hiện
  tooltip, không mở hộp tìm); cú click thứ hai mới mở. Shift+F (fullscreen) và gõ chữ để tìm mã
  đều bị bản nhúng tắt. Ô mã ở (48,104) trong vùng trang khi rộng 1080; `--symbol-box=x,y` để đổi.
- CGEvent chuột phải đặt `kCGMouseEventClickState = 1` (bản `screen.click()` của video-factory
  chưa đặt) — không thì Chrome chỉ thấy hover.
- **Sự cố 2026-09-22, đừng lặp lại:** giữa lúc script chạy, người dùng mở tab Claude.ai trong chính
  cửa sổ Chrome của chính hồ sơ đó và nó lên trước. Chốt chặn cũ (Chrome ở trước + tiêu đề có tên hồ sơ)
  vẫn qua, nên script dán "VNINDEX" + Enter vào chat của họ và GỬI đi, còn `set size` rơi vào cửa sổ
  một hồ sơ khác vì chỉ số cửa sổ đã trượt. Chốt chặn giờ là `focused_ours()`: cửa sổ AXMain phải là
  cửa sổ APP (tiêu đề không có ` - Google Chrome - `) và `AXDocument` trùng URL, tra lại TRƯỚC MỌI
  click/phím/chụp; kích cỡ phải khớp sau `set size`; thanh tiêu đề đo được phải trong 20–60pt. Sai
  bất kỳ điều gì → `ABORTED before any input`, không gõ gì. Vẫn phải dặn người dùng: đừng đụng
  Chrome trong ~25s.
- Bộ gõ Telex đang bật: mã cổ phiếu được DÁN (Cmd+V), không gõ. Enter sau khi dán phải chờ danh
  sách kết quả nạp (~2,5s), không thì chọn nhầm dòng cũ.
- `--interval=D|W|2W|M` bấm đúng nút interval người dùng đã ghim trên thanh công cụ (x = 166/189/
  220/247, y = 104 trên vùng trang 1080 rộng); `--zoom-out=N` lăn chuột N nấc trên chart để kéo
  lịch sử ra (đo 2026-09-23: `--interval=M --zoom-out=6` thấy từ ~2001). Script bấm theo thứ tự
  mã → range → interval → ⌥R (`--reset-view`) → chỉ báo → pan → zoom (`shoot_real.py`), bất kể thứ
  tự cờ: nút range đặt lại cả độ phân giải nên interval bấm trước nó sẽ bị huỷ im lặng.
- `--indicator=MACD` mở hộp "fx Các chỉ báo" (x ≈ 356, y = 104), DÁN tên, rồi **Down + Return** — click vào
  dòng kết quả chỉ tô sáng, Return khi chưa chọn dòng không làm gì, Esc không đóng (đo 2026-09-23); đóng
  bằng nút X (x ≈ 676, y = 140). Chỉ báo thêm vào được LƯU vào layout của người dùng trên FireAnt — chỉ
  dùng khi họ bảo, và chạy lại lần hai là thêm bản thứ hai. Ảnh weekly MACD + volume đã dùng cho scene
  thanh khoản của reel `channel`.
- **Đừng "mở rộng" chart.** Nút ⤢ trên thanh tab của FireAnt không đổi bố cục; nút ⛶ của
  TradingView gọi Fullscreen API của trình duyệt → cửa sổ app phủ kín màn 1080×1920, mất nút đóng
  (đã xảy ra 2026-09-22, phải gỡ bằng `AXFullScreen = false`). `--crop=chart` (mặc định cho
  fireant) cắt đúng khung TradingView 687×514pt bên trái panel phải; vào panel 880×512 bằng
  `fit: contain` (viền hai bên) hoặc `cover` (cắt trên dưới).

Những điều đã đo, đừng thử lại:

- Terminal đọc `configId` từ URL (`/analyze?configId=<id>`) và **bỏ qua** tham số `symbol`; đổi mã
  phải gõ vào ô tìm (script làm sẵn cho `--site=zionle`). Từ 2026-09-23 (giao diện mới) trang KHÔNG
  mở VNINDEX: vài giây sau `load` nó tự nạp mã đầu watchlist (STB) vào ô tìm, ghi đè chữ đã gõ, và
  Enter sau 400ms chọn gợi ý cũ. Script đợi chart tự nạp (`Latest:`), chọn hết ô, dán, đợi 2,5s rồi
  Enter, và xác nhận bằng `Latest:` + tên mã trong chữ trang (chữ `bars · <mã>` cũ không còn).
- FireAnt cũng bỏ qua `?symbol=`; mở tab cuối cùng/mặc định (FPT). Chart nằm trong iframe
  TradingView nên `document.querySelector` không thấy canvas — `--clip=canvases` tự rơi về iframe
  lớn nhất, còn đổi mã dùng chuột + bàn phím thật (`Input.dispatchMouseEvent`/`insertText`), xuyên
  được iframe.
- Fork puppeteer của Remotion không biết `waitUntil: networkidle2`; script tự đợi `load` rồi
  `--wait`/`--wait-for`/`--wait-text`.
- Khung panel là 880×512 khi có caption (tỉ lệ 1,72). Chụp ở `--viewport=1800x1000` cho khung chart
  gần tỉ lệ đó; `fit: cover` cắt mép, `fit: contain` để viền.

**Ảnh là trích dẫn, không phải số liệu.** Con số trong ảnh là của trang nguồn; số trên headline và
trong lời đọc vẫn phải truy về fact pack như mọi scene khác. Luôn đặt `visual.source`
(`zionle.io.vn`, `fireant.vn`) để chip nguồn hiện lên.

## 6b. Prompt cho người viết — `prompts/scene-writer.md`

Prompt duy nhất cho khâu viết lời, tiếng Việt, một agent viết cả reel. Bốn phần: luật cứng (verify
FAIL; năm đọc `hai không hai hai`, KHÔNG `năm hai mươi hai`), **giọng người, chữ của nghề** (mở bằng
quan sát, tối đa hai số đọc ra lời mỗi scene, câu dài ngắn xen kẽ, "bạn/mình" một hai lần, thuật ngữ
giao dịch thay chữ đời thường theo bảng thay từ — người dùng bác "bậc thang", "tiền mỏng dần", "cái
biên này" 2026-09-23 — không ẩn dụ, headline là ý không phải bảng số, ngân sách chữ khác nhau giữa các
scene, kết scene mở đường), **outro** (thả tim · chia sẻ · theo dõi + một câu hứa cập nhật, không số, không
thuật ngữ, không câu vọng hook — người dùng chốt 2026-09-28), và bảng ba cột bản tin → ví von (bị bác) → trader nói, lấy từ reel `channel`. Muốn đổi giọng kênh thì sửa file đó, không sửa lẻ trong prompt của agent. Ngưỡng máy đo
được nằm ở `content-rules.style`; verify chỉ WARN.

## 6. Brief — agent viết từ một hai dòng của người dùng

`brief/<tên>.md`. Vài dòng `key: value` ở đầu, rồi mỗi scene một H2. Bình thường agent viết nó ở
SKILL.md mục 1a sau khi đọc fact pack (`node scripts/enrich.mjs --facts-only --name=<tên>`); người
dùng chỉ viết tay khi muốn kiểm soát từng scene. Ví dụ đã chạy: `brief/channel.md`.

```md
name: liquidity                      # BẮT BUỘC — quyết định mọi tên file
title: VNINDEX · thanh khoản cạn dần # tuỳ chọn, mặc định = name
symbol: VNINDEX                      # tuỳ chọn; có content/<symbol>-analysis.json thì fact pack thêm `terminal.*`,
                                     # có content/<symbol>-daily.json thì thêm `daily.*` (nến ngày thật)
ticker: daily                        # tuỳ chọn; ticker in phiên thật cuối cùng từ `daily` thay vì close tháng dựng lại
footer: Nguồn: zionle.io.vn · …      # tuỳ chọn; chỉ khi số thật đến từ nguồn đó
brand: Kênh của bạn                  # tuỳ chọn, rót vào scene outro
act: blue                            # tuỳ chọn, ép act cho mọi scene trừ cuối
disclaimer: ...                      # tuỳ chọn, mặc định là câu miễn trừ sẵn có

## <vai> · <panel>
src: public/shots/<tên>.png          # panel image: ảnh đã chụp bằng scripts/shoot.mjs (có sidecar .json)
source: fireant.vn                   # chip nguồn trên ảnh; caption:/fit:/focus: cũng nhận ở đây
act: blue                            # tuỳ chọn: act riêng của scene này, thắng act đầu brief và act của vai
Một hai dòng ý đồ. Viết như đạo diễn dặn, không phải như kịch bản.
```

Dòng `key: value` trong scene là TRƯỜNG của panel, không phải ý đồ; enrich điền thẳng vào
`visual` — trừ `act:`, thuộc về scene. Ý đồ là những dòng còn lại.

`name` sinh ra `content/<name>.json`, `content/<name>.facts.json`, id scene `<name>-<vai>` và
từ đó file giọng `public/voiceover/NN-<scene id>.wav`. Composition id thì bạn tự đặt khi đăng ký ở
`src/Root.tsx` — quy ước là viết hoa chữ đầu (`liquidity` → `Liquidity`), chữ viết tắt thì viết
hoa cả (`RSI`, `MACD`).

### Vai — định nghĩa ở `arc.roles`

Mỗi vai là một khoá của `arc.roles` trong `src/shared/content-rules.json`, xếp theo thứ tự kể. Đó là
định nghĩa DUY NHẤT (người dùng chốt 2026-09-29, sau khi act nằm trong `enrich.mjs`, nhịp ở `style.pace`,
việc của vai ở bảng tại đây, và ba script tự đoán vai từ id — bảng cũ ở mục này còn gợi ý những panel đã
tắt hay bị cấm). Mỗi vai mang:

- `job` — scene đó làm gì trong mạch; người viết đọc chính dòng này;
- `act` — màu nền mặc định; scene đặt `act:` riêng trong brief khi màu mặc định sai nghĩa (một
  `scenario` tăng giá không mang màu cảnh báo);
- `pace` — `short`/`mid`/`long`: `_words` enrich nhắm, và check `style` giữ vai `short` không dài hơn
  trung vị chữ của reel, vai `long` không ngắn hơn;
- `shots` — máy quay mặc định, một `move` mỗi beat, lấy từ bản `channel` đã duyệt; enrich ghi thành
  `_camera` làm gợi ý, đạo diễn vẫn đặt từng `shots` sau khi nhìn ảnh;
- `mustSay` (`scenario`) — lời đọc phải có một chữ trong đó; `minRun` (`chapter`) — đi thành chuỗi liền nhau.

In bảng hiện hành thay vì chép ra đây:

```bash
node -e 'const r=require("./src/shared/content-rules.json").arc.roles;for(const[k,v]of Object.entries(r))console.log(k.padEnd(13),v.act.padEnd(7),v.pace.padEnd(6),(v.shots??[]).join(" → ").padEnd(20),v.job)'
```

Reel phân tích chart dùng ba vai riêng: các lần lịch sử là `chapter` (cùng khuôn, ít nhất hai chương liền
nhau — một chương đứng lẻ là `evidence`), kịch bản "nếu … thì" là `scenario`, các mức phải canh phía trên và
phía dưới là `levels`. Vai chỉ định mạch kể; nó **không** khoá panel — nhưng scene có số trên màn hình là
ảnh chart có mark (mục 1).

Luật mạch có script gác (mức FAIL/WARN của từng luật ở `arc.severity`):

| Check | Soi gì |
|---|---|
| `roles` | scene đầu là `arc.firstRole`, scene cuối là `arc.lastRole`, scene nào cũng có vai; chuỗi `minRun`; lời `scenario` có chữ của `mustSay` |
| `arc` | số scene trong `arc.minScenes`–`arc.maxScenes`, act không đi ngược, scene cuối là panel `outro`, tổng thời lượng trong `arc.totalSecondsWarn` |
| `camera` | hai khung máy liền nhau không cùng `move` (trong scene, và qua ranh giới scene khi vẫn cùng ảnh); `static` chỉ ở khung cuối của scene — payoff |

Scene mang trường `role` (enrich ghi, merge giữ). Scene scaffold trước 2026-09-29 không có trường đó thì
script đọc vai từ id (`<tên>-<vai>[-n]`). Đổi vai một scene đã có giọng: sửa `role`, KHÔNG sửa `id`.

### Sai thì báo ngay

```
Scene 2: role "villain" is not one of hook|concept|...|outro
Scene 1: panel "donut" is not one of candles|macd|...|outro
Scene 8: act "red" is not one of blue|maroon|amber|navy
No scenes found. Each scene is an H2: "## <role> · <panel>".
```

Cả bốn đều thoát mã `2` trước khi ghi file nào — kể cả fact pack.

## 8. Trang duyệt — `scripts/review-page.mjs`

Điểm dừng của skill (SKILL.md mục 2c) là một trang HTML đăng làm artifact, không phải bảng Markdown —
người dùng chốt 2026-09-23 sau khi duyệt reel `channel` qua trang có khung hình từng scene.

```bash
npm run review-page -- Channel                       # out/review/channel/index.html + stills/*.jpg + files.json
npm run review-page -- Channel --no-stills           # dùng lại khung hình cũ (chỉ đổi lời)
npm run review-page -- Channel --before=<content.json>   # cột lời đọc trước → sau (scene khác id: bảng cấu trúc trước → sau)
npm run review-page -- Channel --notes=<f.json>      # mặc định out/review/channel/notes.json
npm run review-page -- Channel --out=<thư mục>
```

Script: (1) `verify.mjs <Id> --json` — tile verify, tile `facts`, tile `style`, bảng mọi check với dòng
sửa; (2) `npx remotion still <Id>` cho TỪNG beat: beat cuối ở `start + min(n − 15, (beat cuối + 1,5s) × fps)`
(`<scene>.jpg`), các beat trước ở 8 khung hình trước beat kế (`<scene>-b<N>.jpg` — mark của beat đã vẽ
xong, máy đã tới khung của beat), `--scale=0.5 --image-format=jpeg --jpeg-quality=82` — vài giây một ảnh,
reel 12 scene 23 ảnh ~40 giây; tile "Nhịp đổi khung" = tổng thời lượng / số khung (shot trên ảnh, beat ở
panel khác), xanh khi ≤ 5 giây theo vox-director; (3) dựng trang từ `content/<tên>.json`, `content/<tên>.facts.json`, `brief/<tên>.md` (ý đồ
từng H2), `content/vnindex-monthly.meta.json` (nguồn chuỗi; ghi **CHUỖI DỰNG LẠI** nếu
`reconstructed`), và `notes.json` của đạo diễn.

`notes.json` (mọi khoá tuỳ chọn):

```json
{"_summary": "một đoạn cho đầu trang — vòng này sửa gì, đọc gì",
 "_conclusion": [{"tag": "Năm", "level": "pass|warn|fail", "text": "…"}],
 "<sceneId>": {"level": "pass|warn|fail", "title": "…", "notes": ["…"]}}
```

Đăng: tool Artifact với `file_path=out/review/<tên>/index.html`, `root=out/review/<tên>`, `files` =
nội dung `files.json` (script in sẵn), `icon` một chữ chung. Ảnh không nhúng base64 (9 ảnh ≈ 400KB, trang
≈ 40KB) mà đi kèm qua `files`; trên bản cập nhật file không đưa lại vẫn được giữ. Vòng duyệt sau đăng lại
cùng `file_path` (hoặc kèm `url`) để giữ một link. `out/` là thư mục build, không phải content.

Trang KHÔNG chấm điểm — verify làm việc đó; trang chỉ bày reel ra để người duyệt không phải mở JSON, và
nói to `unsupported`. Khung hình lấy ở beat cuối vì đó là lúc mọi mark đã vẽ; muốn xem chuyển động thì
mở `npm run studio`.
