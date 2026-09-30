---
description: Làm reel TỔNG KẾT thị trường theo phiên (hằng ngày) hoặc theo tuần cho VNINDEX — trạng thái thị trường theo quy tắc phiên phân phối và FTD (O'Neil, dùng trong hệ thống Minervini) cộng hai bộ lọc đã lưu trên terminal zionle.io.vn (Volume spike; RS Strong ∩ Uptrend) — kéo số, chụp ảnh, dựng khung, một người viết lời, chấm điểm, đăng TRANG DUYỆT (artifact) rồi mới lồng tiếng và render. Dùng khi người dùng muốn bản tổng kết phiên hôm nay, tổng kết tuần, review thị trường, trạng thái thị trường, phiên phân phối, FTD hay cổ phiếu dẫn dắt từ bộ lọc. KHÔNG dùng cho reel theo một chủ đề, một mã hay một chỉ báo — đó là market-video.
argument-hint: "daily | weekly [--date=YYYY-MM-DD]"
allowed-tools: Read, Write, Edit, Artifact, Agent, Bash(node *), Bash(npm run *), Bash(npx remotion *), Bash(npx tsc *), Bash(../video-factory/.venv/bin/python *), Bash(ffmpeg *), Bash(ffprobe *), Bash(ps *), Bash(ls *), Bash(cat *), Bash(open *)
---

Làm bản tổng kết thị trường: `$1` (mặc định `daily`).

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
node scripts/review/breadth.mjs                          # đường độ rộng (GET /analyze ~900 mã, ~1 phút, cache theo phiên)
node scripts/review/facts.mjs --format=daily --print     # -> content/review-daily.facts.json
node scripts/review/backtest.mjs                         # FTD theo ngưỡng, 13 năm
node --test scripts/review/lib/market-state.test.mjs     # luật + trạng thái 29/9 đã chốt
```

Máy trạng thái ở `scripts/review/lib/market-state.mjs` (thuần, không mạng): phiên phân phối = giảm từ
`distribution.maxChangePercent` với khối lượng cao hơn phiên trước, còn hiệu lực 25 phiên hoặc tới khi giá
cao nhất vượt 5% trên đóng cửa của nó; 4 phiên = chịu áp lực, 6 = điều chỉnh; FTD = từ ngày 4 của nỗ lực
hồi phục, tăng từ `followThrough.minChangePercent` với khối lượng cao hơn. Fact pack cố ý GỌN — chỉ số được
lên màn hình, làm tròn như khi hiện — vì check `facts` của verify chấp nhận một số khi BẤT KỲ số nào
trong pack làm tròn ra nó.

**Đọc fact pack trước khi nghĩ lời**: trạng thái đổi hôm nay chưa (`state.since`), hôm nay có phải phiên
phân phối/FTD (`session.isDistribution`/`isFtd`), `watch` (điều gì sẽ đổi trạng thái). Kịch bản mọc từ số.

## 3. Ảnh

```bash
node scripts/review/shots.mjs --format=daily        # FireAnt + terminal VNINDEX + 2 bảng Screener + 3 chart mã
node scripts/review/shots.mjs --format=daily --only=screener,leaders      # một phần
node scripts/review/shots.mjs --format=daily --only=leaders --calib-only  # chỉ hiệu chỉnh lại
```

Mọi ảnh vào `public/shots/review/<ngày>/` (không bao giờ đè ảnh của Channel). Screener chụp headless sau
**cửa chặn request** của `shoot.mjs`: mọi non-GET tới zionle bị chặn trong trình duyệt, trừ
`--allow-post=/api/stocks/filter`; ảnh nào mà trang cố gọi API khác thì bị bỏ. `js/screener.js` bấm bộ lọc
đã lưu theo tên, sắp xếp giảm dần (VOL/SMA hoặc RS 1M), ẩn cột không nói tới, phóng chữ, và ghi toạ độ
từng dòng/ô vào sidecar. Chart có hiệu chỉnh (`calib_auto.py` → `calib_chart.py`) để mark rơi đúng nến —
số dư lớn là do mũi tên/trendline của terminal cùng màu nến; soát bằng khung hình, không bằng con số.

## 4. Khung scene và khung hình nháp

```bash
node scripts/review/scaffold.mjs --format=daily      # -> content/review-daily.json + brief/review-daily.md
npm run review-page -- DailyReview --out=out/review/draft-daily
```

Scene theo `rules.formats.daily.roles` (người dùng yêu cầu tối ưu giữ người xem 2026-09-29, theo arc
hook_payoff + đếm ngược của vox-director): hook (căng thẳng → neo → lời hứa) → market (bối cảnh, đồng hồ) →
breadth (nghịch lý độ rộng, panel `pictogram` chấm) → spike (gieo móc "mã ở cả hai bộ lọc") → leaders → leader
#3 → #2 → #1 (mỗi mã một chi tiết riêng, #1 trả móc) → watch (payoff, máy đứng yên, câu nếu … thì) → outro —
10 scene, ~80 giây. Bản tuần thêm `week` sau hook.
Id mang ngày (`rd-260929-hook`) để file giọng mỗi bản tách nhau. Bản trước được chép vào
`content/review/archive/` trước khi bị thay. Mark đặt từ số: vline trên từng phiên phân phối, vòng trên nến
FTD, hline ở đáy nhịp hồi, hộp trên ba dòng được chọn và trên ô VOL/SMA / RS 1M, hline EMA50 và mũi tên ở
nến cuối của từng mã. **Nhìn khung hình từng beat** rồi mới cho người viết: nhãn chồng nhau hay rơi khỏi
khung thì sửa ở `scaffold.mjs` (không sửa JSON tay — bản sau sẽ đè).

`DailyReview` đã đăng ký trong `src/Root.tsx`. Bản tuần đầu tiên: thêm `WeeklyReview` (import
`../content/review-weekly.json`) vào `REELS` NGAY SAU khi scaffold lần đầu — file phải có trước khi đăng ký,
thiếu file là verify của MỌI reel báo `registration` FAIL.

## 5. Một người viết cho cả reel

Một agent, prompt = [writer.md](writer.md) + tên reel + thư mục ghi (`.review-cache/writer/<ngày>-<format>/`)
+ **ghi chú giọng của đạo diễn** (kết luận của phiên, số nào là nhân vật chính, scene nào dài). Agent ghi
`<id>.json` từng scene + `_script.md`. Đọc `_script.md` thành tiếng trước khi merge; nghe như bản tin thì
trả lại kèm ghi chú.

```bash
node scripts/merge.mjs content/review-daily.json --from=.review-cache/writer/<ngày>-daily
```

## 6. Chấm điểm

```bash
npm run verify -- DailyReview
```

Verify dùng luật của reel (`rules.json`) và cộng các check của skill (`scripts/review/checks.mjs`):
`review-fresh` (cache và mọi ảnh thuộc phiên, sau 15:00), `review-state` (trạng thái, FTD, số phiên phân
phối trên màn hình khớp máy trạng thái), `review-picks` (mã trên màn hình là mã được chọn, ảnh đúng mã),
`review-outro`, `review-index` (cảnh báo khi chart chỉ số là của terminal chứ không phải FireAnt). `roles`
FAIL khi scene `market` thiếu "nếu". Tối đa 4 vòng sửa; còn FAIL thì hỏi người dùng.

## 7. Trang duyệt — điểm dừng duy nhất

Viết `out/review/review-daily/notes.json` (kết luận: trạng thái, tiền đề nào số đỡ, verify còn gì), rồi:

```bash
npm run review-page -- DailyReview
```

Đăng bằng tool Artifact (`file_path=out/review/review-daily/index.html`, `root`, `files` từ `files.json`,
icon `chart`). Mỗi format MỘT link: bản sau đăng lại cùng file (hoặc kèm `url` cũ). Trả lời ngắn: trạng
thái theo quy tắc, verify còn WARN gì, `unsupported`, ảnh chỉ số là FireAnt hay terminal, và lựa chọn duyệt ·
sửa · bỏ. Không lồng tiếng khi chưa có câu trả lời.

## 8. Sau khi duyệt

```bash
npm run approve -- DailyReview
node scripts/voiceover.mjs --content=content/review-daily.json --retime
npx tsc --noEmit && node scripts/render.mjs --id=DailyReview --out=out/review/daily-<ngày>.mp4
```

Id có ngày nên không cần `--force` cho bản mới; sửa lời một scene thì `--force --only=<id>` như market-video.
Soát sau render như market-video §5 (Whisper cho FTD/RS/tên công ty — đo xong mới thêm vào `voice.lexicon`,
khoảng lặng, khung hai bên mốc beat). Không lồng tiếng hai reel cùng lúc (chung `.tts-cache`).

## 9. Những điều đã đo — đừng đo lại

- Cache Screener 29/9/2026: 12:00 (giữa phiên) rồi 15:04 (sau đóng cửa), 1466 mã.
- `volume_vs_sma` tính theo % (VOL/SMA hiện `+144.1%`): bộ lọc "Volume spike" (`> 1.2`) bắt cả mã chỉ trên
  trung bình 20 phiên hơn 1,2% — ba mã chọn lên reel là ba mã mạnh nhất. Giao diện ghi "Vol x SMA > 1.2"
  như bội số; đó là cấu hình của người dùng, skill không sửa.
- Trang /analyze và /screener tự `POST /api/stocks/filter` khi mở; /analyze vẫn vẽ chart đủ khi bị chặn, và
  trang nào cũng gửi beacon `POST /cdn-cgi/rum` (chặn, vô hại).
- `/analyze` với `1W`/`1M`/`4H` trả 500 — nến tuần gộp từ SSI.
- Ba mã hoà RS 1M 94 (BSR, MSR, PVT ngày 29/9): thứ tự trong ảnh có thể khác, tập hợp phải trùng.
- Chart terminal: pane giá là y 0–0,54, trục giá từ x 0,956 (thẻ giá trendline cùng màu nến) — crop bỏ trục.
- FireAnt 29/9: "no new Chrome app window … appeared" = màn hình NGỦ, không phải Chrome hỏng (người dùng nhìn
  thấy màn hình sáng — đó là màn khoá/hình nền). Space đánh thức, chụp ngay được.
- Nút khung thời gian của FireAnt tự chọn cỡ nến và bấm interval sau đó GIỮ SỐ NẾN: `3p` rồi `D` ra 15 tháng nến
  ngày, `6p` một mình ra nến 2 giờ (và để lại tab của người dùng ở 2h — lượt sau bấm D trả về 1D). Công thức
  đúng: `--interval=D --reset-view` → ~6,5 tháng nến ngày, nến cuối sát mép phải; hiệu chỉnh 142 nến, trung vị 0,54 px.
- Scene 1 (hook) là ảnh FireAnt có GHIM (người dùng yêu cầu 29/9): beat 1 vòng quanh nến FTD, beat 2 vline
  các phiên phân phối + vòng vàng nến hôm nay; câu ghim beat 2 nói "… có ba phiên phân phối".
