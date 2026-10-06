---
description: Làm reel TỔNG KẾT PHIÊN (hằng ngày) cho VNINDEX (DailyReview) — trạng thái thị trường theo quy tắc phiên phân phối và FTD (O'Neil, dùng trong hệ thống Minervini) cộng ba bộ lọc đã lưu trên terminal zionle.io.vn, mỗi bộ lọc một scene (Volume spike; RS Strong; Uptrend), biến động thị trường của phiên trên ảnh FireAnt "Thống kê sàn" (số mã tăng/giảm/đứng giá và phân bổ dòng tiền), rồi soi tối đa hai mã (mã có mặt ở cả ba bộ lọc trước, rồi mã ở cả RS Strong lẫn Uptrend, theo RS 1M) — kéo số, chụp ảnh, dựng khung, một người viết lời, chấm điểm, đăng TRANG DUYỆT (artifact) rồi mới lồng tiếng và render. Dùng khi người dùng muốn bản tổng kết phiên hôm nay, review phiên, review thị trường hôm nay, trạng thái thị trường, phiên phân phối, FTD hay cổ phiếu dẫn dắt từ bộ lọc. KHÔNG dùng cho tổng kết TUẦN (đó là weekly-review — cùng luật và script, scene độ rộng % mã trên SMA200 chỉ có ở đó) hay reel theo một chủ đề, một mã, một chỉ báo (đó là market-video).
argument-hint: "[--date=YYYY-MM-DD]"
allowed-tools: Read, Write, Edit, Artifact, Agent, Bash(node *), Bash(npm run *), Bash(npx remotion *), Bash(npx tsc *), Bash(../video-factory/.venv/bin/python *), Bash(ffmpeg *), Bash(ffprobe *), Bash(ps *), Bash(ls *), Bash(cat *), Bash(open *)
---

Làm bản tổng kết PHIÊN (`--format=daily`) cho phiên đã đóng gần nhất.

Bản TUẦN là skill riêng, [`weekly-review`](../weekly-review/SKILL.md) (người dùng tách 2026-10-05: "init this weekly
skill … after remove it entirely from the daily market"). Nó dùng chung rules.json, writer.md, reference.md và
`scripts/review/` của skill này với `--format=weekly`, và chỉ nó có scene độ rộng cũ (đường % mã trên SMA200,
`breadth.mjs`); ảnh FireAnt "Biến động thị trường" (`flow`) là của bản phiên, scene 02 ngay sau hook (người dùng 2026-10-05: 'Daily; old
chart → weekly', rồi 'move it into the scene 02'). Người dùng gọi `/market-review weekly` hay hỏi tổng kết tuần thì chuyển sang skill đó.

Skill này TÁCH khỏi market-video (người dùng chốt 2026-09-29): luật riêng ở
[rules.json](rules.json), prompt người viết riêng ở [writer.md](writer.md), script riêng ở
`scripts/review/`. Nó KHÔNG đọc `src/shared/content-rules.json` hay `prompts/scene-writer.md`; chỉ dùng
chung phần máy (TTS, render, trang duyệt, chụp ảnh) qua `scripts/lib/rules.mjs` — reel của skill này mang
trường `rules` trỏ về `rules.json`, và chỉ thừa hưởng hằng số của máy (khung hình, audio, chuỗi tháng,
clip giọng). Đổi một con số trong `rules.json` là quyết định của người dùng.

Đường đi, chạy liền một mạch tới điểm dừng DUY NHẤT: **kéo số → trạng thái + fact pack → chụp ảnh →
khung scene → MỘT người viết → chấm điểm → TRANG DUYỆT (artifact) → người dùng duyệt → lồng tiếng, render**.
Không hỏi giữa đường (người dùng không viết brief, không duyệt brief — cùng lựa chọn như market-video).

Tra cứu (file, API, công thức ảnh, đặc tả DD/FTD): [reference.md](reference.md).

## 0. Trước khi chạy

1. **Giờ.** Phiên chỉ xong sau 15:00 ICT; terminal làm mới bộ lọc sau đóng cửa (15:04 ngày 29/9/2026, lượt
   12:00 là giữa phiên). Chạy sớm hơn thì `pull.mjs` dừng ở cửa chặn độ tươi — đúng ý, đừng lách.
2. `ps -Ao command | grep "[r]emotion render"` — có render đang chạy thì đợi.
3. **Chrome.** Ảnh FireAnt chụp bằng Chrome THẬT của người dùng (như market-video): nói với họ đừng đụng
   chuột ~25 giây. Màn hình ngủ (CGSSessionScreenIsLocked = true, System Events thấy 0 cửa sổ, screencapture
   chỉ ra hình nền) thì `shots.mjs` tự đánh thức bằng phím Space như video-factory — máy không đặt mật khẩu
   (`sysadminctl -screenLock status`: off). Space rồi vẫn khoá thì là khoá thật: dừng, không gõ mật khẩu hộ ai.
   Không chụp được thì reel dùng chart VNINDEX của terminal (headless) và trang duyệt nói rõ.

## 1. Kéo số — GET, cộng ĐÚNG MỘT POST được phép

```bash
node scripts/review/pull.mjs            # phiên đã đóng gần nhất
```

- Nến ngày VNINDEX từ SSI iBoard từ 2013 (khối lượng khớp lệnh) → `content/review/vnindex.daily.json`.
  Nến hôm nay lấy trước 15:00 bị bỏ.
- **Cửa chặn độ tươi:** `GET /api/stocks/cache-info` phải sau 15:00 của phiên và trước phiên sau mở cửa;
  sai thì exit 2 kèm giờ của cache. Skill KHÔNG BAO GIỜ gọi `/stocks/recompute`.
- `GET /api/config/{id}` → CHỈ lấy `metrics_filter` (bộ lọc đã lưu). Object đó còn chứa bot token Telegram
  của người dùng: không log, không ghi.
- `POST /api/stocks/filter` — ngoại lệ duy nhất của luật "không POST" (người dùng cho phép 2026-09-29, là
  truy vấn chỉ đọc mà Screener của họ tự gửi): một lần cho toàn bộ mã, một lần cho mỗi bộ lọc đã lưu. Kết
  quả của server là chuẩn; đánh giá lại tại chỗ chỉ để đối chiếu (và đo ra `volume_vs_sma` tính theo %).
- `GET /api/analyze/<mã>` cho ba mã dẫn đầu.
- Ghi snapshot của phiên: `content/review/snapshots/<ngày>.json` — bản tuần so các snapshot trong tuần.

## 2. Trạng thái và fact pack

```bash
node scripts/review/facts.mjs --format=daily --print     # -> content/review-daily.facts.json
node scripts/review/backtest.mjs                         # FTD theo ngưỡng, 13 năm
node --test scripts/review/lib/market-state.test.mjs     # luật + trạng thái 29/9 đã chốt
```

Máy trạng thái ở `scripts/review/lib/market-state.mjs` (thuần, không mạng): phiên phân phối = giảm từ
`distribution.maxChangePercent` với khối lượng cao hơn phiên trước, còn hiệu lực 25 phiên hoặc tới khi giá
cao nhất vượt 5% trên đóng cửa của nó; 4 phiên = chịu áp lực, 6 = điều chỉnh; 5 = MỨC NGUY HIỂM của hệ thống người dùng (`distribution.dangerAt`, 2026-10-01 — không
phải trạng thái: reel cảnh báo, rà lại từng mã và rủi ro; check `review-state` FAIL khi market thiếu chữ "nguy hiểm"; ở mức đó
market nói câu người dùng chốt 2026-10-05, `distribution.danger.say`: "Xác suất có biến động hoặc điều chỉnh lớn, thị trường không
còn khỏe nữa." — thay câu đếm tới điều chỉnh, WARN nếu thiếu); FTD = từ ngày 4 của nỗ lực
hồi phục, tăng từ `followThrough.minChangePercent` với khối lượng cao hơn. Fact pack cố ý GỌN — chỉ số được
lên màn hình, làm tròn như khi hiện — vì check `facts` của verify chấp nhận một số khi BẤT KỲ số nào
trong pack làm tròn ra nó.

**Đọc fact pack trước khi nghĩ lời**: trạng thái đổi hôm nay chưa (`state.since`), hôm nay có phải phiên
phân phối/FTD (`session.isDistribution`/`isFtd`), `watch` (điều gì sẽ đổi trạng thái). Kịch bản mọc từ số.

## 3. Ảnh

```bash
node scripts/review/shots.mjs --format=daily        # FireAnt VNINDEX + chart FireAnt từng mã dẫn dắt + terminal VNINDEX + ảnh flow (headless) (ba scene bộ lọc là bảng vẽ, không chụp)
node scripts/review/shots.mjs --format=daily --only=flow                  # chỉ ảnh "Biến động thị trường" của FireAnt (headless, không đụng Chrome)
node scripts/review/shots.mjs --format=daily --only=screener,leaders      # một phần
node scripts/review/shots.mjs --format=daily --only=leaders --calib-only  # chỉ hiệu chỉnh lại và đọc lại MA trên ảnh
node scripts/review/shots.mjs --format=daily --only=leaders-terminal      # chart terminal của mã — dự phòng khi Chrome bận
node scripts/review/facts.mjs --format=daily        # CHẠY LẠI sau ảnh: pack mang MA50/MA200 FireAnt đọc trên ảnh (leaders.top[i].fireant)
```

**Biến động thị trường (`flow`) là ảnh HEADLESS trang công khai FireAnt "Thống kê sàn"**
(<https://fireant.vn/thi-truong/thong-ke-san>, mục "Biến động theo sàn", tab HSX — không đăng nhập, không bao giờ dùng
Chrome của người dùng; người dùng 2026-10-05: 'Daily; old chart → weekly'): bánh số mã tăng/giảm/đứng giá và cột phân bổ
dòng tiền (tỷ đồng), số đọc từ chính option ECharts của hai chart (`js/fireant-flow.js`, công thức `rules.shots.fireantFlow`)
vào khối `flow` của pack. Từ 2026-10-05 tối (người dùng: "add the image of 'Tác động đến Index' on scene 02 - on beat 2")
ảnh là HAI THẺ chồng nhau, mỗi thẻ đúng 1,42 (`fireant-flow.png` 1664×2344): thẻ dòng tiền ở trên, thẻ "Top cổ phiếu tác
động" ở dưới (mã kéo / đẩy VN-Index bao nhiêu điểm, năm mã mỗi phía — đọc từ state React của component vẽ chart, nguồn
betarest `/symbols/contribute-to-index`; sidecar `js.impact`, pack `flow.impact`). FireAnt chỉ hiện phiên MỚI NHẤT (trong giờ giao dịch là số tạm): ảnh được nhận khi chỉ số ở ô Sàn
HSX bằng giá đóng cửa của phiên (±0,02) và giờ chụp nằm giữa lúc đóng cửa và phiên sau mở — lệch thì `flow.ok: false`,
scaffold bỏ scene và in `flow: dropped — <lý do>`, `review-fresh` FAIL nếu ảnh lệch phiên vẫn ở trong reel.

**Chart từng mã dẫn dắt là ảnh FireAnt nến ngày** (người dùng 2026-10-01: chart terminal có trendline phá vỡ "so
confused and annoy"), chụp trên tab VNINDEX (1D) của người dùng — `rules.shots.fireantStock.tab`, tab họ gắn MA 50
và MA 200 (một chỉ báo "MA Cross 50 200", người dùng 3/10: "open with same VNINDEX symbol to have MA50/MA200 configed
indicator"): mã được dán vào tab đó, chụp, rồi dán lại VNINDEX (`shoot.mjs --tab=VNINDEX --restore-symbol=VNINDEX`, mỗi
bước đọc lại ô mã bằng OCR; dán lại không ăn thì thử lại một lần với chờ lâu hơn — Return trước khi danh sách kết quả
tải xong là giữ mã cũ). Tab này có cả MACD: crop như ảnh VNINDEX, pane giá tới y 0,659 (khối lượng ở đáy pane). MA50/MA200 trên chart là CỦA FireAnt (người dùng:
"refer it not need self-calculation"): `fireant_ma.py` đọc giá trị trên legend và thẻ giá, đối chiếu với pixel của
đường qua hiệu chỉnh; không đọc được thì null — không bao giờ tự tính, không thay bằng EMA50 của terminal. FireAnt luôn
vẽ tới phiên MỚI NHẤT: chụp sau ngày của bản (bản 1/10 chụp ngày 3/10 có nến 2/10) thì hiệu chỉnh trên nến /analyze cộng
nến SSI các phiên sau, legend được đọc khi con trỏ đặt trên nến của bản (`--hover-back`; giá đóng cửa đọc ở đó phải bằng
của bản), và scene che các phiên sau, thẻ giá cuối và đường giá cuối chấm chấm (`maskAfterEdition`). Hiệu chỉnh che các
dòng legend nằm trong pane (chúng in số cùng màu nến) thay vì cắt pane — cắt là mất đỉnh của các nến mới nhất.

Mọi ảnh vào `public/shots/review/<ngày>/` (không bao giờ đè ảnh của Channel). Screener chụp headless sau
**cửa chặn request** của `shoot.mjs`: mọi non-GET tới zionle bị chặn trong trình duyệt, trừ
`--allow-post=/api/stocks/filter`; ảnh nào mà trang cố gọi API khác thì bị bỏ. `js/screener.js` bấm bộ lọc
đã lưu theo tên, sắp xếp giảm dần (VOL/SMA hoặc RS 1M), ẩn cột không nói tới, phóng chữ, và ghi toạ độ
từng dòng/ô vào sidecar. Chart có hiệu chỉnh (`calib_auto.py` → `calib_chart.py`) để mark rơi đúng nến —
số dư lớn là do mũi tên/trendline của terminal cùng màu nến; soát bằng khung hình, không bằng con số.

### Soi từng mã dẫn dắt — agent `symbol-reviewer`

Sau ảnh (và sau khi MA50/MA200 FireAnt đã đọc được), trước scaffold — người dùng 2026-10-01: "create and design an
agent to define the method to review each symbols". Phương pháp nằm ở
[`.claude/agents/symbol-reviewer.md`](../../agents/symbol-reviewer.md): bảng kiểm O'Neil/Minervini (giá so với
MA50/MA200 **của FireAnt** — không bao giờ tự tính MA —, đỉnh/đáy 52 tuần, RS, khối lượng so TB20, đỉnh 20 phiên),
và từ `symbol-reviewer/2` (người dùng 2026-10-03: "include the price action … trendline & resistance and each price must
be noted") PRICE ACTION đọc trước khi chọn thế giá: cấu trúc đỉnh/đáy dao động, kháng cự và hỗ trợ gần nhất, trendline đang
hiệu lực, cây nến cuối (`measure` → `priceAction`); MỘT thế giá → MỘT chi tiết, mark theo giá/ngày (2 beat, tối đa 5 mark
một beat: beat 1 cấu trúc — MA50/MA200, trendline, kháng cự, hỗ trợ; beat 2 read của nến cuối), MỌI nhãn mang giá của
nó, nhánh nếu … thì không gọi giá.

```bash
node scripts/review/lib/symbol-review.mjs measure <ngày> <MÃ>     # số + bảng kiểm + thế giá khớp của một mã
node scripts/review/lib/symbol-review.mjs <ngày>                  # soát mọi bản soi của ngày (0 lỗi)
node scripts/review/facts.mjs --format=<format>                   # CHẠY LẠI: pack mang leaders.top[i].review
```

1. Đạo diễn chạy `measure` cho từng mã trong `screener.leaders.top`. Hai mã có cùng thế giá đầu tiên (`classes[0]`)
   thì mã #1 (`top[0]`) giữ nó, mã kia được dặn tránh thế đó — hai scene không bao giờ cùng một chi tiết.
2. MỖI mã một agent, chạy SONG SONG trong một lượt: Agent tool, `subagent_type: "symbol-reviewer"`. Prompt: ngày, mã,
   format, thế giá phải tránh nếu có. Agent ghi `content/review/symbols/<ngày>/<MÃ>.json` + `.md` và tự soát tới 0 lỗi.
3. `facts.mjs` lần nữa: pack mang `screener.leaders.top[i].review` (thế giá, chi tiết, và ĐÚNG những số bản soi trích)
   để check `facts` của verify soi được nhãn. Bản soi lỗi thì bị bỏ (facts.mjs nói ra), scaffold dùng mark mặc định;
   scaffold cũng chỉ dùng mark của bản soi khi pack mang nó. Verify `review-symbols` (WARN) nhắc mã thiếu bản soi
   hoặc còn ô chờ.

Ô MA của bảng kiểm là "pending" khi `<mã>-fireant.ma.json` chưa có hay FireAnt không hiện MA trên tab của mã —
bản soi vẫn xong, không có mark MA, và `unsupported` nói lý do.

### Soi thêm mã người dùng chọn

Người dùng 2026-10-05: "With this skill, edit for me i can choosen and fill the symbol on the artifact to review beside existed
symbol on 3 filter". Trang duyệt có ô "Soi thêm mã": mã người dùng gõ được lưu trong db của artifact, doc `requests/<ngày>`
(`{edition, symbols, updatedAt}`). Mỗi lượt chạy (và khi người dùng nói "tiếp" sau khi thêm mã trên trang):

1. Đọc doc đó bằng ArtifactData (`get`, url của artifact DailyReview, path `requests/<ngày>`) và ghi
   `content/review/requests/<ngày>.json` = `{edition, symbols, source: "artifact db requests/<ngày>", readAt}`. Không có doc
   thì không có mã thêm. Tối đa `rules.screener.requested.max` (3) mã; mã đã là leader bị bỏ qua (đã có scene), mã không có
   trong universe của phiên bị báo và bỏ.
2. `node scripts/review/pull.mjs --symbols=<MÃ,…> --analyze-only` — chỉ GET `/api/analyze` cho các mã đó, cùng cửa chặn độ tươi.
3. `node scripts/review/facts.mjs --format=daily` → `screener.requested[]` (dòng universe, bộ lọc nó có, MA FireAnt, bản soi).
4. `node scripts/review/shots.mjs --format=daily --only=requested` — chart FireAnt từng mã như leader (Chrome thật, dặn người
   dùng đừng đụng chuột ~40 giây mỗi mã); Chrome bận thì `--only=requested-terminal` (headless).
5. Mỗi mã một agent `symbol-reviewer` (như leader, chạy song song), rồi `facts.mjs` lần nữa.
6. `scaffold.mjs --format=daily --force` — scene `pick` (id `rd-<ngày>-pick-<n>`) sau scene leader cuối; mã thiếu ảnh bị bỏ và
   in lý do. `--force` dựng lại MỌI scene: gộp lại thư mục người viết (`merge.mjs --from=…`) sau đó, và người viết viết thêm
   scene pick (writer.md, mục pick).
   Mã kéo chỉ số nhiều nhất hôm nay (`flow.impact.lead`, ≥ `screener.impact.minShare` %) mà reel đang soi: KHÔNG thêm scene
   (người dùng 2026-10-05: "combine into the VIC symbol review scene … warning the trader monitor the behavior of VIC, not compare
   it with the market VNIndex") — brief của chính scene soi mã đó đòi một câu cảnh báo cuối và số điểm ở headline beat 1.
7. `npm run verify -- DailyReview` (review-picks và review-symbols soi cả pick) → trang duyệt.
8. Đăng lại trang duyệt (cùng link, giữ `capabilities: {db: {}, user: {}}` — bỏ trống trường đó khi đăng lại là giữ nguyên), rồi ghi
   `done: [<MÃ đã có scene>]` vào doc `requests/<ngày>` (ArtifactData `update`, pin `if_version` của lần `get`): ô của mã trên trang
   chuyển từ "chờ soi" sang "đã có scene". Ô "Soi thêm mã" chỉ có trên reel của market-review (`scripts/review-page.mjs`).

## 4. Khung scene và khung hình nháp

```bash
node scripts/review/scaffold.mjs --format=daily      # -> content/review-daily.json + brief/review-daily.md
npm run review-page -- DailyReview --out=out/review/draft-daily
node scripts/frame-audit.mjs DailyReview --check   # mọi khung hình: nhãn bị cắt/chồng, mark ra khỏi khung, máy giật — phải 'no defects'
```

Scene theo `rules.formats.daily.roles` (người dùng yêu cầu tối ưu giữ người xem 2026-09-29, theo arc
hook_payoff + đếm ngược của vox-director): hook (ngày, điểm số, câu hỏi "Tiền chảy vào đâu?", lời mời — KHÔNG đọc số mã
tăng/giảm khi scene 02 là ảnh FireAnt, người dùng 2026-10-05) → flow (SCENE 02, ngay sau hook — người dùng 2026-10-05: 'Daily;
old chart → weekly', rồi 'move it into the scene 02': ảnh FireAnt "Biến động thị trường" của phiên trả lời câu hỏi của hook,
beat 1 thẻ dòng tiền — biểu đồ tròn số mã tăng/giảm/đứng giá (đọc số mã thành chữ) và cột phân bổ dòng tiền cùng lúc —,
beat 2 máy lia xuống thẻ "Top cổ phiếu tác động" — mã kéo / đẩy chỉ số bao nhiêu điểm, khoanh mã dẫn đầu —, kết bằng câu dẫn sang
market; ảnh lệch phiên thì scene bị bỏ và hook đọc lại số mã) → market (bối cảnh, đồng hồ, trao lời cho các bộ lọc — câu
"Bộ lọc hôm nay bắt được gì?" mở spike khi market chạm trần chữ) → spike (bảng `movers` CẢ bộ lọc: cột tăng và cột giảm, mỗi cột tối đa 10 mã theo % thay đổi — tăng mạnh nhất / giảm sâu nhất trên đầu, khối lượng in là % so với SMA20 "KL +92%" (người dùng tối 2026-10-01), chỉ kể bảng của nó) → rs (bảng vẽ RS Strong: tối đa 10 mã
theo RS 1M giảm dần, MỘT cột, MỘT MÌNH; beat 2 tô và tạo hiệu ứng cho mã sẽ soi ngay sau — `focus`) → uptrend (bảng vẽ Uptrend
y như rs, kết bằng lời mời gọi tên mã sẽ soi) →
leader #2 → #1 (TỐI ĐA HAI mã, người dùng chốt 2026-10-01: mã có mặt ở cả ba bộ lọc trước, không đủ thì mã ở cả RS Strong
lẫn Uptrend, trong một tầng xếp theo RS 1M — `rules.screener.leaders.from` là danh sách tầng; **#1 là RS 1M cao nhất và
chiếu sau cùng** (sửa 2026-09-30; bản 29/9 đánh số ngược, không lộ vì ba mã cùng 94), mỗi mã một chi tiết riêng) → watch ("Kịch bản VN-Index", payoff — người dùng 2026-10-05: beat 1 kịch bản tích cực, beat 2 kịch bản tiêu cực, mốc từ price action của chính chỉ số và MA50/MA200 FireAnt — `scenario` của fact pack — cộng các mốc luật; máy đứng yên ở beat 2) → outro — 10 scene, ~80 giây. Đường độ rộng cũ (% mã trên SMA200)
chỉ còn ở bản tuần, skill [`weekly-review`](../weekly-review/SKILL.md), cùng với scene `week` sau hook. Người dùng tách RS Strong và
Uptrend thành hai scene 2026-09-30 ("not union it first"): mỗi scene bảng là MỘT bộ lọc đã lưu (`rules.screener.scenes`),
giao của hai bộ lọc chỉ còn là nguồn của đếm ngược, không phải một scene — và không lên lời: không scene nào nói mã của
bộ lọc này có ở bộ lọc khác (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other
filter"; verify `review-overlap` FAIL).
Id mang ngày (`rd-260929-hook`) để file giọng mỗi bản tách nhau. Bản trước được chép vào
`content/review/archive/` trước khi bị thay. Mark đặt từ số: vline trên từng phiên phân phối, vòng trên nến
FTD, hline ở đáy nhịp hồi, hộp trên ba dòng được chọn và trên ô VOL/SMA / RS 1M, hline EMA50 và mũi tên ở
nến cuối của từng mã. **Nhìn khung hình từng beat** rồi mới cho người viết: nhãn chồng nhau hay rơi khỏi
khung thì sửa ở `scaffold.mjs` (không sửa JSON tay — bản sau sẽ đè).

`DailyReview` đã đăng ký trong `src/Root.tsx`. `WeeklyReview` được đăng ký ở lần scaffold đầu tiên của bản tuần
(skill weekly-review §5) — file phải có trước khi đăng ký, thiếu file là verify của MỌI reel báo `registration` FAIL.

## 5. Một người viết cho cả reel

Một agent, prompt = [writer.md](writer.md) + tên reel + thư mục ghi (`.review-cache/writer/<ngày>-<format>/`)
+ **ghi chú giọng của đạo diễn** (kết luận của phiên, số nào là nhân vật chính, scene nào dài). Agent ghi
`<id>.json` từng scene + `_script.md`. Đọc `_script.md` thành tiếng trước khi merge; nghe như bản tin thì
trả lại kèm ghi chú. Rồi soi `_script.md` bằng `/humanizer` (`.claude/skills/humanizer/SKILL.md`, 26 mẫu dấu
vết AI — dùng các mẫu không phụ thuộc ngôn ngữ; số liệu và câu người dùng đã chốt giữ nguyên) trước khi merge.

```bash
node scripts/merge.mjs content/review-daily.json --from=.review-cache/writer/<ngày>-daily
```

## 6. Chấm điểm

```bash
npm run verify -- DailyReview
```

Verify dùng luật của reel (`rules.json`) và cộng các check của skill (`scripts/review/checks.mjs`):
`review-fresh` (cache và mọi ảnh thuộc phiên, sau 15:00), `review-state` (trạng thái, FTD, số phiên phân
phối trên màn hình khớp máy trạng thái), `review-picks` (mã trên màn hình là mã được chọn, ảnh đúng mã; bảng rs/uptrend
tô đúng mã sẽ soi), `review-overlap` (không câu nào nói mã có ở bộ lọc khác, người dùng 2026-10-05), `review-outro`, `review-index` (cảnh báo khi chart chỉ số là của terminal chứ không phải FireAnt). `roles`
FAIL khi scene `market` thiếu "nếu". Tối đa 4 vòng sửa; còn FAIL thì hỏi người dùng.

## 7. Trang duyệt — điểm dừng duy nhất

Viết `out/review/review-daily/notes.json` (kết luận: trạng thái, tiền đề nào số đỡ, verify còn gì), rồi:

```bash
npm run review-page -- DailyReview
```

Đăng bằng tool Artifact (`file_path=out/review/review-daily/index.html`, `root`, `files` từ `files.json`,
icon `chart`). Bản phiên có MỘT link (bản tuần có link riêng, skill weekly-review): bản sau đăng lại cùng file (hoặc kèm `url` cũ). Trả lời ngắn: trạng
thái theo quy tắc, verify còn WARN gì, `unsupported`, ảnh chỉ số là FireAnt hay terminal, và lựa chọn duyệt ·
sửa · bỏ. Không lồng tiếng khi chưa có câu trả lời.

## 8. Sau khi duyệt

```bash
npm run approve -- DailyReview
node scripts/voiceover.mjs --content=content/review-daily.json --retime
npx tsc --noEmit && node scripts/render.mjs --id=DailyReview --out=out/review/daily-<ngày>.mp4
```

Id có ngày nên không cần `--force` cho bản mới; sửa lời một scene thì `--force --only=<id>` như market-video.
Soát sau render như market-video §5 (Whisper cho FTD và các MÃ đánh vần qua `voice.letters` + `voice.letterJoin` — người dùng 2026-10-01: lời gọi mã, không tên công ty, đọc liền một cụm, không rời từng chữ; `tts_takes.py` đã chọn lượt đủ chữ, không ngắt giữa mã; nghe lệch thì đổi cách đọc trong `rules.json`,
khoảng lặng, khung hai bên mốc beat). Không lồng tiếng hai reel cùng lúc (chung `.tts-cache`).

## 9. Những điều đã đo — đừng đo lại

- Cache Screener 29/9/2026: 12:00 (giữa phiên) rồi 15:04 (sau đóng cửa), 1466 mã.
- `volume_vs_sma` tính theo % (VOL/SMA hiện `+144.1%`): bộ lọc "Volume spike" (`> 1.2`) bắt cả mã chỉ trên
  trung bình 20 phiên hơn 1,2% — ba mã chọn lên reel là ba mã mạnh nhất. Giao diện ghi "Vol x SMA > 1.2"
  như bội số; đó là cấu hình của người dùng, skill không sửa.
- Trang /analyze và /screener tự `POST /api/stocks/filter` khi mở; /analyze vẫn vẽ chart đủ khi bị chặn, và
  trang nào cũng gửi beacon `POST /cdn-cgi/rum` (chặn, vô hại).
- `/analyze` với `1W`/`1M`/`4H` trả 500 — nến tuần gộp từ SSI.
- Ba mã hoà RS 1M 94 (BSR, MSR, PVT ngày 29/9): thứ tự trong ảnh có thể khác, và khi hoà điểm vắt qua hàng 3 (RS Strong
  29/9: AAS 95, PVP 95, rồi BSR/MSR/PVT cùng 94) một mã được chọn có thể nằm ở hàng 4–5 — `lib/screener-rows.mjs`
  (shots.mjs và check `review-picks`) chấp nhận miễn không có dòng LẠ điểm cao hơn đứng trên mã được chọn.
- Từ 2026-09-30: `rules.screener.scenes` có `rs` và `uptrend` (mỗi scene MỘT bộ lọc), `rules.screener.leaders.from`
  = `["rs","uptrend"]` là nguồn đếm ngược. Đổi luật xếp hạng cho phiên đã qua: `node scripts/review/pull.mjs --rebuild`
  (không mạng, xếp lại từ universe đã cache) rồi `facts.mjs`; terminal không có lịch sử nên ảnh bảng của phiên cũ không
  chụp lại được.
- Chart terminal: pane giá là y 0–0,54, trục giá từ x 0,956 (thẻ giá trendline cùng màu nến) — crop bỏ trục.
- FireAnt 29/9: "no new Chrome app window … appeared" = màn hình NGỦ, không phải Chrome hỏng (người dùng nhìn
  thấy màn hình sáng — đó là màn khoá/hình nền). Space đánh thức, chụp ngay được.
- Nút khung thời gian của FireAnt tự chọn cỡ nến và bấm interval sau đó GIỮ SỐ NẾN: `3p` rồi `D` ra 15 tháng nến
  ngày, `6p` một mình ra nến 2 giờ (và để lại tab của người dùng ở 2h — lượt sau bấm D trả về 1D). Công thức
  đúng: `--interval=D --reset-view` → ~6,5 tháng nến ngày, nến cuối sát mép phải; hiệu chỉnh 142 nến, trung vị 0,54 px.
- Scene 1 (hook) là ảnh FireAnt có GHIM (người dùng yêu cầu 29/9): beat 1 vòng quanh nến FTD, beat 2 vline
  các phiên phân phối + vòng vàng nến hôm nay; câu ghim beat 2 nói "… có ba phiên phân phối".
- **Khối lượng SSI của PHIÊN HÔM NAY là số tạm** (đo 2026-10-01): nến 30/9 kéo lúc 15:20 ngày 30/9 ghi 358,8M, hôm sau
  thành 504,6M (×1,16 so với 29/9) — phiên 30/9 từ "không phải phân phối" thành phiên phân phối thứ tư, trạng thái đổi
  sang chịu áp lực; nến 1/10 lúc 15:47 vẫn 260,3M trong khi thẻ khối lượng của FireAnt ghi 449,376M và Entrade (tổng,
  gồm thoả thuận) 629,6M. Nến cùng ngày của terminal (`/api/analyze/VNINDEX`) là bar LIVE kiểu Entrade (open/low trùng
  Entrade, 590,1M) nên không so được với lịch sử khớp lệnh của chính nó; nến ngày cũ của terminal thì trùng SSI chốt.
  Vì vậy: kết luận phân phối của phiên hôm nay phải đối chiếu cùng-cơ-sở (FireAnt khớp lệnh hôm nay vs SSI chốt hôm qua,
  hoặc Entrade tổng vs Entrade tổng), `session.volumeRatio` của pack KHÔNG lên màn hình, lời chỉ nói "khối lượng thấp/cao
  hơn phiên trước" khi hai cơ sở cùng nói vậy, và trước `approve` chạy lại `pull.mjs` + `facts.mjs` để lấy số chốt.
