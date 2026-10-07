# CLAUDE.md

Repo làm reel dọc 1080×1920 về thị trường chứng khoán Việt Nam bằng Remotion: nền tối, một panel
dữ liệu ở giữa, headline hai dòng bên dưới dựng dần lên trong khi panel đứng yên.

Quy trình làm một video nằm ở skill `.claude/skills/market-video/` — gọi `/market-video` hoặc cứ
bảo "làm video về RSI" là nó tự vào. Đừng chép lại quy trình đó ra đây. Bản TỔNG KẾT PHIÊN là
skill thứ hai, `.claude/skills/market-review/` (`/market-review`) — xem đoạn market-review dưới.
Đưa reel đã render lên Facebook là skill thứ ba, `.claude/skills/publish-video/` (`/publish-video <Id>`,
chép từ video-factory 2026-09-30): CHỈ Page Chứng Vịt (`page.json`), CHỈ hồ sơ Chrome của tài khoản trong
`.publish-profile` (gitignore), dừng ở BẢN NHÁP — không bấm Đăng. Soát bằng `scripts/publish/prep.mjs`,
lái Chrome bằng `scripts/publish/fb.py`.
Bản TỔNG KẾT TUẦN là skill thứ tư, `.claude/skills/weekly-review/` (`/weekly-review`, người dùng tách khỏi market-review
2026-10-05): CHUNG rules.json (`formats.weekly`), writer.md, reference.md và `scripts/review/` của market-review với
`--format=weekly` — không chép luật sang. Ảnh FireAnt "Biến động thị trường" ("Thống kê sàn": số mã tăng/giảm và phân bổ
dòng tiền, vai `flow`) nằm ở bản PHIÊN, scene 02 ngay sau hook, và hook bản phiên không còn đọc số mã tăng/giảm (người dùng
2026-10-05: 'move it into the scene 02'); bản tuần giữ đường độ rộng cũ (% mã trên SMA200, `breadth.mjs`) —
người dùng 2026-10-05: 'Daily; old chart → weekly'.

## Nguồn dữ liệu

**VN Trading Terminal của người dùng: https://zionle.io.vn** — đây là nguồn số chính thức của
repo, không phải Google hay TradingView. Frontend Vite SPA, API ở `/api`, 1492 mã trong cache
(kiểm 2026-09-22). `config_id` của người dùng nằm ở `.zionle-config` (gitignore — đừng chép giá trị vào file nào được commit). Kéo số bằng
`node scripts/fetch-market.mjs`; đặc tả API ở `.claude/skills/market-video/reference.md` mục 4.

