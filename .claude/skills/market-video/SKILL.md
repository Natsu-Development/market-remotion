---
description: Làm một reel dọc về thị trường/chứng khoán bằng Remotion, từ MỘT HAI DÒNG chủ đề của người dùng — bạn tự viết brief từ fact pack, sinh khung scene, worker viết lời, chấm điểm bằng script, đăng TRANG DUYỆT (artifact có khung hình từng scene, lời đọc, unsupported) cho người dùng duyệt, rồi mới lồng tiếng và render. Dùng khi người dùng muốn một video mới về VNINDEX, một mã cổ phiếu, hay một chỉ báo kỹ thuật (RSI, MACD, kênh giá, phân kỳ, thanh khoản). Không dùng cho bản tổng kết phiên/tuần (phiên phân phối, FTD, bộ lọc terminal) — đó là skill market-review.
argument-hint: "<chủ đề | mã | brief/*.md | --id=<Composition>> [--retime] [--no-voice]"
allowed-tools: Read, Write, Edit, Artifact, Bash(node *), Bash(npm run *), Bash(npx remotion *), Bash(npx tsc *), Bash(../video-factory/.venv/bin/python *), Bash(ffmpeg *), Bash(ffprobe *), Bash(ps *), Bash(ls *), Bash(cat *), Bash(open *), Bash(curl -sL https://zionle.io.vn/*)
---

Làm một reel thị trường về: `$1`

Đây là skill làm reel theo CHỦ ĐỀ — từ một hai dòng chủ đề đến `out/*.mp4`. Bản tổng kết phiên/tuần là skill riêng
`market-review` (luật riêng, không đọc `content-rules.json` của skill này). Đường đi là
**một hai dòng → BẠN viết brief từ số thật → scaffold + fact pack → worker viết lời → CHẤM ĐIỂM →
NGƯỜI DUYỆT → rồi mới toả ra lồng tiếng và render**.

Người dùng chốt 2026-09-22: họ KHÔNG viết brief. Họ gõ một hai dòng ("MACD tháng ở đỉnh lịch sử
nhưng histogram thu hẹp") và muốn nhận lại bảng scene + lời đọc để duyệt. Từ dòng đó tới mục 2c bạn
chạy liền một mạch, không dừng hỏi. Điểm dừng DUY NHẤT trước khi tốn tiền là **trang duyệt** ở 2c —
`npm run review-page` sinh một trang có khung hình từng scene, bạn đăng nó bằng tool Artifact và đưa link
(người dùng chốt 2026-09-23: duyệt scene và hook trên artifact, trước khi render).

`npm run verify` (mục 2b) là cửa chặn thật, có script gác, chạy trong một giây và KHÔNG cần
audio. Bạn soạn, script chấm. Không được đi tiếp khi nó còn `FAIL`, và không được nới
`src/shared/content-rules.json` để cho qua — đổi một con số trong đó là quyết định của người
dùng, không phải của bạn. Mục 5 là phần bốn thứ script chưa gác được, làm bằng tay sau khi render.

Python cho TTS nằm ở repo bên cạnh: `../video-factory/.venv/bin/python` (torch + omnivoice, ~4GB,
không nhân bản). `scripts/voiceover.mjs` tự tìm đường đó. Repo này KHÔNG chạy độc lập được —
thiếu video-factory thì worker rơi về `python3` hệ thống và chết ở `import`.

Danh mục panel, toàn bộ trường của content JSON và đặc tả API zionle nằm ở
[reference.md](reference.md). Đọc nó trước khi viết scene mới.

## 0. Trước khi chạy

1. Xem có job render nào đang chạy không: `ps -Ao command | grep "[r]emotion render"`. Có thì
   dừng, đợi. Hai lượt render chồng nhau tranh CPU và cả hai cùng chậm.
2. Chốt **điểm vào** từ `$1`:

   | `$1` là | Làm gì | Bắt đầu từ |
   |---|---|---|
   | một hai dòng chủ đề ("MACD tháng ở đỉnh nhưng histogram thu hẹp") | reel mới — BẠN viết brief | mục 1 rồi 1a |
   | một mã ("FPT", "HPG") | kéo số của mã đó rồi làm như trên | mục 1 rồi 1a |
   | `brief/<tên>.md` người dùng viết tay | bỏ qua 1a | mục 1b |
   | `--id=<Composition>` đã có trong `src/Root.tsx` | sửa reel cũ | mục 2 |

3. Chốt **giọng**: mặc định `omnivoice` (nhân bản từ clip trong `assets/voices/`). Chỉ dùng
   `--engine=say` khi máy không có venv — nghe rõ là giọng máy, đừng giao bản đó cho người dùng
   mà không nói trước.


## 1. Lấy số và bối cảnh — từ HAI trang, trước khi viết lời

Không viết một câu nào trước khi có số thật. Kịch bản phải mọc ra từ dữ liệu, không phải ngược lại.
Người dùng chốt 2026-09-22: **scene về nến và chart là ẢNH CHỤP từ hai trang của họ, không phải
chart Remotion vẽ lại.** Với mỗi reel, bạn đi cả hai trang cho đúng mã đang nói:

1. **VN Trading Terminal (zionle.io.vn)** — số và insight có cấu trúc. Kéo phân tích của trang
   (phân kỳ, trendline, tín hiệu) rồi CHỤP trang /analyze của mã:
   ```bash
   node scripts/fetch-market.mjs --symbol=VNINDEX --resample=none --signals      # -> content/vnindex-daily.json + vnindex-analysis.json
   node scripts/shoot.mjs --site=zionle --page=analyze --symbol=VNINDEX --viewport=1800x1000 --clip=canvases \
     --out=public/shots/vnindex-terminal.png
   ```
   `enrich` gộp file analysis vào fact pack thành `terminal.*` (số phân kỳ theo chiều, trendline kèm
   điểm neo = đỉnh/đáy của trang, mọi tín hiệu) và file daily thành `daily.*` (nến ngày THẬT: phiên
   cuối, biên năm, vị trí trong biên, thanh khoản theo tháng) — đó là insight worker được trích.
   Chuyện 12 tháng gần đây thì trích `daily.*` (nến ngày thật của terminal); chuyện nhiều năm trích
   `series`/`peaks`/`rsi`/`macd` — từ 2026-09-23 chuỗi tháng cũng là dữ liệu THẬT (SSI iBoard, xem
   `facts.source`), không còn là bản dựng lại. Brief đặt `ticker: daily` để dòng ticker in phiên
   thật; không có dòng nguồn dưới headline (người dùng bỏ 2026-09-29), `footer:` trong brief mới hiện lại. Phiên đang giao dịch (fetch trước 15:00 ICT)
   bị loại khỏi `daily` — xem `daily.droppedIntraday`.
   Script KHÔNG ghi đè `content/vnindex-monthly.json` nếu không có `--replace-series` (đã xảy ra
   2026-09-23: `--resample=none` mặc định ghi vào đó; khôi phục bằng `node scripts/make-series.mjs`).
2. **FireAnt (fireant.vn/charts)** — chart NGÀY nhiều năm trong Chrome THẬT của họ, đúng layout và
   chỉ báo họ đã lưu. Chọn khung nhìn theo luận điểm: `--range=5y` cho chuyện dài hạn, `1y`/`6p`
   cho nhịp gần:
   ```bash
   node scripts/shoot.mjs --site=fireant --symbol=VNINDEX --range=5y --out=public/shots/vnindex-fireant-5y.png
   ```
   Đừng đụng chuột ~25s. Đọc ảnh xong rồi mới viết brief: mắt bạn là bước "hiểu bối cảnh".
3. **Không vẽ lại chart.** FireAnt đã có nến, RSI, MACD, MA ở mọi khung với đúng tham số người dùng
   lưu, trên dữ liệu sàn thật. Các panel vẽ của Remotion (`candles`/`macd`/`rsi`/`bars`/`pictogram`/
   `list`/`cards`/`zigzag`/`riskReward`) đã bị XOÁ 2026-10-06 — người dùng: "remove the drawn scene since
   already have the picture and indicator of fireant". SỐ SUY RA (tần suất RSI trên 70, drawdown từng đỉnh,
   checklist, cảnh báo) đi vào mark trên ảnh chart và headline, không vào panel riêng.
   Khung tháng dài: `--interval=M --zoom-out=6` bấm nút interval người dùng đã ghim rồi lăn chuột
   kéo lịch sử ra (đo 2026-09-23: thấy từ ~2001). Script bấm theo thứ tự mã → range → interval →
   pan → zoom (`shoot_real.py`), thứ tự cờ trên dòng lệnh không đổi gì: nút range đặt lại cả độ
   phân giải (5y → 1W) nên interval phải bấm sau nó, và pan trước zoom để nến cuối về gần mép phải.
4. **Số phải cùng ngày với ảnh.** Làm mới chuỗi tháng thật trước mỗi reel để fact pack, ticker và
   ảnh FireAnt cùng một ngày, và ghi `facts.source.fetchedAt` vào ghi chú của trang duyệt (`notes.json`, mục 2c):
   ```bash
   node scripts/fetch-market.mjs --symbol=VNINDEX --source=ssi --replace-series   # content/vnindex-monthly.json + .meta.json
   ```
   Bốn reel sinh trước 2026-09-23 từ bản dựng lại cũ (`rsi`, `macd`, `liquidity`, `vnindex`) đã bị xoá
   2026-09-29; `channel` viết theo chuỗi SSI (đỉnh 2022 = high 1536, không phải 1528) là reel duy nhất còn.

Cách gọi API, giới hạn feed và đơn vị giá:

```bash
# nguồn chính: VN Trading Terminal của người dùng
node scripts/fetch-market.mjs --probe --symbol=VNINDEX          # xem response trước
node scripts/fetch-market.mjs --symbol=HPG --resample=none --signals
```

**Feed này là feed NGÀY, khoảng một năm** (254 dòng, `start_date` bị bỏ qua). Nó KHÔNG thay được
`content/vnindex-monthly.json` — chuỗi tháng 13 năm mà fact pack và ticker đọc; chuỗi đó lấy từ
SSI iBoard bằng `--source=ssi --replace-series` (mục 1.4). Giá từ terminal về đơn vị nghìn đồng
nên chỉ số bị chia 1000 — `--scale=auto` nhân lại; SSI/Entrade trả điểm sẵn. Chi tiết ở
[reference.md](reference.md) mục 4.

**Trang đã tự tìm phân kỳ, trendline và tín hiệu.** `--signals` lưu vào
`content/<mã>-analysis.json`. Dùng kết quả của trang thay vì tự tính lại — video mà lệch với
chính trang nguồn là hỏng niềm tin.

**Mọi endpoint TRẢ dữ liệu thị trường đều cần `config_id`** (trừ `GET /stocks/cache-info`). Nó
nằm trong localStorage của trình duyệt ở key `trading-app_config-id`. Đặt vào `.zionle-config`
hoặc `$ZIONLE_CONFIG_ID`. Script KHÔNG bao giờ POST — nó không tự tạo config trên dịch vụ của
người dùng. Thiếu id trả `400 config_id is required`; id sai hoặc đã hết hạn trả
`404 configuration not found` — hai lỗi khác nhau, đừng chữa nhầm.

`scripts/make-series.mjs` là bản DỰNG LẠI cũ, chỉ để chạy offline: meta của nó ghi
`reconstructed: true`, footer sẽ không nêu nguồn, và `facts.source.reconstructed` là `true`. Đừng
render bản công khai từ nó — nó đặt đỉnh 1933 vào 2026-08 trong khi đỉnh thật rơi vào 2026-05.

Không tự tính chỉ báo bằng tay nữa — mục 1b sinh ra `content/<tên>.facts.json` với RSI, MACD,
drawdown, thanh khoản, thống kê theo năm, tất cả đã tính sẵn. Đó mới là thứ worker được phép
trích.

Cửa chặn: mọi con số hiện trên headline hay nhãn chart phải truy được về fact pack. Check
`facts` trong `npm run verify` đối chiếu từng con số với `content/<tên>.facts.json` ở ĐÚNG độ
chính xác đang hiển thị. Nhưng lời đọc thì viết số bằng chữ nên script không soi được — đó là
việc của người duyệt ở mục 2c.

## 1d. Ảnh vào scene — panel `image` là mặc định cho nến và chart

Hai ảnh của mục 1 đi vào brief bằng dòng `src:` trong scene (enrich đọc và điền `visual`), không
sửa JSON tay:

```md
## hook · image
src: public/shots/vnindex-fireant-5y.png
source: fireant.vn
Mở bằng chart 5 năm: ba lần chạm biên trên, lần này histogram mỏng hơn.

## evidence · image
src: public/shots/vnindex-terminal.png
source: zionle.io.vn
Terminal đánh dấu hai phân kỳ dương gần nhất; kể đúng con số trong terminal.divergences.
```

Quy tắc: chụp TRƯỚC khi viết brief và toả worker; worker chỉ viết `caption` (mono, ≤ 76 ký tự) và
KHÔNG bịa số từ ảnh — số trên headline và trong lời vẫn truy về fact pack (`terminal.*` cho phân
kỳ/tín hiệu, phần còn lại cho giá/RSI/MACD tháng). `verify` từ chối ảnh thiếu sidecar `.json`.
**Scene nào nói về xu hướng giá thì panel là ảnh chart có mark** (người dùng chốt 2026-09-23) — không
list, không thẻ, không hai cột cho chuyện giá đi đâu. Mark là `visual.annotations`: `hline` cho mức
kháng cự/hỗ trợ/giá hiện tại, `line` (from/to) cho trendline và hai biên của kênh giá
song song — biên kênh luôn nét liền, kể cả đoạn kéo dài qua điểm chạm cuối (người dùng 2026-09-29: nét đứt
trông như hai đường khác nhau), `box` cho pha tích luỹ/phá vỡ, `circle` cho đỉnh đáy, `arrow` cho
chuỗi đỉnh thấp dần, `vline` cho một mốc ngày — toạ độ phần 0..1 của ẢNH, `beat` là beat nó hiện, do
ĐẠO DIỄN đặt sau khi nhìn ảnh. Toạ độ y của một mức giá tính từ trục giá trong ảnh (ví dụ ảnh
terminal 1356×760 chụp 2026-09-23: `y = (31,5 + (1,95 − p/1000)/0,45 × 446)/760`); đặt xong render
still soát mắt. Mọi scene ảnh đều chuyển động sẵn: quét mở màn, đẩy zoom nhẹ với mark dính theo, mark
tự vẽ nét khi tới beat. **Từ 2026-09-28 (người dùng yêu cầu làm theo vox-director) mỗi beat của scene
ảnh là một khung máy — `visual.shots`**: wide định hướng rồi cận vào đúng chi tiết câu đang gọi tên,
đổi khung mỗi 3–5 giây, hai khung liền nhau không cùng `move`, `static` chỉ cho payoff (check `camera`
của verify cảnh báo khi phạm). Scaffold ghi `_camera` — máy quay mặc định của vai, một `move` mỗi beat —
làm điểm xuất phát. Đạo diễn đặt `shots` cùng lúc với mark, sau khi nhìn ảnh, rồi render thử (`review-page <Id> --out=<thư mục nháp>` —
reel phải đã đăng ký ở `REELS`, cuối mục 1b) soát
từng khung trước khi toả người viết — cận cảnh phóng luôn giao diện FireAnt, đo ở reference.md mục 1. Lời đọc gọi tên đúng mark theo thứ tự beat — người xem nhìn đường kẻ hiện ra
trong lúc nghe. Chữ trên nhãn truy về fact pack. Nếu ảnh FireAnt hiện "Đăng nhập" thì người dùng đã đăng xuất
FireAnt trong Chrome — nói với họ, đừng tự đăng nhập. Lệnh, chế độ và những điều đã đo:
[reference.md](reference.md) mục 7.

**Thanh khoản và động lượng cũng là ảnh FireAnt** (người dùng chốt 2026-09-23, scene 4
của `channel`): chụp khung TUẦN một năm có pane khối lượng và MACD —
`--interval=W --range=1y --indicator=MACD --crop=chart` — rồi `box` quanh cụm cột khối lượng của tháng
đỉnh và tháng hiện tại (nhãn mang số từ `daily.volume`), `hline` ở đường 0 của MACD và `box` quanh
histogram đang thu hẹp. Số MACD tuần KHÔNG có trong pack (pack chỉ có MACD tháng) nên lời tả hình, không
đọc số, và worker ghi vào `unsupported`. `--indicator` thêm chỉ báo qua hộp "fx" của FireAnt và FireAnt
LƯU nó vào layout của người dùng — chỉ dùng khi scene cần đúng chỉ báo đó, không bao giờ gỡ chỉ báo của
họ. Nhãn `hline` mặc định nằm bên phải; khi mép phải ảnh có dải giá trị (badge MACD, trục giá) đặt
`labelSide: "left"` để không chồng chữ. **Người dùng chốt 2026-09-28: scene có số là chart** — kể cả số
suy ra (tỉ lệ lời/lỗ, danh sách việc có mức giá): vẽ thành mark trên ảnh chart (mũi tên +7% / −34%, nhãn
"Vượt 1933 yếu → không mua đuổi" nằm trên đường 1933) — các panel `riskReward`/`bars`/`list` đã bị xoá (2026-10-06).

**Khung ảnh và nhãn (2026-09-28).** Panel ảnh là `LAYOUT.imagePanel` (1000×752, ảnh 1000×704 — tỉ lệ
1,42), to hơn panel thường để chart lấp khung dọc. Mỗi ảnh đặt `crop` (phần của ảnh, tỉ lệ 1,42) để bỏ
giao diện trang nguồn; `masks` + `maskColor` (nền FireAnt `#161921`) che chữ giao diện còn nằm trên chart;
mark và `shots` vẫn theo toạ độ toàn ảnh nên không phải đo lại. Nhãn vẽ trên nền tối riêng — đặt vào vùng
trống (mức giá cao: bên trái, nơi nến cũ thấp), đừng đặt lên nến mới nhất. `until` cho mark tắt sau beat
của nó để beat sau có chỗ. Ví dụ đo sẵn: `content/channel.json` v4.

**Kênh giá song song trên khung tháng là ảnh FireAnt `--interval=M` + hai `line`** (người dùng yêu cầu
2026-09-23, reel `channel` v3): biên trên qua đỉnh `peaks[0]`/`peaks[1]`, biên dưới qua hai đáy cuối —
mọi mức (`atLatest`, `laterPeaks[].line`, `projection[]`, `positionPercent`, `fallToLowerPercent`,
`riseToUpperPercent`) đã có ở fact pack `channel.*`; chu kỳ và "nếu lặp lại" ở `cycle.*`
(`peakSpacing`, `falls`, `ifRepeat[].fromAth`). Toạ độ: đo lưới năm và lưới giá trên ảnh bằng PIL
(venv video-factory) rồi kiểm với bóng nến của các đỉnh/đáy đã ghim — sai một pixel là đường lệch khỏi
đỉnh. Nhãn đặt vào chỗ trống: mép trên ảnh là chú giải của FireAnt, mép phải là nến 2024–2026 — dùng
`label` riêng thay nhãn của `hline`/`box` khi hai nhãn cùng hàng. Script bấm `--range` TRƯỚC
`--interval` (mục 1.3), và sau khi đổi interval phải `--pan` để nến cuối về mép phải (reference.md mục 7).

## 1a. Từ một hai dòng → brief — BẠN là đạo diễn

Người dùng không viết brief. Bạn viết, từ số thật, rồi đi tiếp không hỏi.

1. **Đọc số trước khi nghĩ scene.** Fact pack không cần brief để sinh:
   ```bash
   node scripts/enrich.mjs --facts-only --name=<tên>
   cat content/<tên>.facts.json
   ```
   `<tên>` viết thường, một từ (`macd`, `liquidity`) — nó quyết định mọi tên file phía sau.
2. **Soi tiền đề của người dùng bằng fact pack.** "Histogram thu hẹp" chỉ được viết khi
   `macd.histogramFallingMonths` nói vậy; "đỉnh lịch sử" chỉ khi `macd.max.month` là tháng gần đây.
   Tiền đề không được số đỡ thì brief kể theo số thật, và bạn ghi lại để nói ở trang duyệt (`notes.json`, mục 2c) —
   không đổi số cho vừa lời. (Đã vấp với `liquidity`: tiền đề "cạn dần", số nói +8,5%.)
3. **Chọn arc và nhịp theo vox-director** (`references/beat-layer.md` của github.com/Alisa0808/vox-director,
   người dùng chốt 2026-09-28): một arc trong thư viện (`hook_payoff`, `timeline`, `myth_buster`, `pas`…)
   ghi ở đầu brief; hook ≤ 3 giây — câu đầu ≤ 10 chữ, headline beat đầu đã mang lời hứa, không dựng bối
   cảnh trước; mỗi beat một khung, đổi khung 3–5 giây. Đừng ép `loop_close` vào outro: người dùng bác
   câu vọng lại hook ở outro `channel` ("Vì lần chạm này vẫn chưa xong", 2026-09-28) — outro là lời kêu
   gọi thả tim · chia sẻ · theo dõi theo khuôn ở mục "Outro" của
   [prompts/scene-writer.md](../../../prompts/scene-writer.md). Ngân sách chữ từng scene là quyết định
   của đạo diễn — ghi vào `_words` sau enrich nếu khác mặc định theo vai. Ví dụ đã chạy:
   `brief/channel.md` v4.
4. **Viết `brief/<tên>.md`** theo khuôn ở 1b: `arc.minScenes`–`arc.maxScenes` scene, tổng thời lượng
   trong `arc.totalSecondsWarn`, đầu `hook`, cuối `outro` (check `roles` FAIL nếu sai), act không đi
   ngược. Vai lấy trong `arc.roles` ([reference.md](reference.md) mục 6 — việc, act mặc định, nhịp, máy
   quay của từng vai). Reel phân tích chart: các lần lịch sử là `chapter` (ít nhất hai, liền nhau, cùng
   khuôn), kịch bản "nếu … thì" là `scenario` (lời phải nói ra là kịch bản — `mustSay`, FAIL nếu thiếu),
   mức phải canh là `levels`. Màu mặc định của vai sai nghĩa (kịch bản tăng giá mang màu cảnh báo) thì
   scene đặt `act:` riêng. Mỗi scene một hai dòng ý đồ KÈM con số
   định dùng — worker đọc chính dòng này qua `_brief`, càng cụ thể càng ít bịa. Panel là `image`
   (ảnh FireAnt/terminal có mark) hoặc `outro`; các panel vẽ đã bị xoá 2026-10-06.
5. **Không đưa brief cho người dùng đọc.** Họ duyệt ở 2c, khi đã có lời và headline. Sang 1b.

Ví dụ đã chạy: `brief/channel.md` v4.

## 1b. Enrich — brief thành khung scene + fact pack

Không ai gõ content JSON tay. Đầu vào là `brief/<tên>.md` — thường là bản bạn vừa viết ở 1a; người
dùng cũng có thể viết tay khi muốn kiểm soát từng scene. Mỗi scene một H2 `## <vai> · <panel>` rồi
một hai dòng ý đồ.

```md
title: VNINDEX · thanh khoản cạn dần
name: liquidity
symbol: VNINDEX

## hook · image
src: public/shots/vnindex-fireant-1y.png
source: fireant.vn
Giá vẫn sát đỉnh kênh nhưng thanh khoản đã mỏng đi rõ rệt.

## levels · image
src: public/shots/vnindex-terminal.png
source: zionle.io.vn
Hai mức phải canh: kháng cự đỉnh năm phía trên, hỗ trợ gần nhất phía dưới; nhãn gắn đúng mức giá.

## outro · outro
Thả tim · chia sẻ · theo dõi, hứa cập nhật khi thị trường đổi nhịp. Không số, không thuật ngữ.
```

`vai` là một khoá của `arc.roles` (content-rules; bảng in bằng lệnh ở [reference.md](reference.md) mục 6),
`panel` lấy trong mười một loại ở reference.md mục 1. Dòng `act:` trong scene đặt màu nền riêng cho scene
đó. Vai, act và panel sai thì enrich thoát mã `2` trước khi ghi file nào.

```bash
npm run enrich -- brief/liquidity.md
```

Sinh ra HAI file:

| File | Là gì |
|---|---|
| `content/<tên>.json` | khung scene: id, act, panel, duration ước lượng. Lời và headline để `TODO`. `status: scaffolded` |
| `content/<tên>.facts.json` | **mọi con số worker được phép trích** — giá, RSI, MACD, drawdown, thanh khoản, theo năm |

Tách đôi như vậy là có lý do: script không viết được tiếng Việt, còn worker thì KHÔNG ĐƯỢC
bịa số. Cái gì suy ra được từ dữ liệu thì suy ở đây, worker chỉ còn việc viết chữ.

`id` scene sinh ra là `<tên>-<vai>` (thêm số thứ tự khi một vai xuất hiện hai lần). Prefix tên reel
là cố ý: `public/voiceover/` dùng chung, file là `NN-<id>.wav`, nên hai reel scaffold cùng thứ tự
vai mà id chỉ là `hook-1` thì reel sau lặng lẽ dùng giọng của reel trước (`verify` bắt ở
`voice-stems`). Worker không được đổi `id` hay `visual.type`.

**Rồi ĐĂNG KÝ reel ngay, trước khi đặt khung ảnh.** Trang nháp của mục 1d (`review-page --out=<thư
mục nháp>`, chạy TRƯỚC khi toả người viết) cần composition id để render khung hình — reel chưa khai
thì nó thoát mã `2` — và `verify` cũng chỉ biết những reel khai trong `src/Root.tsx`; gọi tên lạ là nó
thoát mã `2` ("verify hỏng"), rất dễ chữa nhầm. Đăng ký bản `scaffolded` còn `TODO` là bình thường —
verify của nó chưa sạch cho tới khi merge, và khung hình nháp hiện headline `TODO`; thứ cần soát ở đó
là ảnh, mark và máy quay. Thêm hai dòng:

```tsx
import liquidity from '../content/liquidity.json';
// ...
{id: 'Liquidity', content: liquidity as unknown as ReelContent},
```

Tên file là `<tên>` viết thường (`liquidity`), còn `verify`/`approve`/`build`/`review-page` nhận **id
Composition** viết hoa (`Liquidity`). Đăng ký xong mới đặt `crop`/`masks`/mark/`shots` (mục 1d) và
toả người viết (mục 1c).

## 1c. Một người viết cho cả reel — không toả ra từng scene nữa

Người dùng chốt 2026-09-23: bản `channel` viết bằng chín agent song song đúng từng số mà "không
giống người": scene nào cũng 49–50 chữ, câu nào cũng một con số, không ai nói với ai. Giọng chỉ ra
đời từ MỘT người viết liền mạch, nên từ giờ: **một agent viết cả reel** theo
[prompts/scene-writer.md](../../../prompts/scene-writer.md) — file đó là prompt, có phần "Giọng
người" và bảng trước→sau, đừng chép luật vào prompt ad-hoc nữa. Prompt cho agent chỉ còn: tên
reel, đường dẫn thư mục ghi `<id>.json`, và **ghi chú giọng của đạo diễn** (tổng thời lượng nhắm
tới, ẩn dụ, scene nào ngắn scene nào dài, điều KHÔNG được nói). Agent ghi thêm `_script.md` — bài
nói liền mạch — để bạn đọc như người xem sẽ nghe TRƯỚC khi merge; đọc thấy "bản tin" thì trả lại
với ghi chú, đừng merge rồi sửa lẻ.

Đọc xong thì soi `_script.md` bằng `/humanizer` (skill `.claude/skills/humanizer/`, người dùng cài 2026-09-30)
theo mục **"Soi dấu vết AI"** của prompt: mẫu cấu trúc nào áp cho lời đọc tiếng Việt (không X mà là Y, câu chốt
lặp ý, mở màn dàn dựng, cãi với người không có mặt, bộ ba ép, thổi phồng), mẫu nào không (chữ trên màn giữ `−`,
`→`, `·`), và câu người dùng đã chốt thì giữ nguyên. Người viết đã tự soát theo mục đó; lượt của bạn bắt thứ họ
bỏ sót. Còn dấu vết thì trả lại kèm ghi chú như khi nghe ra "bản tin"; một cụm lẻ thì sửa trong `<id>.json` rồi
merge, vì `_script.md` chỉ là bản để đọc. Đã vấp 2026-09-30: "Tức là mình có một kênh giá thật, chứ không phải
cố vẽ cho khớp." (§1) lọt tới trang duyệt và người dùng phải tự bắt ("not like the people talking").

Agent trả về mỗi scene `eyebrow`, `narration`, `beats`, `visual` đã điền, kèm hai trường bắt buộc:

- `citedFacts` — đường dẫn tới từng con số đã dùng (`volume.latestVsTrailingPercent`)
- `unsupported` — **ý đồ của đạo diễn KHÔNG kể được bằng fact pack thì nói ra ở đây**, đừng
  ước lượng, đừng bịa

Trường `unsupported` là thứ đáng giá nhất của tầng này. Đã vấp 2026-09-22: brief `liquidity`
mở bằng tiền đề "thanh khoản cạn dần", nhưng `volume.trailingVsPreviousPercent` là **+8,5%** —
mười hai tháng gần nhất NHIỀU thanh khoản hơn mười hai tháng trước đó. Worker viết theo số thật
và báo ngược lại rằng tiền đề sai. Không có tầng này thì cả video đã kể một chuyện dữ liệu
không đỡ.

Toả ra song song từng scene (cách 2026-09-22) chỉ còn dùng khi viết LẠI một hai scene lẻ của reel
đã có giọng — và khi đó agent phải đọc `_script.md` của bản trước để giữ giọng. Đừng chép số ngân
sách từ `content-rules.json` vào prompt; prompt bảo agent tự đọc file đó.

Đường **sửa MỘT scene** của reel đã có giọng (làm 2026-09-23 cho scene 4 của `channel`): chép các scene
KHÔNG đổi từ `content/<tên>.json` ra thư mục worker y nguyên, cho agent viết lại đúng scene cần đổi
(đọc `_script.md` cũ + ghi chú đạo diễn), rồi `merge.mjs` như thường. Merge giữ `audio` và
`sentenceStarts` của scene lời không đổi và neo lại `at` từ đó, nên tám scene kia không lệch beat;
scene đổi lời mất `audio` và sẽ được thu bằng `voiceover.mjs --force --only=<id> --retime` (mục 3).

Hai điều dặn thêm cho worker, có từ 2026-09-22 khi khung hình có ticker và footer riêng:
`eyebrow` KHÔNG lặp lại mã và khung thời gian (`VNINDEX · ...`) vì dòng ticker trên cùng đã ghi
`VN-INDEX 1M` trên mọi scene — eyebrow nói scene này về CÁI GÌ; và số thập phân trên màn hình
viết dấu phẩy (`165,1`) theo quy ước Việt Nam, ticker cũng in `2,85%` — checker nhận cả hai.

Outro có khuôn riêng ở mục "Outro" của prompt (người dùng chốt 2026-09-28, bốn vòng sửa outro `channel`):
một câu kêu gọi thả tim · chia sẻ · theo dõi bằng giọng người, gắn luôn lý do theo dõi (cập nhật sớm những
biến động của thị trường — người dùng gộp hai câu cũ thành một 2026-09-30); không số, không
MACD, không câu vọng lại hook, không lặp "không phải khuyến nghị" — chữ miễn trừ nằm dưới thẻ outro
(`disclaimer`, mặc định của enrich), footer các scene là tên kênh `Chứng Vịt` (`channel.name`). Không script nào gác điều này; soát
ở `_script.md` và trên trang duyệt.

Nhịp và chữ của nghề có script gác từ 2026-09-23 (người dùng hỏi thẳng giọng trader, nhịp đọc và từ vựng
đã vào enrich và verify chưa): `enrich` đặt `_words` cho từng scene theo nhịp của vai
(`arc.roles.<vai>.pace`: hook/outro ngắn, evidence dài) và ước `duration` theo đó; `verify` check `style` (WARN) soi hook/outro so với trung
vị chữ của reel, evidence không ngắn hơn, câu trong scene không đều nhau (`style.sentenceContrastWords`),
và phần lớn scene có thuật ngữ giao dịch (`style.tradeWords`). Giọng — thứ script không nghe được — vẫn
nằm ở `prompts/scene-writer.md` và ở việc bạn đọc `_script.md` thành tiếng.

```bash
node scripts/merge.mjs content/<tên>.json --from=<thư mục chứa <id>.json>
```

Người viết tự chấm bản nháp mà không đụng `content/<tên>.json`: chép khung ra thư mục của nó, merge vào
bản chép, rồi `verify` nhận ĐƯỜNG DẪN file thay cho id (từ 2026-09-28 — nhiều bản nháp song song chấm
cùng lúc được, không cần đăng ký):

```bash
cp content/<tên>.json <dir>/_reel.json && node scripts/merge.mjs <dir>/_reel.json --from=<dir> && node scripts/verify.mjs <dir>/_reel.json
```

Script thay `eyebrow`/`narration`/`beats`/`visual`, giữ `role`, bỏ `_brief`/`_words`/`_camera`, gom
`unsupported` lên cấp reel, giữ `citedFacts` để soát, và đặt `status: enriched`. Nó từ chối (mã 1) khi
thiếu file của scene nào, còn `TODO`, hay worker đổi `id`/`role`/`visual.type`.

Reel đã đăng ký từ mục 1b, nên merge xong là sang thẳng mục 2b. Chưa đăng ký thì làm ngay (khuôn ở
cuối mục 1b) — `verify <Id>` sẽ thoát mã `2`.

## 2. Lược đồ content — worker điền, bạn soát

Một file cho một reel: `content/<tên>.json`, do mục 1b sinh khung và mục 1c điền lời. Mục này
là lược đồ để bạn ĐỌC HIỂU và soát, không phải để gõ tay từ đầu.

Đăng ký reel ở ĐÚNG MỘT nơi: `REELS` trong `src/Root.tsx`. `render.mjs`, `approve.mjs` và
`verify.mjs` đều đọc lại từ đó qua `scripts/lib/reels.mjs`. Trước đây ba file giữ ba bản sao và
chúng đã lệch nhau.

Khung một scene, và ai sở hữu trường nào:

```json
{
  "id": "divergence",
  "eyebrow": "Tín hiệu thật nằm ở đây",
  "act": "maroon",
  "duration": 15,
  "narration": "Tín hiệu thật của RSI không nằm ở mức, mà nằm ở phân kỳ. So với đỉnh...",
  "beats": [
    {"atSentence": 0, "at": 0.25, "line1": "Phân kỳ âm", "line2": "Mới là tín hiệu", "accent": "gold"},
    {"atSentence": 1, "at": 5, "line1": "Giá cao hơn", "line2": "RSI thấp hơn", "accent": "red"}
  ],
  "visual": {"type": "rsi", "divergence": {"from": "2018-04", "to": "2026-08", "label": "phân kỳ âm"}}
}
```

**`duration`, `at`, `audio`, `sentenceStarts` là ĐẦU RA, không phải đầu vào.** Bạn đặt `duration`
áng chừng và `at` bằng bao nhiêu cũng được. Mỗi lượt voiceover ghi đè `audio`, `sentenceStarts`
và `at` của những beat có `atSentence`; `duration` (và `at` của beat KHÔNG có `atSentence`) chỉ
đổi khi có `--retime`. Cái bạn thật sự thiết kế là `atSentence` — câu nào trong `narration` nói
ra headline đó.

**Lời đọc viết số bằng CHỮ.** `chín mươi phẩy năm`, không phải `90.5`. Lý do: TTS đọc chữ số
trần trong tiếng Việt rất tuỳ hứng. Nhãn trên chart thì giữ chữ số. (Bộ tách câu cắt ở
`[.!?…]` **có khoảng trắng theo sau**, nên dấu thập phân giữa số KHÔNG làm vỡ câu — chỉ dấu
chấm cuối câu mới cắt.)

**`atSentence` đánh số trên danh sách câu ĐÃ GỘP.** Câu dưới 3 từ bị gộp vào câu trước
(`voiceover.mjs:137-142`). Thêm một câu ngắn ở giữa là mọi `atSentence` phía sau trỏ sai — vẫn
trỏ được vào một câu nào đó nên không có cảnh báo nào. Chỉ số vượt quá số câu thì bị kẹp về câu
cuối, cũng im lặng.

**Content là JSON nghiêm ngặt.** README in ví dụ dạng jsonc có `//` — dán nguyên vào
`content/*.json` là `JSON.parse` ném. Mọi cách thụt lề và xuống dòng tự tay cũng mất ở lượt
voiceover sau: script ghi lại cả file bằng `JSON.stringify(reel, null, 2)`.

Chọn panel theo [reference.md](reference.md). Một scene một `visual.type`; đổi kiểu panel giữa
các scene là thứ giữ cho reel không đơn điệu.

Mọi ngưỡng — số từ mỗi scene, tốc độ đọc, bề rộng panel, dung sai số liệu — nằm ở
`src/shared/content-rules.json`. File đó là nguồn duy nhất: `verify.mjs` đọc nó, skill này đọc
nó. ĐỪNG chép lại một con số nào của nó ra đây hay ra comment.

## 2b. Chấm điểm — cửa chặn trước khi toả ra

```bash
npm run verify              # mọi reel
npm run verify -- Channel   # một reel
npm run verify -- --strict  # WARN và SKIP cũng thành lỗi (dùng cho CI)
```

Mã thoát là hợp đồng:

| Mã | Nghĩa | Làm gì |
|---|---|---|
| `0` | sạch (còn WARN thì vẫn qua) | đi tiếp mục 2c — NGƯỜI DUYỆT, chưa phải lồng tiếng |
| `1` | nội dung sai | SỬA `content/<tên>.json`, chạy lại |
| `2` | chính verify hỏng | DỪNG sửa nội dung — sửa môi trường (thiếu series, JSON vỡ, không đọc được registry) |

Check `status` theo dõi reel đang ở đâu: `scaffolded` → `enriched` → `reviewed`. Còn chữ
`TODO` trong scene thì `enriched` là FAIL, `scaffolded` là WARN.

**Vòng lặp: soạn → chấm → sửa, tối đa 4 lượt.** Quá 4 lượt mà vẫn `FAIL` thì dừng và hỏi người
dùng, đừng sửa bừa cho qua. Mỗi dòng `FAIL` kèm một dòng `→` nói chính xác phải sửa gì.

Chạy được TRƯỚC khi có audio — đó là lý do vòng lặp này nhanh. Check nào cần file giọng thì báo
`SKIP` chứ không `FAIL`, nên bạn chỉ trả giá nạp model MỘT lần, sau khi chữ đã đúng.

Check `style` (WARN, ngưỡng ở `content-rules.style`) bắt dấu vết viết máy: mọi scene cùng mép ngân
sách chữ, hơn hai con số đọc ra lời một scene, scene mở bằng con số, "chỉ số"/"các bạn"/"nhà đầu tư",
headline hai dòng cùng là số. Nó không nghe được giọng — đọc `_script.md` thành tiếng là việc của bạn.

Ba check soi mạch kể, mức của từng luật ở `arc.severity` (người dùng chốt 2026-09-29): `roles` — mở bằng
`hook`, kết bằng `outro`, lời `scenario` nói ra là kịch bản (FAIL), `chapter` đi thành chuỗi liền nhau
(WARN); `arc` — số scene, act không đi ngược, tổng thời lượng trong `arc.totalSecondsWarn` (WARN);
`camera` — hai khung máy liền nhau không cùng `move`, `static` chỉ ở khung cuối của scene (WARN).

Những thứ nó bắt mà mắt không bắt được: `sentenceStarts` lệch với `narration` (tức là đã sửa lời
mà quên `--force`), `atSentence` trỏ ra ngoài, beat trùng mốc, mark hay khung máy chờ một beat
không có, panel đã bị xoá, chữ tràn panel, hai reel giành cùng một file giọng, và reel khai trong
`Root.tsx` nhưng thiếu file content.

## 2c. Người duyệt — cửa chặn cuối trước khi tốn tiền

`npm run verify` chỉ nói content hợp lệ, KHÔNG nói content đúng ý. Trước khi toả ra, người dùng phải
NHÌN từng scene: khung hình đã render, headline, lời đọc, mark trên ảnh, và **toàn bộ trường
`unsupported`**. Người dùng chốt 2026-09-23: bản duyệt là một **artifact**, không phải bảng Markdown
trong câu trả lời.

```bash
npm run review-page -- Channel              # out/review/channel/index.html + stills/<scene>.jpg (+ files.json)
npm run review-page -- Channel --no-stills  # chỉ đổi lời: dùng lại khung hình cũ
npm run review-page -- Channel --before=<bản content trước.json>   # thêm cột lời đọc trước → sau khi viết lại (đổi cấu trúc: bảng scene trước → sau)
```

Script chạy `verify --json`, render một khung hình cho TỪNG beat bằng `npx remotion still` (beat cuối
+ 1,5s; beat trước ngay trước beat kế — mark đã vẽ hết, máy đã tới khung của beat), và dựng trang: tile verify · số truy về pack ·
style · nguồn (nói rõ nếu chuỗi giá là bản DỰNG LẠI hay scene nào là chart VẼ), danh sách `unsupported`
lên đầu, thẻ từng scene (ảnh · beat/headline · lời · panel · mark · ý đồ trong brief · ghi chú của bạn),
bảng verify và bảng mốc dữ liệu từ fact pack. Ghi chú đạo diễn — kết luận, mức đạt/cần sửa và nhận xét
từng scene — đặt ở `out/review/<tên>/notes.json` (mẫu ở đầu `scripts/review-page.mjs`); viết nó TRƯỚC
khi sinh trang, đó là chỗ bạn nói tiền đề đã được số đỡ chưa và vòng chấm điểm sửa mấy lượt.

Rồi đăng bằng tool **Artifact**: `file_path=out/review/<tên>/index.html`, `root=out/review/<tên>`,
`files` = nội dung `files.json` (map `stills/<scene>.jpg` → cùng đường dẫn), `icon` một chữ chung
(`film`). Duyệt lại sau khi sửa: đăng lại ĐÚNG file đó (hoặc kèm `url` cũ) để giữ một link; đừng tạo
artifact mới mỗi vòng. Trang là riêng tư — chỉ người dùng mở được.

**Đây là điểm dừng duy nhất của cả đường đi.** Trong câu trả lời đưa link kèm bốn thứ ngắn: tiền đề
của họ đã được số đỡ chưa (bước 1a.2), verify còn gì WARN, scene nào có `unsupported` và vì sao, và
lựa chọn tiếp theo: `duyệt` (bạn chạy `npm run approve` rồi lồng tiếng, render), sửa (scene nào, đổi
gì), hay bỏ. Nếu chuỗi giá là bản dựng lại chứ không phải export sàn, nói ngay ở đây.

**Câu trả lời KHÔNG thay được artifact.** Đừng dán bảng scene, lời đọc từng scene hay JSON vào câu trả
lời thay cho link — người dùng duyệt trên trang, nơi có khung hình; chữ trong câu trả lời chỉ là bốn
điều ngắn ở trên. `npm run review -- Channel` (bảng Markdown) chỉ dùng khi phiên này KHÔNG có tool
Artifact; khi đó nói rõ là đang thiếu artifact, và vẫn dừng chờ người dùng như thường.

```bash
npm run approve -- Channel
```

Lệnh này chạy lại `verify` rồi mới đặt `status: reviewed`. Còn lỗi thì nó từ chối — "đã duyệt"
không bao giờ được phép nghĩa là "đã duyệt một bản còn chưa qua chấm điểm".

`npm run build` **từ chối chạy** khi `status` chưa phải `reviewed`, trừ khi có `--force` cho
bản render nháp. Đây là cửa chặn thật: lồng tiếng và render là nửa tốn kém, không mở ra khi
người duyệt chưa đọc.

## 3. Lồng tiếng

```bash
node scripts/voiceover.mjs --content=content/channel.json --retime
```

**Sửa `narration` mà không có `--force` là giữ nguyên giọng CŨ.** File giọng thành phẩm của
scene đã tồn tại thì script bỏ qua (`voiceover.mjs:257-258`, in `kept existing file`) — nhưng
khối neo beat vẫn chạy và vẫn gán `sentenceStarts` cũ. Kết quả: reel render sạch, exit 0,
headline neo vào những chữ không còn được đọc nữa. Đây là cách hỏng video hay gặp nhất của repo.
Sửa lời → `--force`. Chỉ sửa MỘT scene thì thêm `--only=<id>` (nhiều id cách nhau bằng dấu
phẩy): chỉ scene đó được thu lại, tám scene kia giữ nguyên track và chỉ được neo lại beat —
không tốn mấy phút TTS và không đổi giọng những câu đã duyệt.

`--retime` đặt `duration` = đúng độ dài giọng (tối thiểu 4 giây), và:
- beat CÓ `atSentence`: giữ mốc đo được, chỉ kẹp về `duration - 0,5`
- beat KHÔNG có `atSentence`: co giãn theo tỉ lệ scene

Không có `--retime` thì lời dài hơn scene chỉ là **cảnh báo** — build vẫn exit 0 và giọng bị
cắt giữa chữ ở ranh giới scene. Dòng ⚠ đó trôi qua giữa output `npm run build`.

**Thuật ngữ TTS đọc sai thì sửa ở `voice.lexicon`, không sửa lời.** `src/shared/content-rules.json`
`voice.lexicon` đổi cách ĐỌC một chữ viết (nguyên từ, ngay trước khi tổng hợp); `narration`, headline
và trang duyệt vẫn giữ chữ viết. Đo 2026-09-28 (OmniVoice + Whisper large-v3, 3 câu × 2 lượt): `MACD`
đọc trần 0/6 lần nghe ra MACD ("Macy đi", "FCD"), `em a xê đê` 6/6 — ghi số đo của từng cách viết vào
`_lexicon` trước khi thêm từ mới. Dạng đọc nằm trong khoá cache, nên đổi lexicon rồi chạy
`--force --only=<các scene có từ đó>` là thu lại đúng những câu đó. Whisper viết lại đúng thuật ngữ KHÔNG
chứng minh các âm đã được đọc: nó đoán `MACD` và `43,13%` theo ngữ cảnh (đo 2026-09-30 — lượt trong video đọc
`bốn mươi ba, mười ba` mà Whisper vẫn viết `43,13%`). Soát bằng `scripts/tts_takes.py` (mục 5.1): thu N lượt,
nghe với token chữ số và `MAC…` bị chặn, in từng chữ cái kèm thời lượng, giữ lượt rõ nhất. Dạng đọc MACD từ
2026-09-30 là `em, a, xê, đê` — dấu phẩy giữa các chữ làm mỗi chữ được giữ gấp đôi (`a` 0,12–0,18 s thay vì
0,06–0,10 s) mà không có khoảng lặng nghe được; số đo của từng cách viết nằm trong `_lexicon`. Từ 2026-10-01 lexicon
cũng đọc `phẩy` thành `chấm`: OmniVoice nuốt `phẩy` sau một chữ số ở ~90% lượt dù viết cách nào (1/16 lượt thường,
0/24 ở bốn cách viết khác), `chấm` được nghe 6/6; lời và headline vẫn viết `phẩy`.

**Giọng thật của người dùng và `--force` loại trừ nhau.** Thả file vào
`public/voiceover/<NN>-<id>.wav` thì script không ghi đè NẾU KHÔNG có `--force`; chạy `--force`
lúc file đang nằm đó là TTS ghi đè mất bản ghi thật. Thứ tự đúng: `--force` trước cho sinh
`sentenceStarts`, rồi mới thả file vào, rồi sửa `sentenceStarts` bằng tay cho khớp bản ghi mới.
Và file thả tay đi thẳng vào mix — KHÔNG qua lead-in, tail hay `loudnorm` — nên phải sẵn ở
khoảng −18 LUFS và tự có 0,25s lặng đầu.

## 4. Render

```bash
npx tsc --noEmit                              # cửa chặn: type sai thì đừng render
npx remotion render <Composition> out/<tên>.mp4 --log=error
```

Hoặc trọn gói: `npm run build -- --id=Channel --retime`.

Lỗi hay gặp, và nghĩa của nó:

| Báo | Nghĩa | Làm gì |
|---|---|---|
| `No candle for 2026-08` | `PEAK_MONTHS`/`TROUGH_MONTHS` ở `src/lib/series.ts` trỏ vào tháng không có trong chuỗi | sửa hai mảng đó cho khớp dải dữ liệu — lỗi này ném ở module scope nên giết MỌI composition, kể cả reel không có chart |
| stack trace Node ở bước synthesize | một câu TTS hỏng; `execFileSync` ném nên dòng `FAIL <file> <lý do>` bị nuốt | chạy lại worker bằng tay: `../video-factory/.venv/bin/python scripts/tts_omnivoice.py .tts-cache/_omnivoice_items.json` để thấy lý do thật |
| `ModuleNotFoundError: torch` \| `omnivoice` \| `numpy` | `resolvePython()` rơi về `python3` hệ thống | `--python=<đường dẫn>` hoặc `TTS_PYTHON=...` |
| `Unknown --id=X` | quên đăng ký ở `src/Root.tsx` | thêm import + một dòng vào `REELS` |
| chữ tràn khỏi panel | headline tự co, nhưng caption trong SVG thì không | rút chữ, hoặc hạ `fontSize` ở component |

## 5. Soát — bốn thứ script vẫn chưa gác được

`npm run verify` đã gác phần lớn. Bốn thứ dưới đây cần chính file giọng hoặc bản render, nên
vẫn phải làm bằng tay sau mục 4. (Hai cái đầu `verify` đã chấm một phần: nó so độ dài giọng với
độ dài scene và tính tốc độ đọc — nhưng nó không NGHE được.)

```bash
# 1. TTS có nuốt chữ không — thứ duy nhất bắt được lỗi ref_text trùng đầu câu
../video-factory/.venv/bin/python -c "
import mlx_whisper
r = mlx_whisper.transcribe('public/voiceover/02-history.wav',
    path_or_hf_repo='mlx-community/whisper-large-v3-mlx', language='vi')
print(r['text'])"

# 1a. Nhịp đọc — voice.pace trong content-rules (tốc độ gốc OmniVoice theo câu, khoảng lặng sau câu); đổi rồi:
node scripts/voiceover.mjs --reassemble --retime      # thu câu có khoá mới, ghép lại mọi scene với khoảng lặng mới

# 1b. Số thập phân và thuật ngữ có được ĐỌC không — phiên âm thường ở trên không bắt được (nó đoán 43,13% và
#     MACD theo ngữ cảnh). Thu N lượt, nghe với token chữ số bị chặn, giữ lượt rõ nhất, rồi dựng lại track:
../video-factory/.venv/bin/python scripts/tts_takes.py --dry-run            # xếp hạng, không chép gì
../video-factory/.venv/bin/python scripts/tts_takes.py --takes=8            # chép lượt tốt nhất vào .tts-cache
node scripts/voiceover.mjs --reassemble --only=<id in ra ở cuối> --retime   # dựng lại, không thu lại

# 2. Tốc độ đọc — ngưỡng ở narration.syllableRateWarn / syllableRateFail
node -e "/* số âm tiết / (thời lượng - 1.15) */"

# 3. Khoảng lặng — sau --retime, chỗ cắt scene = audio.leadIn + audio.tail
ffmpeg -i out/rsi.mp4 -af "silencedetect=noise=-50dB:d=0.3" -f null /dev/null 2>&1 | grep silence_duration

# 4. Headline có rơi đúng câu không — lấy khung hai bên mốc beat
ffmpeg -v error -ss 12.7 -i out/channel.mp4 -frames:v 1 -vf "crop=1080:400:0:1250" -y /tmp/a.png
ffmpeg -v error -ss 13.4 -i out/channel.mp4 -frames:v 1 -vf "crop=1080:400:0:1250" -y /tmp/b.png
```

Whisper phiên âm số đọc thành lời trở lại thành chữ số (`hai nghìn mười tám` → `2018`), nên tỉ
lệ khớp thấp ở scene nhiều số KHÔNG có nghĩa là mất chữ — đếm âm tiết bằng mắt trước khi kết
luận. Đã vấp 2026-09-22: scene `history` khớp 0,476 trong khi thật ra đủ chữ, còn scene
`distribution` khớp 0,957.

## 6. Báo cáo cuối

Nói với người dùng: đường dẫn file, thời lượng, độ phân giải, giọng nào (omnivoice hay say,
nhân bản từ clip nào), tổng thời gian lặng và khoảng lặng dài nhất, những gì mục 5 đã soát và
**những gì chưa soát**. Nếu chuỗi giá là bản dựng lại chứ không phải dữ liệu xuất từ sàn, nói
thẳng ra.

Mở file cho người dùng xem: `open out/<tên>.mp4`. Kèm bảng mốc thời gian từng scene để họ tua.

## 7. Những đường đã thử và hỏng — đừng đi lại

- **fp32 là BẮT BUỘC, không phải mặc định thận trọng.** `tts_omnivoice.py:42` ghim
  `dtype=torch.float32`. fp16 trên MPS sinh token rác và không bao giờ tới điều kiện dừng — không
  exception, không dòng FAIL, job chỉ đứng im. Ai "tối ưu" xuống fp16 thì sẽ kết luận là model hỏng.

- **`ref_text` trùng đầu câu nào là mất chữ ở câu đó.** Clip tham chiếu hiện tại cố tình lạc đề
  (một câu về quán mì gà). Nếu đổi clip, lời clip phải KHÁC mọi câu mở đầu trong `narration`.
  Trùng đoạn đầu thì model coi như đã đọc đoạn đó rồi và bỏ qua. Hỏng kiểu này nghe như cắt ghép
  vụng, không như lỗi.

- **Tên file transcript suy ra từ tên clip, không khai báo được.** `voiceover.mjs:50` bỏ `_24k`
  trước khi thêm `.txt`. Thả `myvoice_24k.wav` thì phải có `myvoice.txt`, không phải
  `myvoice_24k.txt`.

- **Cache key chứa đường dẫn TUYỆT ĐỐI của clip tham chiếu.** Đổi tên hoặc chuyển chỗ repo là
  mất trắng toàn bộ `.tts-cache/` — key cũ không khớp nữa, mọi câu phải đọc lại từ đầu.
  `--pause`, `--device` và ngưỡng lặng thì KHÔNG nằm trong key: chỉnh `SILENCE_DB` mà không
  `--force` là không có tác dụng gì, nhìn như chỉnh không ăn.

- **Cắt lặng phải làm TRƯỚC khi nối, không gộp vào filter_complex.** Gộp lại là "tối ưu" hiển
  nhiên (một lượt ffmpeg thay vì N+1) và phá luôn `sentenceStarts`: không đo được độ dài từng
  câu thì mọi headline neo theo `atSentence` trôi dần về sau.

- **Một reel một `Composition`, nhưng `public/voiceover/` dùng chung.** Tên file là
  `<số thứ tự>-<scene.id>.wav`. Hai reel có scene cùng vị trí cùng `id` sẽ dùng chung một file
  giọng, và vì file cũ không bị ghi đè, reel thứ hai lặng lẽ thừa hưởng giọng của reel thứ nhất.
  Chèn hay đổi thứ tự scene cũng làm lệch toàn bộ tên file phía sau.
