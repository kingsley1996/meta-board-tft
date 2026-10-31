# TFTIQ — Product Feature Specification
## Meta Pulse & Trend Detection · Smart Comp Recommendation · Comp Detail

> **Mục tiêu tài liệu:** Đặc tả sản phẩm và kỹ thuật cho ba năng lực được chọn để phát triển TFTIQ: theo dõi biến động meta, đề xuất đội hình theo ngữ cảnh người chơi và nâng cấp trang chi tiết đội hình.
>
> **Định vị:** TFTIQ không chỉ hiển thị đội hình mạnh. TFTIQ giúp người chơi hiểu meta đang thay đổi thế nào, lựa chọn đội hình phù hợp với tài nguyên hiện có và biết cách vận hành đội hình đó trong trận.
>
> **Nguyên tắc:** Data trước, rule/algorithm có thể kiểm chứng, AI giải thích sau. Không để LLM tự bịa số liệu, tự tính thống kê hoặc đưa ra lời khuyên chiến thuật không có căn cứ.

---

## 1. Product direction

### 1.1. Ba năng lực cốt lõi

| Feature | Câu hỏi người dùng cần giải quyết | Giá trị |
|---|---|---|
| Meta Pulse & Trend Detection | Meta đang thay đổi thế nào? Điều gì đang mạnh lên/yếu đi? | Nhận biết xu hướng và thay đổi meta sớm |
| Smart Comp Recommendation | Với unit, item, augment, emblem và tình huống hiện tại, tôi nên chơi comp nào? | Chuyển dữ liệu meta thành quyết định phù hợp ngữ cảnh |
| Improved Comp Detail | Nếu chọn comp này, tôi cần chơi và vận hành nó như thế nào? | Biến comp từ một danh sách unit thành một hướng dẫn thực chiến |

### 1.2. Product workflow

```text
Discover Meta
    ↓
Understand Trends
    ↓
Enter Current Game Context
    ↓
Get Ranked Comp Recommendations
    ↓
Open Comp Detail
    ↓
Follow Game Plan / Alternatives / Pivot Conditions
```

Ba feature phải liên kết với nhau:

- Meta Pulse cung cấp tín hiệu meta cho Recommendation Engine.
- Recommendation Engine truy xuất comp và điều kiện từ Comp Knowledge Base.
- Comp Detail hiển thị cùng một nguồn dữ liệu comp mà Recommendation Engine sử dụng.
- Mọi thống kê phải có patch, thời gian, rank/region filter và sample size đi kèm.

### 1.3. Phạm vi không thuộc MVP

- Tự động đọc màn hình hoặc điều khiển client TFT.
- Real-time in-game overlay.
- Dự đoán chính xác kết quả trận đấu hoặc xác suất Top 4 cá nhân.
- AI tự tạo comp/board chưa được xác thực.
- Player performance diagnosis khi chưa có round-level data.
- Tự động cập nhật guide chuyên gia chỉ dựa trên LLM.

---

# 2. Meta Pulse & Trend Detection

## 2.1. Mục tiêu

Meta Pulse giúp người chơi hiểu không chỉ comp nào đang đứng đầu tier list, mà còn:

1. Comp nào đang tăng hoặc giảm mức độ phổ biến.
2. Hiệu suất của comp có thực sự cải thiện hay không.
3. Champion, item, augment hoặc trait nào đang có thay đổi đáng chú ý.
4. Thay đổi đó có đủ dữ liệu để tin cậy không.
5. Điều gì có thể giải thích xu hướng, và điều gì mới chỉ là tương quan.

Không được đánh đồng **Popularity** với **Strength**. Một comp được chơi nhiều hơn không đồng nghĩa comp đó mạnh hơn.

## 2.2. Các nhóm tín hiệu

### A. Comp trends

Theo dõi theo từng comp và comp variant:

- Play rate: tỷ lệ trận có sử dụng comp.
- Average placement.
- Top 4 rate.
- Win rate / Top 1 rate.
- Sample size.
- Rank distribution.
- Region distribution.
- Thay đổi các chỉ số theo thời gian.

Ví dụ cách hiển thị:

| Comp | Play rate change | Avg placement change | Interpretation |
|---|---:|---:|---|
| Comp A | +18% | -0.12 | Phổ biến hơn và placement cải thiện |
| Comp B | +22% | +0.08 | Phổ biến hơn nhưng placement xấu đi |
| Comp C | -10% | -0.15 | Ít được chơi hơn nhưng hiệu suất cải thiện |

Quy ước: Average placement càng thấp càng tốt. Vì vậy, thay đổi `-0.12` là cải thiện; `+0.08` là xấu đi.

### B. Champion trends

Theo dõi:

- Pick rate.
- Average placement khi xuất hiện.
- Tỷ lệ xuất hiện trong Top 4 / Top 1.
- Tỷ lệ đạt 2-star / 3-star nếu dữ liệu hỗ trợ.
- Item phổ biến và hiệu suất item.
- Tần suất xuất hiện trong các comp mạnh.
- Hiệu suất theo cost, role và rank.

Không nên kết luận một champion mạnh chỉ vì có average placement tốt khi được chọn. Cần xét selection bias, sample size và ngữ cảnh comp.

### C. Item trends

Theo dõi:

- Item usage rate.
- Average placement khi được trang bị trên từng champion.
- Số lượng mẫu.
- Tỷ lệ item xuất hiện trong Top 4 / Top 1.
- Thay đổi theo patch và thời gian.
- Item holder phổ biến.
- Hiệu quả theo archetype/comp.

Không so sánh trực tiếp item trên các champion hoặc role khác nhau nếu không kiểm soát ngữ cảnh.

### D. Augment trends

Theo dõi:

- Pick rate.
- Average placement.
- Top 4 / Top 1 rate.
- Stage/choice index khi augment được chọn.
- Rank-specific performance.
- Synergy với comp, trait và champion.
- Mẫu dữ liệu theo từng lần xuất hiện.

Augment ở lựa chọn thứ nhất, thứ hai và thứ ba có thể có hiệu suất khác nhau. Không gộp các vị trí này nếu làm mất ý nghĩa của dữ liệu.

### E. Trait / archetype trends

Theo dõi:

- Tần suất đạt từng breakpoint.
- Average placement theo breakpoint.
- Các comp sử dụng trait.
- Trait đang được kết hợp thường xuyên.
- Thay đổi hiệu suất qua patch/time window.

## 2.3. Định nghĩa trend

Nên dùng các cửa sổ thời gian rõ ràng:

