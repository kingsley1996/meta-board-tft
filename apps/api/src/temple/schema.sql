-- Bảng cho chánh điện nhiều người (module chùa: src/temple/*).
--
-- File này là nguồn duy nhất: src/temple/schema.ts đọc và chạy đúng nội dung này mỗi
-- lần module chùa chạm Postgres, nên Supabase mới dựng cũng vào chùa được mà không
-- chờ operator chạy migration tay — và không có bản sao thứ hai để lệch về sau.
--
-- Mọi hàng đều đi theo users.id. Người lạ bước vào chùa được cấp một users.id thật
-- (is_guest = true, email giả, không mật khẩu); khi người đó đăng ký tài khoản thì
-- hàng users được nâng cấp tại chỗ, toàn bộ công đức dưới đây giữ nguyên.

-- Cột is_guest nằm trên users (src/accounts.ts thêm nó lúc chạy), vì quyền ghi dữ
-- liệu chùa phải đi theo đúng khoá ngoại users(id) mà các bảng dưới tham chiếu.

CREATE TABLE IF NOT EXISTS temple_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Frame nhị phân của máy khách mã người chơi bằng u32 (protocol.ts:58) trong khi
  -- users.id là uuid, nên mỗi hồ sơ cần một số nguyên riêng. Máy khách không được
  -- tự chọn: nếu không thì hai người cùng khai một id và avatar đè nhau.
  player_id bigint NOT NULL UNIQUE CHECK (player_id BETWEEN 1 AND 4294967295),
  name text NOT NULL CHECK (name <> '' AND char_length(name) <= 28),
  sect text NOT NULL DEFAULT 'tinhdo',
  title text NOT NULL DEFAULT '',
  honor text NOT NULL DEFAULT '',
  exp integer NOT NULL DEFAULT 0,
  sen integer NOT NULL DEFAULT 500,
  ngoc integer NOT NULL DEFAULT 200,
  duc integer NOT NULL DEFAULT 100,
  fruit integer NOT NULL DEFAULT 5,
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  practice_day date,
  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,
  equipped jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory jsonb NOT NULL DEFAULT '{}'::jsonb,
  no_chan boolean NOT NULL DEFAULT false,
  -- Hai mốc chỉ máy chủ được quyền viết. buff_until là hạn "hương trầm" nhân đôi
  -- công đức; meditate_start là giờ ngồi thiền để số phút tính ở server, không phải
  -- do máy khách tự khai.
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

-- Một hàng cho mỗi ngày hành trì: chuỗi ngày, BXH và sổ công đức đều cộng từ đây.
-- Không lưu từng lần lạy vì máy khách đẩy số liệu theo nhịp, và thứ cần hỏi là
-- "hôm nay bao nhiêu", không phải "lạy lúc mấy giờ".
CREATE TABLE IF NOT EXISTS temple_practice (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  bows integer NOT NULL DEFAULT 0,
  beads integer NOT NULL DEFAULT 0,
  rounds integer NOT NULL DEFAULT 0,
  meditate_min integer NOT NULL DEFAULT 0,
  chants integer NOT NULL DEFAULT 0,
  -- Cú "ghé chùa" chỉ có công đức lần đầu trong ngày; giữ lại con số này để server
  -- biết đã trả phần thưởng đó chưa, thay vì tin một lá thư từ máy khách.
  visits integer NOT NULL DEFAULT 0,
  exp integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day),
  CHECK (bows >= 0 AND beads >= 0 AND rounds >= 0 AND meditate_min >= 0 AND chants >= 0 AND visits >= 0)
);
ALTER TABLE temple_practice ADD COLUMN IF NOT EXISTS visits integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS temple_practice_day_idx ON temple_practice (day DESC, exp DESC);

CREATE TABLE IF NOT EXISTS temple_lanterns (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  temple text NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 120),
  likes integer NOT NULL DEFAULT 0,
  -- Lời nguyện của người chưa xác minh email nằm ở pending cho tới khi được duyệt;
  -- đèn bay lên cả hall cùng thấy nên không thể để tự do ghi thẳng.
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('pending', 'live', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS temple_lanterns_feed_idx ON temple_lanterns (temple, status, created_at DESC);

-- Tuỳ hỷ: một người chỉ được một lần cho một đèn, vì mỗi lần cộng 2 Sen cho chủ đèn.
CREATE TABLE IF NOT EXISTS temple_lantern_rejoices (
  lantern_id bigint NOT NULL REFERENCES temple_lanterns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lantern_id, user_id)
);

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

-- Bảng tri ân: mỗi lần tùy hỷ một hàng, và bảng vàng cộng từ đó.
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

-- Kết duyên: hương/lời chúc gửi cho một người cụ thể, có thể kèm Sen.
CREATE TABLE IF NOT EXISTS temple_greetings (
  id bigserial PRIMARY KEY,
  from_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('huong', 'chuc')),
  text text NOT NULL DEFAULT '',
  gift_sen integer NOT NULL DEFAULT 0 CHECK (gift_sen >= 0),
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(text) <= 120)
);
CREATE INDEX IF NOT EXISTS temple_greetings_inbox_idx ON temple_greetings (to_user, seen_at, created_at DESC);

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

CREATE TABLE IF NOT EXISTS temple_dms (
  id bigserial PRIMARY KEY,
  from_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 400),
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS temple_dms_thread_idx ON temple_dms (to_user, from_user, created_at DESC);

-- Nhóm đồng tu (thay cho "Tăng đoàn" của bản gốc): một nhóm có mã mời, hạn mức thành
-- viên, và quỹ công đức chung do chính nhóm đóng góp.
CREATE TABLE IF NOT EXISTS temple_groups (
  id bigserial PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 4 AND 12),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_members integer NOT NULL DEFAULT 10 CHECK (max_members BETWEEN 2 AND 100),
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

-- Quay lộc / xin xăm: một hàng cho mỗi người mỗi loại mỗi ngày, vừa là giới hạn
-- vừa là lịch sử để bảng lộc hiển thị lại đúng kết quả đã nhận.
CREATE TABLE IF NOT EXISTS temple_draws (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('wheel', 'que')),
  day date NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, day)
);

-- Tin chạy / thông bạch trong chùa.
CREATE TABLE IF NOT EXISTS temple_announcements (
  id bigserial PRIMARY KEY,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  effect text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
