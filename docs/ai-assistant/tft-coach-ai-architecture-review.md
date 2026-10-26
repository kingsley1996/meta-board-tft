# Review kiến trúc trả lời của TFT Coach AI (Tomo / MetaBoard)

> **Phạm vi review:** Dựa trên tài liệu `answer-flow.md`, mô tả luồng xử lý của Coach AI tại thời điểm ghi trong tài liệu. Đây là review kiến trúc, chưa phải kết quả audit toàn bộ source code hay benchmark thực tế.
>
> **Nguyên tắc đọc:** Các điểm mô tả luồng hiện tại được rút ra từ tài liệu. Những rủi ro và cải tiến là đánh giá/đề xuất cần được đối chiếu với source code và kiểm thử trước khi triển khai.

## 1. Đánh giá tổng quan

Hệ thống hiện tại đã có nền tảng tốt để phát triển thành một AI assistant chuyên biệt cho TFT. Điểm mạnh nhất là không để LLM tự trả lời mọi câu hỏi chỉ dựa vào kiến thức trong model, mà xây dựng pipeline gồm intent detection, entity resolution, evidence, tool calling, deterministic fallback và validation.

Tuy nhiên, cần phân biệt hai mục tiêu:

- **Trả lời có cấu trúc và ít bịa:** hệ thống hiện tại đã có nhiều cơ chế hỗ trợ.
- **Trả lời đúng với trạng thái trận đấu, đúng meta của set/patch và đưa ra quyết định chiến thuật tốt:** cần bổ sung kiểm chứng dữ liệu, xử lý ngữ cảnh và đánh giá chất lượng chuyên biệt.

Đánh giá dưới đây là định tính về thiết kế, không phải điểm benchmark.

### 1.1. Grounding và chống bịa — tốt về kiến trúc

Evidence JSON, dữ liệu thống kê, mechanics knowledge, điều kiện sử dụng LLM và deterministic fallback đều là những quyết định hợp lý.

### 1.2. Routing và orchestration — khá tốt, nhưng nhiều nhánh

Pipeline có thứ tự rõ ràng và trace được. Tuy nhiên, regex, intent override, tool-result ladder và nhiều gate có thể chồng lấn hoặc gây phân loại sai.

### 1.3. Chất lượng và độ mới dữ liệu — chưa đủ bằng chứng

Có dữ liệu comp, build và meta stats, nhưng tài liệu chưa chứng minh các nguồn được đồng bộ theo cùng set/patch, đủ mẫu hoặc phù hợp với trận đấu hiện tại.

### 1.4. Hiệu năng và chi phí — có nền tảng kiểm soát tốt

Cache, song song hóa, giới hạn tool, concurrency, timeout và provider retry đã có. Tuy nhiên, tải dữ liệu trước khi phân loại và chi phí trace/prompt vẫn cần được đo thực tế.

## 2. Những điểm đang làm tốt và nên giữ lại

### 2.1. Kết hợp deterministic logic với LLM thay vì phụ thuộc hoàn toàn vào model

Theo tài liệu, `answerAssistant()` đi qua các bước xử lý trước, sau đó mới quyết định trả lời deterministic hay gọi LLM. Đây là lựa chọn phù hợp cho assistant trả lời về game có nhiều dữ liệu cấu trúc.

Ví dụ:

- Hỏi giá tiền, tộc hệ hoặc công thức trang bị: lấy dữ liệu chuẩn rồi render trực tiếp.
- Hỏi trang bị nào phù hợp với Akali: tổng hợp build, comp liên quan và thống kê rồi dùng LLM giải thích.
- Hỏi cơ chế nổ hũ: tra bảng mechanics qua tool thay vì để model tự nhớ.
- Thiếu dữ liệu: trả lời có giới hạn thay vì cố gắng tạo ra một câu trả lời nghe hợp lý.

**Nguyên tắc nên giữ:** dữ liệu quyết định sự thật; LLM giúp giải thích và cá nhân hóa cách trình bày.

Tuy nhiên, deterministic không đồng nghĩa với chính xác. Nếu dữ liệu đầu vào sai, cũ hoặc không cùng phiên bản, câu trả lời deterministic vẫn có thể sai. Độ tin cậy của pipeline phụ thuộc rất lớn vào chất lượng evidence.

### 2.2. Entity resolution và follow-up đã được quan tâm đúng mức

Các hàm như `findEntityMentions`, `resolveFollowUpText` và `carryOverComps` giải quyết vấn đề thực tế của hội thoại.

Ví dụ:

> User: Akali nên lên đồ gì?  
> Coach: Gợi ý các trang bị phù hợp cho Akali.  
> User: Còn con tank thì sao?

Nếu assistant chỉ gửi câu hỏi cuối cùng vào LLM, model có thể không biết đang nói về comp nào hoặc đội hình nào. Mang ngữ cảnh từ các lượt trước là cần thiết.

Tuy vậy, một số heuristic hiện dựa trên regex và câu trả lời assistant gần nhất. Đây là nền tảng tốt cho MVP, nhưng chưa đủ chắc chắn khi người dùng đổi chủ đề hoặc đưa nhiều comp vào cùng cuộc hội thoại.

### 2.3. Có cơ chế kiểm soát tool call

Hệ thống giới hạn số vòng, số lần gọi, thời gian chạy, phát hiện tool call lặp và xử lý đối số không hợp lệ. Đây là những guard quan trọng khi sử dụng LLM có khả năng gọi tool.

