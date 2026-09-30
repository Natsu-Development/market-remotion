# Tra cứu — market-review

Tài liệu phụ của [SKILL.md](SKILL.md). Mọi ngưỡng nằm ở [rules.json](rules.json); đừng chép số của nó ra đây.

## 1. File — ai ghi, ai đọc

| File | Ghi bởi | Là gì |
|---|---|---|
| `content/review/vnindex.daily.json` (+ `.meta.json`) | `pull.mjs` | nến ngày VNINDEX từ SSI, 2013 → phiên cuối đã đóng, `{t,o,h,l,c,v}` mỗi dòng một nến |
| `content/review/filters.json` | `pull.mjs` | bộ lọc đã lưu của người dùng — CHỈ tên + điều kiện (không token) |
| `content/review/snapshots/<ngày>.json` | `pull.mjs` | kết quả bộ lọc của phiên: số mã từng bộ lọc, danh sách, picks, breadth, dòng của mã liên quan |
| `content/review/analyze/<ngày>/<MÃ>.json` | `pull.mjs` | `/analyze` của mã dẫn đầu: nến 1 năm (giá nghìn đồng), signals, trendlines |
| `content/review-<format>.facts.json` | `facts.mjs` | fact pack của bản — mọi số được lên màn hình |
| `public/shots/review/<ngày>/*.png` (+ `.json`, `.bars.json`, `.calib.json`) | `shots.mjs` | ảnh, sidecar (nguồn, giờ, request guard, toạ độ bảng), nến dùng hiệu chỉnh, hiệu chỉnh |
| `content/review-<format>.json` | `scaffold.mjs` → người viết → `merge.mjs` → `voiceover.mjs` | reel; đăng ký ở `src/Root.tsx` |
| `brief/review-<format>.md` | `scaffold.mjs` | ý đồ từng scene, trang duyệt đọc nó |
| `content/review/archive/<ngày>-<format>.json` | `scaffold.mjs` | bản trước, chép trước khi bị thay |
| `content/review/breadth.json` | `breadth.mjs` | độ rộng theo phiên: `{t, above, with, percent}` — mã trên SMA200 / mã có SMA200, tính lại từ `/analyze` |
| `.review-cache/` (gitignore) | `pull.mjs`, `shots.mjs`, người viết | toàn bộ 1466 mã của phiên, file tạm của người viết |

`content/review-*.json` nằm phẳng trong `content/` vì `scripts/lib/reels.mjs` chỉ nhận import
`'../content/<tên>.json'` không có thư mục con.

## 2. Fact pack

| Khoá | Nội dung |
|---|---|
| `session` | `date`, `close`, `prevClose`, `changePercent`, `volumeM`, `volumeRatio` (so phiên trước), `volumeVsAvg20`, `isDistribution`, `isFtd` |
| `distribution` | `count`, `window`, `active[]` (`dm`, `changePercent`, `volumeRatio`, `sessionsLeft`, `expireLevel`), `nextExpiry`, `toUnderPressure`, `toCorrection` |
| `state` | `status` + `label`/`short` (rules.status), `since`, `rallyDay`, `rallyLow`, `correctionLow`, `ftd`/`lastFtd` (`dm`, `day`, `changePercent`, `volumeRatio`, `close`, `rallyLow`, `ended`) |
| `watch[]` | `{if, then}` — điều gì sẽ đổi trạng thái; chất liệu duy nhất cho câu nếu … thì |
| `screener` | `cachedAt`, `universe`, `volumeVsSmaUnit`, `breadth`, `spike` (`count`, `up`, `down`, `top[]`), `leaders` (`uptrendCount`, `rsStrongCount`, `count`, `top[]` kèm `ema50`, `aboveEma50Percent`, `high52w`, `fromHigh52wPercent`, `signal`), `alsoSpiking` |
| `weekly` | chỉ bản tuần: nến tuần, `changePercent`, `volumeVsPriorWeek`, phiên phân phối trong tuần, chuyển trạng thái, `newLeaders`/`droppedLeaders` so snapshot tuần trước |
| `backtest` | FTD theo ngưỡng `followThrough.backtestThresholds` trên toàn lịch sử |
| `anchors[]` | các dòng `{label, value, path}` cho bảng số của trang duyệt |

## 3. Quy tắc phiên phân phối / FTD

Nguồn: William O'Neil (IBD), dùng trong market timing của Mark Minervini. Máy trạng thái:
`scripts/review/lib/market-state.mjs`; test: `scripts/review/lib/market-state.test.mjs`.

- **Phiên phân phối**: đóng cửa ≤ `distribution.maxChangePercent` so phiên trước VÀ khối lượng cao hơn phiên
  trước. Tính trong `windowSessions` phiên (kể cả chính nó); hết hạn sớm khi giá cao nhất của một phiên sau
  chạm đóng cửa của nó × (1 + `expireRallyPercent`%).
- **Trạng thái trong xu hướng tăng**: `underPressureAt` phiên còn hiệu lực = chịu áp lực, `correctionAt` =
  điều chỉnh. Thủng đáy nhịp hồi của FTD = FTD thất bại, về điều chỉnh.
