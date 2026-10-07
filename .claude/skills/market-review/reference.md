# Tra cứu — market-review

Tài liệu phụ của [SKILL.md](SKILL.md) (bản phiên) và của skill [weekly-review](../weekly-review/SKILL.md) (bản tuần,
tách 2026-10-05; cùng file này, cùng `rules.json`). Mọi ngưỡng nằm ở [rules.json](rules.json); đừng chép số của nó ra đây.

## 1. File — ai ghi, ai đọc

| File | Ghi bởi | Là gì |
|---|---|---|
| `content/review/vnindex.daily.json` (+ `.meta.json`) | `pull.mjs` | nến ngày VNINDEX từ SSI, 2013 → phiên cuối đã đóng, `{t,o,h,l,c,v}` mỗi dòng một nến |
| `content/review/filters.json` | `pull.mjs` | bộ lọc đã lưu của người dùng — CHỈ tên + điều kiện (không token) |
| `content/review/snapshots/<ngày>.json` | `pull.mjs` | kết quả bộ lọc của phiên: số mã từng bộ lọc, danh sách, picks, breadth, dòng của mã liên quan |
| `content/review/analyze/<ngày>/<MÃ>.json` | `pull.mjs` | `/analyze` của mã dẫn đầu: nến 1 năm (giá nghìn đồng), signals, trendlines |
| `content/review-<format>.facts.json` | `facts.mjs` | fact pack của bản — mọi số được lên màn hình |
| `content/review/requests/<ngày>.json` | đạo diễn, từ db của artifact trang duyệt (doc `requests/<ngày>`, ArtifactData get) | mã người dùng chọn soi thêm (người dùng 2026-10-05): `{edition, symbols, source, readAt}`; `lib/requested.mjs` đọc, tối đa `screener.requested.max` |
| `content/review/symbols/<ngày>/<MÃ>.json` (+ `.md`) | agent `symbol-reviewer` (`.claude/agents/symbol-reviewer.md`) | bản soi từng mã dẫn dắt: số kèm nguồn, bảng kiểm, PRICE ACTION (`symbol-reviewer/2`, 2026-10-03: cấu trúc đỉnh/đáy fractal 3 phiên, kháng cự/hỗ trợ từ các đỉnh/đáy gộp trong 1,5%, trendline qua hai đáy/đỉnh dao động không bị đóng cửa xuyên quá 1%, giải phẫu nến cuối), thế giá, MỘT chi tiết, mark theo giá/ngày (2 beat; `level` có `role`, `trendline`, `candle` — mọi nhãn mang giá), nhánh nếu … thì, và từ `symbol-reviewer/3` (2026-10-07) HAI VAI `roles.holder` / `roles.notHolder` (case, giá, if/then, plate, say, headline — `rolesOf` tính, agent chép nguyên); `scripts/review/lib/symbol-review.mjs` đo (`measure`), soát (`validateReview`) và lọc số được trích (`citedNumbers`) — facts.mjs chỉ mang bản soi hợp lệ, với đúng những số nó trích, vào `screener.leaders.top[i].review` |
| `public/shots/review/<ngày>/*.png` (+ `.json`, `.bars.json`, `.calib.json`) | `shots.mjs` | ảnh, sidecar (nguồn, giờ, request guard, toạ độ bảng), nến dùng hiệu chỉnh, hiệu chỉnh |
| `content/review-<format>.json` | `scaffold.mjs` → người viết → `merge.mjs` → `voiceover.mjs` | reel; đăng ký ở `src/Root.tsx` |
| `brief/review-<format>.md` | `scaffold.mjs` | ý đồ từng scene, trang duyệt đọc nó |
| `content/review/archive/<ngày>-<format>.json` | `scaffold.mjs` | bản trước, chép trước khi bị thay |
| `public/shots/review/<ngày>/fireant-flow.png` (+ `.json`) | `shots.mjs --only=flow` (`js/fireant-flow.js`) | scene `flow` "Biến động thị trường" của bản PHIÊN, scene 02 ngay sau hook (người dùng 2026-10-05: 'Daily; old chart → weekly', rồi 'move it into the scene 02'): ảnh headless trang công khai FireAnt "Thống kê sàn", mục "Biến động theo sàn" sàn HSX — tròn số mã tăng/giảm/không đổi, cột phân bổ dòng tiền (tỷ). Sidecar `js`: số đọc từ chính option ECharts của hai chart (prop React của khung chart; canvas không có chữ), thẻ sàn (chỉ số, số mã, tổng giá trị), hộp từng chart/cột theo phần ảnh. Từ 2026-10-05 tối ảnh là HAI THẺ chồng nhau (1664×2344, mỗi thẻ 1,42): thẻ dòng tiền trên, thẻ "Top cổ phiếu tác động" dưới; `js.card.money`/`js.card.impact` là nửa trên/dưới, `js.impact` {`up`,`down`,`bars` (mã, điểm, hộp)} đọc từ state React của chart (betarest `/symbols/contribute-to-index`) |
| `content/review/breadth.json` | `breadth.mjs` | scene `breadth` của bản TUẦN: độ rộng theo phiên `{t, above, with, percent}` — mã trên SMA200 / mã có SMA200, tính lại từ `GET /analyze` (~900 mã, ~1 phút, cache theo phiên ở `.review-cache/analyze-all/<ngày>/`) |
| `.review-cache/` (gitignore) | `pull.mjs`, `shots.mjs`, người viết | toàn bộ 1466 mã của phiên, file tạm của người viết |