`finalizeModel=false` giúp tool loop không tiếp tục gọi model chỉ để tạo câu trả lời cuối; bước tổng hợp được tách riêng, có thể giảm độ trễ và chi phí.

Tuy nhiên, giới hạn số lần gọi không đảm bảo tool được chọn đúng hoặc dữ liệu từ tool được diễn giải đúng. Hai vấn đề này cần được kiểm thử riêng.

### 2.4. Có validation và fallback thay vì tin đầu ra LLM tuyệt đối

`parseGeneratedAnswer` kiểm tra JSON, cấu trúc output và một số key bị cấm; `ungroundedNumbers` kiểm tra số liệu không có trong evidence đối với một nhánh mechanics.

Đây là hướng đúng. Nhưng JSON hợp lệ và số liệu xuất hiện trong evidence không đồng nghĩa với nội dung đã được kiểm chứng đầy đủ.

### 2.5. Có trace đủ chi tiết để bắt đầu cải thiện bằng dữ liệu thực tế

`assistant_reasoning_logs` cùng các event như `intent_detection`, `tool_call`, `llm_generation`, `validation` và `fallback` là nền tảng tốt cho observability.

Có thể dùng chúng để tìm:

- Những câu hỏi bị phân loại intent sai nhiều nhất.
- Những tool mất thời gian hoặc thường xuyên thất bại.
- Những câu hỏi phải fallback dù lẽ ra có thể trả lời.
- Những trường hợp model tạo câu trả lời dài nhưng thiếu căn cứ.
- Các loại câu hỏi có chi phí token cao nhưng giá trị thấp.

Nên giữ trace, đồng thời bổ sung đánh giá chất lượng câu trả lời thay vì chỉ đánh giá pipeline có chạy thành công hay không.

## 3. Những vấn đề quan trọng nhất cần cải thiện

Ưu tiên được chia thành P0 (ảnh hưởng lớn tới độ đúng) và P1 (quan trọng sau khi đã có các guard cốt lõi).

### P0 — Kiểm soát phiên bản dữ liệu TFT

Tài liệu cho biết hệ thống tải active set/patch, catalog, comps và meta stats song song. Chưa có đủ thông tin để xác nhận mọi nguồn evidence đều thuộc cùng một phiên bản.

### P0 — Làm rõ intent và trạng thái hội thoại

`detectIntent` có thứ tự điều kiện cố định; follow-up dựa một phần vào regex và các message trước. Câu hỏi nhiều ý hoặc đổi chủ đề có thể đi sai nhánh.

### P0 — Validation ngữ nghĩa, không chỉ validation cấu trúc

Parser JSON và gate số liệu hiện có không bao phủ tất cả lỗi như gán nhầm trang bị, đảo chiều so sánh, hiểu sai điều kiện kích hoạt hoặc đưa ra khuyến nghị không được evidence hỗ trợ.

### P1 — Chuẩn hóa dữ liệu thống kê và xếp hạng

Cần kiểm soát sample size, patch, độ tin cậy và sự khác nhau giữa build mạnh về win rate với build phù hợp tình huống.

### P1 — Benchmark và đo lường production

Trace cho biết hệ thống đã làm gì, nhưng chưa tự chứng minh câu trả lời đúng theo đáp án chuẩn hoặc hữu ích với người chơi.

## 4. P0 — Đảm bảo evidence cùng set/patch và có nguồn gốc rõ ràng

Theo tài liệu:

- `getActiveSetAndPatch` lấy meta từ DB.
- `loadCatalog` lấy `tft.json` và alias DB.
- `listComps` lấy comp từ DB.
- `loadMetaStats` lấy thống kê từ `meta.json`.

Các nguồn có thể được cập nhật vào những thời điểm khác nhau. Tài liệu chưa xác nhận có lỗi đồng bộ, nhưng đây là rủi ro nên kiểm tra sớm.

Ví dụ: catalog thuộc Set 18 nhưng comp stats được tổng hợp từ patch trước đó. Assistant có thể trả lời bằng tên tướng đúng nhưng sử dụng số liệu hoặc build không còn phù hợp.

### 4.1. Đề xuất `DataSnapshot`

Tạo snapshot dữ liệu nhất quán cho mỗi request:

```ts
type DataSnapshot = {
  setId: string;
  patchVersion: string;
  catalogVersion: string;
  compDatasetVersion: string;
  statsDatasetVersion: string;
  generatedAt: string;
  source: "official" | "community" | "internal";
};
```

Đây là schema minh họa, không phải cấu trúc đang tồn tại trong code.

Mỗi evidence quan trọng nên có metadata nguồn:

```ts
type EvidenceMetadata = {
  source: string;
  setId: string;
  patchVersion: string;
  observedAt?: string;
  sampleSize?: number;
};
```

Không nhất thiết hiển thị mọi trường cho người dùng, nhưng pipeline cần chúng để:

1. Phát hiện nguồn dữ liệu lệch phiên bản.
2. Không trộn dữ liệu từ các patch khác nhau một cách âm thầm.
3. Trả lời rõ khi không có dữ liệu phù hợp.
4. Trace lại căn cứ của từng gợi ý.

### 4.2. Phân biệt ba loại kiến thức

