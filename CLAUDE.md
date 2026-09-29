# CLAUDE.md

Repo làm reel dọc 1080×1920 về thị trường chứng khoán Việt Nam bằng Remotion: nền tối, một panel
dữ liệu ở giữa, headline hai dòng bên dưới dựng dần lên trong khi panel đứng yên.

Quy trình làm một video nằm ở skill `.claude/skills/market-video/` — gọi `/market-video` hoặc cứ
bảo "làm video về RSI" là nó tự vào. Đừng chép lại quy trình đó ra đây. Bản TỔNG KẾT phiên/tuần là
skill thứ hai, `.claude/skills/market-review/` (`/market-review daily|weekly`) — xem đoạn market-review dưới.

## Nguồn dữ liệu

**VN Trading Terminal của người dùng: https://zionle.io.vn** — đây là nguồn số chính thức của
repo, không phải Google hay TradingView. Frontend Vite SPA, API ở `/api`, 1492 mã trong cache
(kiểm 2026-09-22). `config_id` của người dùng nằm ở `.zionle-config` (gitignore — đừng chép giá trị vào file nào được commit). Kéo số bằng
`node scripts/fetch-market.mjs`; đặc tả API ở `.claude/skills/market-video/reference.md` mục 4.

**Feed `/analyze` là feed NGÀY khoảng một năm, không phải lịch sử dài.** Đo 2026-09-22: đúng 254
dòng `2025-09-15 .. 2026-09-22`, và `start_date` bị bỏ qua hoàn toàn. Gộp tháng chỉ ra 13 nến,
trong khi `candles` và `macd` dựng cho ~13 năm. Đổi lại, feed kèm sẵn `rsi` từng ngày,
`divergences` và `trendlines` — dùng kết quả của trang thay vì tự tính lại. Lịch sử dài lấy từ
SSI iBoard (`--source=ssi`, 3400 nến ngày từ 2013-01-02, không cần auth); VNDirect dchart chỉ có
từ 2017-08 và không có khung tuần/tháng; TCBS bị Cloudflare chặn; CafeF đòi tham số khác.

**Giá từ API về đơn vị nghìn đồng, nên chỉ số bị chia 1000.** VNINDEX trả `1.81069` nghĩa là
1810,69 điểm; FPT trả `66.6` nghĩa là 66.600đ — với cổ phiếu đó là cách yết bình thường.
`--scale=auto` nhân 1000 lại cho mã chỉ số. Quên bước này là mọi nhãn trên chart sai 1000 lần.

**Mọi endpoint TRẢ dữ liệu thị trường đều cần `config_id`** (trừ `GET /stocks/cache-info`). Nó
sinh ra phía trình duyệt, nằm ở localStorage key `trading-app_config-id`, và không có route nào
liệt kê config. Hai lỗi khác nhau, đo trực tiếp 2026-09-22: không gửi id trả
`400 {"error":"config_id is required"}`, gửi id sai trả `404 {"error":"configuration not found"}`.
Cái 404 trông như sai đường dẫn chứ không như id hỏng. Đặt id vào `.zionle-config` hoặc
`$ZIONLE_CONFIG_ID`.

**Không POST lên dịch vụ của người dùng khi chưa hỏi.** `POST /api/config` là cách frontend tự
tạo config cho khách mới, nên nó "vô hại" — nhưng vẫn là ghi lên server của họ.
`scripts/fetch-market.mjs` cố tình chỉ GET. Ngoại lệ DUY NHẤT đã hỏi (2026-09-29): `POST /api/stocks/filter`
của market-review — truy vấn chỉ đọc mà Screener tự gửi. `shoot.mjs --site=zionle` giờ chặn mọi non-GET của
CHÍNH TRANG trong trình duyệt (đo 2026-09-29: /analyze và /screener tự POST `/api/stocks/filter` khi mở, chart
vẫn vẽ đủ khi bị chặn); `--allow-post=<path>` là ngoại lệ, sidecar ghi request nào bị chặn.

