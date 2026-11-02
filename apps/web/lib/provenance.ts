// The field catalog behind /admin/comps/*/provenance: one entry per region of
// the real comp panel, saying which storage it reads, who writes it, and the trap
// that makes it lie. Keys must match the data-pv attributes in
// components/comp-panel.tsx; the test in provenance.test.ts fails when the two
// lists drift, because an unannotated region is worse than no annotation.
export type ProvenanceKey =
  | 'carry'
  | 'cover'
  | 'rating'
  | 'title'
  | 'playstyle'
  | 'chips'
  | 'counters'
  | 'traits'
  | 'augments'
  | 'augment-types'
  | 'matchups'
  | 'board'
  | 'early'
  | 'items'
  | 'positioning'
  | 'flex'
  | 'alt'
  | 'tips'
  | 'stages'
  | 'economy';

// db = a column or child row, file = hand-mapped JSON committed with the app,
// derived = computed on every read from other fields.
export type ProvenanceKind = 'db' | 'file' | 'derived' | 'mixed';

export type ProvenanceField = {
  key: ProvenanceKey;
  label: string;
  path: string;
  kind: ProvenanceKind;
  writer: string;
  changes: string;
  note: string;
};

export const PROVENANCE_FIELDS: ProvenanceField[] = [
  {
    key: 'carry',
    label: 'Tướng chủ lực',
    path: 'comps.carry → join champions',
    kind: 'db',
    writer: 'seed:comps từ snapshot; admin qua form',
    changes: 'Khi snapshot đổi carry — thường kéo theo đổi hàng trên tier list',
    note: 'DB chỉ lưu tên. Cost, icon và sao lấy từ bảng champions lúc đọc; hex này còn quyết định bài nào bị gom chung một hàng trên tier list (lib/variants.ts khớp theo carry).',
  },
  {
    key: 'cover',
    label: 'Ấn/Trang bị đại diện',
    path: 'comps.cover (jsonb) → comp-extras.json',
    kind: 'mixed',
    writer: 'Admin chọn ở /admin/comps/[slug]/edit; comp-extras.json nếu seed chạy lại',
    changes: 'Lưu form, hoặc seed:comps khi file extras có slug đó',
    note: 'Cột DB thắng khi file im lặng. seed:comps ghi đè bằng giá trị trong comp-extras.json, nên sửa tay trong DB mà không sửa file sẽ mất.',
  },
  {
    key: 'rating',
    label: 'Tier, xu hướng, tình huống',
    path: 'comps.tier · comps.trend · comps.situational',
    kind: 'db',
    writer: 'seed:tiers (4 cột) và seed:comps; admin sửa tay trong form',
    changes: 'Mỗi lần crawler đúc kết snapshot rồi seed',
    note: 'tier là bậc thật (S/A/B/C/X); situational mới là thứ đẩy bài vào hàng X trên rail. trend chỉ nhận up/down, rỗng là không có mũi tên.',
  },
  {
    key: 'title',
    label: 'Tên bài',
    path: 'comps.title · comps.title_vi',
    kind: 'db',
    writer: 'seed:comps từ snapshot; admin qua form',
    changes: 'Khi snapshot đổi tên carry/brand của bài',
    note: 'Bản tiếng Việt đọc title_vi trước, thiếu thì rơi về title. slug không đổi được khi đã có row.',
  },
  {
    key: 'playstyle',
    label: 'Mô tả lối chơi',
    path: 'comps.playstyle · comps.playstyle_vi',
    kind: 'db',
    writer: 'seed:comps; admin qua form',
    changes: 'Khi snapshot viết lại đoạn mô tả',
    note: 'Cùng kiểu fallback: cột vi trước, rồi bản tiếng Anh trong payload.',
  },
  {
    key: 'chips',
    label: 'Chips phong độ',
    path: 'comps.style · comps.difficulty · đếm từ comp_units',
    kind: 'mixed',
    writer: 'seed:comps; admin qua form',
    changes: 'style/difficulty khi snapshot đổi; số tướng mỗi lần board đổi',
    note: 'style chỉ được 5 giá trị có CHECK trong DB (Reroll, Fast 8, Fast 9, Flex, Tempo) — seed chết nếu snapshot phát giá trị khác. "N tướng" là units.length lúc đọc, không phải cột nào.',
  },
  {
    key: 'counters',
    label: 'Vote và lượt xem',
    path: 'comps.votes · comps.views',
    kind: 'db',
    writer: 'Khách bấm helpful; bumpComp mỗi lần mở trang',
    changes: 'Liên tục, từ traffic',
    note: 'Hai cột này KHÔNG nằm trong snapshot, nên seed:comps và seed:tiers đều giữ nguyên. Đây là lý do không bao giờ chạy npm run seed (nó xoá hết comps rồi chèn lại).',
  },
  {
    key: 'traits',
    label: 'Tộc hệ',
    path: 'champions.traits × comp_units(role=board)',
    kind: 'derived',
    writer: 'Không ai ghi — comps.ts tính lúc đọc',
    changes: 'Mỗi lần board đổi, hoặc khi crawl lại champions',
    note: 'Đếm theo 8 tướng trên board, nên thêm flex/alt không làm đổi mốc. Mốc màu lấy từ traits.thresholds/styles; tên không có trong bảng traits sẽ hiện count mà không có mốc.',
  },
  {
    key: 'augments',
    label: 'Ấn/Cường hoá ưu tiên',
    path: 'comp_augments (position)',
    kind: 'db',
    writer: 'seed:comps; admin qua form',
    changes: 'Khi snapshot đổi danh sách augments',
    note: 'Panel chỉ hiển thị 8 ô đầu. Icon tra từ bảng augments, bảng đó lấy DISTINCT ON (name) nên một tên nhiều bản chỉ có một icon.',
  },
  {
    key: 'augment-types',
    label: 'Nhóm ấn ưu tiên',
    path: 'comps.augment_types (text[])',
    kind: 'db',
    writer: 'seed:comps; admin qua form',
    changes: 'Khi snapshot đổi thứ tự nhóm',
    note: 'Chỉ 4 nhãn hợp lệ: ITEMS, ECON, COMBAT, EMBLEM. Sắp xếp có nghĩa — seed so mảng đã sort nên thứ tự đổi là bị coi là lệch.',
  },
  {
    key: 'matchups',
    label: 'Khắc chế / Được khắc',
    path: 'comps.matchups (jsonb: kind + slug)',
    kind: 'mixed',
    writer: 'seed:comps; admin qua form',
    changes: 'Khi snapshot đổi cặp đối đầu',
    note: 'DB chỉ lưu slug. Tên và tier hiện trên panel tra lại từ bảng comps lúc đọc, nên slug trỏ tới bài đã xoá sẽ biến mất khỏi danh sách — không báo lỗi, chỉ âm thầm ít đi một dòng.',
  },
  {
    key: 'board',
    label: 'Đội hình chính',
    path: 'comp_units WHERE role=board (position)',
    kind: 'db',
    writer: 'seed:comps ghi lại toàn bộ; admin qua form',
    changes: 'Mỗi lần snapshot đổi board',
    note: 'position là thứ tự hiển thị, không phải vị trí trên bàn. Cost/icon/traits không lưu ở đây mà join bảng champions lúc đọc; tên tướng lạ sẽ nhận cost 1 và icon trống.',
  },
  {
    key: 'early',
    label: 'Giai đoạn đầu',
    path: 'comp_units WHERE role=early',
    kind: 'db',
    writer: 'seed:comps; admin qua form',
    changes: 'Khi snapshot đổi opener',
    note: 'Chỉ có tên: không row/col, không item, không sao. Ô nhỏ này hiển thị bằng cùng bảng join với board nên tên sai sẽ hiện ô trống.',
  },
  {
    key: 'items',
    label: 'Độ ưu tiên trang bị',
    path: 'comp_items (position) + comp_units.items',
    kind: 'db',
    writer: 'seed:comps; admin qua form',
    changes: 'Khi snapshot đổi build',
    note: 'Hai nguồn khác nhau: danh sách cả bài ở comp_items, trang bị gắn trên từng tướng ở cột items của comp_units. Panel chỉ hiện ô trang bị trên hex tướng; danh sách bài đi vào phần carry.',
  },
  {
    key: 'positioning',
    label: 'Xếp tướng trên bàn',
    path: 'comp_units.row · comp_units.col',
    kind: 'db',
    writer: 'seed:comps; admin kéo ô trong form',
    changes: 'Khi snapshot có toạ độ mới',
    note: 'row 0-3, col 0-6, để trống là hợp lệ. Khi cả bài trống toạ độ, panel rơi về 7 ô cố định (fallbackCells) — đó là ô của code, không phải dữ liệu.',
  },
  {
    key: 'flex',
    label: 'Tướng thay thế',
    path: 'comp-extras.json → comps[slug].flex',
    kind: 'file',
    writer: 'Chỉ tay, trong packages/shared/data/comp-extras.json',
    changes: 'Khi ta soạn thêm cặp',
    note: 'KHÔNG có cột DB nào. API đọc file một lần lúc import nên sửa file không làm node --watch restart — phải khởi động lại API. Board đổi tên tướng trong DB thì cặp này vẫn trỏ tên cũ và hex con hiện ô trống.',
  },
  {
    key: 'alt',
    label: 'Build dự phòng',
    path: 'comp_units WHERE role=alt → comp-extras.json',
    kind: 'mixed',
    writer: 'seed:comps ghi role=alt từ snapshot; file extras cho bài chưa có row',
    changes: 'Khi snapshot đổi alt, hoặc khi ta thêm alt vào file',
    note: 'DB thắng; file chỉ được dùng khi bài không có role=alt nào. Vì vậy một bài có thể hiện alt dù không có dòng comp_units nào.',
  },
  {
    key: 'tips',
    label: 'Mẹo chạy bài',
    path: 'comps.tips · comps.tips_vi',
    kind: 'db',
    writer: 'seed:comps; admin qua form',
    changes: 'Khi snapshot đổi tips',
    note: 'Rỗng thì panel ẩn cả khối, không hiện khung trống.',
  },
  {
    key: 'stages',
    label: 'Giai đoạn 2/3/4',
    path: 'comp_stages (stage, text, text_vi)',
    kind: 'db',
    writer: 'seed:comps; admin qua form',
    changes: 'Khi snapshot đổi lộ trình',
    note: 'stage là số 2-4 (CHECK trong DB), nhãn "Stage"/"Giai đoạn" ghép lúc đọc. text_vi được giữ nguyên khi admin lưu form — form tiếng Anh không ghi đè bản dịch.',
  },
  {
    key: 'economy',
    label: 'Kế hoạch tiền & cấp',
    path: 'economy.json (khớp theo carry + board)',
    kind: 'derived',
    writer: 'Không ai — economyForComp chọn lúc render',
    changes: 'Mỗi khi board/carry đổi, hoặc khi crawl lại economy.json',
    note: 'Tên kế hoạch luôn đọc từ style của chính bài (Reroll → bậc cost tương ứng, Flex/Tempo → Fast 8). Bài nào trùng carry và trùng phần lớn board với một bài tftflow *cùng họ kế hoạch* thì mới mượn được level curve của bài đó; khác họ thì dùng vòng generic của chính họ. Đổi board vì thế đổi level curve, không đổi tên kế hoạch.',
  },
];