| Loại dữ liệu | Ví dụ | Cách xử lý |
|---|---|---|
| Game rules | Giá tướng, cơ chế shop odds, công thức trang bị | Nguồn chuẩn, version rõ ràng |
| Meta statistics | Win rate, average placement, top 4 rate, tần suất sử dụng | Gắn patch, thời gian và sample size |
| Strategy heuristics | Khi nào roll, khi nào lên cấp, chuyển bài thế nào | Điều kiện áp dụng rõ ràng, không xem như luật tuyệt đối |

Đây là một trong những thay đổi có giá trị lớn nhất cho độ chính xác.

## 5. P0 — Giảm phụ thuộc vào thứ tự regex trong `detectIntent`

Theo tài liệu, intent được xác định bằng chuỗi điều kiện có thứ tự; điều kiện đầu tiên khớp sẽ thắng. Cách này dễ hiểu, dễ triển khai và phù hợp khi số loại câu hỏi còn ít, nhưng có thể gặp vấn đề khi một câu khớp nhiều intent.

Ví dụ:

> "Trong patch hiện tại, đội hình Akali có mạnh không, và nếu không thì nên chuyển sang comp nào?"

Câu này có ít nhất ba ý:

- Hỏi meta hoặc thống kê của comp.
- Hỏi dữ liệu patch hiện tại.
- Hỏi đề xuất comp thay thế.

Nếu điều kiện đầu tiên khớp thắng, câu hỏi có thể bị thu hẹp thành một intent không đủ để trả lời toàn bộ yêu cầu.

### 5.1. Đề xuất `QueryPlan`

Tách phân loại ý định khỏi kế hoạch thực hiện. Thay vì buộc một câu hỏi vào một intent duy nhất, hãy cho phép lập danh sách task:

```ts
type QueryPlan = {
  tasks: Array<{
    type:
      | "lookup_entity"
      | "get_stats"
      | "search_comps"
      | "compare_comps"
      | "explain_mechanics"
      | "analyze_strategy";
    target?: string;
  }>;
  requiredContext: string[];
  missingContext: string[];
};
```

Đây là schema đề xuất. Với câu hỏi nhiều ý ở trên, planner có thể yêu cầu lấy stats của comp, tìm comp thay thế và xác minh dữ liệu patch trước khi tổng hợp.

Không nhất thiết dùng LLM cho planner ngay từ đầu. Có thể bắt đầu bằng rule-based multi-intent routing, sau đó dùng model phân loại có cấu trúc cho những câu phức tạp. Cần có fallback khi planner không chắc chắn.

Lợi ích:

- Không buộc câu hỏi nhiều ý vào một intent duy nhất.
- Có thể gọi nhiều tool theo kế hoạch rõ ràng.
- Dễ phát hiện thiếu dữ liệu cho từng phần.
- Có thể đánh giá routing độc lập với chất lượng câu trả lời cuối.

## 6. P0 — Entity resolution nên hiểu ngữ cảnh có cấu trúc

Hệ thống đã tìm entity qua tên, alias, tên tiếng Việt được normalize và có cơ chế mang comp từ lượt trước. Điều cần cải thiện là không nên xem mọi mention đều có cùng ý nghĩa.

Ví dụ:

> "Tôi đang chơi Akali nhưng không muốn dùng comp Akali. Có bài nào dùng đồ AP tốt hơn không?"

Câu này chứa Akali, nhưng không có nghĩa người dùng muốn đề xuất comp Akali. Tài liệu đã có `NEGATED_ENTITY_USAGE` để xử lý một phần tình huống này; các câu có nhiều phủ định, điều kiện hoặc đổi chủ đề vẫn cần được test.

### 6.1. Đề xuất `ConversationState`

```ts
type ConversationState = {
  activeSet?: string;
  activePatch?: string;
  currentComp?: string;
  currentChampion?: string;
  gameState?: {
    stage?: string;
    level?: number;
    gold?: number;
    hp?: number;
    streak?: number;
  };
  lastTopic?: string;
  lastUpdatedAt?: string;
};
```

Đây là schema minh họa, không phải cấu trúc hiện tại.

Các trường chỉ được giữ khi có căn cứ từ thông tin người dùng hoặc context hợp lệ. Nếu người dùng nói đang chơi comp khác, state phải được cập nhật thay vì tiếp tục mang comp cũ sang.

**Quy tắc quan trọng:** history là bằng chứng về cuộc hội thoại, không phải nguồn chân lý về trạng thái trận đấu hiện tại.

Nếu người chơi đã lên cấp hoặc thay đổi lượng vàng, state cũ không nên tự động được dùng cho quyết định mới. Khi thiếu thông tin quan trọng, hỏi lại một câu ngắn thường tốt hơn đoán.

## 7. P0 — `ungroundedNumbers` là cần thiết nhưng chưa đủ

Theo tài liệu, gate này chỉ hoạt động với `gameplay_knowledge` khi có mechanics evidence. Nó kiểm tra số trong câu trả lời có tồn tại trong evidence JSON hay không.

Cơ chế này hữu ích để bắt con số tự sinh, nhưng có ba giới hạn:

- Số có trong evidence vẫn có thể bị gắn sai với đối tượng.
- Nội dung sai không nhất thiết chứa số.
- Phép so sánh hoặc phép tính sai vẫn có thể sử dụng các số liệu có thật.

Ví dụ, evidence ghi:

- Build A: win rate 20%.
- Build B: win rate 15%.

Model vẫn có thể nói "Build B có win rate cao hơn Build A" mà không tạo ra số mới nào.

### 7.1. Validation theo loại câu trả lời

