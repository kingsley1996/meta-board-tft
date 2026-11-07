-- Bảng cho sảnh đền nhiều người (module temple: src/temple/*).
--
-- File này là nguồn duy nhất: src/temple/schema.ts đọc và chạy đúng nội dung này mỗi
-- lần module temple chạm Postgres, nên Supabase mới dựng cũng lên được mà không
-- chờ operator chạy migration tay — và không có bản sao thứ hai để lệch về sau.
--
-- Mọi hàng đều đi theo users.id. Người lạ bước vào sảnh được cấp một users.id thật
-- (is_guest = true, email giả, không mật khẩu); khi người đó đăng ký tài khoản thì
-- hàng users được nâng cấp tại chỗ, toàn bộ điểm dưới đây giữ nguyên.

-- Cột is_guest nằm trên users (src/accounts.ts thêm nó lúc chạy), vì quyền ghi dữ
-- liệu sảnh đền phải đi theo đúng khoá ngoại users(id) mà các bảng dưới tham chiếu.

CREATE TABLE IF NOT EXISTS temple_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Frame nhị phân của máy khách mã người chơi bằng u32 (protocol.ts:58) trong khi
  -- users.id là uuid, nên mỗi hồ sơ cần một số nguyên riêng. Máy khách không được
  -- tự chọn: nếu không thì hai người cùng khai một id và avatar đè nhau.
  player_id bigint NOT NULL UNIQUE CHECK (player_id BETWEEN 1 AND 4294967295),
  name text NOT NULL CHECK (name <> '' AND char_length(name) <= 28),
  -- 'flex' là lối chơi mặc định của bản Đền. Database dựng từ trước còn hàng mang id
  -- thiền phái cũ; đoạn UPDATE dưới đổi chúng sang id mới nên không ai rơi vào nhánh
  -- dự phòng của sectOf() chỉ vì bảng danh hiệu đổi tên.
  sect text NOT NULL DEFAULT 'flex',
  title text NOT NULL DEFAULT '',
  honor text NOT NULL DEFAULT '',
  exp integer NOT NULL DEFAULT 0,
  sen integer NOT NULL DEFAULT 500,
  ngoc integer NOT NULL DEFAULT 200,
  -- duc và fruit là hai ví tiền của các tính năng đã cắt (vườn cây, và cột Đức của nhịp
  -- đọc meta). Column để lại cho hàng cũ không thành dữ liệu mồ côi; không còn route nào
  -- cộng hay tiêu, chỉ state.ts vận chuyển nguyên trạng cho tới khi HUD bỏ hẳn nhãn.
  duc integer NOT NULL DEFAULT 100,
  fruit integer NOT NULL DEFAULT 5,
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  practice_day date,
  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,
  equipped jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Bộ sưu tập nhân vật đã mở (text[] id trong HERO_LIST). Để nullable có chủ ý: hàng
  -- mới sinh ghi '{}' = chưa chọn lần nào, còn hàng cũ là NULL = đã đứng một hình từ
  -- trước khi cơ chế này tồn tại, và bản backfill dưới chỉ chạy trên đúng nhóm NULL.
  heroes text[],
  no_chan boolean NOT NULL DEFAULT false,
  -- Hai mốc chỉ máy chủ được quyền viết. buff_until là hạn của lá bùa nhân đôi điểm;
  -- meditate_start là giờ mở một nhịp thiền để số phút tính ở server, không phải do
  -- máy khách tự khai.
  buff_until timestamptz,
  meditate_start timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sen >= 0 AND ngoc >= 0 AND duc >= 0 AND fruit >= 0)
);

-- Cột mới cho P2b: ADD COLUMN IF NOT EXISTS để database đã dựng từ hàng ở trên
-- vẫn lên được mà không cần migration tay.
ALTER TABLE temple_profiles ADD COLUMN IF NOT EXISTS buff_until timestamptz;
ALTER TABLE temple_profiles ADD COLUMN IF NOT EXISTS meditate_start timestamptz;

-- Bộ sưu tập nhân vật đã mở (text[] id trong HERO_LIST). NULL = hàng sinh trước khi cơ
-- chế này tồn tại, nên khởi đầu của nó là đúng nhân vật đang đứng: không ai bị đòi 100
-- Kim Cương để được giữ nguyên hình mình đang có. Hàng mới INSERT '{}' — nghĩa là chưa
-- chọn lần nào, và lần chọn đầu là miễn phí (heroes.ts).
ALTER TABLE temple_profiles ADD COLUMN IF NOT EXISTS heroes text[];
UPDATE temple_profiles SET heroes = ARRAY[appearance ->> 'hero']
  WHERE heroes IS NULL AND appearance ? 'hero';

-- Set DEFAULT là idempotent và không đụng hàng cũ: database đã dựng với 'tinhdo' vẫn
-- lên được, chỉ hàng sinh sau này mới nhận 'flex'.
ALTER TABLE temple_profiles ALTER COLUMN sect SET DEFAULT 'flex';

-- Hồ sơ đã lưu thì phải đổi id theo, nếu không sectOf() không tra ra lối chơi mới và
-- avatar về màu dự phòng. Cặp id cũ/mới chọn theo màu: #4f8a4a/#c4688a/#c0602e giữ
-- nguyên sắc, nên người chơi chỉ thấy nhãn khác đi chứ không phải đổi màu đồ.
UPDATE temple_profiles SET sect = CASE sect
    WHEN 'truclam' THEN 'fast8'
    WHEN 'tinhdo'  THEN 'reroll'
    WHEN 'lamte'   THEN 'tempo'
    WHEN 'taodong' THEN 'flex'
  END
  WHERE sect IN ('truclam', 'tinhdo', 'lamte', 'taodong');

-- Tổ đội đổi hạn mức từ 10 xuống 8, đúng sĩ số một lobby TFT. Chỉ đổi DEFAULT nên hàng
-- cũ giữ con số của chính nó, và 10 vẫn nằm trong khoảng CHECK nên không hàng nào bị
-- từ chối khi chạy lại file này.
ALTER TABLE temple_groups ALTER COLUMN max_members SET DEFAULT 8;

-- Một hàng cho mỗi ngày cầu may: chuỗi ngày, BXH và sổ điểm đều cộng từ đây.
-- Không lưu từng lần nhấn vì máy khách đẩy số liệu theo nhịp, và thứ cần hỏi là
-- "hôm nay bao nhiêu", không phải "làm lúc mấy giờ".
CREATE TABLE IF NOT EXISTS temple_practice (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  bows integer NOT NULL DEFAULT 0,
  beads integer NOT NULL DEFAULT 0,
  rounds integer NOT NULL DEFAULT 0,
  meditate_min integer NOT NULL DEFAULT 0,
  chants integer NOT NULL DEFAULT 0,
  -- Cú "ghé sảnh" chỉ có điểm lần đầu trong ngày; giữ lại con số này để server
  -- biết đã trả phần thưởng đó chưa, thay vì tin một lá thư từ máy khách.
  visits integer NOT NULL DEFAULT 0,
  game_exp integer NOT NULL DEFAULT 0,
  exp integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day),
  CHECK (bows >= 0 AND beads >= 0 AND rounds >= 0 AND meditate_min >= 0 AND chants >= 0 AND visits >= 0)
);
ALTER TABLE temple_practice ADD COLUMN IF NOT EXISTS visits integer NOT NULL DEFAULT 0;
-- Điểm tỷ thí đã nhận trong ngày (theo danh nghĩa phần thưởng, chưa nhân bùa). Trần mỗi
-- ngày của trò chơi đọc từ cột này, nên hết ngày là hết trần mà không cần đồng hồ dọn dẹp.
ALTER TABLE temple_practice ADD COLUMN IF NOT EXISTS game_exp integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS temple_practice_day_idx ON temple_practice (day DESC, exp DESC);

CREATE TABLE IF NOT EXISTS temple_plants (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  temple text NOT NULL,
  item text NOT NULL,
  x numeric(6,2) NOT NULL DEFAULT 5,
  z numeric(6,2) NOT NULL DEFAULT 16,
  fruits integer NOT NULL DEFAULT 0,
  per_pick integer NOT NULL DEFAULT 3,
  ripe boolean NOT NULL DEFAULT true,
  next_pick_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fruits >= 0 AND per_pick > 0)
);
CREATE INDEX IF NOT EXISTS temple_plants_temple_idx ON temple_plants (temple, created_at DESC);

-- Bảng đồng hành: mỗi lần dâng một hàng, và bia vàng cộng từ đó.
CREATE TABLE IF NOT EXISTS temple_donations (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  temple text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(note) <= 120)
);
CREATE INDEX IF NOT EXISTS temple_donations_recent_idx ON temple_donations (created_at DESC);

-- Quà cầu may: bùa/lời chúc gửi cho một người cụ thể, có thể kèm Tinh Hoa.
CREATE TABLE IF NOT EXISTS temple_greetings (
  id bigserial PRIMARY KEY,
  from_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('huong', 'chuc')),
  text text NOT NULL DEFAULT '',
  gift_sen integer NOT NULL DEFAULT 0 CHECK (gift_sen >= 0),
  -- "đã ghi sổ" chứ không còn là "người nhận đã bấm mở": thưởng mở quà nay cộng ngay
  -- lúc quà tới (social.ts:sendGreeting), nên hàng mới sinh đã có dấu này.
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(text) <= 120)
);
CREATE INDEX IF NOT EXISTS temple_greetings_inbox_idx ON temple_greetings (to_user, seen_at, created_at DESC);

-- Hàng cũ chưa bấm mở: đóng dấu cho đúng nghĩa mới của cột. **Không hồi tố phần thưởng**
-- — 496 hàng chưa mở trên dev nhân mỗi 5 Điểm May là +2.480 điểm, đủ kéo người ta mấy
-- bậc từ một đống chữ bot gửi mà trước giờ không ai bấm nổi (hộp thư chỉ đọc 60 hàng).
UPDATE temple_greetings SET seen_at = now() WHERE seen_at IS NULL;

CREATE TABLE IF NOT EXISTS temple_friends (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Bạn bè là hai chiều: hàng accepted lưu cả hai phía để đọc danh sách bằng một
  -- query, còn lời mời thì chỉ một hàng từ phía mời.
  CHECK (user_id <> friend_id),
  PRIMARY KEY (user_id, friend_id)
);
-- Chiều ngược của lời mời: "ai đang chờ mình chấp thuận" lọc theo friend_id, mà khoá
-- chính chỉ đánh chỉ mục theo user_id nên không có dòng này là quét cả bảng bạn bè.
CREATE INDEX IF NOT EXISTS temple_friends_peer_idx ON temple_friends (friend_id, status);

CREATE TABLE IF NOT EXISTS temple_dms (
  id bigserial PRIMARY KEY,
  from_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 400),
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS temple_dms_thread_idx ON temple_dms (to_user, from_user, created_at DESC);
-- Hộp thư gom cả hai chiều (from_user = tôi OR to_user = tôi), nên chiều gửi cũng cần
-- chỉ mục riêng; thread_idx chỉ dẫn đầu bằng to_user.
CREATE INDEX IF NOT EXISTS temple_dms_from_idx ON temple_dms (from_user, created_at DESC);

-- Tổ đội (bản gốc gọi là nhóm đồng tu): một nhóm có mã mời, hạn mức thành viên — 8
-- người đúng sĩ số một lobby TFT — và quỹ điểm chung do chính đội đóng góp.
CREATE TABLE IF NOT EXISTS temple_groups (
  id bigserial PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 4 AND 12),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_members integer NOT NULL DEFAULT 8 CHECK (max_members BETWEEN 2 AND 100),
  goal integer NOT NULL DEFAULT 1000 CHECK (goal > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS temple_group_members (
  group_id bigint NOT NULL REFERENCES temple_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS temple_group_members_user_idx ON temple_group_members (user_id);
CREATE TABLE IF NOT EXISTS temple_group_messages (
  id bigserial PRIMARY KEY,
  group_id bigint NOT NULL REFERENCES temple_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 400),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS temple_group_messages_thread_idx ON temple_group_messages (group_id, created_at DESC);

-- Vòng quay Hex / quẻ đội hình: một hàng cho mỗi người mỗi loại mỗi ngày, vừa là giới
-- hạn vừa là lịch sử để bảng hiển thị lại đúng kết quả đã nhận.
CREATE TABLE IF NOT EXISTS temple_draws (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('wheel', 'que')),
  day date NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, day)
);

-- Đổi duyên với Lão Hành Khất: một hàng là một món "không bán" đã đổi trong ngày.
-- Ba món một ngày đúng như cánh cổng bản gốc (api.js:916); giá thì theo thang dẫn xuất
-- trong catalog.ts, không còn bằng nhau. Khoá (user, item, day) là chỗ chặn cú chạm đúp
-- đổi cùng một món hai lần; shop.ts ghi hàng này trong cùng transaction với nhịp trừ ví.
CREATE TABLE IF NOT EXISTS temple_exchanges (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item text NOT NULL,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item, day)
);

-- Tỷ thí giữa hai người chơi: xúc xắc và oẳn tù tì.
--
-- Một hàng là một trận, không phải một vòng: vòng hiện trường nằm ở a_move/b_move/round
-- nên hai cú POST đồng thời chỉ cần một hàng để phân thắng. Nước đi của bên ra trước
-- được giữ bí mật ở máy chủ (games.ts giấu pick oẳn tù tì cho tới khi bên kia đã ra),
-- nên trên dây không bao giờ có cả hai nước của một vòng chưa phân định.
CREATE TABLE IF NOT EXISTS temple_games (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('dice', 'rps')),
  -- 'invite' = chờ người được mời chấp thuận, 'live' = đang đánh, 'over' = có kết quả,
  -- 'dead' = từ chối/rút lui/quá hạn (reason nói rõ là đường nào).
  status text NOT NULL DEFAULT 'invite' CHECK (status IN ('invite', 'live', 'over', 'dead')),
  -- Bên a là bên chủ động mời; winner rỗng nghĩa là hòa.
  a_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  winner uuid REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  round integer NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 12),
  a_score integer NOT NULL DEFAULT 0 CHECK (a_score >= 0),
  b_score integer NOT NULL DEFAULT 0 CHECK (b_score >= 0),
  -- Nước đi của vòng hiện tại; NULL bên nào là bên đó chưa tới lượt. Sau mỗi vòng cả hai
  -- được ghi NULL lại nên không ai "dùng đỡ" phần thưởng của vòng trước.
  a_move jsonb,
  b_move jsonb,
  -- Vòng vừa phân định, để người mở lại trang vẫn thấy xúc xắc ra sao thay vì chỉ thấy tỉ số.
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (a_user <> b_user)
);
-- Danh sách "trận đang mở của tôi" hỏi theo cả hai chiều, nên mỗi chiều một chỉ mục;
-- khoá chính chỉ đánh theo id.
CREATE INDEX IF NOT EXISTS temple_games_a_idx ON temple_games (a_user, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS temple_games_b_idx ON temple_games (b_user, status, updated_at DESC);

-- Tin chạy trong sảnh.
CREATE TABLE IF NOT EXISTS temple_announcements (
  id bigserial PRIMARY KEY,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  effect text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
