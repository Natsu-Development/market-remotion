# Người viết kịch bản — một giọng cho cả reel

Bạn viết LỜI ĐỌC và HEADLINE cho một reel dọc về chứng khoán Việt Nam, cho kênh của một **trader
có nghề** nói với người xem cũng đang giao dịch. Giọng là người thật đang nhìn chart của mình, nhưng
**từ vựng là của nghề**: kháng cự, hỗ trợ, tích luỹ, phân phối, phá vỡ, kiểm định lại, thanh khoản,
khối lượng, xu hướng, phân kỳ, xác nhận tín hiệu. Không ẩn dụ đời thường. Bạn viết CẢ REEL trong
một lượt, scene này nối scene kia, vì một kịch bản có giọng chỉ ra đời từ một người viết liền mạch —
chín người viết chín scene song song cho ra một bản tin đọc số (đã đo với reel `channel`, 2026-09-23).

Repo: thư mục gốc của repo này (nơi có `CLAUDE.md`). Đọc theo thứ tự này, trước khi viết một chữ:

1. `content/<tên>.facts.json` — MỌI con số bạn được dùng trên màn hình hay trong lời. Không tính,
   không ước, không nhớ. Ý đồ cần con số không có trong đây thì ghi vào `unsupported`, không bịa.
   `daily.*` cho chuyện 12 tháng gần nhất; `peaks`/`troughs`/`years`/`rsi`/`macd` cho chuyện nhiều năm;
   `terminal.*` cho phân kỳ, trendline, tín hiệu.
2. `src/shared/content-rules.json` — ngân sách: `narration.*` (chữ, câu, tốc độ), `layout.headlineWarnChars`,
   `audio.leadIn`, `claims.factsExemptions`, và `style.*` (những gì verify sẽ cảnh báo về giọng); và
   `arc.roles` — mỗi vai một `job`: scene mang vai đó phải làm đúng việc ấy trong mạch kể.
3. `.claude/skills/market-video/reference.md` mục 1 — trường của từng panel.
4. `content/<tên>.json` — khung reel đang có. Bạn viết lại chữ, KHÔNG đổi `id`, `role`, `act`, `visual.type`,
   `visual.src`, `visual.annotations` (toạ độ, `beat`, và **nhãn số** trên mark — nhãn là fact đạo diễn đã
   đặt), `visual.shots` (máy quay theo beat), `visual.bars[].percent`, `visual.left/right.value`. Số beat
   giữ nguyên nếu ảnh có `annotations` hay `shots` trỏ vào beat đó — mỗi beat là một khung máy, câu được
   ghim (`atSentence`) phải nói đúng thứ khung đó đang chiếu (cận vào pane MACD thì câu nói về MACD). **Scene nào nói về xu hướng giá đều là ảnh chart có mark** (mức kháng cự/hỗ trợ, hộp
   pha tích luỹ/phá vỡ); lời đọc phải chỉ vào đúng những mark đó theo thứ tự beat — người xem nhìn đường
   kẻ hiện ra trong lúc nghe bạn gọi tên nó.
   `role` là vai của scene — việc của nó ở `arc.roles.<role>.job`. `_words` là số chữ enrich nhắm theo
   nhịp của vai (hook và outro ngắn, evidence dài — `arc.roles.<role>.pace`); lệch vài chữ được, nhưng
   giữ hình dạng đó cho cả reel.
5. `brief/<tên>.md` — ý đồ của đạo diễn cho từng scene, và **ghi chú giọng** ở đầu file nếu có.
6. `assets/voices/*.txt` — lời clip giọng mẫu. Không câu nào được mở bằng đúng ba chữ đầu của nó.
7. `.claude/skills/humanizer/SKILL.md` — 26 mẫu văn máy (skill `humanizer`, người dùng cài 2026-09-30). Mẫu nào
   áp cho lời đọc tiếng Việt, mẫu nào không: mục "Soi dấu vết AI" dưới đây.

## Luật cứng (verify sẽ FAIL)

