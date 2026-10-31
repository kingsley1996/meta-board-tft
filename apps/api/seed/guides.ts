// Authored guides, seeded into Postgres. English is the source of truth; the
// *Vi fields are optional translations. Edit through /admin/guides (English)
// or here + `npm run seed` (vi). publishedOn is ISO (YYYY-MM-DD).
export type GuideSeed = {
  slug: string;
  author: string;
  authorSlug: string;
  publishedOn: string;
  title: string;
  excerpt: string;
  tags: string[];
  featured?: boolean;
  sections: { heading: string; body: string[]; list?: string[] }[];
  titleVi?: string;
  excerptVi?: string;
  sectionsVi?: { heading: string; body: string[]; list?: string[] }[];
};

export const guideSeeds: GuideSeed[] = [
  {
    slug: 'economy-first-stage-2',
    author: 'Vale',
    authorSlug: 'vale',
    publishedOn: '2026-10-12',
    title: 'Economy first: why your stage 2 decides your stage 5',
    excerpt: 'Interest is not a number you watch, it is a decision you make. A practical framework for the first ten rounds.',
    tags: ['Fundamentals', 'Economy'],
    featured: true,
    sections: [
      {
        heading: 'The two curves',
        body: [
          'Every stage 2 you play one of two curves: the streak curve or the interest curve. The streak curve trades gold for HP and tempo. The interest curve trades HP for gold and flexibility.',
          'Both are correct. What loses games is drifting between them — winning one round, losing the next, and arriving at 3-1 with neither streak gold nor interest.',
        ],
        list: [
          'Pick your curve by 2-1, not at carousel.',
          'A streak is only worth holding if you can hold all 5 rounds.',
          'Interest caps at 50 gold; after that, gold is for the curve that plans to spend it.',
        ],
      },
      {
        heading: 'What stage 2 gold actually buys',
        body: [
          'Gold stacked in stage 2 converts into level 8 on 4-2 with 30+ gold to roll. That is the entire goal: a full board two rounds before players who fought all stage 2.',
          'If your board cannot reach 4-2 at level 8 with 30 gold, your stage 2 was too expensive. Count the rounds you leveled early — each one is roughly a roll-down delayed.',
        ],
      },
    ],
    titleVi: 'Kinh tế trước tiên: vì sao giai đoạn 2 quyết định giai đoạn 5',
    excerptVi: 'Lãi không phải con số để ngắm, mà là quyết định bạn đưa ra. Khung tư duy thực dụng cho mười vòng đầu.',
    sectionsVi: [
      {
        heading: 'Hai đường cong',
        body: [
          'Mỗi giai đoạn 2 bạn đi một trong hai đường cong: đường chuỗi thắng hoặc đường lãi. Đường chuỗi đổi vàng lấy Máu và tempo. Đường lãi đổi Máu lấy vàng và độ linh hoạt.',
          'Cả hai đều đúng. Thứ thua ván đấu là đi lạc giữa hai đường — thắng một vòng, thua vòng sau, và đến 3-1 mà chẳng có vàng chuỗi lẫn lãi.',
        ],
        list: [
          'Chọn đường cong từ 2-1, không phải lúc vòng xoay.',
          'Chuỗi chỉ đáng giữ nếu bạn giữ được cả 5 vòng.',
          'Lãi tối đa ở 50 vàng; sau đó, vàng là để tiêu cho đường cong đã định tiêu.',
        ],
      },
      {
        heading: 'Vàng của giai đoạn 2 thực sự mua được gì',
        body: [
          'Vàng tích ở giai đoạn 2 chuyển thành cấp 8 ở 4-2 với hơn 30 vàng để roll. Đó là toàn bộ mục tiêu: đội hình hoàn chỉnh trước những người đánh nhau cả giai đoạn 2 hai vòng.',
          'Nếu đội hình không đạt 4-2 ở cấp 8 với 30 vàng, giai đoạn 2 của bạn quá đắt. Đếm số vòng bạn lên cấp sớm — mỗi vòng tương đương một lần roll bị đẩy lùi.',
        ],
      },
    ],
  },
  {
    slug: 'item-slam-decision',
    author: 'Rook',
    authorSlug: 'rook',
    publishedOn: '2026-10-08',
    title: 'Item slams: the 8-second decision',
    excerpt: 'You have eight seconds on the carousel and three slams in your pocket. Here is the order of operations.',
    tags: ['Items', 'Fundamentals'],
    sections: [
      {
        heading: 'Slam order',
        body: ['Slams are about real options, not perfect items. A completed flexible item on your carry beats a perfect component on your bench every time.'],
        list: ['Carry item that combines now', 'Tank item that combines now', 'Flexible component (blade, vest)', 'Component for a contested line'],
      },
      {
        heading: 'The pivot tax',
        body: [
          'Slamming locks in a damage type. If your lobby is 5 AP players and you slam AP on 2-2, you paid the pivot tax for somebody else.',
          'Watch the first two PvP rounds. If three boards open with Arcanists, your AP slam is a donation. Blade or vest first, AP second.',
        ],
      },
    ],
    titleVi: 'Ghép trang bị: quyết định trong 8 giây',
    excerptVi: 'Bạn có tám giây ở vòng xoay và ba món đồ trong túi. Đây là thứ tự xử lý.',
    sectionsVi: [
      {
        heading: 'Thứ tự ghép',
        body: ['Ghép đồ là chuyện lựa chọn thật, không phải món hoàn hảo. Một trang bị linh hoạt đã hoàn chỉnh trên chủ lực luôn thắng một mảnh hoàn hảo nằm dự bị.'],
        list: ['Trang bị chủ lực ghép được ngay', 'Trang bị đỡ đòn ghép được ngay', 'Mảnh linh hoạt (kiếm, giáp gai)', 'Mảnh cho đội đang bị tranh'],
      },
      {
        heading: 'Thuế xoay bài',
        body: [
          'Ghép đồ khóa lại một loại sát thương. Nếu sảnh có 5 người chơi phép và bạn ghép phép ở 2-2, bạn đang trả thuế xoay bài thay người khác.',
          'Quan sát hai vòng PvP đầu. Nếu ba đội mở bằng Pháp Sư, cú ghép phép của bạn là một món quà. Kiếm hoặc giáp gai trước, phép sau.',
        ],
      },
    ],
  },
  {
    slug: 'rolling-on-8-flowchart',
    author: 'Nyx',
    authorSlug: 'nyx',
    publishedOn: '2026-09-30',
    title: 'Rolling on 8: a flowchart that actually works',
    excerpt: 'Every "when do I roll" answer, reduced to three questions about your HP, gold and lobby.',
    tags: ['Decision making', 'Mid game'],
    sections: [
      {
        heading: 'The three questions',
        body: ['Before any roll-down, answer: Am I stable if I wait? Do I know my final board? Is anyone else buying my units?'],
        list: [
          'Stable + known board + contested: roll now.',
          'Stable + known board + free: wait one stage.',
          'Unstable: roll to 20 and stabilise, then rebuild.',
        ],
      },
      {
        heading: 'Why waiting is usually wrong below 40 HP',
        body: ['Players protect gold the way they protect HP — as a score. Gold is only a score while you are alive. Below 40 HP, the roll-down is the correct play even at level 7 in a bad spot.'],
      },
    ],
    titleVi: 'Roll ở 8: lưu đồ thật sự hiệu quả',
    excerptVi: 'Mọi câu trả lời cho "khi nào roll", rút gọn thành ba câu hỏi về Máu, vàng và sảnh đấu.',
    sectionsVi: [
      {
        heading: 'Ba câu hỏi',
        body: ['Trước mọi lần roll, trả lời: Chờ thêm có ổn không? Đội hình cuối của tôi đã rõ chưa? Có ai khác đang mua tướng của tôi không?'],
        list: [
          'Ổn định + rõ bài + bị tranh: roll ngay.',
          'Ổn định + rõ bài + không tranh: chờ thêm một giai đoạn.',
          'Không ổn định: roll về 20 và ổn định, rồi gây dựng lại.',
        ],
      },
      {
        heading: 'Vì sao chờ thường sai khi dưới 40 Máu',
        body: ['Người chơi giữ vàng như giữ Máu — như một cột điểm. Vàng chỉ là điểm khi bạn còn sống. Dưới 40 Máu, roll là nước đi đúng kể cả ở cấp 7 trong thế xấu.'],
      },
    ],
  },
  {
    slug: 'frontline-positioning-5-minutes',
    author: 'Juno',
    authorSlug: 'juno',
    publishedOn: '2026-09-22',
    title: 'Frontline positioning in 5 minutes',
    excerpt: 'Your frontline is a decision about which side the fight happens on. Stop centering it.',
    tags: ['Positioning'],
    sections: [
      {
        heading: 'Pick a side',
        body: [
          'Your carry sits in a corner. Your frontline mirrors it, shifted one hex inward, so the fight starts on your terms. Center fronts lose to corner carries; corner fronts trade better than both.',
        ],
        list: ['Carry corner first, always', 'Frontline one hex toward mid', 'Assassins opposite their carry', 'From 4-3 onward, re-scout every round'],
      },
      {
        heading: 'The last-round veto',
        body: ['In the final two rounds, the fight is one hybrid battle. Position for the board that counters you, not the board with the most HP — that is the one that ends your game.'],
      },
    ],
    titleVi: 'Xếp tuyến trước trong 5 phút',
    excerptVi: 'Tuyến trước là quyết định giao tranh diễn ra ở phía nào. Đừng đặt nó chính giữa nữa.',
    sectionsVi: [
      {
        heading: 'Chọn một phía',
        body: [
          'Chủ lực nằm ở góc. Tuyến trước soi gương theo nó, dịch vào một ô, để giao tranh bắt đầu theo ý bạn. Tuyến giữa thua chủ lực góc; tuyến góc đổi bài tốt hơn cả hai.',
        ],
        list: ['Chủ lực vào góc trước, luôn luôn', 'Tuyến trước dịch một ô về giữa', 'Sát thủ đối diện chủ lực địch', 'Từ 4-3 trở đi, do thám lại mỗi vòng'],
      },
      {
        heading: 'Quyền phủ quyết vòng cuối',
        body: ['Hai vòng cuối, giao tranh chỉ còn một trận hỗn hợp. Xếp cho đội khắc chế bạn, không phải đội nhiều Máu nhất — đó mới là đội kết thúc ván của bạn.'],
      },
    ],
  },
  {
    slug: 'tier-list-is-a-queue',
    author: 'Vale',
    authorSlug: 'vale',
    publishedOn: '2026-10-31',
    title: 'The tier list is a queue, not a shopping list',
    excerpt: 'A rank tells you how many lobbies will fight you for the line. Read pressure first, then pick the comp nobody else is building.',
    tags: ['Fundamentals', 'Meta'],
    sections: [
      {
        heading: 'A tier is a forecast, not a verdict',
        body: [
          'Every tier on this site is an opinion built from match data and a coaching review. Data finds the lines that place well; the review removes lines that only win in lobbies nobody plays in. A tier moves when both agree, so the list is a forecast for the next few games, not a promise about yours.',
          'That distinction matters because a forecast changes with the lobby. S-tier means the line is strong and visible, so expect two or three players per lobby to try it. The same line at A in a lobby that leaves it alone is the better bet.',
        ],
        list: [
          'S: strong, and everyone can see it',
          'A: strong when the lobby lets you take it',
          'B: fine with a good opener, weaker when forced',
          'C: narrow — needs exact items or an early high roll',
          'X: situational, not bad — it wins when the situation matches',
        ],
      },
      {
        heading: 'Count the lobby before you commit',
        body: [
          'Tier lists rank lines; the lobby decides between them. Scout on 2-1 and again on 3-1: who is holding your carry, who slammed your items, who is leveling on your curve. Two players already on the S line turn it into a reroll race you did not choose.',
          'The comp page lists what the line needs — carry, items, augments and the stage you should be stable. If those do not match your board and bench, the tier is not talking about your game yet.',
        ],
        list: [
          'Two or more players on the same S line: take the free line instead',
          'None of the line’s items on your bench: that is a pivot, not a plan',
          'An X-tier comp with its items and opener is a real pick, not a last resort',
        ],
      },
      {
        heading: 'Checkpoints, not a chase',
        body: [
          'Use the comp stages as checkpoints. At 3-2, does your board look like the comp’s 3-2 — the same units, the same items, the level it expects? If yes, keep going. If not, fix the board you have instead of forcing the page.',
          'Re-read the list when the patch or the data moves, not every game. Chasing every tier change costs more gold than any single comp choice.',
        ],
      },
    ],
    titleVi: 'Bảng xếp hạng là hàng đợi, không phải danh sách mua sắm',
    excerptVi: 'Một thứ hạng cho biết bao nhiêu sảnh sẽ tranh đội đó với bạn. Đọc áp lực trước, rồi chọn đội không ai chơi.',
    sectionsVi: [
      {
        heading: 'Thứ hạng là dự báo, không phải bản án',
        body: [
          'Mỗi thứ hạng trên trang này là ý kiến dựng từ dữ liệu trận đấu và một lượt soát của huấn luyện viên. Dữ liệu tìm ra đội xếp hạng cao; lượt soát loại những đội chỉ thắng trong sảnh không ai chơi. Một đội đổi hạng khi cả hai đồng ý, nên bảng là dự báo cho vài trận tới, không phải lời hứa cho trận của bạn.',
          'Khác biệt đó quan trọng vì dự báo thay đổi theo sảnh. Hạng S nghĩa là đội mạnh và ai cũng thấy, nên mỗi sảnh sẽ có hai ba người thử. Cùng đội đó ở hạng A trong một sảnh bỏ mặc nó lại là cửa tốt hơn.',
        ],
        list: [
          'S: mạnh, và ai cũng thấy',
          'A: mạnh khi sảnh để bạn lấy',
          'B: ổn nếu mở bài tốt, yếu khi bị ép',
          'C: hẹp — cần đúng trang bị hoặc high roll sớm',
          'X: tình huống, không phải yếu — thắng khi tình huống khớp',
        ],
      },
      {
        heading: 'Đếm sảnh trước khi chốt',
        body: [
          'Bảng xếp hạng xếp các đội; sảnh mới là nơi chọn giữa chúng. Do thám ở 2-1 và lần nữa ở 3-1: ai đang giữ chủ lực của bạn, ai đã ghép đồ của bạn, ai đang lên cấp theo đúng đường của bạn. Hai người đã vào đội S biến nó thành cuộc đua roll mà bạn không chọn.',
          'Trang đội hình liệt kê đội đó cần gì — chủ lực, trang bị, nâng cấp và mốc bạn phải ổn định. Nếu những thứ đó không khớp đội hình và dự bị của bạn, thứ hạng chưa nói về ván của bạn.',
        ],
        list: [
          'Từ hai người chơi cùng đội S: chọn đội đang trống',
          'Bench không có món nào của đội: đó là xoay bài, không phải kế hoạch',
          'Đội hạng X có đủ đồ và mở bài đúng là lựa chọn thật, không phải cứu cánh',
        ],
      },
      {
        heading: 'Mốc kiểm tra, không phải đuổi theo',
        body: [
          'Coi các mốc giai đoạn của đội hình là điểm kiểm tra. Ở 3-2, đội của bạn có giống 3-2 của đội mẫu — đúng tướng, đúng đồ, đúng cấp nó cần? Nếu có, đi tiếp. Nếu không, sửa đội đang có thay vì ép theo trang.',
          'Đọc lại bảng khi patch hoặc dữ liệu đổi, không phải mỗi ván. Đuổi theo từng lần đổi hạng tốn vàng hơn mọi lựa chọn đội hình.',
        ],
      },
    ],
  },
  {
    slug: 'augment-tiers-when-s-tier-loses',
    author: 'Rook',
    authorSlug: 'rook',
    publishedOn: '2026-09-02',
    title: 'Augment tiers: when the S-tier pick loses',
    excerpt: 'The best augment on paper is the one your board can actually use. A guide to the gap.',
    tags: ['Augments'],
    sections: [
      {
        heading: 'Board fit beats tier',
        body: ['An S-tier economy augment on a board that must win stage 3 is a C-tier pick. The tier assumes a neutral board; you never have one.'],
        list: ['Economy augments need stable boards', 'Combat augments need a carry to boost', 'Trait augments need the trait online by 3-2', 'Pivot augments need a flexible bench'],
      },
      {
        heading: 'The 2-for-1 rule',
        body: ['If two augments both fit, take the one that keeps your next three rounds simple. You are buying time, not power.'],
      },
    ],
    titleVi: 'Xếp hạng nâng cấp: khi lựa chọn hạng S thua',
    excerptVi: 'Nâng cấp tốt nhất trên lý thuyết là cái đội hình bạn dùng được. Hướng dẫn về khoảng cách đó.',
    sectionsVi: [
      {
        heading: 'Hợp đội hình thắng thứ hạng',
        body: ['Một nâng cấp kinh tế hạng S trên đội buộc phải thắng giai đoạn 3 là lựa chọn hạng C. Thứ hạng giả định đội hình trung tính; bạn chẳng bao giờ có đội trung tính.'],
        list: ['Nâng cấp kinh tế cần đội ổn định', 'Nâng cấp giao tranh cần chủ lực để buff', 'Nâng cấp tộc hệ cần tộc online trước 3-2', 'Nâng cấp xoay bài cần dự bị linh hoạt'],
      },
      {
        heading: 'Quy tắc 2 chọn 1',
        body: ['Nếu hai nâng cấp đều hợp, chọn cái giữ ba vòng tới của bạn đơn giản. Bạn đang mua thời gian, không phải sức mạnh.'],
      },
    ],
  },
];