- **Nỗ lực hồi phục**: trong điều chỉnh, ngày 1 là phiên đầu tiên đóng cửa tăng — hoặc phiên lập đáy mới mà
  đóng cửa ở nửa trên biên độ (`day1UpperHalfClose`). Giá thấp nhất trong phiên thủng đáy nhịp hồi → làm lại.
- **FTD**: từ ngày `minDay`, tăng ≥ `minChangePercent` với khối lượng cao hơn phiên trước → xu hướng tăng xác
  nhận; `resetOnFtd` xoá số phiên phân phối.
- Máy bắt đầu ở "điều chỉnh" tại nến đầu tiên và ổn định sau FTD đầu tiên — luôn chạy trên nhiều năm.
- Làm tròn: so ngưỡng trên phần trăm chưa làm tròn (như lúc đo 2026-09-29).

Chốt bằng test (dữ liệu SSI, DD −0,5%, FTD +1,25%, 29/9/2026): 3 phiên phân phối còn hiệu lực — 11/9
(−1,86%, KL ×1,64, còn 12 phiên), 23/9 (−0,84%, ×1,23, còn 20), 24/9 (−1,47%, ×1,07, còn 21); xu hướng tăng
xác nhận từ FTD 3/8/2026 (ngày 5, +1,56%, KL ×1,07), đáy nhịp hồi 1651,20. Ở −0,2% của IBD thì thêm 14/9,
18/9, 28/9 → 6 phiên, điều chỉnh từ 28/9.

Backtest 2013 → 29/9/2026 (3404 phiên, cửa sổ 25 phiên, không stop, cửa sổ chồng nhau):

| FTD ≥ | FTD | chấm được | cao hơn sau 25 phiên | trung vị |
|---|---|---|---|---|
| +1,25% (rules.json) | 31 | 31 | 65% | +2,6% |
| +1,5% | 28 | 28 | 75% | +3,7% |
| +1,7% | 26 | 25 | 72% | +3,7% |

16/31 FTD tới sau ngày 7 — nhịp hồi ở VN thường dài.

## 4. Terminal zionle.io.vn

| Gọi | Ghi chú |
|---|---|
| `GET /api/stocks/cache-info` | không cần id; `cached_at` là cửa chặn độ tươi |
| `GET /api/config/{id}` | chỉ đọc `metrics_filter`; object còn `telegram.bot_token` — không log, không ghi |
| `POST /api/stocks/filter?config_id=` | NGOẠI LỆ DUY NHẤT (người dùng cho phép 2026-09-29). Body `{match, negate?, conditions, groups?, exchanges?}`; `{match:"and"}` trả mọi mã. Trả `{stocks:[…]}` |
| `GET /api/analyze/{mã}?interval=1D&config_id=` | nến ~1 năm, signals, trendlines. `1W`/`1M`/`4H` trả 500 |

Dòng Screener: `symbol, name, exchange, rs_1m, rs_3m, rs_6m, rs_9m, rs_52w, current_volume, volume_sma20,
current_price` (nghìn đồng)`, price_change_pct, ema_9, ema_21, ema_50, sma_200, has_*`. Đường trung bình
bằng 0 nghĩa là chưa tính được (mã mới niêm yết) — `dropZeroMa` loại chúng.

Bộ lọc đã lưu (29/9/2026): Volume spike (`volume_vs_sma > 1.2`, `volume_sma20 ≥ 1.5M`), RS Strong
(`rs_1m ≥ 60`, `volume_sma20 ≥ 1M`), Uptrend (`price > ema_50`, `ema_50 > sma_200`, `volume_sma20 ≥ 1.2M`),
cùng Uptrend Minervini, Momentum breakout/breakdown, Bullish/Bearish RSI (chưa dùng). `volume_vs_sma` là %
trên trung bình 20 phiên — đối chiếu tại chỗ khớp 100% với cách hiểu %, 44% với cách hiểu bội số.

## 5. Ảnh

| Ảnh | Lệnh (shots.mjs tự gọi) | Ghi chú |
|---|---|---|
| FireAnt VNINDEX ngày | `shoot.mjs --site=fireant --symbol=VNINDEX --size=1080x900 --interval=D --reset-view --crop=full` | Chrome thật, tab 1D của người dùng (giá + khối lượng + MACD); ~6,5 tháng; crop/mask giống ảnh 1080×900 của Channel; pane hiệu chỉnh `paneFrac` [0,058, 0,21, 0,896, 0,66] — tiêu đề OHLC và histogram MACD cùng màu nến nên phải chặn pane |
| terminal VNINDEX (dự phòng) | `shoot.mjs --site=zionle --page=analyze --symbol=VNINDEX --viewport=1800x1000 --clip=canvases` | hiệu chỉnh trên giá ÷ 1000 (terminal yết chỉ số theo nghìn) |
| Screener | `shoot.mjs --site=zionle --page=screener --allow-post=/api/stocks/filter --viewport=1200x1000 --scale=2 --js=scripts/review/js/screener.js --js-args=<json>` | `{filter, sort, keep, rows, zoom}`; sidecar `js` = trang (px CSS), dòng, ô, nút; ảnh = cả trang đã phóng |
| chart mã | `shoot.mjs --site=zionle --page=analyze --symbol=<MÃ> --viewport=1800x1000 --clip=canvases` | 2712×1520; pane giá `paneFrac` [0,015, 0, 0,955, 0,54]; crop bỏ trục giá |

