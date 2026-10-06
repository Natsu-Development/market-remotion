title: VNINDEX · kênh giá tháng, chu kỳ bốn năm và MACD
name: channel
symbol: VNINDEX
brand: Chứng Vịt
logo: logo/chung-vit.png
ticker: daily
footer: Chứng Vịt
disclaimer: Mọi thông tin chỉ là thông tin tham khảo, không phải khuyến nghị đầu tư.

# v6 — 2026-09-30 sau phiên: fact pack, ticker và ba ảnh FireAnt làm mới tới phiên 30/9 (đóng cửa 1768,62). Nến tháng 9
# đã đóng nên MACD tháng cắt xuống được xác nhận (139,7 dưới 142,1, histogram −2,4); phiên 30/9 đóng dưới hỗ trợ 1777,
# đóng tuần (thứ sáu 2/10) mới quyết định chuỗi đáy cao dần. Kênh: giá ở 76,9% chiều cao, +9,7% lên biên trên, −32,3%
# về biên dưới. Lời viết lại qua /humanizer ở vòng 7k; vòng 8 chỉ đổi câu mà số mới làm sai.
#
# v5 — 2026-09-29: vai theo bộ vai ở content-rules `arc.roles` — ba chương lịch sử là `chapter`, "nếu lặp lại"
# là `scenario`, hai mức phải canh là `levels`; `principle` và `action` là ảnh chart có mark như bản đã duyệt
# 2026-09-28, outro là lời kêu gọi. Lời, hình, giọng không đổi. Id scene trong content/channel.json giữ tên cũ
# (channel-evidence-3…5, channel-mechanism, channel-warning) vì id là tên file giọng; vai nằm ở trường `role`.
# Enrich lại từ brief này sẽ sinh id mới (channel-chapter-3…) và phải thu giọng lại. Caption và số trong
# ý đồ theo vòng 5 (fact pack và ảnh 28/9); phần v4 dưới đây giữ nguyên làm lịch sử.
#
# v4 — 2026-09-28, dựng lại theo vox-director (github.com/Alisa0808/vox-director, tầng STORY: beat-layer.md).
# Cùng luận điểm và cùng số của v3 (fact pack 23/9, ảnh 23/9); đổi cấu trúc, nhịp và máy quay.
#
# Arc: hook_payoff, thân là `timeline` — ba lần chạm biên trên kể như ba chương 2018 → 2022 → 2026, cùng
# một khuôn (chạm → MACD tháng cắt → rơi bao nhiêu) để người xem tự thấy vần lặp, rồi chương 2026 dừng ở
# đúng chỗ hai lần trước đã cắt. Sau đó mới là phản biện, nguyên tắc, kịch bản, mức phải canh, việc làm.
# Hook ≤ 3 giây: câu đầu ≤ 10 chữ, headline beat 1 đã mang lời hứa (surprising_stat + urgent_warning),
# không mở bằng dựng bối cảnh. Kết bằng lời kêu gọi ở outro (câu vọng lại hook — `loop_close` — bị bỏ 2026-09-28).
#
# Nhịp (vox: đổi khung 3–5 giây, không giữ một khung quá 8 giây): 12 scene, mỗi scene 2 beat, mỗi beat
# một khung máy (`visual.shots`: wide định hướng → cận vào chi tiết lời đang gọi tên). Tổng ~87 giây,
# ~355 chữ. Ngân sách chữ từng scene (đạo diễn đặt, đã ghi vào `_words`): hook 24 · concept 28 ·
# 2018 32 · 2022 32 · 2026 34 · tuần 34 · phản biện 28 · nguyên tắc 26 · kịch bản 30 · mức canh 30 ·
# việc làm 32 · outro 24. Hook và outro ngắn nhất, bốn scene bằng chứng dài nhất.
#
# Lời theo máy quay: câu nào đọc lúc máy đang cận vào pane MACD thì nói về MACD; câu gọi tên mark nào
# thì mark đó đang vẽ ra. Ba chương timeline dùng cùng khuôn câu (vần lặp là chủ ý), nhưng không chép
# nguyên câu — mỗi chương một chi tiết riêng (2018: ba tháng; 2022: bốn tháng và rơi sâu hơn;
# 2026: đồng hồ đang ở tháng thứ tư). Giọng: một trader cảnh báo bạn bè, không doạ. "Nếu lặp lại" là
# KỊCH BẢN, không phải dự báo — nói rõ ở scene kịch bản, và phản biện phải thật lòng.