**`content/vnindex-monthly.json` là dữ liệu THẬT từ 2026-09-23** — SSI iBoard, nến ngày
2013-01-02 → nay gộp tháng, `content/vnindex-monthly.meta.json` ghi nguồn/ngày/số nến, footer đọc
file đó để ghi "Nguồn: SSI iBoard". Làm mới: `node scripts/fetch-market.mjs --symbol=VNINDEX
--source=ssi --replace-series` (`--source=entrade` là nguồn thay thế: giá y nhau, volume gồm cả
thoả thuận). `make-series.mjs` là bản DỰNG LẠI cũ, chỉ còn để chạy offline; nó ghi
`reconstructed: true` vào meta và footer sẽ không nêu nguồn. Bản dựng lại đã SAI đáng kể: đỉnh
2026 thật là **1933,11 vào tháng 5/2026** (bản cũ đặt vào 2026-08), 2026-08 chỉ 1838, 2026-09 1874;
đáy 2020-03 thật 649 (bản cũ 601). Bốn reel sinh từ bản cũ (`Reel`, `RSI`, `Liquidity`, `MACD`)
đã bị xoá 2026-09-29 theo yêu cầu người dùng; `Channel` là reel duy nhất còn lại. `series.peakMonths` trong `content-rules.json` là `2026-05` cho đỉnh này;
`src/lib/series.ts` đọc anchors từ chính file đó, không còn bản sao riêng.

