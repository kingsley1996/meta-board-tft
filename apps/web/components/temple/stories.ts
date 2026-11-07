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

// Lão Hành Khất: tám chiêu bán cho người ghé sảnh — vai thương nhân, không phải nhà phân tích.
export const HERMIT_LESSONS = [
  'Chiêu thứ nhất: Tiền. Giữ 50 vàng trước để lấy lãi, tiêu sau. Nghèo cuối trận là nghèo từ giữa trận.',
  'Chiêu thứ hai: Ngó bảng. Bốn người cùng giữ một tướng thì không ai lên 3 sao được đâu.',
  'Chiêu thứ ba: Nhịn. Thấy hàng ngon không có nghĩa là phải mua. Mua sai một vòng là mất cả nhịp.',
  'Chiêu thứ tư: Đọc bản vá. Meta đổi từng tuần, đội hình mạnh hôm nay chưa chắc còn ngày mai.',
  'Chiêu thứ năm: Xếp chỗ. Chủ lực đứng sai ô thua nhanh hơn đứng sai tướng.',
  'Chiêu thứ sáu: Ghép đồ theo món, không theo sở thích. Thiếu một mảnh là cả món nằm không.',
  'Chiêu thứ bảy: Chọn ấn theo bài đang có, không theo ấn mạnh nhất trên giấy.',
  'Chiêu cuối: Top 4 là một chiến thắng. Tám người vào queue, chỉ một người nhất, còn lại tính bằng hạng.',
];

// Lời chúc gửi kèm quà tặng (main.js: pcard.greets).
export const WISHES = [
  'Chúc bạn một ngày toàn top 4',
  'Chúc bạn về đúng bài mình cần',
  'Chúc bạn lên 3 sao đúng chủ lực',
  'Chúc bạn queue sạch, không gặp người bỏ trận',
];

// Câu chữ cho màn chờ (help.js:8-16 của bản gốc). help.js bị xoá cùng main.js vì màn
// chờ giờ là React, nhưng mấy dòng này là nội dung chứ không phải code.
export const QUOTES = [
  '“Chuẩn bị kỹ thì vận may đến gần hơn một chút.”',
  '“Thở một hơi trước khi mở hàng. Tay vững thì chọn đúng.”',
  '“Thua một round không phải thua cả trận.”',
  '“Đọc bảng xếp hạng trước khi đọc ý mình.”',
  '“Bình tĩnh là một loại trang bị.”',
  '“Không có đội hình vạn năng, chỉ có người đọc được tình huống.”',
  '“Chơi đủ lâu thì số liệu sẽ đứng về phía bạn.”',
  '“Vào queue cho vui, thắng thua tính sau.”',
];