## hook · image
src: public/shots/vnindex-fireant-monthly.png
source: fireant.vn
fit: contain
caption: NẾN THÁNG · BIÊN TRÊN QUA 1211 (2018), 1536 (2022) · ĐỈNH 1933: +1,1%
Mở bằng cú CẬN vào đỉnh 5/2026 (1933) nằm đúng trên đường kẻ qua hai đỉnh cũ (2018 · 1211, 2022 · 1536):
lần chạm thứ ba (đường ở 1912, vượt 1,1%). Beat 1 máy lùi ra toàn cảnh: hai lần chạm trước rơi 28,85% và
43,13%. Câu đầu ≤ 10 chữ, không số đọc ra lời; kết bằng câu hỏi "lần này thì sao". ~24 chữ.

## concept · image
src: public/shots/vnindex-fireant-monthly.png
source: fireant.vn
fit: contain
caption: BIÊN DƯỚI QUA 649 (2020), 874 (2022) · DỐC 86,7 / 84,3 ĐIỂM/NĂM
Kênh giá song song: biên dưới qua đáy 3/2020 (649) và đáy 11/2022 (874). Hai biên dốc 86,7 và 84,3
điểm/năm, lệch 2,8% — song song thật, không vẽ cho vừa mắt. Beat 0: máy trên vùng hai đáy, biên dưới vẽ ra.
Beat 1: lùi ra cả kênh. Không kết bằng câu nhử: chương 2018 tự mở bằng "Lần đầu chạm kháng cự là …". Nói như người đang
giải thích cho một người, không như chú thích (người dùng 30/9): điều nhìn thấy (hai đường gần như song song, ghim
beat 1) → nghĩa của nó (kênh giá thật) gộp trong một câu ("… nên đây là một kênh giá khá chuẩn"). Không thêm câu thanh minh "chứ không
phải cố vẽ cho khớp" (người dùng 30/9: không giống người nói). ~36 chữ.

## chapter · image
src: public/shots/vnindex-fireant-monthly.png
source: fireant.vn
fit: contain
caption: ĐỈNH 1211,34 (4/2018) · MACD CẮT XUỐNG 7/2018 · VỀ 861,85: −28,85%
Chương 1 — 2018. Tháng 4/2018 chạm biên trên ở 1211. Ba tháng sau (7/2018) MACD tháng cắt xuống đường tín
hiệu. Từ đỉnh, thị trường rơi 28,85% từ 1211,34 về 861,85 (1/2019), mất 9 tháng. Beat 0: cận vào đỉnh 2018. Beat 1: máy
lùi xuống, thấy cả mũi tên rơi và hộp MACD cắt 7/2018. Tối đa hai số đọc ra lời. ~32 chữ.

## chapter · image
src: public/shots/vnindex-fireant-monthly.png
source: fireant.vn
fit: contain
caption: ĐỈNH 1536,45 (1/2022) · MACD CẮT XUỐNG 5/2022 · VỀ 873,78: −43,13%
Chương 2 — 2022, cùng khuôn với 2018. Tháng 1/2022 chạm biên trên ở 1536. Bốn tháng sau (5/2022) MACD
tháng cắt xuống. Lần này rơi sâu hơn: 43,13% từ 1536,45 về 873,78 (11/2022), mất 10 tháng. Beat 0: cận vào đỉnh 2022.
Beat 1: lùi xuống, mũi tên rơi và hộp MACD 5/2022. Kết ở mức giảm; chương 2026 tự mở và gọi lại mốc bốn tháng. ~43 chữ.