| Loại câu trả lời | Kiểm tra nên có |
|---|---|
| Tra cứu tướng/item | Tên, thuộc tính và mô tả khớp catalog |
| Thống kê meta | Giá trị, đơn vị, patch, mẫu và chiều so sánh |
| Đề xuất comp | Comp được đề xuất tồn tại trong dữ liệu hợp lệ |
| So sánh comp | Điểm chung và khác biệt được suy ra từ hai comp thực |
| Phân tích chiến thuật | Đủ state đầu vào, giả định được công khai, khuyến nghị nhất quán |
| Cơ chế game | Quy tắc có nguồn chuẩn và đúng phiên bản |

Mục tiêu không phải xây một model thứ hai để tranh luận với model đầu tiên. Các phép kiểm tra quan trọng nên được thực hiện bằng code hoặc dữ liệu chuẩn khi có thể.

## 8. Những cải thiện cho đề xuất comp và phân tích meta

### 8.1. Không đánh đồng comp có win rate cao với comp tốt nhất cho người chơi

Tài liệu mô tả `rankComps` chấm điểm theo mức độ khớp champion, item, augment, style và difficulty, rồi chọn top 5. Với thống kê build, hệ thống lấy top build theo win rate thật.

Đây là khởi đầu hợp lý, nhưng cần phân biệt:

1. **Meta ranking:** Comp nào đang có kết quả tốt trên dữ liệu thống kê?
2. **Contextual recommendation:** Với quân cờ, trang bị, augment và lượng vàng hiện có, người chơi nên làm gì?

Hai bài toán này không tương đương.

Một comp có win rate cao nhưng cần carry 4-cost và nhiều trang bị hoàn chỉnh có thể không phù hợp với người chơi ở stage 3, có ít vàng và chưa tìm được carry đó.

### 8.2. Đề xuất mô hình xếp hạng nhiều thành phần

\[
S(c \mid x) =
w_m M(c) + w_f F(c,x) + w_e E(c,x) - w_r R(c,x)
\]

Trong đó:

- \(M(c)\): sức mạnh meta của comp \(c\).
- \(F(c,x)\): mức độ phù hợp với trạng thái hiện tại \(x\).
- \(E(c,x)\): mức độ phù hợp của trang bị, augment và quân cờ đang có.
- \(R(c,x)\): rủi ro khi chuyển sang comp đó.

Đây là công thức thiết kế đề xuất, không phải công thức hiện có trong `rankComps`. Trọng số cần được hiệu chỉnh bằng dữ liệu đánh giá thực tế.

Không nên gộp mọi yếu tố vào một điểm duy nhất ngay từ đầu. Hãy giữ từng thành phần riêng để có thể giải thích, ví dụ:

> Comp A mạnh về meta, nhưng Comp B phù hợp hơn vì bạn đã có hai món đồ chủ lực và nhiều quân cờ cần thiết.

Nếu chưa có dữ liệu đủ để đánh giá một yếu tố, hệ thống phải bỏ qua yếu tố đó hoặc nêu rõ giới hạn, không tự tạo điểm số.

### 8.3. Kiểm soát sample size và độ bất định của thống kê

Tài liệu cho biết hệ thống sử dụng win rate, average placement, top 4 rate và số trận. Nhưng chưa mô tả ngưỡng mẫu tối thiểu hoặc cách xử lý mẫu nhỏ.

Ví dụ:

| Build | Số trận | Win rate |
|---|---:|---:|
| Build A | 30 | 30% |
| Build B | 3.000 | 24% |

Không thể kết luận ngay Build A tốt hơn. Mẫu nhỏ có thể biến động lớn, và hai build có thể được sử dụng trong những hoàn cảnh khác nhau.

Nên bổ sung:

- Ngưỡng sample size tối thiểu cho từng loại thống kê.
- Nhãn độ tin cậy hoặc khoảng bất định khi phù hợp.
- Phân biệt dữ liệu thiếu với giá trị bằng 0.
- Lọc theo set/patch và điều kiện thống kê phù hợp.
- Cảnh báo khi mẫu nhỏ, dữ liệu cũ hoặc phân bố người chơi khác nhau.

Đối với xếp hạng, có thể thử phương pháp shrinkage về mức trung bình thay vì dùng trực tiếp win rate thô:

\[
\hat p = \frac{w + \alpha}{n + \alpha + \beta}
\]

Trong đó \(w\) là số trận thắng, \(n\) là số trận được đo và \(\alpha,\beta\) là tham số prior. Đây chỉ là một lựa chọn thống kê; cần định nghĩa đúng đơn vị quan sát và kiểm tra xem dữ liệu có phù hợp với mô hình hay không.

### 8.4. Không để LLM tự tạo kế hoạch roll/level từ dữ liệu thiếu

`analyzeStrategy` và `buildStrategyPlan` trả lời deterministic nếu parse được trạng thái. Đây là thiết kế tốt vì quyết định chiến thuật phụ thuộc nhiều điều kiện.

Cần kiểm tra cụ thể thuật toán có xử lý các yếu tố sau không:

- Stage và level hiện tại.
- Gold, HP, streak và các round còn lại.
- Quân cờ đã có, số lượng bản sao và mức nâng cấp.
- Trang bị, augment và điều kiện mở khóa cơ chế.
- Mục tiêu comp và khả năng hoàn thành đội hình.
- Trạng thái lobby, nếu dữ liệu này thực sự có sẵn.