**market-review — skill thứ hai, TÁCH khỏi market-video** (người dùng tạo 2026-09-29). Reel tổng kết
phiên (`DailyReview`, 8 scene ~70s) và tuần (`WeeklyReview`): trạng thái thị trường theo quy tắc phiên phân
phối/FTD (O'Neil, dùng trong hệ thống Minervini; người dùng đặt phân phối ≤ −0,5% thay −0,2% của IBD) và hai
bộ lọc đã lưu trên terminal (Volume spike; RS Strong ∩ Uptrend, top 3 kèm chart từng mã). Luật riêng ở
`.claude/skills/market-review/rules.json`, prompt người viết riêng `writer.md`, script riêng `scripts/review/`.
Reel của nó mang trường `rules`; `scripts/lib/rules.mjs` cho verify/review-page/voiceover đọc luật theo reel
và chỉ cho nó thừa hưởng hằng số của máy (layout, audio, series, clip giọng) — reel không có `rules` (Channel)
chấm y như cũ (đo: output `verify Channel --json` trùng từng byte trước/sau). Đừng sửa `content-rules.json`
để chiều market-review, và ngược lại.

## Quy ước quan trọng

**Số trên màn hình phải truy được về fact pack.** Check `facts` của `npm run verify` soi số
trên headline và nhãn chart; số trong lời đọc viết bằng chữ nên script không soi được. Tính chỉ
báo, in ra, đọc kết quả, rồi mới viết lời — kịch bản mọc từ số, không phải ngược lại. Video RSI
ra đời đúng theo thứ tự đó: tính RSI-14 trước, thấy 59/151 tháng nằm trên 70, rồi mới có luận
điểm "quá mua là bình thường".

**`duration`, `at`, `audio`, `sentenceStarts` là đầu ra của `voiceover.mjs`, không phải đầu vào.**
Thứ con người thiết kế là `atSentence` — câu nào trong `narration` nói ra headline đó. Sửa tay
bốn trường kia là sẽ bị ghi đè ở lượt voiceover sau mà không báo.

**Lời đọc do MỘT agent viết cho cả reel, theo `prompts/scene-writer.md`.** Người dùng chốt
2026-09-23 sau bản `channel`: chín agent viết chín scene cho ra bản tin đọc số — đúng mà không giống
người. Giọng nằm ở prompt đó (phần "Giọng người"); `content-rules.style` + check `style` của verify
chỉ cảnh báo dấu vết máy. Đạo diễn đọc `_script.md` thành tiếng trước khi merge. Người dùng chốt thêm
2026-09-23: từ vựng là của **trader** (kháng cự/hỗ trợ/tích luỹ/phá vỡ/thanh khoản), không ví von đời
thường ("bậc thang", "tiền mỏng dần" bị bác); năm đọc `hai không hai hai`, không `năm hai mươi hai`;
scene nào về xu hướng giá đều là ảnh chart có mark (`hline`/`box`…) vẽ dần theo beat; mọi scene ảnh
có chuyển động sẵn trong `ImagePanel`.

**Sửa `narration` thì PHẢI `--force`.** File giọng cũ không bị ghi đè nếu không có cờ đó, nhưng
khối neo beat vẫn chạy và vẫn gán `sentenceStarts` cũ. Reel render sạch, exit 0, headline neo
vào những chữ không còn được đọc. Đây là cách hỏng video hay gặp nhất của repo. Sửa một
scene thì `--force --only=<id>`: chỉ scene đó thu lại, các scene khác giữ track cũ và chỉ neo
lại beat. `merge.mjs` cũng neo lại `at` từ `sentenceStarts` cũ cho scene có lời không đổi, nên
gộp lại một scene không làm lệch beat tám scene kia.

**Nhưng `--force` cũng XOÁ bản ghi thật thả tay vào `public/voiceover/`.** Hai tính năng đó
loại trừ nhau: không cờ thì file thả tay thắng, có cờ thì TTS ghi đè lên nó. Muốn dùng giọng
thật: chạy `--force` trước cho sinh `sentenceStarts`, rồi mới thả file vào, rồi sửa
`sentenceStarts` bằng tay. File thả tay cũng không qua lead-in, tail hay `loudnorm` — phải sẵn
ở khoảng −18 LUFS.

**Lời đọc viết số bằng chữ, nhãn chart giữ chữ số.** `chín mươi phẩy năm` trong `narration`,
`90.5` trên chart. Lý do là TTS đọc chữ số trần trong tiếng Việt rất tuỳ hứng. Bộ tách câu cắt
ở `[.!?…]` **có khoảng trắng theo sau**, nên dấu thập phân giữa số không làm vỡ câu — đo trực
tiếp 2026-09-22, `"chạm 1.933 điểm. Đó là đỉnh."` vẫn ra đúng hai câu.

**fp32 là bắt buộc cho OmniVoice.** fp16 trên MPS sinh token rác và không bao giờ dừng: không
exception, không log, job đứng im. Ghim ở `scripts/tts_omnivoice.py:42`, đừng "tối ưu" nó.

**Lời clip tham chiếu phải KHÁC mọi câu mở đầu trong `narration`.** Trùng đoạn đầu là model coi
đoạn đó đã nói rồi và bỏ qua — nghe như cắt ghép vụng, không như lỗi. Clip hiện tại cố tình lạc
đề (một câu về quán mì gà).

**Python cho TTS ở repo bên cạnh.** `../video-factory/.venv/bin/python` — torch + omnivoice ~4GB,
không nhân bản. Repo này không chạy độc lập được; thiếu nó thì worker rơi về `python3` hệ thống
và chết ở `import omnivoice`, hiện ra dưới dạng stack trace Node chứ không phải lời nhắc cài đặt.

**Thêm một reel là sửa ĐÚNG MỘT nơi: `REELS` ở `src/Root.tsx`.** `render.mjs`, `approve.mjs` và
`verify.mjs` đều đọc lại từ đó qua `scripts/lib/reels.mjs`. Trước đây ba file giữ ba bản sao và
chúng đã lệch nhau — đó là lý do có module ấy.

**Vai của scene khai ở ĐÚNG MỘT nơi: `arc.roles` trong `src/shared/content-rules.json`** (người dùng
chốt 2026-09-29) — việc, act mặc định, nhịp, máy quay mặc định của từng vai; enrich, verify, merge, review
và review-page đọc qua `scripts/lib/roles.mjs`. Trước đó act nằm trong `enrich.mjs`, nhịp ở `style.pace`,
việc của vai ở reference.md, và ba script tự đoán vai từ id — bốn chỗ đã lệch nhau. Reel phân tích chart
có ba vai riêng: `chapter` (các lần lịch sử, ít nhất hai liền nhau), `scenario` (lời phải có chữ của
`mustSay` — verify FAIL, vì câu gọi giá không điều kiện nghe như khuyến nghị), `levels` (mức phải canh, trên
và dưới). Scene mang trường `role`; đổi vai scene đã có giọng thì sửa `role`, KHÔNG sửa `id` — id là tên file
giọng (`channel-mechanism` giữ id, mang `role: scenario`).

**`content/*.json` là JSON nghiêm ngặt.** README in ví dụ dạng jsonc có `//` cho dễ đọc — dán
nguyên vào là `JSON.parse` ném.

**Nến và chart trong reel là ẢNH CHỤP hai trang của người dùng, không phải chart Remotion vẽ**
(người dùng chốt 2026-09-22). Skill đi cả hai trang cho mã đang nói: terminal cho insight có cấu
trúc (`fetch-market.mjs --signals` → `terminal.*` trong fact pack) + ảnh /analyze; FireAnt cho chart
ngày nhiều năm (`--range=5y`, `--interval=D|W|2W|M` bấm nút interval người dùng đã ghim,
`--zoom-out=6` lăn chuột để thấy lịch sử tới ~2001). `candles`/`macd`/`rsi` vẽ TẮT mặc định (người dùng chốt 2026-09-23:
FireAnt đã có hết) — chỉ khi được bảo đích danh. **Người dùng chốt 2026-09-28: scene nào có SỐ trên màn
hình đều là ảnh chart có mark** — không cột `riskReward`/`bars`, không `list` chứa số; tỉ lệ lời/lỗ là
hai mũi tên trên chart, danh sách việc là nhãn gắn vào đúng mức giá. Thẻ outro cũng không mang số. Từ
2026-09-23 chuỗi tháng là dữ liệu thật (SSI) nên fact pack, ticker và ảnh FireAnt cùng số khi kéo cùng ngày
(đóng cửa 28/9: 1780,68 ở cả ba) — trước đó bản dựng lại lệch ảnh thật (1.878 vs 1816,93, đo 2026-09-22).
Ảnh vào brief bằng dòng `src:`/`source:` trong scene; enrich điền `visual`.

**Ảnh chụp trang web là panel `image`, chụp bằng `scripts/shoot.mjs`.** Người dùng cho phép
2026-09-22: zionle.io.vn (headless, `configId` trong URL, không POST) và fireant.vn/charts qua
**Chrome thật** của họ, hồ sơ ghi ở `.shoot-profile` hoặc `$SHOOT_PROFILE` (gitignore; `scripts/shoot_real.py`, lái bằng CGEvent +
`screencapture` như video-factory, cần venv của repo đó). Bản sao hồ sơ (`--profile=<hồ sơ>`,
`.chrome/<hồ sơ>/`, gitignore) KHÔNG thay được đăng nhập thật — FireAnt vẫn hiện "Đăng nhập" dù cookie
giải mã được; giữ lại chỉ làm fallback cho site khác. Cả hai trang bỏ qua `?symbol=`; script gõ/dán
mã vào ô tìm. Ảnh thiếu sidecar `.json` thì `verify` FAIL.

**Chữ không được đè lên chart, chart phải lấp khung** (người dùng chốt 2026-09-28). Khung ảnh là
`LAYOUT.imagePanel` 1000×752 (ảnh 1000×704, tỉ lệ 1,42); mỗi ảnh có `crop` đúng tỉ lệ đó để cắt thanh
công cụ/dòng OHLC/thanh chu kỳ của FireAnt và trục giá tính theo nghìn của terminal, `masks` che chú
giải Volume/MACD và logo; nhãn mark vẽ trên nền tối riêng và đặt vào vùng trống — soát từng beat.

**Máy quay trên ảnh là `visual.shots`, theo vox-director** (người dùng yêu cầu 2026-09-28,
github.com/Alisa0808/vox-director — chỉ tầng STORY: arc, hook ≤ 3 giây, đổi khung 3–5 giây, wide → cận,
`static` cho payoff; `loop_close` KHÔNG áp vào outro — xem đoạn outro dưới). Mỗi beat của scene ảnh một khung (`x`/`y` tâm theo phần ảnh, `zoom`
1..4, `move`), đạo diễn đặt như mark, worker không đổi; đặc tả ở reference.md mục 1. Cận cảnh phóng luôn
giao diện FireAnt (dòng OHLC ở y 0,085–0,125 của ảnh tháng) — soát bằng khung hình từng beat của
`review-page`, đừng tin toạ độ trên giấy. `verify` nhận đường dẫn file để chấm bản nháp chưa đăng ký.

**Hai bộ màu, đừng gộp.** `COLORS.red/green/gold` là màu CHỮ headline. `COLORS.up/down`
(`#1FA377`/`#EC5F38`) là màu MARK — nến, histogram, mũi tên ticker — chọn bằng validator của
skill dataviz trên nền plot: cặp xanh/đỏ thường chỉ đạt ΔE mù màu 6,7, cặp này 10,2. Khung hình
có ticker (trên) và footer (dưới) trên mọi scene, tính từ chuỗi giá; footer mặc định ghi nguồn từ
`vnindex-monthly.meta.json` (`Nguồn: SSI iBoard · tới T9/2026`), và chỉ ghi "Dữ liệu" khi meta báo
`reconstructed` — đặt `footer` ở cấp reel khi số đến từ nhiều nguồn (`Channel`: `Nguồn: SSI · zionle.io.vn · FireAnt`).

**Chữ Việt cần subset `vietnamese` của font.** Thiếu nó thì dấu chồng (Ổ, Ữ, Ặ) rơi về font
khác và lệch khỏi cap height. Icon thì vẽ bằng SVG chứ không gõ ký tự, vì ✓ và ⚠ thiếu ở vài
weight và cũng rơi về font khác.

**Người dùng chốt 2026-09-22: đầu vào là MỘT HAI DÒNG chủ đề, không phải brief.** Agent tự đọc
fact pack (`node scripts/enrich.mjs --facts-only --name=<tên>`), tự viết `brief/<tên>.md`, chạy
liền tới `npm run review-page -- <Id>`, đăng trang đó làm **artifact** (khung hình từng scene, lời, `unsupported`;
người dùng chốt 2026-09-23) rồi mới dừng cho người dùng duyệt. Không dừng
giữa đường để hỏi; không đưa brief ra duyệt.

**Miễn trừ chỉ nằm ở outro** (người dùng chốt 2026-09-28): footer các scene chỉ ghi nguồn (`Nguồn: SSI ·
zionle.io.vn · FireAnt`), chữ nhỏ dưới outro là `Mọi thông tin chỉ là thông tin tham khảo, không phải khuyến
nghị đầu tư.` (mặc định của enrich); lời đọc không lặp "không phải khuyến nghị". Outro kêu gọi thả tim ·
chia sẻ · theo dõi bằng giọng người, không MACD, không số.

**Người dùng chốt 2026-09-22: nhận diện thương hiệu ở scene outro là chỗ trống.** `Kênh của bạn`
+ monogram sinh sẵn. Logo và tên kênh của người khác không phải thứ để dựng lại; người dùng thả
file của họ vào `public/` và đặt `visual.logo` thì monogram tự biến mất.

## Khi debug

- job TTS đứng im, không log → kiểm `dtype` có còn float32 không
- mất vài chữ đầu câu → lời clip tham chiếu trùng đầu `narration`
- sửa lời mà giọng không đổi → thiếu `--force`
- chữ "nến" đầu cụm ra "nên"/"đến" qua nhiều lượt TTS → nói "tháng … đóng cửa" thay cho "nến tháng …" trong lời (headline giữ "nến")
- nhãn số bị viền cắt khi zoom → nhãn phải đi qua `Halo` của ImagePanel (tự trượt vào trong khung máy); đừng vẽ chữ SVG trần
- mark lệch khỏi nến sau khi chụp lại → chạy lại `scripts/calib_chart.py` cho ảnh đó; đừng dùng toạ độ đo tay của ảnh cũ
- TTS đọc thuật ngữ lung tung (MACD → "Macy đi") → thêm dạng đọc vào `voice.lexicon` ở content-rules, thu lại bằng `--force --only`; đừng viết "em a xê đê" vào `narration`
- bản ghi thật biến mất → chạy `--force` lúc file đang nằm trong `public/voiceover/`
- headline rơi sai câu → `sentenceStarts` cũ, hoặc thêm câu ngắn làm lệch `atSentence`
- `No candle for <tháng>` → `series.peakMonths`/`troughMonths` ở `content-rules.json` (nguồn của `PEAK_MONTHS` trong `src/lib/series.ts`) vượt dải dữ liệu
- stack trace Node ở bước synthesize → chạy `scripts/tts_omnivoice.py` tay để thấy dòng `FAIL`
- `400 config_id is required` → chưa đặt `.zionle-config`
- `404 configuration not found` → id sai hoặc đã hết hạn, không phải sai đường dẫn
- panel thiếu chi tiết → chi tiết đó gác sau `beatIndex >= 1`, scene chỉ có một beat
- `Unknown --id=X` → quên `REELS` ở `src/Root.tsx`
- `roles` FAIL "has to say it is one" → scene `scenario` kể như lời gọi giá; viết lại thành nhánh nếu … thì, đừng thêm chữ vào `mustSay`
- `voice-stems` FAIL giữa hai reel scaffold → id kiểu cũ `hook-1` trùng vị trí; enrich giờ sinh `<tên>-<vai>`
- cận cảnh ảnh hiện chữ FireAnt khổng lồ ở mép trên → khung `shots` cắt vào dòng OHLC; đặt mép trên khung ≥ 0,125
- khung đầu scene ảnh đen một lúc → quét mở màn đang chạy trong lớp đã phóng; với `shots` nó phải ở toạ độ màn hình (ImagePanel)
- `shoot_real: ABORTED before any input` → cửa sổ đang focus không phải cửa sổ app của script (người dùng vừa đụng Chrome); chạy lại khi Chrome rảnh, KHÔNG nới chốt chặn — nới là gõ vào app của họ (đã xảy ra 2026-09-22)
