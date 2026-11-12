// Lời thoại của ba vị hướng dẫn trong sảnh và mấy dòng chữ cho màn chờ. Chỉ đền đang chạy
// (`nhattru`) có truyện, viết lại cho Đền Cầu May ngày 2026-11-07; 14 đền còn lại đã cắt
// khỏi content.json. Đây là nội dung, không phải engine, nên nằm bên HUD.
import content from '@/vendor/temple/data/content.json';

export type Tale = { title: string; text: string };
export type Teller = { name: string; role: string; tales: Tale[] };
export type Source = { title: string; url: string };

export type Story = {
  real?: boolean;
  location?: string;
  founded?: string;
  intro?: string;
  story?: string[];
  highlights?: string[];
  visitTip?: string;
  sources?: Source[];
};

// Bài giới thiệu lối chơi: mỗi lối một trang, huấn luyện viên dẫn người chơi sang đây khi
// họ hỏi "về lối chơi của tôi". Nội dung đọc từ data/content.json, khoá theo id trong meta.json.
export type Guide = {
  name: string;
  subtitle: string;
  origin: string;
  practice: { title: string; text: string }[];
  inApp: string;
  chants: { name: string; text: string }[];
};

const TALES_BY_TEMPLE = (content.tales ?? {}) as Record<string, Teller[]>;
const STORIES = (content.stories ?? {}) as unknown as Record<string, Story>;
const GUIDES = (content.guides ?? {}) as Record<string, Guide>;

export const tellersOf = (templeId: string): Teller[] => TALES_BY_TEMPLE[templeId] ?? [];
export const storyOf = (templeId: string): Story => STORIES[templeId] ?? {};
export const guideOf = (sectId: string): Guide | null => GUIDES[sectId] ?? null;

export const ABBOT = 'HLV Tomo';

// Lão Hành Khất: những lời khuyên ngắn gọn cho người chơi ghé sảnh.
// Phong cách: ông chú mê TFT, nói chuyện thẳng thắn và có chút hài hước.
export const HERMIT_LESSONS = [
  'Bài đầu tiên phải học là giữ tiền. Có 50 vàng thì mới có lãi tối đa. Đừng thấy shop đẹp là roll sạch túi.',
  'Nhớ ngó nhà đối thủ nhé. Cả lobby cùng tranh một bài thì người khóc cuối cùng thường là người hết vàng trước.',
  'Đừng thấy tướng nào cũng mua. Đội hình cần gì thì giữ cái đó, ham đủ thứ chỉ tổ kẹt hàng trên bench.',
  'Meta thay đổi sau mỗi bản cập nhật. Bài mạnh hôm qua chưa chắc còn mạnh hôm nay, nhớ xem lại bảng xếp hạng trước khi vào trận.',
  'Xếp đội hình cũng quan trọng như chọn tướng. Chủ lực đứng sai chỗ có khi chưa kịp gây sát thương đã lên bảng đếm số.',
  'Đừng ghép đồ chỉ vì thấy món nào cũng có vẻ ngon. Hãy ưu tiên trang bị phù hợp với chủ lực và đội hình mình đang chơi.',
  'Có ấn mạnh chưa chắc đã dùng được. Chọn ấn hợp với đội hình hiện tại thường tốt hơn cố nhét vào một bài không liên quan.',
  'Không phải trận nào cũng cần về nhất. Giữ được top 4 đã là một trận đấu thành công, nhất là khi đầu game không thuận lợi.',
];

// Lời chúc gửi kèm quà tặng (main.js: pcard.greets).
export const WISHES = [
  'Chúc bạn vào trận nhặt toàn đồ đẹp, tướng ngon!',
  'Chúc bạn roll đâu trúng đó, chủ lực lên 3 sao!',
  'Chúc bạn ghép đồ chuẩn bài, chọn lõi hợp ý!',
  'Chúc bạn không bị tranh bài, không gặp lobby quá điên!',
];

// Câu nói ngắn hiển thị trong lúc chờ.
// Chủ đề xoay quanh TFT: nhân phẩm, kinh tế, chiến thuật và tinh thần leo rank.
export const QUOTES = [
  '“Nhân phẩm rất quan trọng, nhưng biết giữ tiền còn quan trọng hơn.”',
  '“Đừng vội roll khi chưa biết mình đang tìm gì.”',
  '“Thua vài round chưa đáng sợ, mất bình tĩnh mới đáng sợ.”',
  '“Trước khi chốt bài, nhớ ngó xem có bao nhiêu nhà đang tranh.”',
  '“Đội hình mạnh đến đâu cũng cần xếp đúng vị trí.”',
  '“Không có bài nào mạnh trong mọi trận. Quan trọng là biết xoay bài đúng lúc.”',
  '“Một round thắng không quyết định trận đấu, nhưng một quyết định đúng có thể cứu cả trận.”',
  '“Top 4 cũng là điểm. Đừng trận nào cũng cố sống chết để lấy top 1.”',
];