Không phải câu hỏi nào cũng cần tất cả thông tin trên. Trước quyết định có tác động lớn, hệ thống cần xác định trường nào là bắt buộc.

Ví dụ:

> "Tôi level 6, 32 vàng, HP 38, có carry 2 sao. Nên roll hay lên cấp?"

Câu trả lời tốt cần nêu khuyến nghị, lý do, giả định và điều kiện khiến quyết định thay đổi. Nếu không biết stage, comp hoặc carry cụ thể, assistant nên nêu thông tin còn thiếu và có thể hỏi lại.

Không nên hardcode một quy tắc roll/level chung cho mọi patch rồi coi đó là tối ưu. Game rules và strategy policy cần được quản lý riêng, có version và test.

### 8.5. Phân biệt dữ liệu thực tế và suy luận chiến thuật

Nên chuẩn hóa câu trả lời nội bộ thành ba tầng:

1. **Evidence — Dữ liệu thực tế:** comp có những tướng nào, build được dùng bao nhiêu trận, chỉ số thống kê thuộc patch nào.
2. **Inference — Suy luận có căn cứ:** build có vẻ phù hợp với lượng trang bị đang có, nhưng cần thêm thông tin để xác nhận khả năng hoàn thành comp.
3. **Recommendation — Khuyến nghị:** ưu tiên giữ vàng trong một khoảng thời gian, sau đó đánh giá lại theo shop và trạng thái lobby. Điều kiện cụ thể phải đến từ logic chiến thuật đã được kiểm chứng.

Cách phân tầng này giúp model không trình bày suy luận như thể đó là số liệu thực tế, đồng thời giúp xác định lỗi nằm ở dữ liệu, thuật toán hay bước diễn đạt.

## 9. Cải thiện tool calling và evidence retrieval

### 9.1. Đánh giá lại điều kiện `shouldTryTools`

Theo tài liệu, tool loop chỉ được kích hoạt trong một số trường hợp: reference data, intent chưa xác định, tier comp hoặc một số truy vấn meta thiếu stats tĩnh.

Điểm mạnh là tiết kiệm chi phí. Rủi ro là một câu hỏi có vẻ đơn giản theo intent vẫn có thể cần dữ liệu động hoặc dữ liệu chưa được đưa vào evidence.

Ví dụ:

> "Ấn này có thể chơi những comp nào trong patch hiện tại?"

Câu hỏi vừa cần resolve item/emblem, vừa cần tìm comp và có thể cần dữ liệu meta. Nếu evidence tĩnh không chứa đủ comp liên quan, việc không gọi tool có thể khiến assistant bỏ sót lựa chọn.

Đề xuất **evidence-aware routing**:

1. Xác định thông tin câu hỏi cần.
2. Kiểm tra evidence hiện có có đáp ứng đủ không.
3. Chỉ gọi tool để bổ sung phần thiếu.
4. Kiểm tra kết quả tool có đúng mục tiêu và phiên bản không.
5. Tổng hợp khi đủ evidence; nếu không, trả lời phần có căn cứ kèm giới hạn hoặc hỏi lại.

Đây không nhất thiết phải là agent tự do gọi tool vô hạn. Một planner có cấu trúc và vòng bổ sung evidence giới hạn thường dễ kiểm soát hơn.

### 9.2. Định nghĩa rõ hợp đồng dữ liệu cho từng tool

Bảy tool hiện có bao phủ nhiều use case: tìm comp, lấy comp, so sánh, thống kê, mechanics và kế hoạch kinh tế.

Có thể chuẩn hóa kết quả tool theo cấu trúc:

```ts
type ToolEvidence<T> = {
  status: "ok" | "not_found" | "ambiguous" | "stale";
  data?: T;
  source: string;
  setId?: string;
  patchVersion?: string;
  retrievedAt: string;
  limitations: string[];
};
```

Đây là schema đề xuất; có thể giữ kiểu dữ liệu hiện tại và bổ sung metadata tương đương.

Các nguyên tắc cần kiểm tra:

- `not_found` không được chuyển thành danh sách rỗng rồi diễn giải thành "không có".
- `ambiguous` phải khác với kết quả tìm kiếm có điểm phù hợp thấp.
- `stale` không nên được dùng như dữ liệu mới nhất.
- Tool trả lỗi phải khác với tool chạy thành công nhưng không có dữ liệu.
- Tool trả nhiều kết quả không có nghĩa mọi kết quả đều liên quan đến câu hỏi.

### 9.3. Không chỉ dùng điểm matching để chọn comp

`rankComps` hiện chấm điểm theo mức độ trùng khớp champion, item, augment, style và difficulty. Đây là heuristic phù hợp để tạo shortlist, nhưng điểm matching không chứng minh comp là lựa chọn mạnh nhất.

Nên chia quá trình thành hai bước:

- **Candidate generation:** tìm các comp đáp ứng điều kiện truy vấn.
- **Candidate evaluation:** kiểm tra tính hợp lệ, độ mới của dữ liệu, chỉ số meta và độ phù hợp với trạng thái người chơi.

Nếu chỉ có dữ liệu đủ cho bước đầu, câu trả lời nên là "các comp phù hợp với điều kiện tìm kiếm", không phải "comp mạnh nhất".

### 9.4. Kiểm tra history và tool messages bị gửi trùng

Tài liệu mô tả lần gọi LLM cuối gửi history, user message chứa evidence, cùng `toolMessages` từ tool loop.