- **Short-term:** 24 giờ gần nhất, nếu sample size đủ.
- **Medium-term:** 7 ngày gần nhất.
- **Patch-to-date:** từ khi patch hiện tại bắt đầu.
- **Previous patch comparison:** so sánh cùng khoảng thời gian hoặc toàn patch trước, cần ghi rõ phương pháp.

Không hiển thị trend 24h nếu lượng dữ liệu quá thấp. Khi dữ liệu không đủ, hiển thị `Insufficient data` thay vì cố tạo nhãn tăng/giảm.

### Trend dimensions

Mỗi entity có tối thiểu hai nhóm thay đổi độc lập:

1. **Popularity trend:** thay đổi play/pick rate.
2. **Performance trend:** thay đổi average placement, Top 4 rate hoặc metric hiệu suất đã chọn.

Có thể phân loại:

| Popularity | Performance | Label gợi ý | Ý nghĩa |
|---|---|---|---|
| Tăng | Cải thiện | Rising & stronger | Được chơi nhiều hơn và hiệu suất tốt hơn |
| Tăng | Xấu đi | Rising but weaker | Có thể đang bị FOTM/over-contested |
| Giảm | Cải thiện | Underplayed / improving | Có thể là lựa chọn ít phổ biến nhưng hiệu quả |
| Giảm | Xấu đi | Falling | Mất độ phổ biến và hiệu suất |
| Không rõ | Không rõ | Stable / insufficient data | Chưa có tín hiệu đủ mạnh |

Không gán nhãn `Rising` chỉ dựa trên một chỉ số.

## 2.4. Cách tính metric

### Play rate

```text
play_rate =
  number_of_matches_where_entity_appears
  / eligible_match_count
```

Cần định nghĩa rõ `appears`: comp detection, champion presence hoặc augment selection có thể dùng mẫu số khác nhau.

### Average placement

```text
average_placement =
  sum(placement) / eligible_observation_count
```

Luôn hiển thị số observation tương ứng.

### Top 4 rate

```text
top4_rate =
  count(placement <= 4) / eligible_observation_count
```

### Top 1 rate

```text
top1_rate =
  count(placement == 1) / eligible_observation_count
```

### Delta

Với metric càng cao càng tốt:

```text
absolute_delta = current_value - baseline_value
relative_delta =
  (current_value - baseline_value) / baseline_value
```

Với average placement, chiều tốt/xấu bị đảo ngược: giảm là tốt hơn.

Nên lưu cả giá trị hiện tại, baseline và delta, không chỉ lưu nhãn trend.

## 2.5. Tránh trend giả

Đây là yêu cầu quan trọng nhất của feature.

### A. Sample-size threshold

- Đặt ngưỡng observation tối thiểu theo từng entity/metric.
- Ngưỡng phải cấu hình được và có thể khác nhau giữa comp, champion, item, augment.
- Không dùng cùng một ngưỡng tùy tiện cho mọi loại entity.
- Nếu dưới ngưỡng, vẫn có thể hiển thị số liệu nhưng không đưa ra kết luận trend mạnh.

### B. Confidence / uncertainty

- Hiển thị sample size.
- Có thể dùng confidence interval cho rate.
- Với average placement, cân nhắc bootstrap confidence interval hoặc phương pháp phù hợp với phân phối dữ liệu.
- Tránh tuyên bố thay đổi có ý nghĩa nếu khoảng bất định quá lớn.
- Không coi chênh lệch nhỏ là thay đổi đáng kể chỉ vì giá trị được làm tròn.

### C. Cohort consistency

Khi so sánh hai giai đoạn, cần giữ các điều kiện tương đương:

- Set và patch.
- Game mode.
- Rank range.
- Region.
- Queue type nếu có.
- Entity definition / comp detection version.

Nếu cohort thay đổi, phải ghi chú hoặc chuẩn hóa trước khi so sánh.

### D. Avoid survivorship and selection bias

Ví dụ: một champion chỉ được dùng trong những board rất mạnh có thể có placement tốt, nhưng điều đó không chứng minh champion tự thân mạnh.

Cần cung cấp context như:

- Comp/trait đi kèm.
- Unit star level.
- Item.
- Stage/level.
- Rank.
- Tần suất xuất hiện.

## 2.6. Meta Pulse UI

### A. Overview page

Các thành phần:

1. Current patch selector.
2. Rank / region / mode filters.
3. Time window selector.
4. Trending up.
5. Trending down.
6. Most played.
7. Biggest performance gain.
8. Biggest performance drop.
9. New or emerging comps.
10. Methodology / data freshness indicator.

Ví dụ card:

```text
RIFTBEAST BRAWLER
Rising & stronger

Play rate       +18.2%
Avg placement   3.91 → 3.78
Top 4 rate      58.1% → 61.4%
Sample size     12,480 matches

Compared with previous 7-day window
```

Các số trên chỉ là ví dụ minh họa UI, không phải dữ liệu thật.

### B. Entity detail trend chart

Khi mở một comp/champion/item:

- Line chart play rate theo ngày.
- Line chart average placement theo ngày.
- Top 4 rate theo ngày.
- Sample size theo ngày.
- Patch boundary marker.
- Annotation cho balance update nếu có nguồn xác thực.

Không nên đặt play rate và average placement trên cùng một trục nếu làm biểu đồ khó đọc. Có thể dùng hai chart riêng hoặc trục phù hợp.

### C. Trend explanation

Phần giải thích nên chia:

- **Observed:** dữ liệu thực sự cho thấy điều gì.
- **Possible explanation:** giả thuyết có thể giải thích xu hướng.
- **Confidence:** mức độ chắc chắn.
- **What to do:** hành động gợi ý, nếu có đủ căn cứ.

Ví dụ:

```text
Observed:
Play rate increased over the last 7 days while average placement improved.

Possible explanation:
The composition may be benefiting from a shift in item/augment usage.

Confidence:
Medium — sample size is sufficient, but the trend is not yet stable across all ranks.

Takeaway:
Worth considering, but compare performance in your rank before forcing the composition.
```

AI chỉ được viết phần giải thích dựa trên dữ liệu được truyền vào. Nếu không có bằng chứng về nguyên nhân, phải dùng ngôn ngữ giả thuyết, không khẳng định patch hoặc thay đổi unit là nguyên nhân.

## 2.7. Data model gợi ý

Có thể materialize aggregate theo ngày để tránh query nặng trên raw match data.