export const provenanceFieldByKey = new Map<ProvenanceKey, ProvenanceField>(
  PROVENANCE_FIELDS.map((field) => [field.key, field])
);

export type ApiCompRow = {
  slug: string;
  title: string;
  title_vi: string | null;
  tier: string;
  situational: boolean;
  style: string;
  difficulty: number;
  trend: string | null;
  playstyle: string;
  playstyle_vi: string | null;
  carry: string;
  cover: { kind: 'item' | 'augment'; name: string } | null;
  tips: string;
  tips_vi: string | null;
  augment_types: string[];
  matchups: { slug: string; kind: string }[];
  votes: number;
  views: number;
};

export type ApiProvenance = {
  slug: string;
  inDb: boolean;
  inSnapshot: boolean;
  row: ApiCompRow | null;
  units: { role: string; name: string; row: number | null; col: number | null; stars: number | null; items: string[]; position: number }[];
  items: string[];
  augments: string[];
  stages: { stage: number; text: string; text_vi: string | null }[];
  extras: { cover?: { kind: string; name: string }; flex?: { name: string; replaces: string }[]; alt?: { name: string; items: string[] }[] } | null;
  snapshot: Record<string, unknown> | null;
  snapshotError: string | null;
  sections: { desired: Record<string, string[]> | null; stored: Record<string, string[]> | null };
  drift: string[];
  missing: { champions: string[]; items: string[]; augments: string[] };
};

const SECTION_TO_FIELD: Record<string, ProvenanceKey[]> = {
  board: ['board', 'positioning'],
  early: ['early'],
  alt: ['alt'],
  items: ['items'],
  augments: ['augments'],
  types: ['augment-types'],
  stages: ['stages'],
  copy: ['carry', 'title', 'playstyle', 'tips'],
  rating: ['rating', 'chips'],
  matchups: ['matchups'],
  new: [],
};

// The sections seed:comps would rewrite, resolved to the panel regions they
// belong to, so "board lệch" points at the hexes on screen.
export function mapDrift(provenance: ApiProvenance): { section: string; fields: ProvenanceField[] }[] {
  return provenance.drift.map((section) => ({
    section,
    fields: (SECTION_TO_FIELD[section] ?? []).flatMap((key) => {
      const field = provenanceFieldByKey.get(key);
      return field ? [field] : [];
    }),
  }));
}