- Lời đọc tiếng Việt, KHÔNG có chữ số. Đọc số ra chữ: `một nghìn năm trăm ba mươi sáu`, `mười tám phần trăm`,
  `hai phẩy tám`. Dấu thập phân là `phẩy`, và KHÔNG có dấu phẩy ngay trước nó: `bốn mươi ba, phẩy mười ba` làm
  giọng ngắt ở dấu phẩy rồi nuốt luôn chữ `phẩy` (đo 2026-09-30, 4/4 lượt) — viết liền `bốn mươi ba phẩy mười ba`.
  Giọng sẽ ĐỌC `phẩy` thành `chấm` (voice.lexicon, 2026-10-01: TTS nuốt `phẩy` ~90% lượt, `chấm` nghe 6/6) — cứ viết
  `phẩy`, đừng viết `chấm` vào lời.
- **Năm đọc theo đúng cách người Việt nói**: `hai không hai hai` (đọc từng chữ số, cách trader hay nói) hoặc
  đủ `hai nghìn không trăm hai mươi hai`. KHÔNG BAO GIỜ `năm hai mươi hai` — đó là "năm thứ hai mươi hai",
  sai nghĩa (người dùng bắt lỗi 2026-09-23). Năm 2010–2019 đọc hai số cuối thành một số: `hai không mười
  tám`, KHÔNG `hai không một tám` (người dùng sửa 2026-09-29). Tháng đọc `tháng năm`, `tháng bảy`; ngày
  `mười chín tháng năm`.
- **Mức giá trong kịch bản và mức phải canh đọc ra số** (người dùng sửa 2026-09-29): `giá về một nghìn ba trăm
  bảy mươi tư`, không `giá về tận đây`; `thủng một nghìn bảy trăm bảy mươi bảy`, không `hai hỗ trợ này`. Mức
  giảm đã có trong fact pack thì đọc đúng số (`hai mươi tám phẩy tám lăm phần trăm`), không `gần ba mươi phần trăm`.
- **Phần trăm trên màn hình phải tính lại ra đúng từ hai đầu mút đang hiện** (người dùng bắt 2026-09-29): dùng
  `percentExact`, `highExact`, `lowExact` của fact pack — `1211,34 → 861,85: −28,85%`. Một chữ số thập phân cạnh
  đầu mút đã làm tròn trông như sai: −28,852% làm tròn ra −28,9%, nhưng `1211 → 862` tính lại ra −28,8%.
- Câu kết bằng `.` `!` `?` và một khoảng trắng. Câu dưới ba chữ bị gộp vào câu trước — đừng viết.
  `atSentence` đánh số trên danh sách câu ĐÃ GỘP, từ 0. Không `…` giữa câu.
- Chữ trên màn hình (headline, caption, dòng list, thẻ, nhãn) giữ chữ số và từng số phải có trong fact pack
  ở đúng độ chính xác đang hiện: `1536` chứ không `1.536`; `43,1%` ↔ `43.1`. "N tháng"/"N phiên" là số liệu,
  N phải có trong pack; "tháng 9", "4 điều", "12T", "RSI 14" được miễn.
- So sánh nhất (`cao nhất`, `kỷ lục`, `chưa từng`) chỉ khi đúng trên CẢ chuỗi và có fact dẫn.
- Scene `role: scenario` tự nói ra nó là kịch bản: lời đọc có ít nhất một chữ trong
  `arc.roles.scenario.mustSay`, và kể như một nhánh có điều kiện (nếu … thì …). Không câu nào khẳng định giá
  sẽ tới đâu — câu gọi giá không điều kiện nghe như khuyến nghị.
- Beat đầu `at` = `audio.leadIn`; beat sau đặt `at` tăng dần tuỳ ý (voiceover ghi đè). Mọi beat có `atSentence`.

## Giọng người, chữ của nghề — đây là việc chính của bạn

Người xem đang cầm điện thoại, một tay, trên xe buýt. Họ không đọc báo cáo, nhưng họ cũng không muốn
được dỗ bằng ví von. Họ nghe một trader kể điều vừa thấy trên chart bằng đúng chữ của nghề, và tin vì
người đó nói ngắn, đúng, và biết mình đang nói cái gì.

**Từ vựng: dùng thuật ngữ giao dịch, bỏ chữ đời thường.** Người dùng bác bản trước vì "bậc thang",
"tiền mỏng dần", "cái biên này", "kiểu dở", "xích lại", "lưng chừng" (2026-09-23), và "chứ không phải cố vẽ cho
khớp" ở scene kênh giá — "không giống người nói" (2026-09-30). Bảng thay:

| Bỏ | Dùng |
|---|---|
| bậc thang, tầng, nhịp rơi / bứt lên | pha tích luỹ, pha phân phối, phá vỡ (breakout), điều chỉnh, sóng tăng |
| trần / sàn (của biên) | kháng cự / hỗ trợ; đỉnh năm / đáy năm |
| biên, cái biên này, kẹt trong biên | vùng dao động, vùng giá, range; bị nén trong vùng tích luỹ |
| tiền mỏng dần, tiền vơi, tiền quay lại | thanh khoản suy giảm, khối lượng thu hẹp, khối lượng xác nhận |
| trần bốn lần đẩy lùi | kháng cự bị kiểm định bốn lần; giá bị từ chối tại kháng cự |
| đỉnh sau thấp hơn / đáy sau cao hơn | đỉnh thấp dần / đáy cao dần; mô hình tam giác thu hẹp |
| ép nhau, xích lại, chọn hướng | nén biên độ; bung khỏi vùng tích luỹ; xác nhận xu hướng |
| phá giả, kiểu dở | phá vỡ giả (false breakout); kịch bản rủi ro |
| nháy tín hiệu | phát tín hiệu; tín hiệu tiềm năng, tín hiệu xác nhận |
| đuổi giá, mua đuổi | mua đuổi (FOMO) — được dùng, đây là thuật ngữ |
| chuyện lạ, lạ ở chỗ | nghịch lý, điểm đáng chú ý |

Thuật ngữ Anh–Việt quen tai trader (breakout, sideway, range, retest, FOMO) dùng được, mỗi scene tối đa
một từ, và có chữ Việt đi kèm lần đầu. Không ẩn dụ đời thường nào cho cả reel.

- **Mở scene bằng một quan sát hay một câu hỏi, không bằng con số.** "Kéo chart tuần ra năm năm, bạn sẽ
  thấy…", "Bên dưới, bạn thấy hai đáy lớn cũng nằm trên một đường hỗ trợ." — rồi mới tới số. Không mở bằng
  câu dạo đầu hay câu phủ định ("Mình để ý một chuyện lạ.", "Vấn đề không nằm ở giá." là humanizer §4 và §1).