```ts
type TrendEntityType =
  | "comp"
  | "champion"
  | "item"
  | "augment"
  | "trait";

type TrendSnapshot = {
  id: string;
  set: string;
  patch: string;
  entityType: TrendEntityType;
  entityId: string;

  region: string | null;
  rankBucket: string | null;
  gameMode: string | null;

  windowStart: string;
  windowEnd: string;
  generatedAt: string;

  sampleSize: number;
  playRate: number | null;
  averagePlacement: number | null;
  top4Rate: number | null;
  top1Rate: number | null;

  baselineSampleSize: number | null;
  baselinePlayRate: number | null;
  baselineAveragePlacement: number | null;
  baselineTop4Rate: number | null;

  playRateDelta: number | null;
  averagePlacementDelta: number | null;
  top4RateDelta: number | null;

  popularityTrend:
    | "rising"
    | "falling"
    | "stable"
    | "insufficient_data";

  performanceTrend:
    | "improving"
    | "declining"
    | "stable"
    | "insufficient_data";

  confidenceLevel: "low" | "medium" | "high";
};
```

Đây là schema khởi đầu. Có thể tách bảng snapshot và bảng trend classification khi cần tối ưu.

### Pipeline

```text
Riot Match Data
      ↓
Raw Match Storage
      ↓
Normalization & Validation
      ↓
Entity / Comp Detection
      ↓
Daily Aggregation
      ↓
Baseline Comparison
      ↓
Trend Classification
      ↓
Meta Pulse API
      ↓
Web UI + AI Explanation
```

### API gợi ý

```http
GET /api/meta/pulse
  ?set=current
  &patch=current
  &rank=diamond_plus
  &region=vn
  &window=7d

GET /api/meta/trends
  ?entityType=comp
  &direction=rising
  &sort=playRateDelta
  &limit=20

GET /api/meta/entities/:type/:id/trends
  ?window=30d
  &rank=diamond_plus
  &region=vn
```

Response cần chứa `generatedAt`, filter đã áp dụng, sample size và thông tin baseline.

## 2.8. Acceptance criteria

- [ ] Có thể lọc theo patch, rank, region và time window.
- [ ] Có thể xem popularity và performance trend riêng biệt.
- [ ] Mọi metric có sample size.
- [ ] Có trạng thái insufficient data.
- [ ] So sánh hai giai đoạn có cohort tương đương hoặc có cảnh báo.
- [ ] Chart thể hiện patch boundary.
- [ ] Có data freshness timestamp.
- [ ] AI explanation phân biệt observed facts và hypotheses.
- [ ] Không tạo trend label từ dữ liệu dưới threshold.
- [ ] Có test cho trường hợp average placement giảm nhưng được phân loại là cải thiện.

---

# 3. Smart Comp Recommendation

## 3.1. Mục tiêu

Trả lời câu hỏi:

> Với những gì tôi đang có trong trận, đâu là các đội hình phù hợp nhất và tại sao?

Recommendation không được chỉ trả về comp có tier cao nhất. Nó phải cân nhắc:

- Item components và completed items.
- Champions hiện có.
- Augments.
- Emblems.
- Level / stage.
- Economy / HP nếu người dùng cung cấp.
- Contest level nếu có dữ liệu lobby.
- Meta performance.
- Khả năng chuyển đổi từ board hiện tại.

## 3.2. Product scope

### MVP: User-input recommendation

Người dùng tự nhập hoặc chọn:

**Required / recommended inputs**

- Set / patch.
- Item components.
- Completed items.
- Champions hiện có.
- Augments.
- Emblems.

**Optional context**

- Current level.
- Stage.
- Gold.
- HP.
- Current board.
- Preferred archetype.
- Rank / region.

Không bắt buộc người dùng phải nhập tất cả. UI phải cho phép bắt đầu recommendation với thông tin một phần và thể hiện độ đầy đủ của context.

### Later: Match / lobby context

Khi có nguồn dữ liệu hợp lệ:

- Champions đang bị contest.
- Người chơi khác đang hướng tới comp nào.
- Unit pool / availability nếu có thể suy ra đáng tin cậy.
- Current board và round state.
- Historical player preferences.

Không được giả định Riot API cung cấp live board state của tất cả người chơi. Nếu không có nguồn dữ liệu live hợp lệ, không hiển thị tính năng như thể có thể đọc lobby realtime.

## 3.3. Recommendation workflow

```text
User Context
    ↓
Input Validation & Normalization
    ↓
Candidate Retrieval
    ↓
Hard Constraint Filtering
    ↓
Feature Scoring
    ↓
Risk / Penalty Adjustment
    ↓
Ranked Recommendations
    ↓
Explanation + Evidence
    ↓
Open Comp Detail
```

### Step 1 — Normalize context

Chuẩn hóa mọi input thành canonical IDs:

- Champion ID.
- Item ID.
- Component ID.
- Augment ID.
- Trait ID.
- Set / patch ID.

Kiểm tra input có thuộc set hiện tại hay không.

### Step 2 — Candidate retrieval

Lấy candidate comp từ Comp Knowledge Base theo:

- Carry/primary champion compatibility.
- Item compatibility.
- Trait overlap.
- Augment/emblem synergy.
- Current patch validity.
- Comp status / availability.

Không nên retrieval chỉ theo một item vì có thể tạo candidate quá rộng.

### Step 3 — Hard constraints

Loại bỏ candidate khi vi phạm điều kiện không thể đáp ứng, ví dụ:

- Comp thuộc set khác.
- Champion không tồn tại trong set hiện tại.
- Comp đã deprecated.
- Bắt buộc có một unit nhưng dữ liệu set không hợp lệ.

Các điều kiện như “thiếu item lý tưởng” không nên tự động loại comp; đó thường là soft penalty vì có thể dùng alternative item.

### Step 4 — Score candidate

Điểm số ban đầu nên dễ giải thích và cấu hình được.

Ví dụ:

```text
Final Score =
  Meta Strength
  + Item Compatibility
  + Champion Compatibility
  + Augment / Emblem Synergy
  + Board Transition Fit
  + Flexibility
  - Contest Risk
  - Missing Core Requirements
```

Có thể chuẩn hóa từng thành phần về 0–100.

Một baseline trọng số để bắt đầu thử nghiệm:

| Component | Initial weight |
|---|---:|
| Meta strength | 20% |
| Item compatibility | 25% |
| Champion compatibility | 20% |
| Augment / emblem synergy | 15% |
| Board transition fit | 10% |
| Flexibility | 10% |

Penalty:

- Missing core requirements.
- Contest risk.
- Low confidence / low sample size.
- Comp difficulty, nếu đã có đánh giá đáng tin cậy.

Trọng số chỉ là giả thuyết ban đầu. Cần đánh giá offline và điều chỉnh bằng dữ liệu, không xem đây là công thức tối ưu.

### Important: Compatibility score is not win probability

Nếu hiển thị `92% match`, người dùng có thể hiểu nhầm thành 92% cơ hội thắng.

Nên ưu tiên:

- `Strong fit`
- `Good fit`
- `Situational`
- `Poor fit`

Hoặc hiển thị `Fit score: 92/100` kèm chú thích rõ đó là mức độ tương thích với input.

Không được gọi đó là win probability.

## 3.4. Feature scoring chi tiết

### A. Item compatibility

Cần phân biệt:

1. Core item match.
2. Good alternative item match.
3. Item holder compatibility.
4. Component availability.
5. Item flexibility.

Ví dụ:

```text
Comp A
- Required carry: Champion X
- Ideal items: Item 1, Item 2, Item 3
- User has: Item 1 component x2, Item 2 component x1

Result:
Good item direction, but one core item is not yet completed.
```

Không chỉ đếm số item trùng. Cần đánh giá item có đúng vai trò trên carry/tank hay không.

### B. Champion compatibility

- Số lượng champion đang sở hữu.
- Champion có thuộc core board không.
- Có bản sao để hướng tới 2-star/3-star không, nếu người dùng cung cấp.
- Unit có thể làm temporary holder hay không.
- Có thể giữ lại bao nhiêu unit khi pivot.

Không tự suy ra số lượng bản sao nếu input không có thông tin đó.

### C. Augment / emblem synergy

- Direct synergy.
- Trait breakpoint impact.
- Carry/tank synergy.
- Economy/leveling synergy.
- Comp-specific requirement.

Phân biệt augment có synergy trực tiếp với augment chỉ hữu ích chung.

### D. Board transition fit

Đánh giá mức độ chuyển từ board hiện tại sang comp mục tiêu:

- Số unit cần thay.
- Số unit có thể giữ.
- Trait overlap.
- Item holder transition.
- Role coverage.
- Cost / level feasibility nếu có dữ liệu.

Đây là một yếu tố khác biệt quan trọng: comp mạnh nhưng phải thay toàn bộ board có thể là lựa chọn tệ trong một số tình huống.

### E. Meta strength

Dùng thống kê của comp ở đúng:

- Set / patch.
- Rank bucket.
- Region.
- Game mode.

Nếu sample size thấp, giảm confidence hoặc không dùng metric đó.

### F. Contest risk

MVP không nên giả vờ biết lobby hiện tại nếu không có dữ liệu.

Có thể chia:

- `Unknown`: không có lobby data.
- `Low / Medium / High`: chỉ khi có nguồn dữ liệu contest đáng tin cậy.
- `Patch popularity`: chỉ là độ phổ biến chung, không phải lobby contest.

Không dùng play rate toàn server để kết luận người chơi đang bị contest trong trận hiện tại.

## 3.5. Recommendation output

Mỗi recommendation cần có:

```ts
type CompRecommendation = {
  compId: string;
  fitScore: number | null;
  fitLabel: "strong" | "good" | "situational" | "poor";

  reasons: Array<{
    type:
      | "item_match"
      | "champion_match"
      | "augment_synergy"
      | "emblem_synergy"
      | "board_transition"
      | "meta_strength"
      | "flexibility";
    title: string;
    explanation: string;
    evidence?: {
      metric?: string;
      value?: number;
      sampleSize?: number;
      source?: string;
    };
  }>;

  warnings: Array<{
    type:
      | "missing_core_item"
      | "missing_core_unit"
      | "low_sample_size"
      | "contest_unknown"
      | "high_transition_cost"
      | "patch_uncertainty";
    message: string;
  }>;

  nextSteps: string[];
};
```

### UI card example

```text
COMP A
Strong fit · 88/100

Why this comp:
✓ Your current components fit the primary carry.
✓ You already have 2 core units.
✓ Current patch performance is strong in your rank.

Watch out:
! One ideal item is still missing.
! Lobby contest data is unavailable.

Suggested next step:
Keep your current frontline and prioritize completing the carry items.

[View comp guide]
```

Tất cả số liệu ở đây chỉ là ví dụ minh họa.

## 3.6. Recommendation UI flow

### A. Context builder

Nên chia thành các section ngắn:

1. Items.
2. Champions.
3. Augments.
4. Emblems.
5. Game state (optional).

Yêu cầu UX:

- Search champion/item/augment.
- Click để thêm/xóa.
- Hiển thị component inventory rõ ràng.
- Hỗ trợ completed item và component riêng.
- Có nút clear/reset.
- Có thể dùng partial context.
- Hiển thị context completeness.

Không bắt buộc người dùng điền form dài trước khi xem kết quả.

### B. Results

Hiển thị 3–5 candidate tốt nhất:

- Fit label / score.
- Comp board preview.
- Carry và core traits.
- Lý do đề xuất.
- Warnings.
- Meta stats.
- Link sang Comp Detail.

Có filter:

- Most compatible.
- Strongest meta.
- Most flexible.
- Lowest transition cost.

### C. Compare recommendations

Cho phép so sánh tối đa 2–3 comp:

- Item compatibility.
- Champion overlap.
- Meta strength.
- Core requirements.
- Transition cost.
- Flexibility.
- Known risks.

### D. Explain recommendation

AI có thể nhận structured result từ engine và diễn giải tự nhiên.

AI không được:

- Tự thay score.
- Bịa sample size.
- Tạo số liệu win rate.
- Khẳng định contest khi không có lobby data.
- Tự thêm unit/item/augment không thuộc set.
- Tự tạo game mechanic không có trong knowledge base.

## 3.7. Architecture

```text
Web Context Builder
      ↓
Recommendation API
      ↓
Context Normalizer
      ↓
Candidate Retrieval
      ↓
Constraint Validator
      ↓
Scoring Engine
      ↓
Evidence Builder
      ↓
Recommendation Response
      ↓
AI Explanation (optional)
```

Nên tách scoring engine thành module thuần, có unit test độc lập. Không đặt business logic scoring trong prompt.

### Suggested interfaces