`content/review-*.json` nằm phẳng trong `content/` vì `scripts/lib/reels.mjs` chỉ nhận import
`'../content/<tên>.json'` không có thư mục con.

## 2. Fact pack

| Khoá | Nội dung |
|---|---|
| `session` | `date`, `close`, `prevClose`, `changePercent`, `volumeM`, `volumeRatio` (so phiên trước), `volumeVsAvg20`, `isDistribution`, `isFtd`; `window` (vùng giá của cửa sổ reel nhìn: `high`/`low`/`changePercent`); `breadthToday` (mã tăng/giảm/đứng giá của phiên trên HSX — FireAnt khi khớp phiên, không thì Screener; `indexWord`/`breadthWord` là hai chữ hook được dùng, do ngưỡng quyết định: |Δ| < 0,3% = "đi ngang", một phía ≥ 60% = "phần lớn", lệch ≥ 15% = "nhiều hơn") |
| `distribution` | `count`, `window`, `active[]` (`dm`, `changePercent`, `volumeRatio`, `sessionsLeft`, `expireLevel`), `nextExpiry`, `toUnderPressure`, `toCorrection`, `dangerAt`, `toDanger`, `danger` (mức nguy hiểm của hệ thống người dùng, 2026-10-01) |
| `state` | `status` + `label`/`short` (rules.status), `since`, `rallyDay`, `rallyLow`, `correctionLow`, `ftd`/`lastFtd` (`dm`, `day`, `changePercent`, `volumeRatio`, `close`, `rallyLow`, `ended`) |
| `scenario` | `close`; `up[]` / `down[]` — tối đa hai VÙNG mỗi phía, gần trước (mỗi vùng `{low, high, at, members[]}`, members = MA50/MA200 FireAnt hoặc mốc price action `{kind, name, price, dm, touches}`; mốc trong 0,5% gộp một vùng; `at` = đường giá chạm trước), `rallyLow`, `window` (142 phiên), `ma` — chất liệu của scene "Kịch bản VN-Index" (2026-10-05) |
| `watch[]` | `{if, then}` — ngưỡng còn phía trước, gần nhất trước (không còn nhánh "thêm 0 phiên"), nhánh mức nguy hiểm mang `danger: true`, rồi đáy nhịp hồi và đồng hồ hết hạn; chất liệu duy nhất cho câu nếu … thì |
| `screener` | `requested[]` (mã người dùng chọn: dòng như leaders.top + `filters`, `fireant`, `review`, `requested: true`; chỉ khi có file requests), `cachedAt`, `universe`, `volumeVsSmaUnit`, `spike` (`count`, `up`, `down`, `sortedBy`, `order`, `volumeUnit`, `top[]`, `gainers[]`, `losers[]` — mỗi dòng mọi bảng có `volumeVsSma20Percent` = (KL − SMA20)/SMA20 × 100, số nguyên), `rs` và `uptrend` (mỗi bộ lọc một scene từ 2026-09-30: `filter`, `count`, `ranked`, `up`, `down`, `top[]` — mỗi dòng kèm `filters[]` = các bộ lọc đã lưu mà mã đó qua), `leaders` (tối đa 4 mã từ 2026-10-06 — `rules.screener.leaders.top`, trước là 2; 2026-10-01: `from[]` = các TẦNG scene theo `rules.screener.leaders` — cả ba bộ lọc trước, rồi RS Strong ∩ Uptrend; format khai `rules.formats.<fmt>.leaders.from` (tiền tố của các tầng đó, kèm `since`) thì `from`/`tiers`/`count`/`top` chỉ còn tầng của nó — bản phiên từ 2026-10-06 chỉ tầng cả ba bộ lọc, `top[]` có thể rỗng; `tiers[]` {`scenes`, `filters`, `names`}; `filters[]` của tầng cuối; `count` = số mã qua cả hai; mỗi mã trong `top[]` có `tier` và `tierFilters`, `top[]` (xếp theo RS 1M, `top[0]` = #1, chiếu sau cùng) kèm `ema50`, `aboveEma50Percent`, `high52w`, `fromHigh52wPercent`, `signal`; `alsoSpiking[]` = mọi mã qua cả hai bộ lọc dẫn dắt mà cũng ở bộ lọc Volume spike — chất liệu của móc 2 cũ; từ 2026-10-05 không scene nào dùng nó cho lời, người dùng: "Not need mentioned the stock on specific filter existed on other filter"); `breakout` / `breakdown` chỉ ở bản tuần (2026-10-06, `rules.formats.weekly.screener.scenes` — hai bộ lọc Momentum của terminal, thay ba bộ lọc của bản phiên): dạng như `rs` cộng `signalKind`, `confirmed`/`potential` (đếm cả bộ lọc theo cờ has_<kind>_confirmed / _potential), `weekUp`/`weekDown`, `weekOf`, mỗi dòng `top[]` thêm `rs3m`, `signal` ('confirmed'|'potential'), `weekChangePercent` (giá SSI, lib/stock-bars.mjs; null khi chưa có cache); ở bản tuần `leaders` là của format đó (`rules.formats.weekly.screener.leaders`, snapshot `leadersByFormat.weekly`): `order` "tier", `perTier` 1 — MỘT mã soi mỗi bộ lọc, RS 1M cao nhất chưa được chọn — mỗi dòng `top[]` như leaders bản phiên cộng `tier`, `tierScene` (bảng dẫn vào scene soi mã đó); `filtersOf`/`filters[]` chỉ kể bộ lọc của các scene format đó dựng; `breadth` chỉ ở format có vai `breadth` (bản tuần): `aboveSma200`/`withSma200`/`aboveSma200Percent` (đếm thô của terminal), `count` {`above`, `with`, `percent`, `floor`, `rule`} = CON SỐ scene nói (2026-10-06: "amount of stock have price better than its SMA200" — mọi mã terminal có SMA200, hoặc chỉ mã KL TB20 ≥ `rules.formats.weekly.breadth.minVolumeSma20` khi sàn đó > 0), `up`/`down`, và khi có `breadth.json` thì `history[]` (60 phiên: `t`, `above`, `with`, `percent`, `indexClose` — số mã tính lại từ giá đóng cửa SSI, SMA200 của giá kéo qua phiên không khớp) + `line` (`first`/`last`/`peak` %, `countFirst`/`countLast`/`countPeak`/`countChange`, `indexChangePercent`, `set`, `residual` = điểm cuối của đường − `count.above`, `residualSharePercent`, `vsScreener`) + `week` (`from` = phiên cuối tuần trước, `lineFrom`/`lineTo`/`lineChange`, `screenerFrom`/`screenerChange` từ snapshot phiên đó khi có) |
| `weekly` | chỉ bản tuần: nến tuần, `changePercent`, `volumeVsPriorWeek`, phiên phân phối trong tuần, chuyển trạng thái, `newLeaders`/`droppedLeaders` so snapshot tuần trước |
| `indexDaily` / `indexWeekly` | chỉ bản tuần (2026-10-06, "eval the VNIndex as daily and weekly"): VN-Index ở khung NGÀY (vai `daily`, 142 phiên SSI) và khung TUẦN (vai `week`, 142 tuần — nến SSI gộp theo tuần bắt đầu thứ Hai như khung W của FireAnt). Mỗi khối: `timeframe` (D/W), `window`, `from`, `close`; `structure` (lib/symbol-review.mjs: `kind` up/down/range, `hh`/`hl`, `text`, `highs[]`/`lows[]` = hai đỉnh, hai đáy dao động gần nhất {`t`,`dm`,`price`}, `word` tăng/giảm/đi ngang, `broke` = đỉnh/đáy gần nhất mà nến cuối đã đóng qua, hoặc null); `ma` {`MA50`,`MA200`: {`value`, `closeVsPercent`}} đọc từ legend ảnh FireAnt (`vnindex-daily.ma.json` / `vnindex-weekly.ma.json`, không tính) — chỉ khi legend đọc đúng nến của bản (hover close = close), không thì `ma` rỗng và `maWhy` nói vì sao; `maPosition` (chữ: "dưới cả MA50 và MA200", …), `ma50AboveMa200`. Riêng `indexDaily`: `weekSessions[]` {`t`,`dm`,`weekday`,`close`,`changePercent`,`volumeVsPrior`, `volumeProvisional` khi KL phiên của SSI còn tạm}. Riêng `indexWeekly`: `openThrough` (thứ của bản khi tuần chưa khép lại, vd "Thứ Ba"), `up[]`/`down[]` = hai VÙNG gần nhất mỗi phía (mốc swing tuần và MA tuần trong 0,5% gộp, như `scenario`; `at` = đường chạm trước). `facts.mjs --dir=<shots/review/…>` đọc sidecar MA ở thư mục ảnh khác (bản thử). |
| `sectors` | chỉ bản tuần (2026-10-06, `scripts/review/lib/sectors.mjs`): `ok` (`{ok: false, why}` khi thiếu `.review-cache/<ngày>-universe.json` hoặc `content/review/industries.json` — scene bị bỏ), `source`, `mapFetchedAt`, `minVolumeSma20`, `minMembers`, `sortBy` "medianRs1m", `comparedWith` (ngày của bản tuần trước trong archive, null khi chưa có); `groups[]` — nhóm ICB cấp 2 có ≥ `minMembers` mã thanh khoản (KL TB20 ≥ `minVolumeSma20`, có RS 1M), xếp theo RS 1M trung vị: `rank`, `code`, `name` (tên đầy đủ, để đọc), `short` (≤ 22 ký tự, để in), `members`, `rs1m` (trung vị, nguyên), `weekChangePercent` (trung vị % tuần từ nến SSI của `lib/stock-bars.mjs`, 2 chữ số lẻ; null khi dưới nửa số mã có nến), `aboveSma200Share` (% mã có SMA200 mà giá trên nó, nguyên), `strongest` {`symbol`, `rs1m`} (chỉ cho brief), `prevRank`; `unranked[]` {`code`, `name`, `short`, `members`} |
| `flow` | chỉ format có vai `flow` (bản phiên): `ok` — ảnh FireAnt "Thống kê sàn" có đúng phiên của bản (thẻ HSX = đóng cửa ± `shots.fireantFlow.matchTolerance`, chụp sau 15:00 và trước phiên sau); không thì `{ok: false, why}` và scene bị bỏ. Khi `ok`: `exchange` "HOSE" (FireAnt ghi HSX), `up`/`down`/`flat`/`total` + `…Percent`, `money` {`up`,`down`,`flat`,`total`} tỷ đồng 1 chữ số lẻ như nhãn FireAnt, `moneyPercent`, `moneyLead` + `moneyLeadRatio` (phía nhiều tiền chia phía kia), `countWord`/`moneyWord` (chữ do ngưỡng quyết định, như `breadthToday`), `agree` (`same`/`opposite`/null — số mã và dòng tiền cùng hay ngược chiều), `photo`, `fetchedIct`; `impact` (thẻ "Top cổ phiếu tác động", 2026-10-05): `up[]`/`down[]` {`symbol`,`points`} điểm 2 chữ số lẻ như nhãn FireAnt, `lead` (mã tác động lớn nhất), `indexChange` (điểm thay đổi của chỉ số), `leadShare` (% của `lead` trên `indexChange`), `upSum`/`downSum` |
| `backtest` | FTD theo ngưỡng `followThrough.backtestThresholds` trên toàn lịch sử |
| `anchors[]` | các dòng `{label, value, path}` cho bảng số của trang duyệt |

## 3. Quy tắc phiên phân phối / FTD

Nguồn: William O'Neil (IBD), dùng trong market timing của Mark Minervini. Máy trạng thái:
`scripts/review/lib/market-state.mjs`; test: `scripts/review/lib/market-state.test.mjs`.

- **Phiên phân phối**: đóng cửa ≤ `distribution.maxChangePercent` so phiên trước VÀ khối lượng cao hơn phiên
  trước. Tính trong `windowSessions` phiên (kể cả chính nó); hết hạn sớm khi giá cao nhất của một phiên sau
  chạm đóng cửa của nó × (1 + `expireRallyPercent`%).
- **Trạng thái trong xu hướng tăng**: `underPressureAt` phiên còn hiệu lực = chịu áp lực, `correctionAt` =
  điều chỉnh. Thủng đáy nhịp hồi của FTD = FTD thất bại, về điều chỉnh. `dangerAt` (năm) = MỨC NGUY HIỂM của hệ thống người
  dùng (2026-10-01): không phải trạng thái; từ đó market cảnh báo và rà lại từng mã và rủi ro, watch giữ lời, leader thêm một câu rủi ro.
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
| `https://fireant.vn/thi-truong` (headless, không đăng nhập) | cạnh mỗi chỉ số: `▲ tăng ● đứng giá ▼ giảm` của phiên MỚI NHẤT (trong phiên là số đang chạy). `lib/fireant.mjs` đọc; `pull.mjs` chỉ tin khi giá VN-INDEX trên trang = đóng cửa của phiên (`fireant.matchesSession`), không thì dùng đếm từ universe của Screener. Dashboard FireAnt còn tab "Biến động" (Số lượng CP tăng/giảm/không đổi) — chưa chụp làm ảnh |

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
| FireAnt VNINDEX ngày | `shoot.mjs --site=fireant --symbol=VNINDEX --size=1080x900 --interval=D --reset-view --crop=full` | Chrome thật, tab 1D của người dùng (giá + khối lượng + MA Cross 50/200 từ 3/10 + MACD; `fireant_ma.py` → `vnindex-daily.ma.json`: MA50/MA200 của FireAnt và các dòng legend mà scaffold che); ~6,5 tháng; crop/mask giống ảnh 1080×900 của Channel; pane hiệu chỉnh `paneFrac` [0,058, 0,21, 0,896, 0,66] — tiêu đề OHLC và histogram MACD cùng màu nến nên phải chặn pane |
| terminal VNINDEX (dự phòng) | `shoot.mjs --site=zionle --page=analyze --symbol=VNINDEX --viewport=1800x1000 --clip=canvases` | hiệu chỉnh trên giá ÷ 1000 (terminal yết chỉ số theo nghìn) |
| Screener | `shoot.mjs --site=zionle --page=screener --allow-post=/api/stocks/filter --viewport=1200x1000 --scale=2 --js=scripts/review/js/screener.js --js-args=<json>` | `{filter, sort, keep, rows, zoom}`; sidecar `js` = trang (px CSS), dòng, ô, nút; ảnh = cả trang đã phóng |
| chart mã (FireAnt, mặc định từ 2026-10-03) | `shoot.mjs --site=fireant --symbol=<MÃ> --tab=VNINDEX --restore-symbol=VNINDEX [--hover-back=N] --size=1080x900 --interval=D --reset-view --crop=full` (`rules.shots.fireantStock`) | Chrome thật, tab VNINDEX (1D) của người dùng — giá + khối lượng + MA Cross 50/200 (MA50 xanh lá, MA200 cam) + MACD; 1080×867, ~6,5 tháng (144 nến, d 6,0 px, trung vị 0,45–0,53 px); hiệu chỉnh trên nến /analyze (+ SSI các phiên sau ngày của bản), `paneFrac` [0,058, 0,18, 0,896, 0,655], dòng legend trong pane được che (`blank`); `fireant_ma.py` → `<mã>-fireant.ma.json`: giá trị MA của FireAnt (legend, đọc trên nến của bản khi `--hover-back`; thẻ giá; kiểm bằng pixel của đường), đường đi của từng MA, đỉnh cột khối lượng từng nến, các dòng legend và thẻ giá (để che) |
| chart mã (terminal, dự phòng) | `shoot.mjs --site=zionle --page=analyze --symbol=<MÃ> --viewport=1800x1000 --clip=canvases` (`--only=leaders-terminal`) | 2712×1520; pane giá `paneFrac` [0,015, 0, 0,955, 0,54]; crop bỏ trục giá; có mũi tên tín hiệu và trendline của terminal |

Hiệu chỉnh: `calib_auto.py` tìm cột nến theo màu trong pane, ước d (px/nến), last_x, N = khoảng cách/d + 1,
rồi chạy `scripts/calib_chart.py`. Chart terminal có mũi tên tín hiệu, trendline chấm và thẻ giá cùng màu
nến nên số dư trung vị 4–9 px là do chúng; đo 29/9: đường giá cuối của BSR lệch 4 px (≈2 px trên khung
hình), bốn vline phiên phân phối/FTD trùng đúng nến. Soát bằng khung hình của trang duyệt.

## 6. Mark scaffold đặt

| Scene | Beat 1 | Beat 2 | Beat 3 |
|---|---|---|---|
| hook | mũi tên ĐỎ chỉ XUỐNG đỉnh từng phiên phân phối + nhãn "N phiên phân phối"; máy cận nhịp cuối | mũi tên XANH LÁ chỉ LÊN đáy nến FTD + nhãn, vòng vàng ở nến hôm nay; máy lùi ra | — |
| week (chỉ bản tuần) | ảnh FireAnt VNINDEX nến TUẦN (`vnindex-weekly`, hiệu chỉnh trên nến tuần gộp từ SSI, tuần bắt đầu thứ Hai): nhãn "Tuần ±x% · KL ×…" (`weekly.changePercent`, `weekly.volumeVsPriorWeek`); máy cận nến tuần cuối | máy lùi ra toàn cảnh | — |
| market | mũi tên đỏ, nhãn "N/25 phiên phân phối" (tắt ở beat 3), nhãn phiên nặng nhất | mũi tên xanh lá FTD + nhãn, hline vàng đáy nhịp hồi | nhãn "d/m hết hạn sau N phiên" ở phiên cũ nhất, nhãn bậc ngưỡng còn phía trước ("5 phiên → nguy hiểm · 6 phiên → điều chỉnh" ở bốn phiên; tới năm phiên thì nhãn đỏ "Nguy hiểm: rà lại từng mã · 6 phiên → điều chỉnh"); máy cận |
| flow (bản phiên, scene 02 sau hook — 2026-10-05) | ảnh FireAnt hai thẻ chồng nhau (`fireant-flow`, fit contain, máy zoom 2 — mỗi thẻ vừa khung): THẺ DÒNG TIỀN — nhãn vàng "HOSE · phiên d/m", nhãn trắng "N tăng · N giảm · N đứng giá" dưới biểu đồ tròn, hộp quanh cột dòng tiền dẫn đầu cùng nhãn giá trị FireAnt in trên nó (màu mark `up`/`down`); máy `push_in` | máy lia xuống (`tilt`) THẺ "TOP CỔ PHIẾU TÁC ĐỘNG": nhãn vàng "Tác động đến VN-Index (điểm)" (thẻ không có tiêu đề riêng), hộp quanh cột mã tác động lớn nhất, nhãn "<MÃ> +12,80 điểm · chỉ số +15,49" cạnh cột. Không chữ của mình trên cột. Không có ảnh đúng phiên thì scene bị bỏ (scaffold in lý do) | — |
| breadth (chỉ bản tuần) | panel `lines` (vẽ): pane trên = VN-INDEX đóng cửa vẽ ra, mốc FTD | pane dưới = % mã trên SMA200 vẽ ra (`screener.breadth.history`); thiếu lịch sử thì scaffold bỏ scene (lưới chấm dự phòng đã bỏ 2026-10-06) | — |
| spike | panel `movers` (vẽ): cột TĂNG — CẢ bộ lọc, tối đa 10 mã theo % giảm dần, tăng mạnh nhất trên đầu (beat 1) | cột GIẢM — tối đa 10 mã theo % tăng dần, rơi sâu nhất trên đầu (beat 2); mỗi dòng mã · KL +x% · %, khối lượng là % so với SMA20 (`volumeVsSma20Percent`, VOL/SMA của terminal); caption "KHỐI LƯỢNG ĐỘT BIẾN · N MÃ · XẾP THEO % THAY ĐỔI · KL SO SMA20" (người dùng 30/9 bảng hai cột, tối 1/10 thứ tự % và đơn vị %; `movers.sortBy: "rs_1m"` trả về thứ tự RS 1M, `visual: "photo"` trả về bảng chụp; `review-picks` FAIL khi bảng lệch thứ tự pack). Mã sẽ soi ngay sau mà bảng có (`focus`, người dùng 2026-10-06: "With the volumn spike also have the animation with this scene for me highlight the symbol must noted"): vạch vàng ở mép trái khi dòng hiện, rồi beat 3 (`emphasis`) các dòng khác mờ, dòng đó có nền vàng quét ngang, viền vàng, mã phóng to và đổi vàng, kính lúp, nhãn "Xem kỹ: DGW" thay caption (`src/scenes/Movers.tsx`); không có mã nào thì hai beat | — |
| rs / uptrend | panel `board` (vẽ, `visual: "board"`, `src/scenes/FilterBoard.tsx`): MỘT bộ lọc, MỘT cột, tối đa 10 mã xếp theo RS 1M giảm dần — # · MÃ · GIÁ · % NGÀY · RS 1M (số + thanh) + hai cột riêng (RS 52W, KL/TB20 cho RS Strong; trên EMA50, trên SMA200 cho Uptrend), các dòng hiện dần từ trên xuống; caption "<BỘ LỌC> · N MÃ · XẾP THEO RS 1M" | mã sẽ soi ngay sau (`focus`: leader theo thứ tự chiếu, rồi mã người dùng chọn — chỉ những mã bảng đang hiện) được tô và có hiệu ứng, các dòng khác mờ đi, nhãn "Xem kỹ: MSR · DGW"; hai bảng y như nhau (người dùng 2026-10-05: "decoration and animation with the symbol need focused", "uptrend … behavior like the RS strong"). Không còn dải vàng / tia sét / chú giải mã ở cả hai bộ lọc ("Not need mentioned the stock on specific filter existed on other filter") | — |
| rs / uptrend (cũ, `visual: "columns"`) | panel `movers` hai cột 1/10 chiều: cột trái #1–5 (beat 1), số lớn RS 1M, số nhỏ % hôm nay | cột phải #6–10 (beat 2) | — |
| rs / uptrend (ảnh, khi `visual: "photo"`) | ảnh bảng Screener của bộ lọc đó xếp theo RS 1M: hộp quanh các dòng được chọn — hoà điểm RS có thể đẩy một dòng xuống dưới hàng 3, `lib/screener-rows.mjs` chấp nhận khi không có dòng lạ đứng trên; nhãn "N mã <bộ lọc>" đè lên nút Columns/Export | hộp từng ô RS 1M, máy cận | — |
| leader (tối đa bốn từ 2026-10-06, trước là hai; 2026-10-01: mã ở cả ba bộ lọc trước, rồi mã ở cả RS Strong lẫn Uptrend; bản phiên từ 2026-10-06 CHỈ mã ở cả ba bộ lọc, 0–2 scene, `rules.formats.daily.leaders` — cách chọn của đạo diễn, lời không nói mã ở bộ lọc nào, 2026-10-05) | ảnh FireAnt của mã (`lib/leader-fireant.mjs`): nhãn "MÃ · RS 1M … · ±x%" ở cảnh rộng; nhãn đặt trên CHÍNH đường MA50/MA200 của FireAnt với giá trị FireAnt in (không vẽ đường của mình); MỘT chi tiết — theo bài đánh giá của `symbol-reviewer` khi có (`content/review/symbols/<ngày>/<MÃ>.json`: mức, vùng, hộp khối lượng, mũi tên), không thì hline đỉnh 52 tuần "Đỉnh 52T … · −x%" hoặc hộp trên cột khối lượng hôm nay "KL +x%" (mã cũng ở Volume spike, KL ≥ ×1,2) | mũi tên vào nến của bản "±x% trên MA50" (MA50 của FireAnt; thiếu thì "Đóng cửa …"), máy cận. Mọi nhãn được ĐẶT vào chỗ trống trong khung máy của beat — không đè nến, cột khối lượng, trục giá, chip nguồn hay nhãn khác; mũi tên không cắt qua nến khác; đường nào còn trong cận cảnh thì giữ nhãn cũ nếu còn chỗ (không có hai bản nhãn mờ chồng nhau lúc máy chuyển) | — |
| leader / pick — beat 3 "Hành động" (từ 2026-10-07, khi bản soi có `roles`) | máy lùi về nến cuối và đường giá của hai vai (`lib/leader-fireant.mjs`); plate ĐỎ "Đang giữ: dưới 63,20 chốt 1/2" dưới đường của người đang giữ, plate TRẮNG "Chưa mua: …" trên đường của người chưa có hàng (vai không có giá: cạnh nến cuối; trendline / MA50: chính đường đó); nhãn của beat 1–2 rời đi | — | — |
| watch ("Kịch bản VN-Index", 2026-10-05) | kịch bản tích cực: hline xanh ở từng vùng phía trên của `scenario.up` (nhãn "MA50 1774,79 · Kháng cự 1776,85", "MA200 1795,82"), vòng vàng nến hôm nay; máy tilt, cận nến cuối và các đường phía trên | kịch bản tiêu cực: hline đỏ ở hỗ trợ của `scenario.down` ("Hỗ trợ 1715,91"), hline vàng "Thủng <đáy nhịp hồi> → FTD thất bại", nhãn "Thêm N phiên phân phối → <ngưỡng kế>", tới năm phiên thêm nhãn đỏ "Mức nguy hiểm: rà lại từng mã và rủi ro"; máy ĐỨNG YÊN (payoff), lùi ra đủ thấy cả hai phía | — |

Người dùng chốt 2026-09-29: phiên phân phối và FTD là MŨI TÊN chỉ đúng vào nến — FTD XANH LÁ chỉ lên, phiên phân phối
ĐỎ chỉ xuống. Mũi tên là mark nên dùng cặp màu hướng của repo, accent `up` (#1FA377) / `down` (#EC5F38, ΔE mù màu 10,2;
với đỏ chữ #E5333A cũng đạt 8,1 — đo bằng validator trên nền FireAnt); nhãn đi kèm dùng màu CHỮ `green` / `red`. verify
chỉ nhận `up`/`down` trên mark ảnh, không trên headline. Kiểu `style: "block"`: thân đặc, đầu rộng, viền trắng, quầng tối;
NGẮN (~22 px, `ARROW` 0,025) và THẲNG đứng, đầu mũi tên cách đỉnh/đáy nến ~4 px (`GAP`). Hai phiên phân phối sát nhau vẫn
tách được vì mỗi đầu nằm ở đỉnh nến của chính nó (khác độ cao). Trục thời gian của hiệu chỉnh được khớp
lại trên chính các cột nến (`calib_auto.py`, `xFit`) — chỉ dùng `calib_chart.py` thì đầu mũi tên lệch ~0,4 nến.
| spike (ảnh, khi `visual: "photo"`) | hộp quanh ba dòng; nhãn "Top 3: KL +x% · …" đè lên nút Columns/Export | hộp từng ô VOL/SMA, máy cận |
| rs / uptrend (bảng vẽ, mặc định) | cột trái #1–5: mã · RS 1M (số lớn) · % hôm nay (số nhỏ) | cột phải #6–10 (bộ lọc ≤ 5 mã thì chỉ một cột) |
| rs / uptrend (ảnh, khi `visual: "photo"`) | hộp quanh các dòng được chọn của bộ lọc đó; nhãn "N mã RS Strong" / "N mã Uptrend" | hộp từng ô RS 1M, máy cận |
| pick (mã người dùng chọn, sau leader — 2026-10-05) | như leader: ảnh FireAnt của mã (`<mã>-fireant.png`, `shots.mjs --only=requested`), mark của bản soi | như leader |
| leader (terminal, dự phòng) | nhãn "MÃ · RS 1M … · ±x%", hline EMA50 | mũi tên vào nến cuối "±x% trên EMA50", máy cận |

Nhãn chỉ mang số của fact pack; check `facts` của verify soi từng số.