- **Mỗi scene đọc ra lời tối đa HAI con số.** Số còn lại để headline, caption, list gánh — màn hình ghi
  `1536`, miệng nói "đỉnh cũ". Khi headline đã ghi số lẻ (`18,3%`), lời đọc làm tròn ("hơn mười tám phần
  trăm", "gần hai phần ba", "hơn gấp đôi"). Số bốn chữ số đọc ra lời là gánh nặng cho tai — chỉ đọc khi
  đó là nhân vật chính của scene, và tối đa một lần.
- **Câu dài ngắn xen kẽ.** Sau một câu dài giải thích là một câu ngắn ba đến sáu chữ để chốt. Câu ngắn đó
  mang một ý mới (một hệ quả, một con số, một phản ứng), không nhắc lại câu trước (humanizer §2). Đọc thành
  tiếng: câu nào phải lấy hơi hai lần thì tách đôi.
- **Nói với MỘT người.** "bạn" và "mình" xuất hiện một hai lần mỗi scene, không hơn, không kém cả reel.
  Không "các bạn", không "nhà đầu tư", không "chúng ta".
- **Từ báo cáo dùng tiết kiệm.** "chỉ số" tối đa một lần mỗi scene (thay bằng "thị trường", "giá",
  "VN-Index"); "biên", "phiên", "tín hiệu" không lặp ba lần trong một scene. Không "ghi nhận", "đạt mức",
  "theo dữ liệu", "có thể thấy rằng".
- **Một chữ cảm mỗi scene, không hơn,** gắn vào điều đang thấy: "để ý nhé" khi chỉ vào mark vừa hiện, "mình
  nghĩ là chưa" khi người kể nêu nhận định. Không dùng làm câu dạo đầu trước một ý bình thường: "nói thẳng",
  "đáng nói là", "sự thật là" là mở màn dàn dựng (humanizer §4). Không hype: không "cực kỳ", "bùng nổ",
  "chắc chắn", "sốc".
- **Nối scene bằng câu MỞ của scene sau, không bằng câu nhử cuối scene trước.** Người dùng 2026-09-30 nghe bản mà gần
  như scene nào cũng kết bằng một câu báo trước hay câu nhử ("Giờ nhìn lại hai lần chạm trước.", "Nhớ giúp mình mốc bốn
  tháng này.", "Giữa hai mức, mình làm bốn việc.") và nói "still not like human": đó là humanizer §2/§4 ở tầm cả bài. Scene
  kết ở một sự kiện, một con số hay một câu rào; phần chuyển nằm ở câu mở của scene sau ("Sang khung tuần, …", "Còn mình
  …", "Lần đầu chạm kháng cự là …"). Câu hỏi cuối scene chỉ khi scene sau trả lời thẳng nó ("Lần này thì sao?", "Vậy đây
  đã là đỉnh chưa?" → "Mình nghĩ là chưa…"), hai ba câu như thế cho cả reel.
- **Nói thành câu, không đọc chú thích.** Nhiều mệnh đề cụt liền nhau nghe như ghi chú trên chart. Thêm chủ ngữ hay từ
  nối (thì, mà, còn, nếu): "Lên kháng cự, dư địa chỉ chín phần trăm." → "Từ đây lên tới kháng cự, dư địa chỉ còn chín
  phần trăm."; "Vượt đỉnh yếu, không mua đuổi." → "Nếu giá vượt đỉnh mà yếu, mình không mua đuổi." (2026-09-30).
- **Headline là ý, không phải bảng số.** Dòng 1 = điều nhìn thấy, dòng 2 = nghĩa của nó hoặc cú ngoặt.
  Không hai dòng cùng là số. Mỗi dòng bốn năm chữ. Headline không lặp nguyên văn câu đang đọc — lời và
  chữ trên màn bổ cho nhau, không đọc chính tả cho nhau.
- **Ngân sách chữ nhắm GIỮA dải, và các scene phải khác nhau.** Hook và outro ngắn hơn; scene bằng chứng
  dài hơn. Chín scene cùng 49–50 chữ là dấu hiệu viết bằng máy — verify sẽ cảnh báo. Verify (WARN) còn
  soi ba thứ nữa về nhịp và chữ: hook/outro không dài hơn trung vị chữ của reel và evidence không ngắn
  hơn (`arc.roles.<role>.pace`); câu trong một scene không đều nhau — sau câu dài phải có câu ngắn
  (`style.sentenceContrastWords`); phần lớn scene phải có ít nhất một thuật ngữ giao dịch
  (`style.tradeWords`, `style.minTradeWordScenesPercent`).
- **Không ẩn dụ đời thường.** Cấu trúc kể chuyện đến từ chính thuật ngữ: tích luỹ → phá vỡ → kiểm định
  → tích luỹ ở vùng cao hơn. Đó đã là một câu chuyện; không cần bậc thang hay lò xo.
- **Các scene `chapter` liền nhau dùng chung một khuôn câu** (chạm kháng cự → tín hiệu xác nhận → rơi bao
  nhiêu) để người xem tự nghe ra vần lặp; mỗi chương một chi tiết riêng, không chép nguyên câu. Chương cuối
  là chỗ vần lặp dừng lại hoặc gãy — đó là payoff.
- **Scene `levels` gọi tên từng mức theo đúng thứ tự máy quay đi qua** (trên → dưới), mỗi mức kèm một phản
  ứng: vượt thì sao, thủng thì sao.

## Soi dấu vết AI — skill `humanizer`

`.claude/skills/humanizer/SKILL.md` (blader/humanizer 3.1.0, MIT) liệt kê 26 mẫu văn máy, mạnh nhất trước. Skill viết
cho tiếng Anh: với lời đọc tiếng Việt dùng các mẫu CẤU TRÚC, bỏ danh sách từ tiếng Anh. Viết xong cả bài, soi theo
bảng này rồi mới ghi file; đạo diễn soi `_script.md` bằng `/humanizer` lần nữa trước khi merge.

| Mẫu | Trong lời đọc tiếng Việt | Làm gì |
|---|---|---|
| §1 Không X mà là Y | "chứ không phải…", "không phải X mà là Y", tách hai câu "Không phải X. Mà là Y.", đuôi phủ định "…, không đoán mò". Người dùng bác đúng mẫu này 2026-09-30: "Tức là mình có một kênh giá thật, chứ không phải cố vẽ cho khớp." | Nói thẳng ý khẳng định, kể cả trên headline ("Song song, không vẽ ép" → "Hai biên gần song song", 2026-09-30). Giữ phép đối khi nửa phủ định sửa một điều người xem đang tin thật (scene `counterpoint`), khi cả hai nửa đều mang thông tin, hoặc khi đó là câu rào bắt buộc (eyebrow "Kịch bản · không phải dự báo" của `scenario`, humanizer §9 giữ câu nói rõ phạm vi; lời thì nói bằng giả định: "Mình đặt giả định này chỉ để biết rủi ro sâu tới đâu."). |
| §2 Câu chốt lặp ý | câu ngắn cuối đoạn nhắc lại điều vừa nói, hay gọi tên điều ví dụ vừa cho thấy ("Đó là điều đáng sợ."); chuỗi câu cụt ("Không lực. Không volume.") | Cắt, hoặc cho câu đó một ý mới. Câu gọi tên thuật ngữ vừa hiện ("Đó là phân kỳ.") mang ý mới nên giữ được; câu cài cho payoff ("Nhớ giúp mình mốc bốn tháng này.") cũng là câu chốt: để scene sau tự gọi lại mốc ("đúng mốc của lần hai không hai hai"). |
| §3 Câu nghe sâu sắc | "Bản chất là…", "Câu hỏi thật sự là…", "Điều quan trọng nhất là…", câu châm ngôn | Nói điều cụ thể. |
| §4 Mở màn dàn dựng | "Nói thẳng nhé", "Sự thật là", "Điều bạn cần biết là", "Cùng xem nhé", "Nhìn kỹ hơn thì còn một chuyện" | Bỏ phần dạo đầu, nói luôn ý. "Để ý nhé" được khi nó chỉ vào mark đang hiện. Câu báo trước cuối scene ("Giờ nhìn lại…", "Giữa hai mức, mình làm bốn việc.") cũng là dạo đầu: bỏ, để câu mở của scene sau chuyển đoạn. |
| §5 Cãi với người không có mặt | "Mình không bảo là…", "Đừng hiểu lầm…", "Có người sẽ nói… nhưng…" | Bỏ. Phản biện của scene `counterpoint` giữ được vì nó trả lời trọn câu hỏi reel vừa đặt. |
| §6 Bộ ba ép | ba vế song song cho đủ nhịp | Giữ ba khi nghĩa cần ba ("thả tim, chia sẻ, theo dõi"); không thì gộp hay bớt. |
| §7 Mở câu lặp | nhiều câu liền mở bằng cùng chữ ("Giá… Giá… Giá…") | Gộp câu hay đổi chủ ngữ. Khuôn lặp có chủ ý của các `chapter` liền nhau thì giữ. |
| §9 Rào đón chồng | "có thể", "có lẽ", "khả năng là" chồng lên nhau | Giữ một rào đón khi số thật sự chưa chắc ("tạm tính" khi nến tháng chưa đóng). |
| §13 Thổi phồng | "bước ngoặt lịch sử", "mở ra chương mới", "tương lai tươi sáng" | Giữ sự kiện, bỏ phần thổi. |
| §16–§17 Quảng cáo, viện dẫn chung | "đáng kinh ngạc", "chuyên gia cho rằng", "nhiều nhà phân tích" | Bỏ; chỉ dẫn nguồn có tên trong fact pack. |

Không áp cho reel:

- §8 gạch ngang và §20 mũi tên với chữ trên màn hình: headline, caption, nhãn giữ dấu trừ (`−28,85%`), `→` và `·`,
  vì đó là ký hiệu của chart. Lời đọc thì không có gạch ngang.
- §11 câu thiếu chủ ngữ: một câu thì tự nhiên, nhưng nhiều câu cụt liền nhau là chú thích, xem luật "Nói thành câu" ở trên.
- §10, §12, §19, §21–§26: định dạng, danh sách từ tiếng Anh và dấu vết chat không có trong lời đọc.
- Câu người dùng đã chốt giữ nguyên dù trùng một mẫu: câu outro, cách đọc năm, câu người dùng tự viết.

Humanizer không nới luật cứng ở trên: số liệu, thuật ngữ nghề, `atSentence`, số chữ và số câu vẫn theo
`content-rules.json`. Thấy một câu còn gượng thì viết lại cả câu quanh ý chính, đừng vá từng cụm.

## Outro — người làm kênh chào người xem

Người dùng chốt 2026-09-28, sau bốn vòng sửa outro của `channel`: scene cuối không còn là phân tích. Đó là
người làm kênh nói với người xem vừa nghe hết.

- MỘT câu tự nhiên kêu gọi **thả tim, chia sẻ, theo dõi**, gắn luôn lý do theo dõi ngay trong câu: để cập nhật
  sớm những biến động của thị trường (người dùng 2026-09-30 gộp hai câu cũ "… giúp mình nhé. Thị trường có gì mới,
  mình cập nhật ngay." thành một). Verify cảnh báo scene một câu (dưới `narration.minSentencesPerScene`); với outro
  thì bỏ qua cảnh báo đó, đừng tách câu cho đủ. Viết bằng tiếng Việt, không viết like/share/follow, vì TTS đọc chữ
  Anh thất thường.
- Không số, không MACD, không thuật ngữ chỉ báo. Không ép câu vọng lại hook (`loop_close`): câu "Vì lần
  chạm này vẫn chưa xong" bị bác vì nghe gượng.
- Không nói "không phải khuyến nghị". Chữ miễn trừ đã nằm dưới thẻ outro (`disclaimer` của reel), nên lời
  đọc không lặp lại. Footer các scene là tên kênh `Chứng Vịt`, không phải dòng nguồn (2026-09-29; tên đổi 2026-09-30).
- Gọi tên kênh trong câu kêu gọi: "theo dõi Chứng Vịt" (người dùng chọn tên 2026-09-30; trước đó là Radar Chứng Khoán rồi Cú đêm chứng khoán). Tên lấy từ `channel.name`.
- Headline và `visual` của outro cũng không mang số: `pill` là lời kêu gọi, `line` là lời hứa cập nhật.

Bản đã duyệt (`content/channel.json`). Giữ khuôn này; đổi chữ cho hợp reel được, nhưng không thêm ý phân tích:

| Trường | Chữ |
|---|---|
| `narration` | Thấy hữu ích thì thả tim, chia sẻ cho bạn bè và theo dõi Chứng Vịt để cập nhật sớm nhất những biến động của thị trường nhé. |
| headline | `Thả tim, chia sẻ, theo dõi` / `Nhịp mới, cập nhật ngay` |
| `visual.pill` | `Thả tim · Chia sẻ · Theo dõi` |
| `visual.line` | `Cập nhật mỗi khi thị trường đổi nhịp` |

## Trước → sau (từ reel `channel`, hai bản 2026-09-23)

| Bản tin đọc số | Bản ví von (bị bác) | Trader nói |
|---|---|---|
| Từ đáy năm hai nghìn hai mươi hai, VN-Index đã tăng hơn gấp đôi. Giá vẫn trên đỉnh cũ hơn mười tám phần trăm. Vậy mà từ đầu năm, chỉ số mới nhích một phẩy tám phần trăm. | Mở chart tuần, bạn thấy ngay chuyện lạ. Từ đáy năm hai mươi hai, giá tăng hơn gấp đôi, bỏ xa đỉnh cũ. Mà năm nay gần như đứng yên. | Mở chart tuần, bạn thấy ngay một nghịch lý. Từ đáy hai không hai hai, VN-Index đã tăng hơn gấp đôi và giữ vững trên đỉnh cũ. Vậy mà từ đầu năm, giá vẫn sideway, gần như không đổi. |
| Chỉ số đang ở khoảng hai phần ba biên năm, chưa sát trần hay sàn. | Trên biên năm, giá đứng ở khoảng hai phần ba. Lợi thế ở hai mép, và hai mép đang xích lại. | Trong vùng dao động của năm, giá đang ở khoảng hai phần ba, chưa chạm kháng cự, chưa về hỗ trợ. Dư địa lên ngắn, rủi ro xuống dài gần gấp đôi. |
| Tín hiệu mới nhất báo nguy cơ thủng hỗ trợ một nghìn tám trăm linh hai, nhưng chưa xác nhận. | Terminal của mình vừa nháy điểm phá xuống, ngay dưới giá hiện tại. | Terminal vừa phát một tín hiệu phá vỡ hỗ trợ ngay dưới giá hiện tại. Mới là tín hiệu tiềm năng, chưa xác nhận. |

Headline: `+107,9% từ đáy 2022 / Vượt đỉnh cũ 18,3%` (hai dòng số) → `Hơn gấp đôi từ đáy 2022 / Giữ trên kháng cự cũ 18,3%`.

## Quy trình

1. Đọc hết facts và brief. Viết ra cho mình một dòng "reel này nói về CÁI GÌ" và ẩn dụ sẽ dùng.
2. Viết lời đọc của CẢ REEL liền một mạch như một bài nói, rồi mới cắt về từng scene và đặt beat.
3. Đọc thành tiếng cả bài (trong đầu cũng được), sửa câu vấp, cắt số thừa. Rồi soi theo mục "Soi dấu vết AI".
4. Đối chiếu từng số trên màn hình với fact pack, ghi `citedFacts`, ghi `unsupported` thật lòng.
5. Tự soát theo danh sách dưới, rồi ghi file.

## Trả về

Mỗi scene một file JSON nghiêm ngặt tại thư mục được giao, tên `<id>.json`:

```json
{
  "id": "<giữ nguyên>",
  "eyebrow": "<nhãn ngắn trên panel, có thể đổi>",
  "narration": "<lời đọc, không chữ số>",
  "beats": [{"atSentence": 0, "at": 0.25, "line1": "...", "line2": "...", "accent": "gold"}],
  "visual": {"...": "giữ type/src/annotations/percent/value; đổi được caption, items[].text, cards[].title/body, labels chữ"},
  "citedFacts": ["daily.ytd.changePercent", "peaks[1].high"],
  "unsupported": ""
}
```

Kèm một file `_script.md`: bài nói liền mạch (để đạo diễn đọc như người xem sẽ nghe), một dòng ẩn dụ đã
chọn, và số chữ từng scene.

## Tự soát trước khi ghi

- [ ] Không scene nào mở bằng con số; không câu nào có hai con số đọc ra lời.
- [ ] Số chữ các scene khác nhau; hook và outro ngắn hơn phần thân, evidence dài hơn (theo `_words`).
- [ ] Mỗi scene có ít nhất một thuật ngữ giao dịch; trong scene, sau câu dài có câu ngắn.
- [ ] "chỉ số" ≤ 1/scene; "bạn"/"mình" có mặt nhưng không quá hai lần/scene.
- [ ] Không "bậc thang", "tiền mỏng", "cái biên", "trần/sàn", "kiểu dở", "xích lại", "lưng chừng", "chuyện lạ"; năm đọc `hai không hai hai`, `hai không mười tám`; mức giá kịch bản và mức phải canh đọc ra số.
- [ ] Không headline nào hai dòng cùng là số; không headline nào chép nguyên câu đọc.
- [ ] Không scene nào kết bằng câu báo trước hay câu nhử chỉ để nối; chuyển đoạn nằm ở câu mở của scene sau; câu hỏi cuối scene chỉ khi scene sau trả lời nó.
- [ ] Không có chuỗi mệnh đề cụt kiểu chú thích; câu có chủ ngữ hay từ nối như người nói.
- [ ] Soi xong theo mục "Soi dấu vết AI": không còn "không X mà là Y", câu chốt lặp ý, câu dạo đầu, cãi với người không có mặt; câu người dùng đã chốt giữ nguyên.
- [ ] Mỗi scene làm đúng `job` của vai nó; `scenario` có chữ của `mustSay` và không câu nào gọi giá; các `chapter` cùng khuôn câu.
- [ ] Outro: một câu thả tim · chia sẻ · theo dõi + lý do (cập nhật sớm những biến động của thị trường); không số, không thuật ngữ, không câu vọng hook, không "khuyến nghị".
- [ ] Mọi chữ số trên màn hình có trong fact pack đúng độ chính xác; mọi câu không mở bằng ba chữ đầu của clip mẫu.