Cách này có thể cần thiết cho một số provider, nhưng cần kiểm tra message assembly để bảo đảm:

- Không gửi trùng nội dung câu hỏi.
- Không trộn tool result cũ vào request mới.
- Không làm prompt phình to không cần thiết.

Nên đo riêng:

- Token đầu vào của system prompt.
- Token của history.
- Token của evidence JSON.
- Token của tool results.
- Token đầu ra.
- Tỷ lệ dữ liệu bị cắt do giới hạn ký tự.

Giới hạn 8.000 ký tự cho từng tool message và giới hạn evidence theo số lượng entity/comp không bảo đảm phần quan trọng nhất luôn được giữ lại. Nên ưu tiên trường theo mục đích truy vấn thay vì chỉ cắt theo độ dài.

## 10. Cải thiện LLM và lớp validation

### 10.1. Structured output theo loại câu hỏi

Hiện tại `parseGeneratedAnswer` yêu cầu JSON gồm `answer`, `sections`, `followUpQuestions` và `limitations`. Đây là hợp đồng đầu ra tốt cho UI, nhưng khá tổng quát cho nhiều loại câu hỏi TFT.

Nên giữ schema chung cho giao diện, đồng thời bổ sung trường nội bộ theo từng loại tác vụ.

Ví dụ, kết quả phân tích chiến thuật:

```ts
type StrategyAnswer = {
  recommendation: string;
  reasons: string[];
  assumptions: string[];
  alternatives: string[];
  confidence: "high" | "medium" | "low";
  evidenceIds: string[];
  missingInformation: string[];
};
```

Đây là schema đề xuất. Trường `confidence` không nên được model tự đặt chỉ dựa trên cảm giác; cần định nghĩa quy tắc gán nhãn hoặc hiệu chỉnh bằng kết quả đánh giá.

Kết quả thống kê nên có các trường như chỉ số, giá trị, đơn vị, patch, sample size và nguồn dữ liệu. Nhờ đó, code có thể kiểm tra trước khi chuyển thành câu trả lời tiếng Việt.

### 10.2. Chuyển từ kiểm tra JSON sang kiểm tra claim

Một cải tiến có giá trị cao là biểu diễn các khẳng định quan trọng dưới dạng claim có thể kiểm chứng.

Ví dụ, thay vì chỉ nhận:

> Akali là carry tốt nhất của comp này vì build có win rate cao.

Hệ thống cần xác định được các claim:

- Akali có mặt trong comp.
- Build đang được nhắc đến thuộc về Akali.
- Chỉ số được trích dẫn thuộc đúng patch.
- So sánh "tốt nhất" có căn cứ và tiêu chí rõ ràng.

Validator sau đó kiểm tra các claim với evidence trước khi cho phép câu trả lời được gửi đi.

Không cần triển khai hệ thống claim extraction phức tạp cho mọi câu hỏi ngay từ đầu. Hãy bắt đầu với số liệu, tên entity, so sánh và khuyến nghị comp.

### 10.3. Giữ streaming, nhưng cân nhắc thời điểm hiển thị

Theo tài liệu, hệ thống stream trường `answer` từ JSON đang sinh ra trước khi nhận kết quả cuối cùng và hoàn thành validation.

Điều này tạo rủi ro: người dùng có thể nhìn thấy câu trả lời sai trước khi validator quyết định fallback.

Ví dụ, model bắt đầu stream một con số sai; sau đó `ungroundedNumbers` phát hiện lỗi và thay toàn bộ câu trả lời bằng deterministic fallback. UI có thể đã hiển thị một phần thông tin không chính xác.

Hai hướng xử lý:

- **An toàn nhất:** buffer toàn bộ output, validate xong mới hiển thị.
- **Cân bằng độ trễ:** chỉ stream nội dung sau khi đã qua bước kiểm tra claim hoặc validation từng phần đủ tin cậy.

Với TFT Coach, nên ưu tiên phương án đầu cho câu hỏi về số liệu, mechanics, so sánh build và quyết định chiến thuật. Có thể giữ streaming nhanh cho persona hoặc giải thích không phụ thuộc nhiều vào dữ liệu thực tế.

## 11. Hiệu năng và chi phí

Hệ thống đã có cache, tải dữ liệu song song, giới hạn concurrency, tool timeout, provider retry và giới hạn số vòng gọi. Tuy nhiên, cần đo trước khi tối ưu.

### 11.1. Tránh load dữ liệu không cần thiết cho mọi câu hỏi

Theo thứ tự hiện tại, hệ thống load catalog, comps và meta stats trước khi xử lý prompt injection, persona và một số nhánh đơn giản. Do đó, các câu như "Chào Tomo" có thể vẫn kích hoạt công việc tải dữ liệu trước khi trả lời deterministic.

Có thể cải thiện bằng một lớp routing nhẹ:

1. Kiểm tra input và context.
2. Xử lý các trường hợp có thể trả lời an toàn mà không cần dữ liệu.
3. Chỉ load các nguồn cần thiết cho intent hoặc task plan.
4. Bổ sung evidence nếu thiếu.

Cần giữ các bước xác thực context và kiểm tra an toàn; không nên chuyển chúng ra sau chỉ để tiết kiệm chi phí.

### 11.2. Đo độ trễ theo từng bước

