// Lời thoại và bài viết của người trong chùa. Lấy nguyên văn từ data/content.json của
// bản gốc và hai bảng tên trong main.js:1047-1049 — đây là nội dung, không phải
// engine, nên nó nằm bên phía HUD.
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

// Bài giới thiệu pháp môn: mỗi thiền phái một trang, thầy trụ trì dẫn người chơi sang
// đây khi họ hỏi "về pháp môn của con".
export type Guide = {
  name: string;
  subtitle: string;
  origin: string;
  history: string[];
  essence: string[];
  practice: { title: string; text: string }[];
  daily: string[];
  chants: { name: string; text: string }[];
  inApp: string;
  sources: Source[];
};

const TALES_BY_TEMPLE = (content.tales ?? {}) as Record<string, Teller[]>;
const STORIES = (content.stories ?? {}) as unknown as Record<string, Story>;
const GUIDES = (content.guides ?? {}) as Record<string, Guide>;

export const tellersOf = (templeId: string): Teller[] => TALES_BY_TEMPLE[templeId] ?? [];
export const storyOf = (templeId: string): Story => STORIES[templeId] ?? {};
export const guideOf = (sectId: string): Guide | null => GUIDES[sectId] ?? null;

export const ABBOT = 'Thầy Tâm Liên';

// Lão Hành Khất: bán "bí kiếp" mà thật ra là tám lời dạy (main.js:1049).
export const HERMIT_LESSONS = [
  'Thức thứ nhất: Thở. Chưa thở được thì chưa làm được gì.',
  'Thức thứ hai: Lắng. Nghe người khác nói hết câu.',
  'Thức thứ ba: Nhịn. Lời nặng để qua đêm rồi hãy nói.',
  'Thức thứ tư: Xả. Nắm chặt bao nhiêu, mỏi tay bấy nhiêu.',
  'Thức thứ năm: Tha. Người đầu tiên được nhẹ lòng là mình.',
  'Thức thứ sáu: Cho. Có cây kẹo cũng chia cho người khác một nửa.',
  'Thức thứ bảy: Niệm. Một câu Phật hiệu, trăm mối lo tan.',
  'Thức cuối: Vạn Phật quy tâm. Không tìm đâu xa, tuyệt học ở ngay trong lòng bạn.',
];

// Lời chúc gửi kèm quà kết duyên (main.js: pcard.greets).
export const WISHES = [
  'Chúc bạn thân tâm thường an lạc',
  'Chúc bạn một ngày chánh niệm',
  'Nguyện bạn và gia đình luôn bình an',
  'Chúc bạn tinh tấn trên đường tu',
];

// Câu chữ cho màn chờ (help.js:8-16 của bản gốc). help.js bị xoá cùng main.js vì màn
// chờ giờ là React, nhưng mấy câu này là nội dung chứ không phải code.
export const QUOTES = [
  '“Tâm an thì cảnh an.”',
  '“Một niệm thanh tịnh là một niệm Phật.”',
  '“Gieo nhân lành, gặt quả lành.”',
  '“Hạnh phúc không có đường đi, hạnh phúc chính là con đường.”',
  '“Mỗi bước chân là một bước an lạc.”',
  '“Không làm các điều ác, siêng làm các việc lành, giữ tâm ý trong sạch – đó là lời chư Phật dạy.” (Kinh Pháp Cú)',
  '“Lời nói dịu dàng như hoa sen nở.”',
  '“Hơn ngàn lời vô nghĩa, một lời có ích hơn, nghe xong được an tịnh.” (Kinh Pháp Cú)',
];
