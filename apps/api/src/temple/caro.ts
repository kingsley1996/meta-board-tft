// Luật cờ caro cho tỷ thí: bàn 9x9, bên đặt đủ 5 ô liền nhau thì thắng.
//
// Vì sao luật nằm riêng ở đây mà không nằm trong games.ts: bàn cờ là thứ duy nhất trong
// tỷ thí mà một gói tin có thể khai sai có chủ đích ("tôi thắng rồi"). Mọi ô, mọi nước và
// mọi hàng thắng đều do máy chủ tính, máy khách chỉ vẽ lại những gì nó nhận — nên phần
// này phải đọc được và thử được mà không cần database, còn games.ts lo giao dịch.
//
// Vì sao đi luân phiên mà không đồng loạt như xúc xắc: caro ăn nhau từng ô một, nước sau
// phụ thuộc bàn của nước trước. games.ts giữ nguyên mô hình "một vòng = lượt a rồi lượt b"
// nên các cột a_move/b_move vẫn trả lời được "đến lượt ai" cho bot mà không cần đọc bàn.

export const SIZE = 9;
export const CELLS = SIZE * SIZE;
export const RUN = 5;

// Bên mời cầm 'a' và đi trước; 'b' là bên nhận lời mời.
export type CaroSide = 'a' | 'b';
const MARK: Record<CaroSide, string> = { a: 'a', b: 'b' };
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

// Bàn cờ là một chuỗi 81 ký tự: '.' ô trống, 'a'/'b' ô đã đặt. Một ký tự một ô nên
// độ dài chuỗi tự nó là số ô đã lấp, và hàng nào cũng đọc được bằng một phép chia.
export const EMPTY_BOARD = '.'.repeat(CELLS);

const other = (side: CaroSide): CaroSide => (side === 'a' ? 'b' : 'a');

// Một hàng cũ của xúc xắc có board rỗng (cột thêm sau, DEFAULT ''), và test thì mọc hàng
// qua SQL. Coi chuỗi không đủ 81 ký tự là bàn trống rẻ hơn là để mọi hàm phải nhớ kiểm tra.
const ensure = (board: string): string => (board.length === CELLS ? board : EMPTY_BOARD);

export const stonesOf = (board: string): number => ensure(board).replace(/\./g, '').length;

export const isEmpty = (board: string, cell: number): boolean => ensure(board)[cell] === '.';

export const isFull = (board: string): boolean => stonesOf(board) >= CELLS;

// Bên a luôn đi nước lẻ, nên hai cột đếm được là biết tới lượt ai.
export function turnOf(board: string): CaroSide {
  const b = ensure(board);
  const a = [...b].filter((c) => c === 'a').length;
  const c = [...b].filter((c) => c === 'b').length;
  return a > c ? 'b' : 'a';
}

export function place(board: string, cell: number, side: CaroSide): string {
  const b = ensure(board);
  return b.slice(0, cell) + MARK[side] + b.slice(cell + 1);
}

const at = (board: string, r: number, c: number): string | undefined =>
  r < 0 || r >= SIZE || c < 0 || c >= SIZE ? undefined : board[r * SIZE + c];

// Số ô liền nhau kể cả ô vừa đặt, theo một hướng. Đếm hai chiều vì hàng thắng có thể
// mọc ra từ giữa: đặt vào khe hở giữa bốn ô của mình là đủ năm.
function runLength(board: string, r: number, c: number, dr: number, dc: number, mark: string): number {
  let n = 1;
  for (const sign of [1, -1]) {
    let rr = r + dr * sign;
    let cc = c + dc * sign;
    while (at(board, rr, cc) === mark) {
      n += 1;
      rr += dr * sign;
      cc += dc * sign;
    }
  }
  return n;
}

// Hàng thắng chứa ô vừa đặt, hoặc null nếu chưa đủ 5. Trả về danh sách ô thay vì chỉ
// true/false vì người chơi cần nhìn ra mình thắng bằng ô nào — máy khách đánh sáng đúng
// các ô này, và không có lý do gì bắt nó tự tính lại luật.
export function winLine(board: string, cell: number): number[] | null {
  const b = ensure(board);
  const mark = b[cell];
  if (mark !== 'a' && mark !== 'b') return null;
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  for (const [dr, dc] of DIRECTIONS) {
    if (runLength(b, r, c, dr, dc, mark) < RUN) continue;
    const line: number[] = [];
    let rr = r;
    let cc = c;
    while (at(b, rr - dr, cc - dc) === mark) {
      rr -= dr;
      cc -= dc;
    }
    while (at(b, rr, cc) === mark) {
      line.push(rr * SIZE + cc);
      rr += dr;
      cc += dc;
    }
    return line;
  }
  return null;
}

// ---- Nước của bot -----------------------------------------------------------------
//
// Ba bậc, đúng thứ tự người thật cũng chơi: hoàn thành hàng của mình, chặn hàng của đối
// thủ, còn thì xây gần đám đông nhà mình. Không cần tìm sâu: caro 9x9 đủ 5 thì một lớp
// lookahead đã chặn được mọi nước thắng trực tiếp, và thứ đáng chặn nhất là ô mà đối thủ
// đặt vào là thành 5.
const centre = Math.floor(CELLS / 2);

// Cách ô giữa theo bàn cờ (Chebyshev): bàn càng gần giữa càng nhiều hướng để nối hàng.
const away = (cell: number): number => {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  return Math.max(Math.abs(r - Math.floor(SIZE / 2)), Math.abs(c - Math.floor(SIZE / 2)));
};

function longestAt(board: string, cell: number, mark: string): number {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  return Math.max(...DIRECTIONS.map(([dr, dc]) => runLength(board, r, c, dr, dc, mark)));
}

// Số ô đã đặt quanh ô này (8 hướng, bán kính 1): caro không ai đánh xa đám đông, và một
// con bot rải ô rời rạc thì người chơi đọc ra ngay là máy.
function crowdedAt(board: string, cell: number): number {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  let n = 0;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const v = at(board, r + dr, c + dc);
      if (v === 'a' || v === 'b') n += 1;
    }
  }
  return n;
}

export function bestMove(board: string, side: CaroSide): number | null {
  const b = ensure(board);
  const open: number[] = [];
  for (let i = 0; i < CELLS; i += 1) if (b[i] === '.') open.push(i);
  if (!open.length) return null;
  // Bàn trống thì giữa bàn, không phải ô 0: một con bot mở màn ở góc nhìn là gian lận.
  if (stonesOf(b) === 0) return centre;

  for (const mark of [MARK[side], MARK[other(side)]]) {
    for (const i of open) if (longestAt(b, i, mark) >= RUN) return i;
  }

  // Tấn công nặng hơn phòng thủ một chút, nhưng hai hàng cùng dài thì chọn ô xây được
  // hàng của mình — người thua vì một con bot chỉ biết chặn cũng khó mà tin đó là người.
  let pick = open[0];
  let score = -Infinity;
  for (const i of open) {
    const mine = longestAt(b, i, MARK[side]);
    const theirs = longestAt(b, i, MARK[other(side)]);
    const s = mine * 100 + theirs * 90 + crowdedAt(b, i) * 12 - away(i);
    if (s > score) {
      score = s;
      pick = i;
    }
  }
  return pick;
}