| Metric | Giúp xác định |
|---|---|
| `t_data_load` | DB, cache hoặc đọc file có chậm không |
| `t_entity_resolution` | Resolve alias có tốn thời gian không |
| `t_tool_execution` | Tool nào chậm hoặc thường timeout |
| `t_first_token` | Thời gian người dùng chờ trước nội dung đầu tiên |
| `t_llm_generation` | Model generation có phải nút thắt không |
| `t_validation` | Validation có gây độ trễ đáng kể không |
| `t_total` | Độ trễ end-to-end |
| `input_tokens`, `output_tokens` | Chi phí và độ phình context |

Nên báo cáo p50, p95 và tỷ lệ lỗi theo từng intent, không chỉ trung bình toàn hệ thống.

### 11.3. Kiểm tra giới hạn rate limit thực tế

Tài liệu mô tả mặc định 12 request/phút và 200 request/ngày theo `clientId(req)`, nhưng bảng cấu hình lại ghi giới hạn theo conversation. Cần xác minh trong code để tài liệu và hành vi thực tế nhất quán.

Nếu giới hạn dựa trên IP hoặc định danh client do trình duyệt gửi lên, cần kiểm tra khả năng giả mạo định danh và trường hợp nhiều người dùng chung IP.

Với production, có thể cần giới hạn theo nhiều tầng: người dùng đã xác thực, IP, concurrency và ngân sách token. Không nhất thiết áp dụng tất cả ngay từ MVP.

## 12. Evaluation pipeline và benchmark

`assistant_reasoning_logs` hiện ghi lại các bước chạy và lỗi kỹ thuật. Nhưng một request có thể có intent đúng, tool chạy thành công, JSON hợp lệ và validation pass mà câu trả lời vẫn sai về chiến thuật.

Vì vậy, nên bổ sung **evaluation pipeline độc lập với production request**.

### 12.1. Xây dựng benchmark TFT chuyên biệt

Bắt đầu với khoảng 150–300 câu hỏi được kiểm tra thủ công, sau đó mở rộng theo lỗi thực tế. Đây là quy mô khởi đầu đề xuất, không phải ngưỡng bảo đảm chất lượng.

Bộ test nên bao phủ:

1. **Tra cứu kiến thức:** champion, item, trait, augment, mechanics, shop odds, kinh tế và tên trùng.
2. **Meta và comp:** build, comp recommendation, so sánh, mẫu nhỏ, dữ liệu cũ và câu hỏi cần số liệu.
3. **Ra quyết định chiến thuật:** roll hay lên cấp, giữ hay bán tướng, chuyển comp, thiếu thông tin và trạng thái mâu thuẫn.
4. **Hội thoại nhiều lượt:** follow-up ngắn, phủ định, đổi comp, đổi chủ đề, sửa thông tin cũ và tham chiếu mơ hồ.
5. **Robustness và fallback:** provider timeout, tool lỗi, thiếu evidence, prompt injection, dữ liệu sai phiên bản và JSON không hợp lệ.

Mỗi câu test nên có đáp án hoặc tiêu chí chấm, evidence mong đợi, set/patch, intent hoặc task plan mong đợi và kết quả xử lý khi thiếu dữ liệu.

### 12.2. Định nghĩa metric chất lượng

| Metric | Ý nghĩa |
|---|---|
| Intent/task accuracy | Hệ thống có hiểu đúng mục tiêu câu hỏi không |
| Entity resolution accuracy | Có resolve đúng tướng, item, comp, augment không |
| Evidence recall | Có lấy đủ evidence cần thiết để trả lời không |
| Claim support rate | Bao nhiêu claim thực tế được evidence hỗ trợ |
| Factual accuracy | Câu trả lời có đúng theo nguồn chuẩn không |
| Recommendation quality | Gợi ý có hợp lý với trạng thái và điều kiện không |
| Clarification quality | Có hỏi lại đúng lúc khi thiếu dữ liệu không |
| Fallback correctness | Khi không đủ căn cứ, hệ thống có giới hạn đúng không |
| p95 latency và cost/request | Chất lượng vận hành và chi phí thực tế |

`claim support rate` và `factual accuracy` là hai metric khác nhau: câu trả lời có thể bám sát evidence nhưng evidence đã lỗi thời; ngược lại, một câu có thể tình cờ đúng nhưng không có căn cứ đáng tin cậy.

### 12.3. Regression test mỗi khi sửa prompt, tool hoặc provider

Mỗi lần thay đổi `detectIntent`, `rankComps`, prompt hoặc tool registry đều có thể làm hỏng những trường hợp trước đó chạy đúng.

Nên chạy benchmark trên các thay đổi quan trọng, so sánh theo từng nhóm câu hỏi và lưu:

- Phiên bản code.
- Phiên bản prompt.
- Model/provider.
- Snapshot dữ liệu.
- Output cũ và mới.
- Điểm số theo từng metric.
- Chi phí và độ trễ.

Không nên chỉ đánh giá xem câu trả lời mới nghe tự nhiên hơn hay không.

## 13. Kiến trúc đích đề xuất

Không cần viết lại toàn bộ hệ thống. Có thể tiếp tục sử dụng kiến trúc hiện tại nhưng làm rõ ranh giới trách nhiệm:

```text
1. Request & Safety
   ├─ Input validation
   ├─ Rate limit
   ├─ Prompt injection
   └─ Context validation

2. Context & Query Understanding
   ├─ Conversation state
   ├─ Entity resolution
   ├─ Multi-intent classification
   └─ Missing information

3. Query Planner
   ├─ Task plan có cấu trúc
   ├─ Chọn nguồn dữ liệu
   └─ Xác định tool cần gọi

4. Evidence Layer
   ├─ Game rules
   ├─ Comp data
   ├─ Meta stats
   ├─ Strategy engine
   └─ Version & provenance

5. Evidence Sufficiency Gate
   ├─ Đủ dữ liệu → tiếp tục
   ├─ Thiếu nhưng có thể lấy thêm → bổ sung
   └─ Không thể xác minh → hỏi lại hoặc giới hạn

6. Deterministic Engine / LLM Synthesis
   ├─ Tính toán bằng code khi có thể
   └─ LLM giải thích và tổng hợp khi cần

7. Validation & Response
   ├─ Schema validation
   ├─ Claim support
   ├─ Numeric consistency
   ├─ Domain checks
   └─ Fallback

8. Evaluation & Observability
   ├─ Trace
   ├─ Quality metrics
   ├─ Regression tests
   ├─ Latency
   └─ Token cost
```

Điểm khác biệt lớn nhất không phải số lượng agent hoặc tool. Đó là việc đưa **evidence sufficiency, version consistency và semantic validation** thành các bước có trách nhiệm rõ ràng, thay vì phụ thuộc chủ yếu vào prompt và một số gate riêng lẻ.

## 14. Roadmap triển khai thực tế

### Giai đoạn 1 — Kiểm chứng độ đúng của pipeline hiện tại

**Ưu tiên cao nhất**

- Tạo benchmark cho các intent và follow-up phổ biến.
- Kiểm tra routing, entity resolution và các intent override.
- Kiểm thử consistency giữa set/patch của catalog, comp và stats.
- Kiểm thử tool trả thiếu dữ liệu, provider lỗi và validation fallback.
- Kiểm tra streaming có hiển thị câu trả lời trước khi validation hoàn tất không.

**Kết quả mong muốn:** biết rõ hệ thống sai ở đâu trước khi thay đổi kiến trúc.

### Giai đoạn 2 — Nâng cấp evidence và validation

- Chuẩn hóa metadata nguồn, patch, thời gian và sample size.
- Bổ sung evidence sufficiency gate.
- Thêm domain validation cho số liệu, tên entity và kết quả so sánh.
- Làm rõ các trạng thái `not_found`, `ambiguous`, `stale` và `error`.
- Bổ sung regression tests cho mỗi lần thay đổi dữ liệu hoặc prompt.

**Kết quả mong muốn:** giảm lỗi factual và ngăn câu trả lời vượt quá căn cứ hiện có.

### Giai đoạn 3 — Nâng cấp query planning và hội thoại

- Xây dựng `QueryPlan` cho câu hỏi nhiều ý.
- Quản lý conversation state có cấu trúc.
- Chỉ gọi tool khi evidence hiện có chưa đủ.
- Giới hạn số bước và số tool theo kế hoạch.
- Xử lý rõ trường hợp thiếu thông tin hoặc người dùng thay đổi trạng thái trận đấu.

**Kết quả mong muốn:** xử lý follow-up và câu hỏi phức tạp nhất quán hơn.

### Giai đoạn 4 — Cải thiện chất lượng chiến thuật

- Hiệu chỉnh `rankComps` bằng dữ liệu benchmark.
- Phân biệt meta ranking và contextual recommendation.
- Kiểm chứng logic roll/level và chuyển comp.
- Đánh giá độ ổn định của gợi ý qua các trạng thái đầu vào.
- Theo dõi chất lượng thực tế cùng latency và cost.

**Kết quả mong muốn:** không chỉ trả lời đúng dữ kiện mà còn đưa ra gợi ý hữu ích hơn trong trận đấu.

## 15. Kết luận và khuyến nghị ưu tiên

Nếu đây là dự án của mình, mình sẽ **không rewrite toàn bộ `orchestrator.ts` và cũng chưa chuyển ngay sang một agent framework phức tạp hơn**.

Ba việc đầu tiên:

1. **Tạo benchmark và tìm lỗi thực tế:** xác định những câu hỏi mà hệ thống phân loại sai, lấy thiếu evidence hoặc trả lời sai.
2. **Đảm bảo dữ liệu và validation:** thống nhất phiên bản nguồn, kiểm tra claim và xử lý thiếu dữ liệu trước khi cho phép LLM trả lời.
3. **Nâng cấp state và planning:** xử lý tốt hơn câu hỏi nhiều ý, follow-up và quyết định chiến thuật theo trạng thái hiện tại.

Sau đó mới tối ưu ranking, chi phí và độ trễ dựa trên số liệu.

Kiến trúc hiện tại đã có nhiều thành phần của một hệ thống AI production: orchestration, tool calling, fallback, validation và tracing. Bước tiếp theo không phải thêm càng nhiều tool hoặc agent càng tốt, mà là **đo được chất lượng, biết rõ căn cứ của từng khuyến nghị và ngăn hệ thống trả lời chắc chắn khi dữ liệu chưa đủ**.

### Giới hạn của review

`answer-flow.md` mô tả luồng xử lý, không chứa toàn bộ implementation của `rankComps`, `analyzeStrategy`, `parseGeneratedAnswer` hay các tool truy vấn DB. Do đó, các đề xuất liên quan tới những hàm đó cần được đối chiếu với source code và benchmark trước khi quyết định thay đổi cụ thể.
