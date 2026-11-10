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