// Toàn bộ chữ trên MÀN CHỜ, một cặp en/vi cho mỗi dòng. Route /en/temple có thật
// (app/(temple)/[lang]/temple/page.tsx) nên màn chờ là chỗ duy nhất của đền nói được
// tiếng Anh; HUD và các sheet vẫn một thứ tiếng.
// `name` không lấy từ TEMPLE.name: meta.json chỉ có "Đền Cầu May", còn "Lucky Temple"
// là nhãn đã dùng ở <title> của chính route này và trong messages.ts.
// `steps` tra theo KHOÁ mà engine.ts phát ở onProgress ('build' | 'sweep'), không tra
// theo chuỗi tiếng Việt — sửa câu chữ trong engine sẽ không làm màn chờ mất nhãn.
// `noGlA` + `noGlB` là MỘT câu cắt làm hai, chỉ để nhét <code>chrome://settings/system</code>
// vào giữa: một chuỗi liền thì mất phông monospace của đường dẫn.
// `free` là dòng phân trần, đứng riêng một hàng vì nó phủ lên CẢ bốn trạng thái của
// màn chờ: khách vào đền lần đầu hay người boot fail bấm lại đều phải đọc được nó.
export type LoaderCopy = {
  name: string;
  noGlTitle: string;
  noGlA: string;
  noGlB: string;
  retry: string;
  errTitle: string;
  errBody: string;
  guestNote: string;
  guestBtn: string;
  signupBtn: string;
  loginBtn: string;
  entering: string;
  free: string;
  steps: Record<string, string>;
  quotes: string[];
};

export const LOADER: Record<'en' | 'vi', LoaderCopy> = {
  vi: {
    name: 'Đền Cầu May',
    noGlTitle: 'Không dựng được sảnh 3D',
    noGlA: 'Máy tính này chưa bật tăng tốc đồ hoạ, nên trình duyệt không cấp ngữ cảnh WebGL. Bật ở',
    noGlB: 'rồi mở lại trang.',
    retry: 'Thử lại',
    errTitle: 'Chưa vào được sảnh',
    errBody: 'Sảnh đang bận, thử lại sau nhé',
    guestNote: 'Cầu may trước trận, không cần tài khoản. Điểm đang có vẫn ở nguyên khi đăng ký.',
    guestBtn: 'Vào với tư cách khách',
    signupBtn: 'Tạo tài khoản',
    loginBtn: 'Đã có tài khoản',
    entering: 'Đang vào sảnh…',
    free: 'Mọi vật phẩm và hoạt động trong đền đều miễn phí, chỉ để giải trí và cầu may trước giờ vào trận.',
    steps: { gate: 'Mở cổng đền', build: 'Dựng sảnh đền', sweep: 'Dọn dẹp đền' },
    quotes: QUOTES,
  },
  en: {
    name: 'Lucky Temple',
    noGlTitle: 'The 3D hall won’t render',
    noGlA: 'Graphics acceleration isn’t on for this computer, so the browser won’t hand us a WebGL context. Turn it on at',
    noGlB: 'and reload.',
    retry: 'Try again',
    errTitle: 'Couldn’t get into the hall',
    errBody: 'The hall is busy — give it a moment and try again.',
    guestNote: 'Luck-check before your game, no account needed. Your points are still here if you sign up.',
    guestBtn: 'Enter as a guest',
    signupBtn: 'Create an account',
    loginBtn: 'I already have an account',
    entering: 'Entering the hall…',
    free: 'Every item and activity in the temple is free — it’s for fun and a little luck before you queue.',
    steps: { gate: 'Opening the gates', build: 'Raising the hall', sweep: 'Sweeping the floors' },
    quotes: [
      '“Luck matters a lot. Knowing when to hold your gold matters more.”',
      '“Don’t roll before you know what you’re rolling for.”',
      '“Losing a few rounds isn’t scary. Losing your head is.”',
      '“Before you lock your board, check how many others are fighting for it.”',
      '“Even the strongest comp needs the right placement.”',
      '“No comp wins every game. The good ones know when to pivot.”',
      '“One won round doesn’t decide the game, but one right call can save it.”',
      '“Top 4 is still points. Don’t die for top 1 every single game.”',
    ],
  },
};