**Feed `/analyze` là feed NGÀY khoảng một năm, không phải lịch sử dài.** Đo 2026-09-22: đúng 254
dòng `2025-09-15 .. 2026-09-22`, và `start_date` bị bỏ qua hoàn toàn. Gộp tháng chỉ ra 13 nến,
trong khi chuỗi tháng của SSI phủ ~13 năm. Đổi lại, feed kèm sẵn `rsi` từng ngày,
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
phiên (`DailyReview`, 10 scene ~80s; từ 2026-10-05 có ảnh FireAnt "Biến động thị trường" làm scene 02 ngay sau hook, hook không đọc số mã tăng/giảm; ảnh là hai thẻ chồng nhau — beat 1 thẻ dòng tiền (tròn + cột), beat 2 máy lia xuống thẻ "Top cổ phiếu tác động", mã kéo/đẩy chỉ số bao nhiêu điểm, `flow.impact`) — bản tuần (`WeeklyReview`) là skill thứ tư
`weekly-review`, chung luật và script, thêm `week` và đường độ rộng % mã trên SMA200: trạng thái thị trường theo quy tắc phiên phân
phối/FTD (O'Neil, dùng trong hệ thống Minervini; người dùng đặt phân phối ≤ −0,5% thay −0,2% của IBD; năm phiên phân phối là MỨC NGUY HIỂM của hệ thống người dùng —
`distribution.dangerAt`, 2026-10-01, không phải trạng thái: market phải cảnh báo và rà lại từng mã và rủi ro, verify FAIL nếu thiếu; rồi
nói câu người dùng chốt 2026-10-05 `distribution.danger.say` — "Xác suất có biến động hoặc điều chỉnh lớn, thị trường không còn khỏe
nữa." — THAY câu đếm "Thêm một phiên nữa là điều chỉnh", verify chỉ WARN vì người dùng nói "something like"; headline
beat 2 của market ở trạng thái chịu áp lực là `status.UNDER_PRESSURE.headline` "Sức khỏe thị trường đang yếu", không còn tên trạng thái — người dùng cùng ngày; scene cuối là "Kịch bản VN-Index": nhánh tích cực / tiêu cực theo `scenario` của pack —
vùng price action 142 phiên của chính chỉ số + MA50/MA200 FireAnt, gần trước — rồi các mốc luật, người dùng tối 5/10) và hai
bộ lọc đã lưu trên terminal, MỖI BỘ LỌC MỘT SCENE (Volume spike; RS Strong; Uptrend — người dùng tách RS Strong và
Uptrend 2026-09-30, "not union it first"), rồi SOI TỐI ĐA BỐN mã kèm chart từng mã (người dùng 2026-10-06: "I want change and allow for the at most 2 with review stock, the number i want is 4" — trước là hai; 2026-10-01: mã có mặt ở cả ba bộ lọc trước, không đủ thì mã ở cả RS Strong lẫn Uptrend, xếp theo RS 1M — `screener.leaders.from` là danh sách tầng; bản PHIÊN từ 2026-10-06 chỉ soi mã ở CẢ BA bộ lọc, người dùng: "remove the stock not in all 3 filter, only keep the stock on all 3 filters", chọn "All 3 filters only" — `formats.daily.leaders` (chỉ của bản phiên, có `since`), không tầng dự phòng, mã soi hôm trước soi lại khi còn ở cả ba, ngày không có mã nào thì không có scene leader; tối 2026-10-01 người dùng bỏ lời đếm ngược — "Remove 'Đếm ngược từ hai' => 'Let's review …'": scene Uptrend kết bằng lời mời "Cùng mình xem kỹ …" (không "soi kỹ": OmniVoice đọc "soi" thành "xoay", 7/7 lượt 2026-10-04), eyebrow `Soi mã · <MÃ>`, câu đầu "Mã đầu tiên là …", thứ tự giữ nguyên). Hai bộ lọc giữ tên terminal trong lời — "bộ lọc RS Strong", "bộ lọc Uptrend", không "RS mạnh" (người dùng: "keep the RS strong verb … trading verb"; `voice.lexicon` đọc Strong/Uptrend, chưa đo); không scene nào nói mã của bộ lọc này có ở bộ lọc khác (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter" — bỏ dải vàng/tia sét, móc 2 của spike và "ở cả ba bộ lọc" của leader; verify `review-overlap` FAIL); hai bảng RS Strong và Uptrend một cột, theo RS 1M, beat 2 tô và tạo hiệu ứng cho mã sẽ soi ngay sau (`focus`; "decoration and animation with the symbol need focused", Uptrend "behavior like the RS strong"), và bảng Volume spike cũng vậy ở beat 3 từ 2026-10-06 (người dùng: "With the volumn spike also have the animation with this scene for me highlight the symbol must noted"; `src/scenes/Movers.tsx`, `focusSince`) và Uptrend kết bằng lời mời gọi tên chúng
(`screener.leaders.from` trong rules.json; scene bảng khai ở `screener.scenes` — thêm scene = thêm vai + cột `keep`). Bảng Volume spike xếp theo % thay đổi — cột tăng từ mã tăng mạnh nhất, cột giảm từ mã giảm sâu nhất — và in khối lượng là % so với SMA20 ("KL +92%", VOL/SMA của terminal; người dùng tối 2026-10-01: `movers.sortBy: changePercent`, `movers.volume: percentVsSma20`); RS Strong và Uptrend vẫn theo RS 1M; `review-picks` FAIL khi bảng lệch thứ tự của pack hoặc scene spike/leader còn "KL ×". Luật riêng ở
`.claude/skills/market-review/rules.json`, prompt người viết riêng `writer.md`, script riêng `scripts/review/`.
Reel của nó mang trường `rules`; `scripts/lib/rules.mjs` cho verify/review-page/voiceover đọc luật theo reel
và chỉ cho nó thừa hưởng hằng số của máy (layout, audio, series, clip giọng) — reel không có `rules` (Channel)
chấm y như cũ (đo: output `verify Channel --json` trùng từng byte trước/sau). Đừng sửa `content-rules.json`
để chiều market-review, và ngược lại. Lời đọc của market-review gọi MÃ ba chữ cái, không tên công ty (người dùng
2026-10-01): `voice.letters` trong `rules.json` đánh vần, nối bằng `voice.letterJoin` (dấu cách: "em ét rờ" liền một cụm —
người dùng tối 2026-10-01: "solid and clearly not separate"; dạng "em, ét, rờ" làm giọng dừng ở từng chữ), `spellerOf` ở
`scripts/lib/rules.mjs` áp SAU lexicon và chỉ cho reel có bảng chữ (Channel đọc y như cũ); bảng movers chỉ in mã; hai mã
cạnh nhau trong lời tách bằng chữ ("GEE và POW") vì không có dấu phẩy thì hai mã liền nhau thành một chuỗi chữ cái.
`tts_takes.py` coi mỗi mã đánh vần là thuật ngữ bắt buộc: đủ từng chữ, chữ ngắn nhất giữ đủ lâu, không ngắt ≥ 0,15 s giữa
các chữ. Chỉ báo và động từ của mẫu hình giữ tên trader trong lời
(người dùng 2026-10-01: "hai trăm phiên => MA200"): viết `MA200`/`EMA50`/`RS`, không "đường trung bình hai trăm phiên";
`voice.lexicon` của rules.json đọc chúng thành chữ và check `narration` của verify soi chữ số trên dạng đọc.
Scene soi mã KẾT bằng HAI VAI từ 2026-10-07 (người dùng: "add the role of holder and not holder with action and behavior like
'Không mua đuổi' with not holder when it exhausted run, and … with holder: 'nếu dưới giá …' thì hạ tỷ trọng & chốt lời một nửa"):
`rolesOf` ở `scripts/review/lib/symbol-review.mjs` (agent `symbol-reviewer` §6b/§6c, method /3, hai bảng do hai agent thiết kế)
quyết định người đang giữ làm gì dưới đường nào và người chưa có hàng làm gì, siết lại ở mức nguy hiểm; scene thêm beat 3 "Hành
động" (plate trên đúng đường giá) và hai câu cuối; verify `review-roles` FAIL khi thiếu. Đây là chỗ DUY NHẤT reel nói hành động —
verdict, nhánh "nếu … thì", nhãn mark vẫn mô tả (`FORBIDDEN` vẫn chặn ở đó).

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
chỉ cảnh báo dấu vết máy. Đạo diễn đọc `_script.md` thành tiếng trước khi merge, và soi nó bằng skill
`/humanizer` (`.claude/skills/humanizer/`, chép từ blader/humanizer 3.1.0, MIT — người dùng cài 2026-09-30):
các mẫu AI không phụ thuộc ngôn ngữ (không X mà là Y, câu chốt một dòng, bộ ba ép, mở màn dàn dựng, phủ định
không ai nói, gạch ngang tràn lan) sửa cho giống người; số liệu, thuật ngữ nghề và câu người dùng đã chốt giữ nguyên. Người dùng chốt thêm
2026-09-23: từ vựng là của **trader** (kháng cự/hỗ trợ/tích luỹ/phá vỡ/thanh khoản), không ví von đời
thường ("bậc thang", "tiền mỏng dần" bị bác); năm đọc `hai không hai hai`, không `năm hai mươi hai`, và
2010–2019 là `hai không mười tám`, không `hai không một tám` (người dùng sửa 2026-09-29); mức giá trong kịch
bản và mức phải canh đọc ra số, mức giảm có trong pack đọc đúng số, không "gần ba mươi phần trăm", và phần trăm
trên màn hình phải tính lại được từ hai đầu mút đang hiện (`percentExact`/`highExact`/`lowExact`: `1211,34 → 861,85: −28,85%`);
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

**OmniVoice nuốt `phẩy` và dính chữ cái tuỳ lượt, và Whisper KHÔNG bắt được.** Đo 2026-09-30 (người dùng nghe
`channel.mp4` thấy 43,13% mất `phẩy`, MACD không rõ): `bốn mươi ba phẩy mười ba` mất `phẩy` 3/4 lượt, `hai mươi
tám phẩy tám lăm` 2/4, còn `em mờ a xê đê` bị ép vào 0,6–0,7 giây với chữ `a` chỉ 0,06–0,10 giây — mà Whisper vẫn
viết lại `43,13%` và `MACD`, vì nó đoán theo ngữ cảnh. Phiên âm thường vì thế không phải bằng chứng. Cách sửa
nằm ở `scripts/tts_takes.py`: thu N lượt cho câu có `phẩy`/thuật ngữ, nghe lại bằng Whisper với token chữ số và
`MAC…` bị chặn (số phải trở về thành chữ, chữ cái phải hiện từng chữ kèm thời lượng), giữ lượt rõ nhất tại đúng
đường dẫn cache, rồi `voiceover.mjs --reassemble --only=<id> --retime` dựng lại track (không thu lại gì). Dấu phẩy
ngay trước `phẩy` (`bốn mươi ba, phẩy mười ba`) làm giọng ngắt rồi bỏ luôn chữ đó — verify cảnh báo. Đo thêm 2026-10-01: `phẩy` sau một chữ số bị nuốt ở ~90% lượt dù
viết cách nào (1/16 lượt thường, 0/24 lượt đổi cách viết), còn `chấm` được nghe 6/6 — nên `voice.lexicon` đọc `phẩy` thành
`chấm` (chỉ TTS; lời và headline vẫn `phẩy`). Muốn quay lại `phẩy` thì xoá dòng đó và chấp nhận thu 10–20 lượt mỗi số. Dạng đọc
MACD là `em, a, xê, đê` (dấu phẩy giữa các chữ làm mỗi chữ được giữ gấp đôi, không có khoảng lặng nghe được);
người dùng đổi thành `em, ây, xê, đê` tối 2026-09-30, rồi bỏ dấu phẩy chiều 2026-10-01 (`em ây xê đê`, nhanh hơn); tối 2026-10-01 rules.json
của market-review đọc MACD y như content-rules (người dùng: "refer lexicon of channel video") và FTD cũng bỏ phẩy (`ép tê đi`).

**Không render khi chưa NGHE từng câu** (người dùng 2026-10-06, bản 6/10: "The pronounce of the number on this video is
not clear … ensure it not happened again"). Nghe lại bản 6/10: lượt trong video đọc 1759 thành "một nghìn bảy trăm năm
chín" (mất `mươi`), câu flow bỏ hẳn 0,58 của FPT ("… kéo lùi không chấm bốn phẩy tám điểm"), và câu "mười ba phẩy bảy" của
MSB thu lúc 18:00, sau lượt chọn, nên không ai nghe. `tts_takes.py` cũ có ba lỗ: lệnh chặn chữ số chặn luôn 1501 token
timestamp (`<|0.00|>` có chữ số — decoder hết đường, nhả token 0 là "!") và cả token của chính con số (`một`, `trăm`,
`mươi`), nên ra "!!!!"; pass thường đếm chữ số là đã nghe ("1.759"); prompt chứa sẵn số của reel. Câu không giải được chỉ
in ra, không chặn gì. Giờ `render.mjs` chạy `tts_takes.py --content=<reel> --rebuild` sau voiceover:
nghe MỌI câu (token chữ số bị chặn, primer có số và ngày viết bằng chữ nhưng không có số của câu đó), giữ lượt mà MỘT bản
nghe có đủ mọi số (mỗi chuỗi ≥ 2 chữ đếm), mã, thuật ngữ theo đúng thứ tự — số nói hai lần phải nghe hai lần, không chữ lạ
dính vào số ("… bốn hai chân thì …") — thu thêm tới 18 lượt cho câu chưa rõ; rồi từ chối render khi
`voice-heard` của verify FAIL — lượt chưa nghe, lượt không rõ, track cũ hơn lượt vừa chọn (`scripts/lib/heard.mjs`). Kết
quả nghe ở `.tts-cache/_heard.json` theo hash audio (lượt nghe rồi không nghe lại), danh sách lượt của từng reel ở
`.tts-cache/manifests/<reel>.json` (voiceover.mjs ghi). `--unheard` bỏ cửa này cho bản nháp hoặc giọng thật thả tay. Câu
vẫn không rõ sau 18 lượt (exit 3) thì tách câu — tối đa hai số mỗi câu — rồi `voiceover.mjs --reassemble --only=<id>
--retime` (chỉ thu câu đổi chữ; `--force` thu lại cả scene và mất các lượt đã chọn).

**Nhịp đọc nằm ở `voice.pace` của content-rules, không ở lời** (người dùng 2026-10-01: "giọng không có nhịp, không
có điểm nhấn"). `voiceover.mjs` đặt tốc độ gốc của OmniVoice cho từng câu — câu "key" (có con số, hoặc là câu mà
một beat headline neo vào, hoặc thuộc hook) đọc 0,92, hook 0,95 — và khoảng lặng sau câu: 0,28 s mặc định, 0,55 sau
câu hỏi, 0,4 trong hook, ít nhất 0,45 trước câu key. Tốc độ nằm trong khoá cache (chỉ khi ≠ 1), khoảng lặng áp lúc
ghép. Đo 2026-10-01: cao độ (F0) đổi tuỳ lượt, không theo tốc độ hay dấu "…" trước con số — nên điểm nhấn là CHỌN
lượt: `tts_takes.py` thu N lượt cho mọi câu key và giữ lượt rõ nhất có dải cao độ rộng nhất (p10–p90, tối đa 12
semitone được tính). Đổi nhịp = sửa `voice.pace` rồi `voiceover.mjs --reassemble --retime` → `tts_takes.py` →
`--reassemble --only=<id> --retime`; `.tts-cache/_sentences.json` là bản kê câu → file → speed → key mà picker đọc.

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
`--zoom-out=6` lăn chuột để thấy lịch sử tới ~2001). Các panel vẽ (`candles`/`macd`/`rsi`/`bars`/`pictogram`/`list`/`cards`/`zigzag`/`riskReward`) đã bị XOÁ 2026-10-06
(người dùng: "remove the drawn scene since already have the picture and indicator of fireant"); panel còn lại: `image`, `outro`, `lines`, `movers`, `board`. **Người dùng chốt 2026-09-28: scene nào có SỐ trên màn
hình đều là ảnh chart có mark** — (các panel đó đã bị xoá); tỉ lệ lời/lỗ là
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
có ticker (trên) trên mọi scene, tính từ chuỗi giá. **Footer dưới headline là tên kênh, không phải dòng nguồn**
(người dùng 2026-09-29: bỏ "Nguồn: …", ghi tên kênh): tên nằm ở `channel.name` trong
`content-rules.json`, enrich chép vào `footer` và `brand` của outro; brief ghi `footer: false` để ẩn.

**Chữ Việt cần subset `vietnamese` của font.** Thiếu nó thì dấu chồng (Ổ, Ữ, Ặ) rơi về font
khác và lệch khỏi cap height. Icon thì vẽ bằng SVG chứ không gõ ký tự, vì ✓ và ⚠ thiếu ở vài
weight và cũng rơi về font khác.

**Người dùng chốt 2026-09-22: đầu vào là MỘT HAI DÒNG chủ đề, không phải brief.** Agent tự đọc
fact pack (`node scripts/enrich.mjs --facts-only --name=<tên>`), tự viết `brief/<tên>.md`, chạy
liền tới `npm run review-page -- <Id>`, đăng trang đó làm **artifact** (khung hình từng scene, lời, `unsupported`;
người dùng chốt 2026-09-23) rồi mới dừng cho người dùng duyệt. Không dừng
giữa đường để hỏi; không đưa brief ra duyệt.

**Bản phiên (DailyReview): mỗi bản một mp4 và một artifact riêng** (người dùng 2026-10-06: "With each review daily, create
another daily file .mp4 and its artifact respective for me"). Trang duyệt vào `out/review/daily-<ngày>/`, video vào
`out/review/daily-<ngày>.mp4` (mặc định của `render.mjs` theo `edition`; `--out` mang ngày của bản khác bị từ chối), link
artifact của từng bản ghi ở `content/review/artifacts.json` qua `node scripts/review/artifacts.mjs set|get|prev`: lần đăng
đầu là artifact MỚI, vòng duyệt lại của cùng bản đăng lại link đó, không bao giờ đăng lên link của bản trước (tới 5/10 mọi
bản dùng chung một link nên trang của phiên trước mất). Bản tuần và Channel giữ một link như cũ.

**Miễn trừ chỉ nằm ở outro** (người dùng chốt 2026-09-28): footer các scene là tên kênh (không ghi
nguồn, từ 2026-09-29), chữ nhỏ dưới outro là `Mọi thông tin chỉ là thông tin tham khảo, không phải khuyến
nghị đầu tư.` (mặc định của enrich); lời đọc không lặp "không phải khuyến nghị". Outro kêu gọi thả tim ·
chia sẻ · theo dõi bằng giọng người, không MACD, không số.

**Kênh của người dùng là "Chứng Vịt"** (người dùng chọn tên 2026-09-30, sau "Radar Chứng Khoán" ngày 29/9 và "Cú đêm chứng khoán" sáng 30/9; trước đó outro
để chỗ trống `Kênh của bạn`). Thẻ outro in tên đó dưới vòng tròn logo (không có logo thì vòng tròn là monogram `CĐ`, chữ đầu của hai từ đầu); lời outro
gọi tên kênh. Tên là tiếng Việt nên không cần dạng đọc trong `voice.lexicon`. Logo là con vịt đeo kính (người dùng tải `Downloads/chung vit.png` 2026-10-01, thay con cú của 30/9): đầu vịt cắt vuông 512 px ở `public/logo/chung-vit.png`, dùng chung cho Channel và market-review, nằm trong vòng tròn của thẻ outro và trong huy hiệu footer của mọi scene; tên kênh vẫn in dưới/bên cạnh. Brief đặt `logo:`, hoặc `visual.logo`. Logo và tên kênh của người khác vẫn không phải thứ để dựng lại.

## Khi debug

- job TTS đứng im, không log → kiểm `dtype` có còn float32 không
- mất vài chữ đầu câu → lời clip tham chiếu trùng đầu `narration`
- sửa lời mà giọng không đổi → thiếu `--force`
- chữ "nến" đầu cụm ra "nên"/"đến" qua nhiều lượt TTS → nói "tháng … đóng cửa" thay cho "nến tháng …" trong lời (headline giữ "nến")
- nhãn số bị viền cắt, hai nhãn chồng nhau, hay máy giật giữa lúc zoom → `node scripts/frame-audit.mjs <Id> --check` đo MỌI khung hình (không render); nhãn đi qua `framePlates` ở `src/lib/photoLayout.ts` (ImagePanel), đừng vẽ chữ SVG trần. Nhãn của scaffold đè lên nến → `scripts/review/lib/plate-room.mjs` (scaffold in dòng `plate:` cho nhãn nó dời hoặc khung nó lùi ra)
- mark lệch khỏi nến sau khi chụp lại → chạy lại `scripts/calib_chart.py` cho ảnh đó; đừng dùng toạ độ đo tay của ảnh cũ
- TTS đọc thuật ngữ lung tung (MACD → "Macy đi") → thêm dạng đọc vào `voice.lexicon` ở content-rules, thu lại bằng `--force --only`; đừng viết "em a xê đê" vào `narration`
- chữ cái MACD dính nhau, hoặc số thập phân đọc thiếu `phẩy` (`bốn mươi ba mười ba`) → không tin phiên âm Whisper thường; chạy `scripts/tts_takes.py` (thu N lượt, nghe với token chữ số bị chặn, giữ lượt rõ nhất) rồi `voiceover.mjs --reassemble --only=<id> --retime`; và bỏ dấu phẩy đứng ngay trước `phẩy` trong `narration`
- render dừng ở "listening to every sentence" hoặc verify `voice-heard` FAIL → đọc dòng `✗` của `tts_takes.py`: `not heard: <số>` là lượt đọc thiếu chữ (thu thêm `--max-takes=24`, hoặc tách câu nhiều số); `never listened to` là câu thu sau lượt nghe; `a take was picked after the track was built` là quên `--reassemble` — chạy lại `tts_takes.py --content=<reel> --rebuild`. Đừng `--unheard` để qua cửa cho bản sẽ đăng
- hai mã cổ phiếu đánh vần nghe thành một, hay số đếm dính vào mã → tách mã bằng chữ trong `narration` ("AAS và HID, rồi tới DRI", "Số ba là BSR"), không sửa `voice.letters`; lẫn chữ cái (PVT/PVP) thì `tts_takes.py`
- số lớn mất chữ ("năm nghìn tám trăm linh hai tỷ" nghe "năm tám không hai tỷ"), hay chữ I trong mã nghe thành "1" (VIC → "V1C", DRI → "DR1") → giọng tham chiếu (ThanhBinh) là giọng Nam: `voice.lexicon` của rules.json cho giọng đọc "ngàn"/"trăm lẻ" thay "nghìn"/"trăm linh", và `voice.letters.I` là "y" (đo 2026-10-05, script ở `scripts/voice-checks/`); lời và headline vẫn viết "nghìn", "linh"
- mã đọc rời từng chữ, có ngắt giữa các chữ cái → `voice.letterJoin` ở `rules.json` phải là dấu cách (không `, `); `tts_takes.py` báo "gap … inside a spelled ticker" khi lượt nào cũng ngắt — thu thêm `--takes=12`
- bản ghi thật biến mất → chạy `--force` lúc file đang nằm trong `public/voiceover/`
- headline rơi sai câu → `sentenceStarts` cũ, hoặc thêm câu ngắn làm lệch `atSentence`
- `No candle for <tháng>` → `series.peakMonths`/`troughMonths` ở `content-rules.json` (nguồn của `PEAK_MONTHS` trong `src/lib/series.ts`) vượt dải dữ liệu
- stack trace Node ở bước synthesize → chạy `scripts/tts_omnivoice.py` tay để thấy dòng `FAIL`
- `400 config_id is required` → chưa đặt `.zionle-config`
- `404 configuration not found` → id sai hoặc đã hết hạn, không phải sai đường dẫn
- market-review: khối lượng phiên hôm nay thấp bất thường (×0,5 phiên trước) → nến cùng ngày của SSI là số tạm (30/9: 359M lúc 15:20, hôm sau 505M; 1/10: 260M lúc 15:47, FireAnt 449M); đối chiếu thẻ FireAnt/Entrade cùng cơ sở trước khi kết luận phân phối, không in `volumeRatio` của phiên hôm nay, kéo lại trước `approve` (SKILL.md market-review §9)
- `Unknown --id=X` → quên `REELS` ở `src/Root.tsx`
- `roles` FAIL "has to say it is one" → scene `scenario` kể như lời gọi giá; viết lại thành nhánh nếu … thì, đừng thêm chữ vào `mustSay`
- `voice-stems` FAIL giữa hai reel scaffold → id kiểu cũ `hook-1` trùng vị trí; enrich giờ sinh `<tên>-<vai>`
- cận cảnh ảnh hiện chữ FireAnt khổng lồ ở mép trên → khung `shots` cắt vào dòng OHLC; đặt mép trên khung ≥ 0,125
- khung đầu scene ảnh đen một lúc → quét mở màn đang chạy trong lớp đã phóng; với `shots` nó phải ở toạ độ màn hình (ImagePanel)
- `shoot_real: ABORTED before any input` → cửa sổ đang focus không phải cửa sổ app của script (người dùng vừa đụng Chrome); chạy lại khi Chrome rảnh, KHÔNG nới chốt chặn — nới là gõ vào app của họ (đã xảy ra 2026-09-22)