```ts
type RecommendationContext = {
  setId: string;
  patchId: string;
  rank?: string;
  region?: string;

  itemComponents: string[];
  completedItems: string[];
  champions: Array<{
    championId: string;
    copies?: number;
    starLevel?: number;
  }>;

  augmentIds: string[];
  emblemIds: string[];

  stage?: string;
  level?: number;
  gold?: number;
  hp?: number;

  currentBoard?: Array<{
    championId: string;
    starLevel?: number;
    items?: string[];
  }>;
};

interface CompCandidateRetriever {
  retrieve(
    context: RecommendationContext
  ): Promise<CompCandidate[]>;
}

interface CompScoringEngine {
  score(
    context: RecommendationContext,
    candidates: CompCandidate[]
  ): ScoredCompCandidate[];
}

interface RecommendationExplainer {
  explain(
    result: ScoredCompCandidate[]
  ): Promise<CompRecommendation[]>;
}
```

## 3.8. Evaluation

### Offline evaluation dataset

Tạo test cases có context và expected relevant comps:

```text
Case 1:
- AP components
- AP augment
- Early AP carry
Expected:
- AP comps should rank higher than unrelated AD comps.

Case 2:
- AD components
- AD carry copies
Expected:
- AD comps with compatible itemization should rank higher.

Case 3:
- Emblem X
Expected:
- Comps using emblem X should be retrieved.

Case 4:
- Current board overlaps with Comp A
Expected:
- Comp A should receive transition-fit advantage.

Case 5:
- Missing core requirements
Expected:
- Comp should be penalized and warning should appear.
```

### Metrics

| Metric | Mục tiêu |
|---|---|
| Recall@K | Candidate phù hợp có được retrieve không |
| NDCG@K | Candidate tốt có được xếp cao không |
| Constraint satisfaction | Có đáp ứng điều kiện cứng không |
| Explanation groundedness | Lý do có khớp evidence không |
| Coverage | Bao nhiêu context có recommendation hợp lệ |
| Latency | Thời gian tạo kết quả |
| User selection rate | Người dùng chọn candidate nào |

Không dùng placement đơn lẻ để kết luận recommendation tốt hay xấu.

## 3.9. Acceptance criteria

- [ ] Có thể tạo recommendation từ partial context.
- [ ] Context được normalize bằng canonical IDs.
- [ ] Candidate chỉ thuộc set/patch hợp lệ.
- [ ] Hard constraints được tách khỏi soft preferences.
- [ ] Scoring có thể giải thích và test độc lập.
- [ ] Fit score không bị mô tả thành xác suất thắng.
- [ ] Mỗi recommendation có reasons và warnings.
- [ ] Không có lobby contest claim khi thiếu lobby data.
- [ ] Có thể mở Comp Detail từ recommendation.
- [ ] Có offline evaluation dataset và regression tests.
- [ ] AI chỉ diễn giải kết quả có cấu trúc từ engine.

---

# 4. Improved Comp Detail

## 4.1. Mục tiêu

Comp Detail phải trả lời được sáu câu hỏi:

1. Đội hình này gồm những unit nào?
2. Tôi cần item/augment/emblem gì?
3. Khi nào nên chơi đội hình này?
4. Tôi đi từ early game đến final board như thế nào?
5. Nếu không hit unit hoặc thiếu item thì thay thế ra sao?
6. Khi nào nên tiếp tục và khi nào nên pivot?

Không nên coi Comp Detail là một trang hiển thị board và danh sách item. Đây là một **Comp Knowledge Package** có thể được dùng bởi cả UI, Recommendation Engine và AI Coach.

## 4.2. Information architecture

```text
Comp Detail
├── Overview
│   ├── Comp Identity
│   ├── Tier / Meta Stats
│   ├── Difficulty
│   └── Conditions to Play
│
├── Final Board
│   ├── Champions
│   ├── Positioning
│   ├── Traits
│   └── Roles
│
├── Items & Augments
│   ├── Carry Items
│   ├── Tank Items
│   ├── Alternative Items
│   └── Recommended Augments
│
├── Game Plan
│   ├── Early Game
│   ├── Mid Game
│   └── Late Game
│
├── Variants
│   ├── Alternative Carries
│   ├── Alternative Frontline
│   ├── Level Variants
│   └── Emblem Variants
│
├── Decision Guide
│   ├── When to Play
│   ├── When to Avoid
│   ├── When to Roll
│   └── When to Pivot
│
└── Evidence
    ├── Meta Statistics
    ├── Sample Size
    ├── Rank / Region
    ├── Patch
    └── Guide Author / Review
```

## 4.3. Overview section

Thông tin đầu trang:

- Comp name.
- Archetype.
- Patch compatibility.
- Tier.
- Average placement.
- Top 4 rate.
- Win rate.
- Play rate.
- Sample size.
- Rank/region filter.
- Difficulty.
- Flexibility.
- Last updated.

### Difficulty

Không nên tự suy ra difficulty chỉ từ average placement.

Có thể xây dựng đánh giá ban đầu từ expert-curated fields:

- Execution difficulty.
- Economy requirement.
- Unit dependency.
- Item dependency.
- Contest sensitivity.

Nếu chưa có expert review, hiển thị `Not rated` thay vì tự gán.

### Conditions to play

Ví dụ:

```text
Good conditions
- You have a strong start for the primary carry.
- Your components align with the core itemization.
- You can preserve enough HP while reaching the target level.

Avoid / reconsider when
- Key units are heavily contested.
- You lack a viable item direction.
- Your current board is significantly stronger in another direction.
```

Những điều kiện này cần được review theo từng comp, không dùng template chung như thể đúng cho tất cả đội hình.

## 4.4. Final board

Đây là phần trực quan quan trọng nhất.

Cần hiển thị:

- Hex board.
- Champion placement.
- Star level nếu có ý nghĩa.
- Items trên champion.
- Role labels: carry, secondary carry, tank, utility.
- Trait breakpoints.
- Level của board.
- Core units và optional units.

### Positioning

Nên hỗ trợ:

- Default positioning.
- Against melee access.
- Against backline access.
- Against AoE.
- Protect carry.
- Flexible positioning notes.

Không nên hiển thị nhiều preset nếu không có lý do chiến thuật rõ ràng.

Nếu có thể, mỗi preset phải đi kèm giải thích ngắn: thay đổi vị trí nào và nhằm giải quyết mối đe dọa gì.

## 4.5. Items & Augments

### Carry itemization

Mỗi carry cần:

- Best item combinations.
- Alternative item combinations.
- Item priority.
- Item role/explanation.
- Evidence/sample size nếu có statistical data.

Ví dụ:

```text
PRIMARY CARRY

Best item direction
1. Item A — Core damage
2. Item B — Scaling / synergy
3. Item C — Survival

Alternatives
- Item D can replace Item C in a suitable lobby.
- Item E is acceptable when components do not align.
```

Không nên ghi một thứ tự item tuyệt đối nếu hiệu quả phụ thuộc vào champion, patch, augment hoặc lobby.

### Tank itemization

Tách frontline unit theo role:

- Main tank.
- Secondary tank.
- Utility frontline.

Giải thích item nào phù hợp với từng role, tránh chỉ đưa một danh sách item chung.

### Augment recommendations

Chia:

- Best synergy.
- Strong general options.
- Situational options.
- Economy/tempo options.

Nếu có stats, cần phân biệt:

- Overall augment performance.
- Performance when used with this comp.
- Performance at each augment selection stage.

Không dùng overall augment stats để khẳng định augment đó là best-in-slot cho comp.

## 4.6. Game Plan theo stage

Đây là phần tạo khác biệt lớn so với một comp board tĩnh.

### Early game

Cần trả lời:

- Starting board nên dùng gì?
- Unit nào làm item holder?
- Có nên giữ unit nào?
- Trait nào giúp giữ máu?
- Có nên win streak hay lose streak?
- Điều kiện nào cho phép tiếp tục theo comp?

### Mid game

Cần trả lời:

- Mốc level mục tiêu.
- Thời điểm cần stabilize.
- Unit nào là ưu tiên khi roll.
- Khi nào dừng roll.
- Điều kiện tiếp tục giữ economy.
- Cách thay temporary unit.

### Late game

Cần trả lời:

- Final board.
- Unit nào cần nâng cấp.
- Khi nào lên level tiếp.
- Cách cap board.
- Cách thay utility unit.
- Positioning theo lobby.

Mọi hướng dẫn về stage, level và roll timing phải có expert review hoặc nguồn dữ liệu đủ tin cậy. Không nên sinh tự động một chiến thuật chung cho tất cả comp.

## 4.7. Comp Variants

Một comp có thể có nhiều cách triển khai:

### A. Carry variants

- Primary carry.
- Alternative carry.
- Conditions to switch.

### B. Frontline variants

- Main tank A.
- Alternative tank B.
- Trait trade-off.

### C. Level variants

- Level 7 board.
- Level 8 board.
- Level 9 cap board.

Chỉ tạo variant khi có giá trị chiến thuật rõ ràng. Không tạo variant chỉ vì có thể thay một unit bất kỳ.

### D. Emblem variants

- Emblem required.
- Emblem optional.
- Trait breakpoint gained.
- Which unit to replace.
- Board trade-off.

## 4.8. Decision Guide

Đây là phần quan trọng nhất để biến guide thành công cụ ra quyết định.

### When to play

Các điều kiện mở đầu:

- Item direction.
- Starting units.
- Augment/emblem.
- Economy/HP conditions.
- Contest situation.

### When to avoid

- Missing critical requirements.
- Poor item direction.
- Heavy contest.
- Current board has a stronger alternative.
- Insufficient economy/HP to execute the plan.

### When to roll

Cần lưu các điều kiện cụ thể:

- Target level.
- Roll objective.
- Minimum stabilization requirement.
- Stop condition.

Không chỉ viết "roll at level 7" mà không có bối cảnh.

### When to pivot

Phải mô tả:

- Pivot trigger.
- Candidate alternative comp.
- Units to keep.
- Units to replace.
- Item compatibility.
- Transition cost.
- Risks.

Ví dụ:

```text
Pivot trigger:
You are unable to find the primary carry and your current items support another archetype.

Keep:
- Shared frontline units.
- Utility units with relevant traits.

Replace:
- Units that only support the original carry.

Before pivoting:
Check whether the alternative carry has a viable item path.
```

## 4.9. Evidence & freshness

Mỗi Comp Detail cần thể hiện:

- Patch.
- Set.
- Data window.
- Rank / region.
- Sample size.
- Last data refresh.
- Guide author/source.
- Last expert review.
- Guide version.

Tách rõ hai nguồn:

1. **Statistical evidence:** dữ liệu trận đấu.
2. **Strategic guidance:** hướng dẫn chiến thuật đã được biên tập/review.

Một comp có thể có data mới nhưng guide cũ. UI phải thể hiện hai mốc cập nhật độc lập.

## 4.10. Comp Knowledge schema

Schema gợi ý:

```ts
type CompKnowledge = {
  id: string;
  setId: string;
  patchFrom?: string;
  patchTo?: string;

  name: string;
  slug: string;
  archetype: string;
  description: string;

  overview: {
    difficulty?: "easy" | "medium" | "hard";
    flexibility?: "low" | "medium" | "high";
    executionNotes?: string[];
  };

  board: {
    level: number;
    units: Array<{
      championId: string;
      role:
        | "primary_carry"
        | "secondary_carry"
        | "main_tank"
        | "secondary_tank"
        | "utility";
      starLevel?: number;
      items?: string[];
      position?: {
        x: number;
        y: number;
      };
      required: boolean;
    }>;
    traitTargets: Array<{
      traitId: string;
      breakpoint: number;
    }>;
  };

  itemization: Array<{
    championId: string;
    priority: "core" | "recommended" | "situational";
    itemSets: Array<{
      items: string[];
      explanation?: string;
    }>;
  }>;

  augments: Array<{
    augmentId: string;
    category: "best_synergy" | "strong" | "situational";
    explanation: string;
    selectionStage?: number;
  }>;

  gamePlan: {
    early?: StageGuide;
    mid?: StageGuide;
    late?: StageGuide;
  };

  variants: CompVariant[];

  decisionRules: {
    whenToPlay: string[];
    whenToAvoid: string[];
    rollConditions: string[];
    pivotConditions: PivotRule[];
  };

  provenance: {
    sourceType: "expert" | "community" | "derived";
    sourceName?: string;
    author?: string;
    reviewedAt?: string;
    version: number;
  };
};

type StageGuide = {
  objective: string;
  targetLevel?: number;
  boardUnitIds: string[];
  itemHolders?: string[];
  actions: string[];
  transitionConditions?: string[];
};

type CompVariant = {
  id: string;
  name: string;
  description: string;
  conditions: string[];
  changedUnits: Array<{
    remove?: string;
    add?: string;
  }>;
  tradeoffs: string[];
};

type PivotRule = {
  trigger: string;
  targetCompId?: string;
  keepUnits: string[];
  replaceUnits: string[];
  itemCompatibility: string;
  risks: string[];
};
```