## chapter · image
src: public/shots/vnindex-fireant-monthly.png
source: fireant.vn
fit: contain
caption: MACD THÁNG 139,7 · TÍN HIỆU 142,1 · HISTOGRAM −2,4 · THÁNG 9 ĐÃ ĐÓNG
Chương 3 — 2026, điểm ngoặt. Tháng 5/2026 chạm biên trên lần ba ở 1933. Bốn tháng sau — tức là bây giờ,
đúng nhịp 2022 — MACD tháng 139,7 đã xuống dưới tín hiệu 142,1; histogram từ 48,6 về −2,4 sau 7 tháng thu
hẹp. Nến tháng 9 đã đóng (30/9), nên tín hiệu được xác nhận; lời nói rõ điều đó. Beat 0: cận đỉnh 2026
(push_in). Beat 1: CẮT THẲNG xuống cận histogram tháng 9/2026, máy đứng yên — khoảnh khắc payoff của cả
timeline. ~34 chữ.

## evidence · image
src: public/shots/vnindex-fireant-weekly-wide.png
source: fireant.vn
fit: contain
caption: NẾN TUẦN · KHỐI LƯỢNG 1004 (T10/2025) → 519 TRIỆU/PHIÊN (T9/2026)
Khung TUẦN đi trước khung tháng. Thanh khoản: tháng 10/2025 bình quân 1004 triệu cổ phiếu/phiên, tháng
9/2026 còn 519 triệu (52%, đủ 20 phiên) — giá giữ vùng cao trên nền khối lượng còn một nửa. MACD tuần
nằm dưới đường tín hiệu, histogram tuần âm sâu thêm (đọc từ ảnh 30/9 — pack không có số MACD tuần, không đọc
số). Ảnh riêng của scene này: FireAnt tuần chụp 30/9 sau phiên với `--zoom-out=2` — trục giá giãn xuống ~1250 nên nến
8/2025 → 9/2026 nằm hẳn trên cột khối lượng (người dùng 30/9: nến và volume không được chồng nhau; zoom ra FireAnt,
không thêm script, không tách pane volume). Ảnh, pack và ticker cùng ngày 30/9 (vòng 8), nên badge giá
1768,62 để hiện. Scene 7 và 10 dùng ảnh tuần 1 năm, cùng ngày. Beat 0: toàn cảnh, nhãn T10/2025 và T9/2026 trong khoảng trống giữa
nến và khối lượng. Beat 1: cận pane MACD tuần, từ điểm cắt 6/2026 tới nay. ~34 chữ.

## counterpoint · image
src: public/shots/vnindex-fireant-weekly-macd.png
source: fireant.vn
fit: contain
caption: ĐỈNH 1933,11 → 1651,2: −14,58% · ĐÁY CAO DẦN 1651 → 1716 → 1777
Phản biện thật lòng: chạm biên trên không có nghĩa là sập ngay. Sau đỉnh 5/2026 thị trường đã điều chỉnh
14,58% về 1651,2 (tuần 27/7) rồi hồi lại, và nến tuần đã đóng vẫn giữ chuỗi đáy cao dần 1651 → 1716 → 1777;
phiên 30/9 đóng dưới 1777 (1768,62), nên đóng tuần mới quyết định. Chu kỳ cũng không
lặp y hệt — 45 rồi 52 tháng. Nên đây là kịch bản, chưa phải tín hiệu. Ảnh nến tuần FireAnt (không dùng ảnh
terminal — người dùng yêu cầu 2026-09-29 "get the fireant chart to clearly"); mark đặt từ hiệu chỉnh của ảnh.
Beat 0: mũi tên đỏ đỉnh → 1651, ba vòng xanh ở ba đáy. Beat 1: cận mép phải, hai hỗ trợ 1777 và 1716, nến
tuần cuối đóng phiên dưới 1777 — đóng tuần dưới đó thì xu hướng ngắn hạn gãy. ~44 chữ.