Hiệu chỉnh: `calib_auto.py` tìm cột nến theo màu trong pane, ước d (px/nến), last_x, N = khoảng cách/d + 1,
rồi chạy `scripts/calib_chart.py`. Chart terminal có mũi tên tín hiệu, trendline chấm và thẻ giá cùng màu
nến nên số dư trung vị 4–9 px là do chúng; đo 29/9: đường giá cuối của BSR lệch 4 px (≈2 px trên khung
hình), bốn vline phiên phân phối/FTD trùng đúng nến. Soát bằng khung hình của trang duyệt.

## 6. Mark scaffold đặt

| Scene | Beat 1 | Beat 2 | Beat 3 |
|---|---|---|---|
| hook | mũi tên ĐỎ chỉ XUỐNG đỉnh từng phiên phân phối + nhãn "N phiên phân phối"; máy cận nhịp cuối | mũi tên XANH LÁ chỉ LÊN đáy nến FTD + nhãn, vòng vàng ở nến hôm nay; máy lùi ra | — |
| market | mũi tên đỏ, nhãn "N/25 phiên phân phối" (tắt ở beat 3), nhãn phiên nặng nhất | mũi tên xanh lá FTD + nhãn, hline vàng đáy nhịp hồi | nhãn "d/m hết hạn sau N phiên" ở phiên cũ nhất, nhãn "4 phiên → chịu áp lực · 6 phiên → điều chỉnh"; máy cận |
| breadth | `lines`: pane trên = VN-INDEX đóng cửa (vẽ ở beat 1), pane dưới = % mã trên SMA200 (vẽ ở beat 2), mốc FTD; lịch sử từ `scripts/review/breadth.mjs` (GET /analyze từng mã có SMA200, cache `.review-cache/analyze-all/<ngày>/`, ~1 phút cho ~900 mã). Không có lịch sử thì rơi về `pictogram` chấm | (đường dưới) | — |
| spike / leaders | hộp quanh ba dòng; nhãn tóm tắt đè lên nút Columns/Export | hộp từng ô VOL/SMA / RS 1M, máy cận | — |
| leader #3/#2/#1 | nhãn "MÃ · RS 1M … · ±x%", hline EMA50, và MỘT chi tiết riêng: hline đỉnh 52 tuần "Đỉnh 52T … · −x%" (mã còn xa / sát đỉnh) hoặc hộp trên cột khối lượng hôm nay "KL ×…" (mã cũng ở Volume spike) | mũi tên vào nến cuối "±x% trên EMA50", máy cận | — |
| watch | hline vàng "Thủng <đáy nhịp hồi> → FTD thất bại", hline xanh "Chạm <mức hết hạn thấp nhất> → phiên d/m hết hạn"; máy tilt từ đáy lên | vòng vàng nến hôm nay, nhãn "Thêm N phiên phân phối → <trạng thái kế>", "d/m hết hạn sau N phiên"; máy ĐỨNG YÊN (payoff) | — |

Người dùng chốt 2026-09-29: phiên phân phối và FTD là MŨI TÊN chỉ đúng vào nến — FTD XANH LÁ chỉ lên, phiên phân phối
ĐỎ chỉ xuống. Mũi tên là mark nên dùng cặp màu hướng của repo, accent `up` (#1FA377) / `down` (#EC5F38, ΔE mù màu 10,2;
với đỏ chữ #E5333A cũng đạt 8,1 — đo bằng validator trên nền FireAnt); nhãn đi kèm dùng màu CHỮ `green` / `red`. verify
chỉ nhận `up`/`down` trên mark ảnh, không trên headline. Kiểu `style: "block"`: thân đặc, đầu rộng, viền trắng, quầng tối;
NGẮN (~22 px, `ARROW` 0,025) và THẲNG đứng, đầu mũi tên cách đỉnh/đáy nến ~4 px (`GAP`). Hai phiên phân phối sát nhau vẫn
tách được vì mỗi đầu nằm ở đỉnh nến của chính nó (khác độ cao). Trục thời gian của hiệu chỉnh được khớp
lại trên chính các cột nến (`calib_auto.py`, `xFit`) — chỉ dùng `calib_chart.py` thì đầu mũi tên lệch ~0,4 nến.
| spike | hộp quanh ba dòng; nhãn "Top 3: KL ×…" đè lên nút Columns/Export | hộp từng ô VOL/SMA, máy cận |
| leaders | hộp quanh ba dòng; nhãn "N mã qua RS Strong + Uptrend" | hộp từng ô RS 1M, máy cận |
| leader | nhãn "MÃ · RS 1M … · ±x%", hline EMA50 | mũi tên vào nến cuối "±x% trên EMA50", máy cận |

Nhãn chỉ mang số của fact pack; check `facts` của verify soi từng số.