Schema trên là logical model. Có thể chuẩn hóa thành các bảng riêng trong PostgreSQL để quản lý version, query và reuse tốt hơn.

## 4.11. Content authoring & review

Không để LLM tự publish Comp Knowledge.

Đề xuất workflow:

```text
Comp Draft
   ↓
Data Validation
   ↓
Strategy Authoring
   ↓
Expert Review
   ↓
Patch Compatibility Check
   ↓
Publish
   ↓
Version & Monitor
```

Các rule:

- Champion/item/augment ID phải hợp lệ trong set.
- Trait breakpoint phải tồn tại.
- Board level phải hợp lý.
- Không có unit trùng ngoài chủ đích.
- Item assignment phải hợp lệ.
- Các stage guide phải có nội dung.
- Pivot target phải tồn tại.
- Nội dung thay đổi phải lưu version.
- Patch mới cần đánh dấu guide cũ cần review.

AI có thể hỗ trợ draft, phát hiện thiếu nội dung và kiểm tra consistency, nhưng cần reviewer xác nhận những hướng dẫn chiến thuật quan trọng.

## 4.12. Acceptance criteria

- [ ] Comp Detail có overview và meta statistics.
- [ ] Có final board và positioning.
- [ ] Có carry/tank itemization riêng.
- [ ] Có augment recommendations.
- [ ] Có early/mid/late game plan.
- [ ] Có alternative board/variants.
- [ ] Có conditions to play/avoid.
- [ ] Có roll và pivot guidance.
- [ ] Có provenance và review timestamp.
- [ ] Data freshness và guide freshness được tách biệt.
- [ ] Recommendation Engine có thể reuse Comp Knowledge.
- [ ] AI Coach có thể truy xuất đúng các section.
- [ ] Có validation trước khi publish.
- [ ] Có versioning và patch compatibility.

---

# 5. Shared data architecture

Ba feature phải dùng chung một nguồn dữ liệu chuẩn, tránh mỗi module tự duy trì một bản comp khác nhau.

## 5.1. Core entities

```text
Set
Patch
Champion
Trait
Item
ItemComponent
Augment
Comp
CompVariant
CompBoard
CompUnit
CompItemization
CompAugment
CompGuide
Match
MatchParticipant
ParticipantUnit
ParticipantItem
ParticipantAugment
DailyEntityAggregate
TrendSnapshot
RecommendationSession
RecommendationResult
```

## 5.2. Data ownership

| Data | Source of truth |
|---|---|
| Set/champion/trait/item/augment metadata | Game data source được version hóa |
| Match placement và participant data | Riot match data đã normalize |
| Comp statistics | Aggregate pipeline của TFTIQ |
| Comp guide / strategy | Expert-reviewed content |
| Recommendation score | Deterministic scoring engine |
| AI explanation | LLM dựa trên structured evidence |
| Trend classification | Trend processing service |

## 5.3. Data versioning

Mỗi record hoặc aggregate cần có đủ thông tin để xác định:

- Set.
- Patch.
- Data collection time.
- Aggregation window.
- Region.
- Rank bucket.
- Game mode.
- Processing version.
- Entity detection version.

Nếu thay đổi thuật toán nhận diện comp, phải biết aggregate nào được tạo từ phiên bản cũ để tránh so sánh không tương đương.

## 5.4. Data quality checks

- Duplicate match detection.
- Invalid set/patch detection.
- Unknown entity IDs.
- Missing placement.
- Invalid item/augment references.
- Impossible star level / board state.
- Stale match ingestion.
- Aggregate count reconciliation.
- Comp detection regression.

Không đưa dữ liệu chưa qua validation vào public Meta Pulse hoặc Recommendation Engine.

---

# 6. AI Coach integration

AI Coach là lớp giao tiếp và giải thích, không phải nơi chứa toàn bộ logic sản phẩm.

## 6.1. Tools đề xuất

```text
get_meta_pulse(filters)
get_entity_trends(entity_type, entity_id, filters)
search_comps(filters)
get_comp_detail(comp_id, sections)
recommend_comps(context)
compare_comps(comp_ids, context)
get_comp_variants(comp_id, context)
```

## 6.2. Example workflow

User:

> Tôi đang có nhiều AP components, một emblem X và đang chơi board có Champion A. Nên chơi gì?

Agent:

1. Parse user context.
2. Resolve canonical item/emblem/champion IDs.
3. Call `recommend_comps`.
4. Receive ranked candidates and evidence.
5. Call `get_comp_detail` for top candidates if more details are needed.
6. Explain trade-offs and next steps.
7. Link to Comp Detail.

## 6.3. Response contract

Mọi câu trả lời recommendation nên phân biệt:

```text
Recommendation
- Candidate comp
- Fit label / score

Reasons
- Evidence-backed reasons

Warnings
- Missing requirements
- Unknown context
- Low confidence

Next actions
- Suggested item direction
- Units to keep
- Relevant guide section

Sources
- Comp ID
- Patch
- Data window
- Sample size
- Guide version
```

## 6.4. Guardrails

- Không có evidence thì không tạo numeric claim.
- Không có live lobby data thì không khẳng định comp bị contest.
- Không có current game context thì không giả vờ biết board người dùng.
- Không có dữ liệu patch mới thì cảnh báo stale data.
- Không suy diễn mechanic khi knowledge base không có.
- Không để AI tự ghi vào canonical comp data.
- Log tool inputs/outputs để có thể debug và evaluate.

---

# 7. Roadmap triển khai

## Phase 0 — Foundation

Mục tiêu: chuẩn hóa data và comp knowledge trước khi xây các trải nghiệm phụ thuộc.

- [ ] Chốt canonical IDs cho set/champion/item/augment/trait.
- [ ] Chốt định nghĩa comp và comp variant.
- [ ] Chuẩn hóa match data.
- [ ] Xây aggregate schema.
- [ ] Xây Comp Knowledge schema.
- [ ] Xây validation và versioning.
- [ ] Tạo test fixtures cho từng set/patch.

**Exit criteria:** có thể truy xuất cùng một comp từ Meta page, Comp Detail và Recommendation Engine bằng một canonical ID.

## Phase 1 — Improved Comp Detail

Mục tiêu: tạo một comp guide thực sự hữu ích và có cấu trúc.