## principle · image
src: public/shots/vnindex-fireant-monthly.png
source: fireant.vn
fit: contain
caption: ĐÓNG CỬA 1769 · BIÊN TRÊN 1941 (+9,7%) · BIÊN DƯỚI 1197 (−32,3%)
Nguyên tắc kênh giá: sát biên trên thì rủi ro lớn hơn phần thưởng. Giá 1769 ở 76,9% chiều cao kênh; lên
biên trên 1941 là +9,7%, về biên dưới 1197 là −32,3% — hai mũi tên trên chart, không cột (người dùng chốt
2026-09-28). Beat 0: máy đi dọc kênh xuống chỗ giá đứng. Beat 1: lùi ra, thấy cả hai mũi tên. ~26 chữ.

## scenario · image
src: public/shots/vnindex-fireant-monthly.png
source: fireant.vn
fit: contain
caption: NẾU LẶP LẠI TỪ ĐỈNH 1933,11: −28,85% → 1375 · −43,13% → 1099
Nếu chu kỳ lặp lại — KỊCH BẢN, không phải dự báo, nói rõ bằng lời. Lặp mức rơi 2018 (−28,85%) từ đỉnh 1933,11
là về 1375; lặp mức rơi 2022 (−43,13%) là về 1099 — xuyên qua biên dưới (1197 hôm nay, 1218 cuối năm).
Beat 0: cận nửa phải, mức 1375. Beat 1: lùi ra, mức 1099 và biên dưới. ~30 chữ.

## levels · image
src: public/shots/vnindex-fireant-weekly-macd.png
source: fireant.vn
fit: contain
caption: NẾN TUẦN · ĐỈNH NĂM 1933 · HỖ TRỢ 1777 / 1716 · ĐÁY NĂM 1586
Hai mức phải canh, trên chart tuần FireAnt sạch (không dùng ảnh terminal có trendline và điểm phá vỡ tự vẽ —
người dùng yêu cầu 2026-09-29). Bốn đường ngang đặt từ hiệu chỉnh của ảnh: 1933, 1777, 1716, đáy năm 1586; nhãn
ở vùng tương lai trống, trục giá hiện đủ. Lời mở bằng điều nhìn thấy ("Mức mình canh phía trên là đỉnh năm nay"), đọc ra 1933 và
1777; đóng tuần dưới 1777 là gãy chuỗi đáy cao dần (phiên 30/9 đã đóng dưới). Khung lùi rộng (zoom 1,45 rồi 1,35 — người dùng yêu cầu 2026-09-29
thấy rõ đường, nến và điểm tham chiếu): vòng đỏ ở đỉnh 1933, vòng vàng ở hai đáy 1777 và 1716, vòng xanh ở đáy
năm 1586. Beat 0: đỉnh 1933. Beat 1: máy tilt xuống ba mức hỗ trợ. ~44 chữ.

## action · image
src: public/shots/vnindex-fireant-monthly.png
source: fireant.vn
fit: contain
caption: BA VIỆC: ĐÒN BẨY · 1933 · 1777 / 1716
Ba việc mình đang làm, mỗi việc là một nhãn gắn đúng chỗ trên chart, không danh sách (người dùng chốt
2026-09-28): nửa trên kênh, và nến tháng 9 đã xác nhận MACD cắt xuống → hạ đòn bẩy; vượt 1933 yếu →
không mua đuổi; đóng tuần dưới 1777 rồi 1716 → giảm tỷ trọng. Lời không nói "khuyến nghị". ~32 chữ.

## outro · outro
Thả tim · chia sẻ · theo dõi Chứng Vịt trong một câu, gắn luôn lý do theo dõi: cập nhật sớm những biến động của thị trường
(khuôn ở mục "Outro" của prompts/scene-writer.md). Thẻ outro mang tên kênh dưới logo (tên kênh đổi thành Chứng Vịt 2026-09-30). Không số, không MACD,
không câu vọng lại hook. ~29 chữ.
