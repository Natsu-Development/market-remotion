---
description: Làm reel TỔNG KẾT TUẦN của VNINDEX (WeeklyReview) sau phiên cuối tuần — cây nến tuần, trạng thái thị trường theo quy tắc phiên phân phối và FTD (O'Neil, dùng trong hệ thống Minervini), độ rộng thị trường (đường % mã trên SMA200 dưới đường chỉ số — scene này CHỈ có ở bản tuần; ảnh FireAnt "Biến động thị trường" là của bản phiên), ba bộ lọc đã lưu trên terminal zionle.io.vn mỗi bộ lọc một scene, rồi soi tối đa hai mã dẫn dắt — kéo số, chụp ảnh, dựng khung, một người viết lời, chấm điểm, đăng TRANG DUYỆT (artifact) rồi mới lồng tiếng và render. Dùng khi người dùng muốn tổng kết tuần, review tuần, bản tuần, nhìn lại tuần qua, thị trường cuối tuần ra sao, độ rộng thị trường tuần này. KHÔNG dùng cho tổng kết phiên hằng ngày (đó là market-review) hay reel theo một chủ đề, một mã, một chỉ báo (market-video).
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

## 2. Fact pack tuần

```bash
node scripts/review/breadth.mjs                            # đường độ rộng: GET /analyze ~900 mã, ~1 phút, cache theo phiên ở .review-cache/analyze-all/
node scripts/review/facts.mjs --format=weekly --print      # -> content/review-weekly.facts.json (screener.breadth có line/history khi breadth.json có)
node --test scripts/review/lib/market-state.test.mjs
```

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

### Độ rộng thị trường: đường % mã trên SMA200, CHỈ có ở bản tuần

Người dùng 2026-10-05 ('Daily; old chart → weekly'): bản tuần giữ scene "Độ rộng thị trường" cũ — panel `lines` vẽ hai
đường cùng trục thời gian, VN-INDEX đóng cửa ở trên, % mã đứng trên SMA200 (của terminal) ở dưới, ~60 phiên, mốc FTD —
còn ảnh FireAnt "Biến động thị trường" (số mã tăng/giảm và phân bổ dòng tiền của MỘT phiên) là scene `flow` của bản phiên.

- Số của đường: `node scripts/review/breadth.mjs` (§2) tính lại % mã trên SMA200 theo từng phiên từ `GET /analyze` của
  ~900 mã → `content/review/breadth.json`; `facts.mjs --format=weekly` đưa vào `screener.breadth` (`history[]`, `line`:
  đầu/cuối/đỉnh, % chỉ số cùng đoạn, `vsScreener` — độ lệch so với số đếm của Screener).
- Scene: beat 1 đường chỉ số vẽ ra, beat 2 đường độ rộng vẽ ra; nghịch lý là chỉ số đi một đằng mà phần lớn mã đi một nẻo.
  Thiếu lịch sử độ rộng (`breadth.json`) hay pack thiếu `screener.breadth` thì scaffold bỏ scene và in `breadth: dropped — <lý do>`
  (lưới chấm `pictogram` dự phòng đã bỏ cùng các panel vẽ, người dùng 2026-10-06), market trao lời thẳng cho các bộ lọc.

## 4. Soi từng mã dẫn dắt

Giống market-review §3 ("Soi từng mã dẫn dắt — agent `symbol-reviewer`"), với ngày là phiên cuối tuần và format là
`weekly`: chạy `node scripts/review/lib/symbol-review.mjs measure <ngày> <MÃ>` cho từng mã trong
`screener.leaders.top`, mỗi mã một agent `symbol-reviewer` chạy song song, rồi `facts.mjs --format=weekly` lần nữa.
Bộ lọc là của phiên cuối tuần, vì terminal không giữ lịch sử. Bản soi nằm theo NGÀY (`content/review/symbols/<ngày>/`),
nên tối thứ Sáu bản tuần dùng lại bản soi của bản phiên: `node scripts/review/lib/symbol-review.mjs <ngày>` báo hợp lệ
thì chỉ soi mã còn thiếu. `measure` và bộ soát đọc fact pack có `asOf` đúng ngày (pack của format, pack của format kia,
rồi pack trong archive); trước 5/10 chúng luôn đọc pack PHIÊN mới nhất, nên bản soi cũ hỏng khi pack phiên sang ngày
khác (bản soi PVT 2/10 bị loại ngày 5/10 vì giá 24,20 của 5/10).

## 5. Khung scene và khung hình nháp

```bash
node scripts/review/scaffold.mjs --format=weekly     # -> content/review-weekly.json + brief/review-weekly.md
npm run review-page -- WeeklyReview --out=out/review/draft-weekly
node scripts/frame-audit.mjs WeeklyReview --check    # mọi khung hình — phải 'no defects'
```

Scene theo `rules.formats.weekly.roles`, 11 scene, 70–110 giây: **hook** (tuần qua: chỉ số đóng tuần ở đâu, tăng hay giảm bao nhiêu, rồi câu hỏi và lời mời) → **week** (cây nến tuần
trên ảnh FireAnt tuần: tuần tăng/giảm bao nhiêu, khối lượng so với tuần trước, đóng cửa ở đâu trong biên tuần) →
**market** (trạng thái theo quy tắc tới phiên cuối tuần, phiên phân phối, FTD, đồng hồ, mức nguy hiểm, kết bằng câu dẫn
sang độ rộng) → **breadth** (đường % mã trên SMA200, §3) → **spike** → **rs** → **uptrend** → **leader** ×2 → **watch** (payoff,
các nhánh nếu … thì cho tuần sau) → **outro** (hứa "mỗi cuối tuần"). Các scene bộ lọc, soi mã và watch dựng y như
bản phiên. Id mang ngày phiên cuối tuần (`rw-261009-hook`).

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
npx tsc --noEmit && node scripts/render.mjs --id=WeeklyReview --out=out/review/weekly-<ngày>.mp4
```

Soát sau render như market-review §8 (Whisper cho FTD và các mã đánh vần; `tts_takes.py` cho số thập phân và thuật ngữ).

## 10. Chưa từng chạy: soát kỹ ở bản đầu tiên

Tới 2026-10-05 chưa có bản tuần nào. Đường `--format=weekly` mới chỉ được dựng thử ra file nháp, nên bản đầu tiên
phải nhìn tận mắt những chỗ sau:

- ảnh `vnindex-weekly` (Chrome thật) và hiệu chỉnh của nó trên nến tuần — chưa chụp lần nào. Thiếu ảnh hay thiếu hiệu
  chỉnh thì scaffold BỎ scene `week` mà không báo, nên đếm số scene so với `formats.weekly.roles`;
- scene `breadth` (đường % mã trên SMA200, `breadth.mjs`) trên bản tuần — khôi phục ngày 2026-10-05 khi ảnh FireAnt sang bản phiên;
- hook, market và watch của bản tuần: brief của scaffold viết cho bản phiên rồi thêm nhánh tuần. Lời phải nói về
  TUẦN, còn phiên thứ Sáu chỉ là một phần của tuần;
- `review-fresh` và trang duyệt trên reel `WeeklyReview`, cùng lần đăng ký đầu tiên trong `src/Root.tsx`.