- [ ] Overview + statistics.
- [ ] Final board + positioning.
- [ ] Carry/tank itemization.
- [ ] Augment recommendations.
- [ ] Early/mid/late game guide.
- [ ] Variants.
- [ ] Conditions to play/avoid.
- [ ] Provenance/versioning.
- [ ] Content review workflow.

**Lý do làm trước:** Recommendation Engine cần Comp Knowledge chất lượng để truy xuất và giải thích. Nếu comp data chỉ là một list champion thì recommendation sẽ nghèo nàn.

## Phase 2 — Meta Pulse

Mục tiêu: phát hiện và trình bày xu hướng từ aggregate data.

- [ ] Daily aggregate pipeline.
- [ ] Baseline comparison.
- [ ] Popularity/performance trend classification.
- [ ] Sample-size threshold.
- [ ] Confidence/uncertainty.
- [ ] Meta Pulse overview.
- [ ] Entity trend charts.
- [ ] Data freshness and methodology.
- [ ] AI trend explanation có grounding.

**Exit criteria:** hệ thống có thể phân biệt một comp đang được chơi nhiều hơn với một comp thực sự cải thiện hiệu suất.

## Phase 3 — Smart Comp Recommendation

Mục tiêu: đề xuất comp từ partial hoặc full game context.

- [ ] Context builder UI.
- [ ] Context normalization.
- [ ] Candidate retrieval.
- [ ] Hard constraints.
- [ ] Scoring engine.
- [ ] Penalty and warnings.
- [ ] Evidence builder.
- [ ] Ranked result UI.
- [ ] Compare candidates.
- [ ] Offline evaluation.
- [ ] AI explanation/tool integration.

**Exit criteria:** cùng một input tạo kết quả ổn định, giải thích được, có warning khi thiếu dữ liệu và không tạo claim vượt quá evidence.

## Phase 4 — Continuous improvement

- [ ] Collect anonymized interaction events phù hợp với privacy policy.
- [ ] Measure recommendation selection rate.
- [ ] Build user feedback loop.
- [ ] Add rank-specific evaluation.
- [ ] Improve trend sensitivity.
- [ ] Add richer board transition scoring.
- [ ] Explore lobby contest data only when a reliable source exists.
- [ ] Add personal analytics when match history coverage is sufficient.

---

# 8. Product analytics

Không chỉ đo page views. Cần đo người dùng có hoàn thành được quyết định hay không.

## Meta Pulse

- Pulse page visits.
- Trend entity clicks.
- Filter usage.
- Trend-to-comp-detail click-through.
- Trend explanation engagement.
- Percentage of trends hidden due to insufficient data.
- Data freshness.

## Smart Comp Recommendation

- Recommendation starts.
- Context completion rate.
- Recommendation result views.
- Comp detail click-through.
- Candidate selection rate.
- Input combinations with no results.
- Average latency.
- User feedback (helpful/not helpful).

## Comp Detail

- Comp detail views.
- Scroll depth by section.
- Board interaction.
- Variant selection.
- Guide section engagement.
- Save/favorite action.
- Recommendation-to-guide conversion.

## Quality guardrails

- Invalid entity reference rate.
- Stale patch content rate.
- Unsupported AI claim rate.
- Recommendation constraint violation rate.
- Trend false-positive review rate.
- Comp guide review overdue rate.

---

# 9. MVP scope — Những gì thực sự cần ship trước

Để tránh scope quá lớn, MVP nên giới hạn như sau:

| Feature | MVP | Defer |
|---|---|---|
| Meta Pulse | Comp trends, popularity/performance split, 7d comparison, sample size | Complex causal explanation, real-time trend |
| Smart Recommendation | Item, champion, augment, emblem input; top 3–5 comps; explainable scoring | Live lobby contest, automatic board reading |
| Comp Detail | Final board, items, augments, game plan, variants, conditions, evidence | Fully adaptive live guide, automated expert content generation |
| AI | Tool-based retrieval and grounded explanation | Autonomous in-game agent |

### MVP success criteria

1. Người dùng có thể tìm hiểu comp đang nổi lên hoặc suy yếu.
2. Người dùng có thể nhập một phần tài nguyên và nhận danh sách comp phù hợp.
3. Người dùng hiểu vì sao từng comp được đề xuất.
4. Người dùng mở Comp Detail và tìm được hướng dẫn để triển khai.
5. Không có số liệu hoặc chiến thuật quan trọng nào được trình bày mà thiếu nguồn/căn cứ.
6. Các feature dùng chung canonical data, không tạo ba hệ thống dữ liệu tách rời.

---

# 10. Product principles

1. **Evidence over confidence:** Không biết thì nói không biết; không biến dữ liệu ít thành kết luận chắc chắn.
2. **Decision over dashboard:** Mọi chart và metric cần giúp người chơi hiểu hoặc quyết định điều gì đó.
3. **Context over generic ranking:** Comp tốt nhất nói chung chưa chắc là comp tốt nhất cho người chơi hiện tại.
4. **Structured data before LLM:** Logic tính toán và kiểm tra phải deterministic khi có thể.
5. **One comp knowledge source:** Meta, recommendation và AI Coach dùng chung Comp Knowledge.
6. **Freshness is visible:** Người dùng luôn biết dữ liệu thuộc patch và thời điểm nào.
7. **Expert strategy stays reviewable:** Hướng dẫn chiến thuật có provenance, version và review.
8. **Graceful partial context:** Không ép người dùng nhập đủ mọi thông tin mới có thể nhận trợ giúp.

---

## Final recommendation

Thứ tự ưu tiên nên là:

1. **Improved Comp Detail** — xây nền tảng kiến thức comp có cấu trúc và được review.
2. **Meta Pulse & Trend Detection** — xây lớp aggregate và xu hướng có thể kiểm chứng.
3. **Smart Comp Recommendation** — kết hợp Comp Knowledge, Meta Data và game context để đưa ra lựa chọn phù hợp.
4. **AI Coach integration** — dùng tools để truy xuất, so sánh và giải thích kết quả.

TFTIQ sẽ có lợi thế khi ba feature không hoạt động riêng lẻ mà tạo thành một vòng lặp:

```text
Meta Data
   ↓
Trend Intelligence
   ↓
Comp Knowledge
   ↓
Context-aware Recommendation
   ↓
Actionable Comp Guide
   ↓
User Feedback & Evaluation
   ↺
```

**Định nghĩa thành công:** Người chơi không chỉ biết comp nào mạnh. Họ biết comp nào phù hợp với mình, vì sao phù hợp, cần làm gì tiếp theo và khi nào nên thay đổi quyết định.
