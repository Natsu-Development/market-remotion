---
description: Làm reel TỔNG KẾT TUẦN của VNINDEX (WeeklyReview) sau phiên cuối tuần — VN-Index ở khung TUẦN (nến tuần, MA50/MA200 tuần, hỗ trợ/kháng cự tuần) và khung NGÀY (cấu trúc giá, MA50/MA200) cùng trạng thái thị trường theo quy tắc phiên phân phối và FTD (O'Neil, dùng trong hệ thống Minervini) trong một scene, SỐ MÃ có giá trên SMA200 (số của terminal + đường tính lại dưới đường chỉ số), xếp hạng nhóm ngành ICB theo RS 1M trung vị, MỘT bảng theo dõi tuần tới lấy bộ lọc RS Strong của terminal zionle.io.vn làm gốc — mọi mã của nó, mã được Uptrend, Momentum breakout hoặc Momentum breakdown cùng tìm ra xếp trước, mỗi mã một chip cho từng bộ lọc đã tìm ra nó, mười dòng một trang, mỗi beat một trang (từ 2026-10-18; trước đó mỗi bộ lọc Momentum một bảng), bảng đứng ngay sau xếp hạng ngành, soi tối đa sáu mã NGƯỜI DÙNG chọn trên trang duyệt (bấm «Chọn» ở dòng mã; mã ngoài bảng được thêm vào bảng; từ 2026-10-09 bản tuần không chọn mã theo bộ lọc hay luật), kịch bản VN-Index — kéo số, chụp ảnh, dựng khung, một người viết lời, chấm điểm, đăng TRANG DUYỆT (artifact) rồi mới lồng tiếng và render. Dùng khi người dùng muốn tổng kết tuần, review tuần, bản tuần, nhìn lại tuần qua, thị trường cuối tuần ra sao, độ rộng thị trường tuần này, ngành nào mạnh tuần này, Momentum breakout/breakdown của tuần. KHÔNG dùng cho tổng kết phiên hằng ngày (đó là market-review, với Volume spike / RS Strong / Uptrend) hay reel theo một chủ đề, một mã, một chỉ báo (market-video).
argument-hint: "[--date=YYYY-MM-DD]"
allowed-tools: Read, Write, Edit, Artifact, Agent, Bash(node *), Bash(npm run *), Bash(npx remotion *), Bash(npx tsc *), Bash(../video-factory/.venv/bin/python *), Bash(ffmpeg *), Bash(ffprobe *), Bash(ps *), Bash(ls *), Bash(cat *), Bash(open *)
---

Làm bản tổng kết TUẦN: tuần kết thúc ở phiên `--date` (mặc định là phiên đã đóng gần nhất, thường là thứ Sáu).

Skill này TÁCH khỏi market-review (người dùng 2026-10-05: "init this weekly skill … after remove it entirely from
the daily market"): market-review làm bản PHIÊN, skill này làm bản TUẦN. Hai skill dùng CHUNG một bộ luật và một bộ
máy, không chép:

- **Luật**: [`../market-review/rules.json`](../market-review/rules.json). `formats.weekly` khai vai, thời lượng, id
  `rw-…`; mọi luật còn lại (phiên phân phối, FTD, mức nguy hiểm, bộ lọc, ảnh, lexicon) là luật chung của hai bản. Reel
  tuần mang trường `rules` trỏ về file đó. Đổi một con số ở đó là đổi cho cả hai bản, và là quyết định của người dùng.
- **Người viết**: [`../market-review/writer.md`](../market-review/writer.md). Mục "Bản tuần" ghi phần khác của bản tuần.
- **Tra cứu**: [`../market-review/reference.md`](../market-review/reference.md). **Script**: `scripts/review/` với `--format=weekly`.
- **Quy trình chung**: [`../market-review/SKILL.md`](../market-review/SKILL.md), gồm cửa chặn độ tươi, luật "chỉ GET
  cộng một POST", Chrome thật, agent `symbol-reviewer`, chấm điểm và mục "Những điều đã đo". Đọc file đó trước; dưới
  đây chỉ ghi chỗ bản tuần khác.

Đường đi chạy liền một mạch tới điểm dừng DUY NHẤT, như bản phiên: **kéo số → fact pack tuần → chụp ảnh → soi mã →
khung scene → MỘT người viết → chấm điểm → TRANG DUYỆT (artifact) → người dùng duyệt → lồng tiếng, render**. Không
hỏi giữa đường.

**Từ 2026-10-06 bản tuần có nội dung riêng** (người dùng: "With weekly artifact, eval the VNIndex as daily and weekly of
this week, eval the filter: Momentum breakout, Momentum breakdown. Also include major ranking and amount of stock have
price better than its SMA200."; trả lời ba câu hỏi: Replace · ICB groups by RS · Top of each filter). 12 scene:
hook → week (VN-Index · Khung tuần) → daily (VN-Index · Khung ngày) → market → breadth (SỐ mã trên SMA200) → sectors
(nhóm ngành ICB theo RS) → breakout → soi mã của nó → breakdown → soi mã của nó → watch → outro. Volume spike, RS Strong
và Uptrend là của bản PHIÊN, bản tuần không có. Hai bộ lọc của bản tuần nằm ở `rules.formats.weekly.screener` (khoá
riêng của format, để bản phiên, hộp "Soi thêm mã" và tầng soi mã của bản phiên không đổi); bảng ngành ở `rules.sectors`.

**Từ 2026-10-09** (người dùng, hai câu): "Combine the scene 03 and 04 to one scene but still keep it meaningful" — khung
ngày và trạng thái theo quy tắc là MỘT scene `market`; "Remove the soi ma first, i will select the symbol to review with
weekly not follow by the filter value and rule" — bản tuần không còn scene soi mã theo luật, chỉ soi mã người dùng chọn.
9 scene + 0–4 scene soi mã: hook → week → market (khung ngày + quy tắc) → breadth → sectors → breakdown → breakout → [mã
người dùng chọn] → watch → outro (`rules.formats.weekly._roles`; breakdown TRƯỚC breakout từ 2026-10-09 — `_order`).

**Từ 2026-10-18** (người dùng: "Also include the RS strong to this video, combine it with the moment breakout/breakdown, Uptrend filter, and give me 10 of symbol raking by the RS1M sorting DESC, Listing for me the table with each symbol and the filter find it? If the symbol have many fiter listing it on the table for me. The table be using for select the stock to review and need notice and monitor for the next week scene without each filter scene (reduce annoy from all filter scene)"): hai bảng Momentum được THAY bằng MỘT scene `watchlist` "Bảng theo dõi tuần tới" —
GỐC là bộ lọc RS Strong — MỌI mã của nó, không cắt ở mười (cùng tối người dùng sửa: "Why i don't see the 10 symbol of RS1M strong sorting DESC? I mean setting the RS1M strong of the RS strong filter to base and expand the list of symbol? Not limit to 10 symbol on the stock list to monitor? Just piority the stock have RS strong and another filter also find it at first?") —
mã được Uptrend, Momentum breakout hoặc Momentum breakdown cùng tìm ra xếp TRƯỚC, mỗi nhóm RS 1M giảm dần (bằng RS 1M thì RS 3M)
(`rules.formats.weekly.screener.scenes.watchlist`: `match: base`, `base: RS Strong`, `order: overlapFirst`); mã chỉ ba bộ lọc kia
tìm ra không lên bảng. Cột % TUẦN · RS 1M · BỘ LỌC — một chip cho MỖI bộ lọc đã tìm ra mã (RS STRONG, UPTREND, BREAKOUT xanh,
BREAKDOWN đỏ); mười dòng một trang, MỖI BEAT MỘT TRANG (`board.scroll`, `lib/board.mjs` `pagesOf`: 19 dòng = 2 trang, 33 dòng = 4
trang — dòng 1–10, 9–18, 16–25, 24–33; tối đa 40 dòng, `top` 40), mỗi trang ghim một câu để có ~3 giây đọc; mã người dùng chọn
sáng ở beat sau trang cuối. Bộ lọc RS Strong là bộ lọc ĐÃ LƯU trên terminal: người dùng đổi nó thì `pull.mjs` lần kế lấy định
nghĩa mới (18/10 15:31 sàn KL TB20 hạ từ 2 000 000 xuống 1 000 000 — 16/10 ra 33 mã thay 19; kéo lại được tới lượt làm mới của
terminal, rồi `facts.mjs`, `scaffold.mjs --force` và lời của scene). Phiên đầu tiên của thiết kế này đã thử hợp bốn bộ lọc rồi lấy mười mã RS 1M cao nhất — người dùng bác. Bảng là danh sách theo dõi tuần tới VÀ danh sách để chọn mã soi:
hộp "Soi thêm mã" của trang duyệt liệt kê đúng các dòng đó kèm chip; mã người dùng chọn chiếu ngay sau bảng. Hai spec
breakout/breakdown ở lại làm dữ liệu (pull.mjs vẫn kéo), không còn là vai.

**Từ 2026-10-18 chiều** (người dùng: "Bang theo doi co phieu must be after the xep hang nganh scene with my pick: 4 symbols and my plus symbol: GMD, ANV. Also edit the artifact to allow me to select the stock on this artifact to add directly to this table scene."): bảng theo dõi đứng NGAY SAU xếp hạng ngành — scene soi mã ngành tự động (MSR tới
vòng 6) bỏ (`formats.weekly.sectors._leaderRetired`; đổi tên lại thành `leader` để bật lại), scene sectors kết bằng câu dẫn
của bảng "Mã nào cần theo dõi?" (`screener.scenes.watchlist.bridge`). MỌI scene soi là mã người dùng chọn — tối đa 6
(`screener.requested.max`, trước là 4; `totalSeconds` [80, 180]). Trang duyệt: mỗi dòng của danh sách có nút «Chọn» (bấm là
chọn / bỏ, cùng đường với gõ mã, lưu vào doc `requests/<ngày>-weekly`). Mã chọn sáng lên ở beat cuối của bảng — bảng xoá trắng
rồi CHỈ còn các mã đó, theo thứ tự scene soi (`emphasis.collapse`, FilterBoard) — và mã chưa có trên bảng được THÊM vào cuối
bảng, thẻ THÊM (`board.addRequested`, facts.mjs `added: true`). Lời mời cuối bảng gọi tên từng mã ("Cùng mình xem kỹ DCL,
rồi MSB, …"). 9 scene + 0–6 scene soi: hook → week → market → breadth → sectors → watchlist → [mã người dùng chọn] → watch →
outro.

**Cùng tối 2026-10-18** (người dùng: "Edit Cùng mình xem kỹ DCL, rồi MSB, … to Cung minh review nhung ma dang chu y cho tuan sau
nhe. And just review the HDB, VPB, GMD and DCL not need review all my picked stock." rồi "Also have scene for all my picked stock
and its filter, also include the price must be monitor and notice."): bảng theo dõi KHÔNG còn tô mã chọn và kết bằng câu của
người dùng, đúng chữ (`formats.weekly.watchlist.invite` "Cùng mình review những mã đáng chú ý cho tuần sau nhé." — "review" giữ
nguyên, `voice.lexicon` đọc "ri viu", chưa đo); ngay sau nó là scene MỚI **picklist** "Mã đáng chú ý tuần sau": MỌI mã người dùng
chọn — giá, chip bộ lọc, VƯỢT (giá theo dõi: nhánh "nếu đóng cửa vượt …" đầu tiên của bản soi) và THỦNG (giá lưu ý: nhánh "nếu đóng
cửa dưới …" đầu tiên) — beat 2 tô các mã có scene soi chart ngay sau (facts `screener.picklist`, scaffold `buildPicklist`, FilterBoard
cột `watchUp`/`watchDown`, verify `review-picklist`). File chọn mã có thêm `review` = các mã soi chart, theo thứ tự (thiếu = mọi mã);
mọi mã trong danh sách vẫn cần bản soi để có hai giá. Trang duyệt: mỗi mã đã chọn có nút «Soi chart» (bật / tắt → doc
`requests/<ngày>-weekly` field `review`). 16/10: danh sách DCL, MSB, VPB, HDB, GMD, ANV; soi chart HDB → VPB → GMD → DCL. Thứ tự:
hook → week → market → breadth → sectors → watchlist → picklist → [soi chart] → watch → outro.

## 0. Khi nào chạy

1. **Sau phiên cuối tuần**, 15:00 ICT, và sau khi terminal làm mới bộ lọc (~15:04). Tuần có ngày nghỉ thì phiên cuối
   là phiên giao dịch cuối cùng của tuần.
2. Chạy muộn hơn vẫn được (tối thứ Sáu, cuối tuần, sáng thứ Hai trước 9:00): cửa chặn độ tươi nhận cache sau 15:00
   của phiên và trước khi phiên sau mở cửa. Phiên thứ Hai mở cửa (9:00) là trang FireAnt đã hiện phiên mới, nên ảnh độ
   rộng không còn khớp; lượt làm mới 12:00 của terminal đẩy luôn bộ lọc sang phiên mới. Từ đó bản của tuần cũ không làm
   lại được nữa. Đừng lách cửa chặn.
3. Như market-review §0: không có render nào đang chạy (`ps -Ao command | grep "[r]emotion render"`). Ảnh chỉ số tuần
   và chart từng mã chụp bằng Chrome THẬT của người dùng, nên dặn họ đừng đụng chuột khoảng 25 giây mỗi ảnh.
4. Tối thứ Sáu thường có cả bản phiên lẫn bản tuần. Làm lần lượt, không lồng tiếng hai reel cùng lúc (chung `.tts-cache`).

## 1. Kéo số

```bash
node scripts/review/pull.mjs            # phiên cuối tuần — cùng lệnh, cùng luật với bản phiên (market-review §1)
```

Bản tuần so các snapshot trong tuần (`content/review/snapshots/<ngày>.json`). Phiên nào đã có bản phiên thì đã có
snapshot; phiên thiếu snapshot thì phần tuần chỉ dựa vào nến SSI (`weekly.snapshots` liệt kê những phiên có).

`pull.mjs` cũng kéo hai bộ lọc của bản tuần (`rules.formats.weekly.screener.scenes`: Momentum breakout, Momentum
breakdown) vào snapshot của MỌI phiên (`members.breakout` / `members.breakdown`, hai POST đọc của cùng endpoint đã duyệt).
Từ 2026-10-09 nó KHÔNG chọn mã soi cho bản tuần nữa (`rules.formats.weekly.screener.leaders`: `top: 0`, không
`snapshot.leadersByFormat.weekly`); `/analyze` của mã người dùng chọn kéo bằng `pull.mjs --symbols=<MÃ,…> --analyze-only` (§4).
Snapshot kéo trước 6/10 không có hai danh sách đó: `pull.mjs --rebuild
--as-of=<ngày>` lấy được khi `.review-cache/<ngày>-filters-server.json` có danh sách server cùng cache stamp (chỉ 5/10 có,
chụp 11:50 ngày 6/10 trước lượt làm mới 12:00 — terminal không giữ lịch sử).

## 2. Fact pack tuần

```bash
node scripts/review/breadth.mjs                            # đường SỐ mã trên SMA200: ~900 GET tới SSI (KHÔNG tới terminal), ~1 phút lần đầu, vài giây khi có cache .review-cache/stock-bars/<ngày>/
node scripts/review/industries.mjs                         # bản đồ ngành ICB cấp 2 (VNDirect, GET, không auth) → content/review/industries.json; dùng lại khi chưa quá rules.sectors.maxAgeDays (7) ngày, --refresh để kéo lại
node scripts/review/facts.mjs --format=weekly --print      # -> content/review-weekly.facts.json
node --test scripts/review/lib/market-state.test.mjs
```

- **Số mã trên SMA200** (`screener.breadth`): số in lên màn hình là số của TERMINAL (mã có `sma_200` > 0 và giá đóng cửa
  trên nó — 247/901 ngày 5/10, đúng con số người dùng lọc "giá > SMA200" trên terminal). Đường lịch sử tính lại từ giá
  đóng cửa SSI (`lib/stock-bars.mjs`; SMA200 của SSI trùng `sma_200` của terminal tới chữ số thứ ba với mã có thanh
  khoản), ngày không khớp lệnh mang giá trước sang; ngày 5/10 đường cuối ở 237/899, lệch −10 mã (−1,1%), trong ngưỡng
  `formats.weekly.breadth.maxResidualPercent` (2%) nên không cần sàn thanh khoản (`minVolumeSma20: 0`; sàn 10 000 cp
  đưa đường và terminal về lệch 1 mã nếu một ngày cần). 174 mã gần như không giao dịch có SMA200 của terminal không
  dựng lại được từ SSI — lý do của độ lệch đó.
- **Nhóm ngành** (`sectors`, `lib/sectors.mjs`): 19 nhóm ICB cấp 2 của VNDirect; mỗi nhóm xếp theo RS 1M TRUNG VỊ của các
  mã có KL TB20 ≥ `rules.sectors.minVolumeSma20` (500 000 cp từ 2026-10-10 — người dùng: "other stock not have liquidty or
  transaction affect to the actual ranking of major"; 100 000 trước đó) trên universe của terminal phiên đó; nhóm dưới
  `minMembers` (5) mã như vậy không xếp hạng (5/10: Ô tô, Viễn thông, Truyền thông, Bảo hiểm). Cột % tuần là trung vị %
  thay đổi trong tuần, đọc từ nến SSI mà `breadth.mjs` đã kéo — chạy `breadth.mjs` TRƯỚC `facts.mjs`. Mỗi nhóm mang `top`
  (2026-10-09): `topPerGroup` (3) mã mạnh nhất theo RS 1M, `{symbol, rs1m, changePercent, weekChangePercent?}`; `strongest`
  = `top[0]`.

Máy trạng thái là của bản phiên (market-review §2), tính tới phiên cuối tuần. Khối `weekly` của pack mang tuần
(`from` → `to`, `sessions`), mở/cao/thấp/đóng, `changePercent` so với đóng cửa tuần trước, `volumeVsPriorWeek` (khối
lượng trung bình mỗi phiên so với tuần trước), các phiên phân phối mới trong tuần, chuyển trạng thái trong tuần, số mã
từng qua Volume spike, mã dẫn dắt mới và mã rơi khỏi nhóm so với tuần trước. **Đọc `weekly`, `state.since`,
`distribution` và `watch` trước khi nghĩ lời.** Kịch bản mọc từ số của TUẦN, không phải của riêng phiên thứ Sáu.

## 3. Ảnh

```bash
node scripts/review/shots.mjs --format=weekly                  # ảnh còn thiếu của phiên cuối tuần + ảnh RIÊNG của bản tuần (nến tuần, Chrome thật)
node scripts/review/shots.mjs --format=weekly --only=fireant-weekly   # chỉ ảnh nến tuần (Chrome thật, ~25 giây)
node scripts/review/facts.mjs --format=weekly                  # CHẠY LẠI sau ảnh: pack mang MA của FireAnt
```

**Tối thứ Sáu bản tuần chạy SAU bản phiên và chung thư mục ảnh** `public/shots/review/<ngày>/`. Ảnh mà bản phiên cũng
chụp (VNINDEX ngày, VNINDEX của terminal, chart từng mã dẫn dắt) đã có thì GIỮ — reel phiên đặt mark trên đúng những
ảnh đó — và `shots.mjs --format=weekly` chỉ chụp `vnindex-weekly`; `--reshoot` chụp lại tất cả. Trước
5/10 lượt chụp mặc định của bản tuần chụp lại cả ảnh của bản phiên, đè lên ảnh reel phiên đang dùng.

Ảnh chỉ số tuần (`vnindex-weekly`, `rules.shots.fireantWeekly`) là tab VNINDEX của người dùng ở khung **W + reset view**:
~140 tuần, tuần cuối sát mép phải, cùng bố cục với ảnh ngày của tab đó (dòng legend OHLC / Volume / MA Cross — MA50/MA200
TUẦN —, pane giá tới ~0,655 với khối lượng ở đáy, MACD dưới). Nó được hiệu chỉnh như chart từng mã của tab đó (pane trên
đáy khối lượng, che các dòng legend in số cùng màu nến) trên nến tuần gộp từ SSI (tuần bắt đầu thứ Hai), vì `/analyze`
của terminal trả 500 với `1W`; lần đầu (5/10, tuần thử 28/9 → 2/10): 142 tuần, trung vị 0,45 px. Công thức cũ `range: 1y`
không có reset view nên nến mới nhất có thể trôi khỏi mép phải. Lượt chụp để tab ở 1W; lượt chụp FireAnt kế (bản phiên,
chart từng mã) bấm D trả về — không có lượt nào nữa thì chụp một lượt `--interval=D --reset-view` ra scratchpad để trả tab.
Scene `week` dựng ở `scripts/review/lib/week-fireant.mjs`: cắt giá + khối lượng (~80 tuần, mép phải), che legend, khung
cây nến tuần, nhãn % tuần, cận cảnh cao/thấp/đóng và khối lượng; ảnh mới hơn tuần của bản (lượt thử một tuần đã qua) thì
che các tuần sau đó, thẻ giá và đường giá cuối chấm chấm. Các công thức chụp FireAnt khác giống hệt bản phiên, xem
market-review §3.

### Số mã trên SMA200: CHỈ có ở bản tuần

Người dùng 2026-10-05 ('Daily; old chart → weekly') giữ scene "Độ rộng thị trường" cho bản tuần; 2026-10-06 ("amount of
stock have price better than its SMA200") nó nói SỐ MÃ: panel `lines` vẽ hai đường cùng trục thời gian, VN-INDEX đóng
cửa ở trên, SỐ mã đóng cửa trên SMA200 ở dưới (~60 phiên, mốc FTD), caption in số của terminal ("TERMINAL: 247/901 MÃ
TRÊN SMA200 · 27,4%"). Ảnh FireAnt "Biến động thị trường" là scene `flow` của bản phiên.

- Số: `node scripts/review/breadth.mjs` (§2) → `content/review/breadth.json` {set, terminal count, residual, 60 dòng
  `{t, above, with, percent}`}; `facts.mjs --format=weekly` đưa vào `screener.breadth` (`count` = số của terminal,
  `history[]`, `line` với số mã đầu/cuối/đỉnh và độ lệch, `week` = số mã đầu tuần → cuối tuần).
- Lời nói số của TERMINAL, không đọc số của đường. Beat 1 đường chỉ số vẽ ra, beat 2 đường số mã vẽ ra: chỉ số đi một
  đằng mà số mã khỏe đi một nẻo (5/10: đường 300 → 237 trong 60 phiên khi VN-Index −4,8%). Verify `review-breadth`:
  số in trên màn hình phải là số của terminal (FAIL), độ lệch đường > 2% thì WARN.
- Thiếu `breadth.json` hay pack thiếu `screener.breadth` thì scaffold bỏ scene và in `breadth: dropped — <lý do>`.

## 4. Soi mã người dùng chọn (không theo bộ lọc)

Từ 2026-10-09 bản tuần KHÔNG chọn mã soi theo bộ lọc hay luật (người dùng: "Remove the soi ma first, i will select the
symbol to review with weekly not follow by the filter value and rule"; trước đó "Top of each filter" — RS 1M cao nhất của
mỗi bộ lọc Momentum, một scene soi mã sau mỗi bảng). `rules.formats.weekly.screener.leaders` là `top: 0`, `from: []`:
`screener.leaders.top` của pack TUẦN rỗng, và pack không bao giờ mượn mã dẫn dắt của bản phiên.

Mã soi là mã người dùng gõ ở hộp "Soi thêm mã" của trang duyệt bản tuần — tối đa `rules.formats.weekly.screener.requested.max`
(4) mã; hộp liệt kê mã của Momentum breakout / breakdown (`listMinFilters: 1`, mã ở cả hai gắn "cả hai"), người dùng gõ
được cả mã ngoài hai bộ lọc. Lượt ĐẦU của tuần chưa có mã nào: trang duyệt đầu tiên không có scene soi mã, bảng breakout
(bảng cuối từ 2026-10-09) kết bằng câu dẫn sang kế hoạch tuần tới ("Vậy tuần tới canh gì?"). Khi người dùng gõ mã rồi nói "tiếp", làm đúng market-review §3 "Soi thêm mã người
dùng chọn" với khoá `<ngày>-weekly` và `--format=weekly`:

1. ArtifactData `get` doc `requests/<ngày>-weekly` trên artifact TUẦN → `content/review/requests/<ngày>-weekly.json`.
2. `node scripts/review/pull.mjs --symbols=<MÃ,…> --analyze-only`, rồi `node scripts/review/facts.mjs --format=weekly`.
3. `node scripts/review/shots.mjs --format=weekly --only=requested` (Chrome thật; bận thì `--only=requested-terminal`).
4. `node scripts/review/lib/symbol-review.mjs measure <ngày> <MÃ> --format=weekly` cho từng mã, mỗi mã một agent
   `symbol-reviewer` chạy song song, rồi `facts.mjs --format=weekly` lần nữa.
5. `scaffold.mjs --format=weekly`: mỗi mã một scene `pick` (`rw-<ngày>-pick-<n>`) NGAY SAU bảng breakout (bảng cuối từ
   2026-10-09), theo thứ tự người dùng gõ; bảng breakout kết bằng lời mời gọi đúng các mã đó ("Cùng mình xem kỹ MSB."), bảng nào có
   mã đó thì beat 2 tô nó; mã chọn đầu tiên mở bằng "Mã đầu tiên là …" (chỉ một mã: "Mã đáng chú ý tuần này là …"). Mã
   thiếu ảnh bị bỏ và in lý do. Verify `review-momentum` FAIL khi bảng tô sai mã hay scene pick không đứng ngay sau bảng
   cuối; `review-picks`, `review-symbols`, `review-roles` soi scene pick như bản phiên.

**Mã ngành — MỘT scene soi mã theo luật từ 2026-10-10** (người dùng: "Get one of stock on this marjor best ranking to
review 1-5 ranking, on the scene 05, mentiond the major raking from 1 to 3 and mention its stock on this major"): mỗi bản tuần
soi thêm mã mạnh nhất (RS 1M cao nhất, `top[0]`) của nhóm ngành HẠNG 1 — `rules.formats.weekly.sectors.leader`
(`fromRanks [1, 5]`, `pick: strongest`, `count: 1`); chỉ khi mã đó đã có scene soi (người dùng gõ nó ở hộp) hoặc không có
chart (`/analyze` không có nến, hoặc đạo diễn chạy `facts.mjs --format=weekly --no-chart=<MÃ>` vì FireAnt không vẽ được)
mới xuống mã mạnh nhất của nhóm hạng 2, rồi 3 … 5. `lib/sectors.mjs sectorLeaderOf` chọn; pack mang `sectors.review`
({symbol, group, groupRank, rs1m, reason}) và `screener.sectorLeader` (cùng dạng một mã người dùng chọn: dòng terminal,
`analyze`, `photo`, `review`). Mã này KHÔNG tính vào 4 mã của người dùng, nhưng reel tối đa năm scene soi mã. Quy trình
y như mã người dùng chọn, mã ngành trước:

1. `node scripts/review/pull.mjs --symbols=<MÃ NGÀNH> --analyze-only` (GET `/analyze` duy nhất) — `facts.mjs` in một dòng
   "sector leader PVP …: analyze missing — run node scripts/review/pull.mjs --symbols=PVP --analyze-only" khi thiếu (nó
   không tự kéo), rồi "no FireAnt photo yet" / "no valid symbol review" cho bước kế.
2. `node scripts/review/shots.mjs --format=weekly --only=requested --symbols=<MÃ NGÀNH>` — `--only=requested` chụp mã ngành
   TRƯỚC các mã người dùng chọn.
3. `measure` + một agent `symbol-reviewer` như các mã kia (mã ngành xếp SAU mã người dùng chọn khi tránh thế giá trùng — bản
   soi đã hợp lệ của mã người dùng không bao giờ hỏng vì nó), rồi `facts.mjs --format=weekly`.
4. `scaffold.mjs --format=weekly`: scene `pick` của mã ngành NGAY SAU sectors (`rw-<ngày>-pick-1`; mã người dùng chọn đánh số
   tiếp), eyebrow "Soi mã · <MÃ>", câu đầu "Mã đầu tiên là <MÃ>." khi còn mã soi sau nó; thiếu ảnh FireAnt hoặc bản soi hợp
   lệ thì bỏ và in lý do (không die). Scene sectors có scene soi chiếu ngay sau thì kết bằng LỜI MỜI CỐ ĐỊNH, không mang mã
   (2026-10-11, `formats.weekly.sectors.invite`): "Cùng mình xem kỹ các mã nằm trong các nhóm ngành trên và đang mạnh nhất thị trường nhé." — các scene soi tự gọi tên mã;
   verify `review-sectors` FAIL khi câu cuối khác lời mời đó, `review-picks` FAIL khi scene mã ngành không đứng ngay sau sectors;
   `review-symbols`, `review-roles`, `review-overlap` soi nó như scene pick.

Bộ lọc là của phiên cuối tuần, vì terminal không giữ lịch sử. Bản soi nằm theo NGÀY (`content/review/symbols/<ngày>/`),
nên tối thứ Sáu bản tuần dùng lại bản soi của bản phiên: `node scripts/review/lib/symbol-review.mjs <ngày>` báo hợp lệ
thì chỉ soi mã còn thiếu. `measure` và bộ soát đọc fact pack có `asOf` đúng ngày (pack của format, pack của format kia,
rồi pack trong archive); trước 5/10 chúng luôn đọc pack PHIÊN mới nhất, nên bản soi cũ hỏng khi pack phiên sang ngày
khác (bản soi PVT 2/10 bị loại ngày 5/10 vì giá 24,20 của 5/10). Mã ở Momentum breakdown là mã MẠNH đang thủng hỗ trợ:
soi để cảnh báo, không gọi bán.

## 5. Khung scene và khung hình nháp

```bash
node scripts/review/scaffold.mjs --format=weekly     # -> content/review-weekly.json + brief/review-weekly.md
npm run review-page -- WeeklyReview --out=out/review/draft-weekly
node scripts/frame-audit.mjs WeeklyReview --check    # mọi khung hình — phải 'no defects'
```

Scene theo `rules.formats.weekly.roles`, 9 scene + 0–6 scene soi mã người dùng chọn, 80–180 giây (0–4 và 80–120 giây từ
2026-10-09 tới 2026-10-18; 12 scene từ 2026-10-06):

1. **hook** — SỐ trước, rồi câu hỏi không ngày (người dùng 2026-10-18: "Remove: Tuần từ mười hai đến mười sáu tháng mười on the
   intro" — eyebrow mang ngày), rồi lời mời (2026-10-09; ~46 chữ, trần 64, `rules.formats.weekly.hook`): "VN-Index
   đóng tuần ở <điểm đủ hai số lẻ> điểm, <tăng/giảm> <x> phần trăm so với tuần trước ("so với (cuối) tuần trước" bắt buộc — F4). Thị trường còn khỏe không?
   Cùng mình điểm lại tuần qua và lên kế hoạch giao dịch cho tuần tới nhé." — điểm đóng tuần đọc ĐỦ, không làm tròn (người dùng
   2026-10-18: "1705.91 not round up/down this number" — "một nghìn bảy trăm linh năm phẩy chín mươi mốt điểm"); lời mời là chữ người dùng ("With weekly the
   intro must have the sentence like: cung minh review va ke hoach giao dich cho tuan toi nhe."; "tuần này" / `inviteOpen`
   khi tuần chưa khép lại). Đạo diễn: số trước, câu hỏi "Thị trường còn khỏe không?" (`hook.question`) thay "Tiền đang chảy
   vào đâu?" — bản tuần không có scene flow nên không ai trả lời câu cũ; scene market trả lời câu mới ở mọi trạng thái. Người
   xem trader: ảnh không còn nhãn "+x%" (headline mang nó). Beat 1 ← câu số, beat 2 ← câu hỏi (headline "Thị trường còn khỏe
   không?" / "Kế hoạch tuần tới"). Phiên FTD mất TRONG tuần của bản (8/10) thì câu mở của bản phiên 8/10
   (`followThrough.lost.say`) đứng trước, beat riêng trên nến FTD. verify `review-plan` (WARN).
2. **week** — VN-Index · Khung tuần, trên ảnh FireAnt tuần, ~28 chữ, hai beat (2026-10-09, `rules.formats.weekly.week`):
   beat 1 cận cảnh cây nến tuần — KẾT LUẬN của nến (đóng sát đỉnh / sát đáy biên tuần, KL so với tuần trước khi số đã chốt;
   nhãn KL ẩn khi KL phiên cuối của SSI còn tạm), không nhãn "+x%" (headline mang nó); beat 2 toàn cảnh: cấu trúc đỉnh/đáy tuần
   (đường đứt nối hai đỉnh, hai đáy gần nhất) và vùng tuần GẦN giá đóng nhất, đọc MỘT LẦN thành số (vùng 1776 ngày 6/10) —
   scene duy nhất ngoài watch đọc một mức giá; MA50/MA200 TUẦN của FireAnt (`vnindex-weekly.ma.json`, chỉ khi legend đọc đúng
   tuần của bản) là nhãn, không đọc — không câu "xu hướng dài hạn chưa gãy"; câu cuối "Còn khung ngày thì sao?" (`week.bridge`).
   Pack `indexWeekly`, `lib/week-fireant.mjs`. Thiếu MA tuần thì scene vẫn dựng với cấu trúc và vùng giá.
3. **market** — VN-Index · Khung ngày VÀ trạng thái theo quy tắc, MỘT scene trên ảnh FireAnt ngày (người dùng 2026-10-09:
   "Combine the scene 03 and 04 to one scene but still keep it meaningful"; `rules.formats.weekly.market`, scaffold
   `dailyFrame` + `buildMergedMarket`). Cùng ngày, đạo diễn và người xem trader (orchestrator gộp): MỘT KẾT LUẬN MỖI BEAT,
   6 câu, ~72 chữ (trần 80, tối đa 2 số đọc ra lời), KHÔNG đọc mức giá nào — nhãn mang 1776,85 / MA50 / MA200. Beat 1 ← s0
   kết luận cấu trúc (hai đường đứt, khung vàng các phiên của tuần; headline "Thủng đáy 14/9 · 1776,85" / "Đáy cao dần đã bị
   phá"); beat 2 ← s1 kết luận MA ("Dưới cả MA50 lẫn MA200" / "Khung ngày đang yếu"); beat 3 ← s2 chuyện quy tắc của TUẦN với
   thay đổi so với tuần trước (điều chỉnh: "tuần này thị trường chuyển sang điều chỉnh: thứ Năm là phiên phân phối thứ sáu";
   chịu áp lực / nguy hiểm: "… hiện tại đang có <n> phiên phân phối" + "thêm <k> so với tuần trước"), mũi tên phân phối và MỘT
   nhãn đếm trả nợ thuật ngữ ("6/25 phiên phân phối" + "Giảm ≥ 0,5%, KL cao hơn phiên trước"); beat 4 ← s3 điều chỉnh: phiên
   FTD 3/8 thất bại, tìm phiên FTD mới (nhãn "FTD 3/8 · thất bại", đường đáy điều chỉnh) / nguy hiểm: "Hệ thống mình báo nguy
   hiểm, rà lại từng mã và rủi ro"; s4 câu người dùng chốt của trạng thái; s5 "Nhìn rộng ra thì sao?". Beat 4 chỉ có nhãn của
   nó; KHÔNG đồng hồ hết hạn, KHÔNG thang ngưỡng ở mọi trạng thái, KHÔNG nhãn "Nguy hiểm" khi điều chỉnh. Ảnh ngày của hook /
   market / watch cắt ở đáy khung khối lượng (`formats.weekly.indexPhoto`, ~0,50 chiều cao ảnh, giữ tỉ lệ 1,42 của panel): khung
   MACD không còn hiện. verify `narration`/`style` đọc ngân sách ở `formats.weekly.market`; `review-timeframes`, `review-state`.
   **Tuần có nỗ lực phục hồi bị thủng đáy** (2026-10-17, tuần 12/10: nỗ lực 9/10 thủng 1724,17 ngày 12/10, nỗ lực 13/10 thủng
   1710,95 ngày 14/10, không phiên phân phối mới): `weekly.transitions[]` mang `why` và `attempt` {day1, rallyLow, days}; beat 3 vẽ
   mỗi đáy đã thủng (đường đỏ "Đáy nỗ lực 9/10 · 1724,17 · thủng 12/10") + nhãn trắng "Thủng đáy nỗ lực = nỗ lực thất bại" THAY
   mũi tên và nhãn đếm phiên phân phối; s2 kể các nỗ lực thất bại, headline "2 nỗ lực phục hồi thất bại" / "Thủng đáy 12/10 và
   14/10". Khuôn cũ ("thứ … là phiên phân phối thứ sáu") chỉ còn cho tuần đổi trạng thái vì phiên phân phối.
4. **breadth** — SỐ mã trên SMA200 (§3). 2026-10-09: ≤ 28 chữ — câu đếm của terminal, chiều của đường bằng chữ, "Nhóm
   ngành nào còn khỏe?"; khung dưới không in số trên trục (người xem: 288/255/221 cạnh 244/898 là "hai con số cho một sự thật").
   Chiều của đường tính từ LẦN ĐỔI CHIỀU LỚN cuối cùng — cực trị muộn nhất của 60 phiên, khi từ đó tới nay đổi ≥ 10 mã và ≥ 5%
   (2026-10-17: 223 → 239 cả cửa sổ đọc thành "tăng dần từ cuối tháng bảy" trong khi đường đã rơi từ 282 ngày 27/8; giờ là
   "giảm dần từ cuối tháng tám", cùng chiều chỉ số trên chặng đó); không có lần đổi chiều như vậy thì so điểm đầu với điểm cuối.
5. **sectors** — Xếp hạng ngành: bảng tối đa 10 nhóm ngành ICB xếp theo RS 1M trung vị (SỐ MÃ · TRUNG VỊ RS 1M · % TUẦN ·
   % MÃ TRÊN SMA200), beat 2 tô ba nhóm dẫn đầu; verify `review-sectors`. 2026-10-09: ~28 chữ — nhóm dẫn đầu (một số),
   câu về các nhóm dẫn đầu đang sáng từ cột % mã trên SMA200 (beat 2 ghim vào đây; vế tương phản gọi được nhóm nào cũng được),
   "Mã nào đang gãy?" (người xem: "I do not trade 'Hàng & DV công nghiệp' (23 names);
   the useful column is % above MA200"). 2026-10-09 chiều (người dùng: "With the scene 05 also listing 2-3 stock with this
   major ranking?"): mỗi dòng in thêm BA mã mạnh nhất của nhóm theo RS 1M (cột `topSymbols`, pack `sectors.groups[].top`,
   `rules.sectors.topPerGroup` 3; mã có KL TB20 ≥ `minVolumeSma20`, bằng RS 1M thì xét RS 3M rồi mã), số mã in nhỏ, xám dưới
   tên ngành; beat 2 làm sáng mã của ba nhóm dẫn đầu cùng dòng. Lời không đọc lại danh sách, gọi tối đa mã mạnh nhất của
   nhóm DẪN ĐẦU, không nói bộ lọc nào; `review-sectors` FAIL khi mã trên dòng lệch `top` của pack, WARN khi lời gọi mã khác.
   Trang duyệt: cột "Mạnh nhất" in cả ba mã, hộp "Soi thêm mã" liệt kê cả ba mã mỗi nhóm (thẻ «top 3 · ngành»).
   **2026-10-10** (người dùng: "on the scene 05, mentiond the major raking from 1 to 3 and mention its stock on this major"):
   ~46 chữ (trần 54), bốn câu — s0 bảng + RS 1M trung vị của nhóm dẫn đầu (beat 1); s1 ba nhóm hạng 1–3, tên đầy đủ, mỗi
   nhóm MỘT mã mạnh nhất ("Dẫn đầu là Hàng hóa và dịch vụ công nghiệp với PVP, rồi Dịch vụ bán lẻ với PET, Hóa chất với
   DRI.", beat 2, `atSentence` 1); một nhận xét % trên SMA200 nếu còn chữ; câu CUỐI là lời mời gọi đúng các scene soi chiếu
   ngay sau ("Cùng mình xem kỹ PVP, rồi VPB và HDB."), "Vậy tuần tới canh gì?" / "Mã nào đang gãy?" chỉ khi không scene soi
   nào theo sau. `review-sectors` WARN khi thiếu mã của một nhóm đầu hay gọi mã khác, FAIL khi lời mời lệch.
   **2026-10-11** (người dùng: "Edit the sentence: Cùng mình xem kỹ PVP, rồi VPB và HDB => something like: Cung minh xem ky cac ma nam trong cac nhom nganh tren & dang manh nhat (leader) cua thi truong nhe"): câu CUỐI khi có scene soi theo sau là lời mời CỐ ĐỊNH, đúng từng chữ, không mang mã
   — `formats.weekly.sectors.invite` "Cùng mình xem kỹ các mã nằm trong các nhóm ngành trên và đang mạnh nhất thị trường nhé." (19 chữ), THAY "Cùng mình xem kỹ PVP, rồi VPB và HDB."; scene thường
   ba câu, ~49 chữ (trần 54), s2 chỉ khi còn chữ; lời chỉ gọi ba mã của s1 (`maxTickers` 3); `review-sectors` FAIL khi
   câu cuối khác lời mời đó, WARN khi thiếu hay thừa mã.
   → (tới 2026-10-18) 1 scene **pick** mã ngành (§4) ngay sau sectors — đã bỏ: bảng theo dõi đứng ngay sau sectors, scene
   sectors kết bằng "Mã nào cần theo dõi?".
6. **watchlist** — Bảng theo dõi tuần tới (từ 2026-10-18, THAY mục breakdown/breakout cũ bên dưới): mọi mã của RS Strong, mã
   có thêm bộ lọc khác xếp trước, chip bộ lọc mỗi dòng, mười dòng một trang, mỗi beat một trang; plate "Thị
   trường: <trạng thái> · danh sách theo dõi tuần tới" dưới khung, caption "RS STRONG · <n> MÃ · CÓ THÊM BỘ LỌC XẾP TRƯỚC"; lời
   MỖI TRANG MỘT CÂU (~44 chữ cho 2 trang, ~58 cho 4; trần 62, `formats.weekly.watchlist`): số mã của RS Strong và cách xếp, chip
   BREAKDOWN là cảnh báo, các mã chỉ có RS Strong (khi đủ trang), "Cứ theo dõi, chưa phải lúc hành động." (trang cuối), rồi lời mời các mã người dùng chọn hoặc "Vậy tuần tới canh gì?". Lời KHÔNG đọc chip của mã nào (bảng đã in),
   không "cả hai / cả ba bộ lọc". verify `review-momentum` soát dòng, thứ tự RS 1M và chip của từng dòng với pack
   (`screener.watchlist`). Hai mục "(cũ)" dưới đây là thiết kế tới 2026-10-17, giữ để tra.
   (cũ) **breakdown** — bộ lọc Momentum breakdown (TRƯỚC breakout từ 2026-10-09): bảng một cột xếp RS 1M (GIÁ · % TUẦN · RS 1M ·
   TÍN HIỆU xác nhận/tiềm năng · RS 52W), danh sách CẢNH BÁO, không gọi bán. 2026-10-09: ~26 chữ — danh sách là gì, đường
   an toàn của người đang cầm ("Đang cầm mã nào ở đây thì rà lại điểm cắt lỗ.", beat 2), "Còn chiều ngược lại?" (người xem là trader "mất
   nhiều tiền"). Dòng neo ở đầu panel; dưới chúng plate "Thị trường: <trạng thái> · danh sách cảnh báo" và thẻ định nghĩa
   của bộ lọc đã lưu (`content/review/filters.json`; khi bảng ≤ 6 dòng) — bảng không có mã chọn thì beat 2 là plate đó.
   (cũ) **breakout** — bộ lọc Momentum breakout, cùng khuôn bảng, plate "… · danh sách theo dõi". Bảng CUỐI: beat 2 tô mã người
   dùng chọn khi nó có trên bảng, câu cuối là lời mời gọi đúng các mã đó, hoặc — chưa có mã nào — câu của watch "Vậy tuần
   tới canh gì?". 2026-10-09: ~24 chữ — "Bộ lọc Momentum breakout chỉ có <n> mã, <MÃ> đã vượt
   trendline giảm. Cứ theo dõi, chưa phải lúc hành động." (beat 2 ở câu hai), rồi lời mời hoặc "Vậy tuần tới canh gì?" (người xem: "I would screenshot MSB/PVS and buy Monday").
   → 0–6 scene **pick** — soi mã người dùng chọn (§4; FireAnt ngày + `symbol-reviewer`), ngay sau bảng theo dõi (từ 2026-10-18;
   trước đó sau bảng breakout / scene mã ngành), theo thứ tự chọn.
8. **watch** — KẾ HOẠCH cho tuần tới, trả lời hứa của hook (2026-10-09; `rules.formats.weekly.watch`): 5 câu, ~66 chữ (trần
   76), ~18 giây — mốc trên → mốc dưới → điều gì đổi trạng thái → người có hàng → người chưa có hàng; chữ chung, không gọi
   giá, không lệnh. Điều chỉnh: "Tuần tới, nếu vượt lại vùng <mốc trên> thì <mốc kế> là mốc kế.
   Nếu thủng <mốc dưới> thì về <mốc kế dưới>. Trạng thái chỉ đổi khi có phiên FTD mới. Có hàng
   thì hạ tỷ trọng và tuân thủ cắt lỗ. Chưa có hàng thì đứng ngoài, không mua đuổi nhịp hồi, chờ phiên FTD mới." (câu của
   người dùng 8/10; hai vai như scene soi mã 7/10). Nguy hiểm / chịu áp lực: "Thêm một phiên phân phối nữa là điều chỉnh. Có
   hàng thì rà lại điểm cắt lỗ của từng mã. Chưa có hàng thì không mua đuổi." Headline "Vượt <mốc> → MA200" / "Kế hoạch tuần
   tới"; "Thủng <mốc> → <mốc>" / "Chờ phiên FTD mới" (nguy hiểm: "Rà lại từng mã và rủi ro"); nhãn "Chờ FTD từ ngày 4, +1,25%"
   ở trạng thái điều chỉnh. Scene ngay trước kết bằng `watch.bridge` "Vậy tuần tới canh gì?" (thay "Còn VN-Index thì sao?").
   Lời thiếu "tuần tới" / "tuần sau" thì `review-plan` WARN.
9. **outro** — hứa "mỗi cuối tuần".

Không scene nào nói một mã có ở bộ lọc kia (5/10: PVS, ABB ở cả hai) — verify `review-overlap`, `review-momentum`. Id
mang ngày phiên cuối tuần (`rw-261009-hook`).

**Lần scaffold ĐẦU TIÊN**: đăng ký `WeeklyReview` trong `src/Root.tsx` NGAY SAU lệnh scaffold (import
`../content/review-weekly.json`, thêm một dòng vào `REELS`). File phải có trước khi đăng ký; đăng ký khi thiếu file thì
verify của MỌI reel báo `registration` FAIL. Bản tuần trước được chép vào `content/review/archive/` trước khi bị thay,
như bản phiên. Nhìn khung hình từng beat rồi mới cho người viết. Nhãn chồng nhau hay rơi khỏi khung thì sửa ở
`scaffold.mjs`, không sửa JSON tay.

## 6. Một người viết cho cả reel

Một agent, prompt = [writer.md](../market-review/writer.md) (đọc cả mục "Bản tuần") + tên reel + thư mục ghi
(`.review-cache/writer/<ngày>-weekly/`) + ghi chú giọng của đạo diễn (kết luận của TUẦN, số nào là nhân vật chính).
Đọc `_script.md` thành tiếng, soi bằng `/humanizer`, rồi:

```bash
node scripts/merge.mjs content/review-weekly.json --from=.review-cache/writer/<ngày>-weekly
```

## 7. Chấm điểm

```bash
npm run verify -- WeeklyReview
```

Cùng các check của skill (`scripts/review/checks.mjs`) với bản phiên. Tối đa 4 vòng sửa; còn FAIL thì hỏi người dùng.

## 8. Trang duyệt: điểm dừng duy nhất

Viết `out/review/review-weekly/notes.json` (kết luận của tuần, tiền đề nào số đỡ, verify còn gì), rồi
`npm run review-page -- WeeklyReview`. Đăng bằng tool Artifact (`file_path=out/review/review-weekly/index.html`,
`root`, `files` từ `files.json`, icon `chart`). Bản tuần có MỘT link riêng, khác link bản phiên, và tuần sau đăng lại
đúng link đó. Trả lời ngắn: trạng thái theo quy tắc, tuần tăng hay giảm, verify còn WARN gì, `unsupported`, ảnh độ
rộng có khớp phiên không, và các lựa chọn duyệt · sửa · bỏ. Chưa có câu trả lời thì không lồng tiếng.

## 9. Sau khi duyệt

```bash
npm run approve -- WeeklyReview
node scripts/voiceover.mjs --content=content/review-weekly.json --retime
../video-factory/.venv/bin/python scripts/tts_takes.py --content=content/review-weekly.json --rebuild   # cửa nghe (market-review §8)
npx tsc --noEmit && node scripts/render.mjs --id=WeeklyReview --out=out/review/weekly-<ngày>.mp4
```

Soát sau render như market-review §8 (Whisper cho FTD và các mã đánh vần; `tts_takes.py` nghe mọi câu — số, mã, thuật ngữ —
và `render.mjs` từ chối render khi `voice-heard` FAIL).

## 10. Chưa từng chạy: soát kỹ ở bản đầu tiên

Bản tuần đầu tiên chạy trên tuần dở dang 5/10 → 6/10 (người dùng 2026-10-06: "of this week"). Nhìn tận mắt thêm: bảng
ngành (tên nhóm dài, nhóm ít mã), hai bảng Momentum (bảng 4 dòng nằm giữa khung với nhiều khoảng trống — hành vi cũ của
FilterBoard), chữ đọc "Momentum", "breakout", "breakdown" (`voice.lexicon` CHƯA đo — chạy `tts_takes.py` sau khi lồng
tiếng), và hộp "Soi thêm mã" của trang duyệt bản tuần: nó liệt kê mã của Momentum breakout / breakdown (mã có ở cả hai
gắn "cả hai") và lưu vào doc `requests/<ngày>-weekly` của artifact TUẦN (`lib/requested.mjs` `requestKey`); đạo diễn
đọc doc đó (ArtifactData get trên artifact tuần) vào `content/review/requests/<ngày>-weekly.json` — bản phiên cùng ngày
giữ `requests/<ngày>` riêng, nên bản tuần không còn nhận mã người dùng gõ cho bản phiên (bản thử 5/10 từng dựng nhầm VIC).
Từ 2026-10-09 hộp đó là đường DUY NHẤT vào scene soi mã của bản tuần (§4, tối đa 4 mã) — bản thật đầu tiên sau đổi (thứ Sáu
9/10) nhìn tận mắt: trang duyệt lượt đầu không có scene soi mã và bảng breakout (bảng cuối từ 2026-10-09) kết bằng câu dẫn
sang kế hoạch tuần tới; sau khi người dùng gõ mã, scene pick đứng ngay sau bảng breakout và lời mời của bảng gọi đúng các mã đó.

Scene `market` gộp khung ngày (2026-10-09) mới chỉ dựng ra file nháp (6/10): nhìn từng beat (header cấu trúc → header MA →
"5/25 phiên phân phối" + FTD → mức nguy hiểm), đếm chữ (~70, trần 80) và nghe câu nối giữa chart và quy tắc; ảnh FireAnt
ngày thiếu MA50/MA200 thì scaffold in `market: no daily frame — …` và scene chỉ còn ba beat của quy tắc.

Tới 2026-10-05 chưa có bản tuần nào. Đường `--format=weekly` mới chỉ được dựng thử ra file nháp, nên bản đầu tiên
phải nhìn tận mắt những chỗ sau:

- ảnh `vnindex-weekly` (Chrome thật) và hiệu chỉnh của nó trên nến tuần — chưa chụp lần nào. Thiếu ảnh hay thiếu hiệu
  chỉnh thì scaffold BỎ scene `week` mà không báo, nên đếm số scene so với `formats.weekly.roles`;
- scene `breadth` (đường % mã trên SMA200, `breadth.mjs`) trên bản tuần — khôi phục ngày 2026-10-05 khi ảnh FireAnt sang bản phiên;
- hook, market và watch của bản tuần: brief của scaffold viết cho bản phiên rồi thêm nhánh tuần. Lời phải nói về
  TUẦN, còn phiên thứ Sáu chỉ là một phần của tuần;
- `review-fresh` và trang duyệt trên reel `WeeklyReview`, cùng lần đăng ký đầu tiên trong `src/Root.tsx`.
