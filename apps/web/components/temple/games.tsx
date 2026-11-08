// Tỷ thí giữa hai người chơi thật: xúc xắc, oẳn tù tì và cờ caro.
//
// Trận nằm trong database nên bảng này chỉ đọc lại những gì máy chủ đã quyết — nước đi
// nào thắng, vòng mấy, ai được cộng bao nhiêu, bàn caro ra sao. Độ May hiện ra cạnh tên
// mỗi bên vì nó là một phần của luật xúc xắc và oẳn tù tì: vòng hòa oẳn tù tì nghiêng về
// phía lộc nặng hơn, và người chơi cần thấy vì sao mình thua một vòng mà hai đòn giống
// hệt nhau. Caro không có chỗ nào cho lộc, nên nó là môn duy nhất không in dòng đó.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameKind,
  GameMatch,
  GameMove,
  GameReply,
  GameSide,
  GamesPayload,
} from "./api";
import { get, post } from "./api";
import { luckyShower } from "./effects";
import { Icon, Sheet, ago, fmt, GuestGate, type Store } from "./ui";
import { Ava } from "./people";

const TABS = [
  { id: "open", label: "Đang tỷ thí" },
  { id: "hist", label: "Từng đấu" },
];

// Tên ba môn tỷ thí — HUD cũng dùng để viết thẻ thông báo, nên để một chỗ.
export const KIND_NAME: Record<GameKind, string> = {
  dice: "Xúc Xắc",
  rps: "Oẳn Tù Tì",
  caro: "Cờ Caro",
};
const KIND_ICON: Record<GameKind, string> = { dice: "dice", rps: "scissors", caro: "grid" };

// Bàn caro máy chủ gửi về là một chuỗi ký tự, một ký tự một ô, nên cạnh bàn suy ra từ
// độ dài chuỗi thay vì hard-code con số 9 của phía API.
const caroSize = (board: string) => Math.round(Math.sqrt(board.length));
const caroName = (board: string, cell: number) =>
  `${"ABCDEFGHI"[cell % caroSize(board)] ?? "?"}${Math.floor(cell / caroSize(board)) + 1}`;
const caroFilled = (board: string) => [...board].filter((c) => c !== ".").length;
// Bên mời cầm 'a' và đi nước đầu, nên hai bên quân đều nhau là tới lượt a. Luật thật nằm
// ở máy chủ; chỗ này chỉ quyết định ô nào bấm được.
const caroOpensA = (board: string) =>
  [...board].filter((c) => c === "a").length === [...board].filter((c) => c === "b").length;

// Mã đòn đúng như máy chủ giữ: bua ăn keo, keo ăn bao, bao ăn bua.
const SIGN_NAME: Record<string, string> = {
  bua: "Búa",
  bao: "Bao",
  keo: "Kéo",
};
const SIGN_ICON: Record<string, string> = {
  bua: "rock",
  bao: "paper",
  keo: "scissors",
};
const SIGNS = ["bua", "bao", "keo"];

const REASON: Record<string, string> = {
  expired: "Hết hạn chờ",
  declined: "Bạn ấy từ chối",
  cancelled: "Bỏ ván",
};
const OUTCOME: Record<string, string> = {
  win: "Thắng",
  lose: "Thua",
  draw: "Hòa",
};

// Lõm xúc xắc trên lưới 3x3, vẽ bằng CSS thay vì ảnh để một viên chỉ nặng vài dòng.
const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
  ],
  5: [
    [1, 1],
    [1, 3],
    [2, 2],
    [3, 1],
    [3, 3],
  ],
  6: [
    [1, 1],
    [1, 3],
    [2, 1],
    [2, 3],
    [3, 1],
    [3, 3],
  ],
};

function Die({ n }: { n: number }) {
  return (
    <span className="die" aria-label={String(n)}>
      {(PIPS[n] ?? []).map(([r, c], i) => (
        <i key={i} style={{ gridRowStart: r, gridColumnStart: c }} />
      ))}
    </span>
  );
}

const sideOf = (m: GameMatch, me: number): GameSide | null =>
  m.a.player.id === me ? m.a : m.b.player.id === me ? m.b : null;

// Bàn caro. Ô trống chỉ bấm được khi tới lượt mình, còn mọi ô đều có tên (C5) trong
// tooltip để người chơi đọc được nước của đối thủ mà không phải đếm ô bằng mắt.
function CaroBoard({
  board,
  line,
  mine,
  canPlay,
  onPlay,
}: {
  board: string;
  line?: number[];
  mine: "a" | "b";
  canPlay: boolean;
  onPlay: (cell: number) => void;
}) {
  const size = caroSize(board);
  const win = new Set(line ?? []);
  return (
    <div className="caro" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
      {[...board].map((c, i) => (
        <button
          key={i}
          type="button"
          className={[c === "a" || c === "b" ? c : "", win.has(i) ? "win" : ""].filter(Boolean).join(" ")}
          disabled={!canPlay || c !== "."}
          title={c === "." ? `Đặt tại ${caroName(board, i)}` : `${caroName(board, i)} · ${c === mine ? "quân của bạn" : "quân đối thủ"}`}
          onClick={() => onPlay(i)}
        >
          {c === "." ? null : <i />}
        </button>
      ))}
    </div>
  );
}

// Nước đi của một bên. Khi vòng oẳn tù tì còn chờ đối thủ, máy chủ giấu đòn của họ và
// chỉ trả `{bonus}` — có mặt ở đó để biết họ đã oẳn, không có mặt để đọc được ra gì.
// Caro không có gì để hiện ở đây: bàn cờ bên dưới đã nói ô nào vừa đặt, đặt thêm một
// dòng chữ vào hàng tên chỉ để lặp lại đúng điều đó.
function MoveBox({
  kind,
  side,
  live,
}: {
  kind: GameKind;
  side: GameSide;
  live: boolean;
}) {
  const mv = side.move;
  if (kind === "caro") return null;
  if (!side.moved)
    return live ? <span className="duel-idle">chưa ra</span> : null;
  if (!mv) return null;
  if (kind === "rps")
    return mv.pick ? (
      <span className="duel-hand">
        <Icon name={SIGN_ICON[mv.pick]} /> {SIGN_NAME[mv.pick]}
      </span>
    ) : (
      <span className="duel-idle">đã ra</span>
    );
  return (
    <span className="duel-dice">
      {(mv.dice ?? []).map((d, i) => (
        <Die key={i} n={d} />
      ))}
      <b>
        {mv.total} <small>+{mv.bonus} lộc</small>
      </b>
    </span>
  );
}

function DuelRow({
  side,
  me,
  kind,
  live,
  won,
}: {
  side: GameSide;
  me: number;
  kind: GameKind;
  live: boolean;
  won: boolean;
}) {
  return (
    <div
      className={`duel-row${side.player.id === me ? " me" : ""}${won ? " win" : ""}`}
    >
      <Ava name={side.player.name} sect={side.player.sect} />
      <div className="duel-who">
        <b>{side.player.name}</b>
        {/* Caro không có lộc để mà in: bàn cờ và chú thích bên dưới đã nói hết. */}
        {kind === "caro" ? null : (
          <small>
            Độ May {side.player.luck} · +{side.player.bonus} lộc
            {side.player.id === me ? " (bạn)" : ""}
          </small>
        )}
      </div>
      <MoveBox kind={kind} side={side} live={live} />
      <span className="duel-sc">{side.score}</span>
    </div>
  );
}

// Vòng vừa ngã ngũ. Trong khối kết quả thì mặt xúc xắc và đòn tay đáng đọc hơn con số:
// hai bên đã hạ màn, thứ còn lại là "mình vừa gieo ra gì", và máy chủ đã giữ sẵn cả hai
// nước đi trong `result` nên người mở lại giữa trận cũng đọc được vì sao tỉ số đổi.
function RoundSide({ kind, mv }: { kind: GameKind; mv: GameMove }) {
  if (kind === "dice")
    return (
      <span className="duel-dice">
        {(mv.dice ?? []).map((d, i) => (
          <Die key={i} n={d} />
        ))}
        <b>{mv.total}</b>
      </span>
    );
  if (!mv.pick) return null;
  return (
    <span className="duel-hand">
      <Icon name={SIGN_ICON[mv.pick]} /> {SIGN_NAME[mv.pick]}
    </span>
  );
}

function LastRound({ m, me }: { m: GameMatch; me: number }) {
  const r = m.result;
  if (!r) return null;
  // Caro không có "vòng" nghĩa là một cặp nước: result của nó chỉ xuất hiện khi ván ngã
  // ngũ, và thứ đáng đọc là năm ô nào thành hàng, không phải hai nước so với nhau.
  const caro = m.kind === "caro";
  const noun = caro ? "ván" : "vòng";
  const same = m.kind === "rps" && !!r.a.pick && r.a.pick === r.b.pick;
  const mine = r.winner && r.winner === (me === m.a.player.id ? "a" : "b");
  const who = !r.winner
    ? `hòa ${noun} này`
    : mine
      ? `bạn thắng ${noun} này`
      : `${r.winner === "a" ? m.a.player.name : m.b.player.name} thắng ${noun} này`;
  return (
    <div className="duel-last">
      <div className="duel-last-head">
        <Icon name={r.winner ? "check" : "spark"} /> {caro ? "Chốt" : `Vòng ${r.round}`} ·{" "}
        <b>{who}</b>
      </div>
      {caro ? (
        <p className="duel-luck">
          {r.line && r.line.length
            ? `Hàng thắng: ${r.line.map((i) => caroName(m.board, i)).join(" · ")}`
            : "Bàn đã đầy mà không bên nào đủ năm ô liền."}
        </p>
      ) : (
        <>
          <div className="duel-vs">
            <RoundSide kind={m.kind} mv={r.a} />
            <em>so với</em>
            <RoundSide kind={m.kind} mv={r.b} />
          </div>
          {same ? (
            <p className="duel-luck">
              Hai đòn bằng nhau, Độ May {r.luck[0]} so với {r.luck[1]} quyết vòng
              này.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Duel({
  s,
  m,
  reload,
}: {
  s: Store;
  m: GameMatch;
  reload: () => void;
}) {
  const me = sideOf(m, s.me);
  const rival = me === m.a ? m.b : m.a;

  const run = async (path: string, body?: Record<string, unknown>) => {
    try {
      const r = await post<GameReply>(path, body);
      if (r.over && r.outcome) {
        s.apply(r);
        if (r.outcome === "win") luckyShower(18);
        // Ván vẫn chơi và vẫn phân thắng thua, chỉ cái ví là đứng lại: nói rõ là trần
        // hôm nay chứ không để "+0 Điểm May Mắn" tự nó thành một câu đố.
        const capped =
          r.cap &&
          r.cap.nominal !== undefined &&
          (r.cap.awarded ?? 0) < r.cap.nominal;
        s.toast(
          `<svg class="i"><use href="#i-${r.outcome === "win" ? "trophy" : "spark"}"/></svg> ${OUTCOME[r.outcome]} ván ${KIND_NAME[m.kind]} · +${fmt(r.gained ?? 0)} Điểm May Mắn${capped ? " · trần hôm nay" : ""}`,
        );
      } else if (r.waiting) {
        s.toast(
          `<svg class="i"><use href="#i-send"/></svg> Đã ra nước đi · chờ đối thủ`,
        );
      } else if (r.result) {
        const w = r.result.winner;
        const won = w && w === (me === m.a ? "a" : "b");
        s.toast(
          `<svg class="i"><use href="#i-${KIND_ICON[m.kind]}"/></svg> ${!w ? "Hòa vòng" : won ? "Bạn thắng vòng" : "Đối thủ thắng vòng"} ${r.result.round}`,
        );
      }
    } catch (e) {
      s.toast((e as Error).message);
    }
    // Luôn đọc lại từ máy chủ thay vì sửa bản trong bộ nhớ: một trận có hai cửa ghi và
    // nước đi của đối thủ có thể xen vào giữa hai phản hồi.
    reload();
  };

  // Caro đi luân phiên nên "đến lượt ai" là câu hỏi đầu tiên trên màn hình, và bàn cờ là
  // câu trả lời. Quyền quyết vẫn ở máy chủ — đây chỉ là thứ bật/tắt các ô trống.
  const caroTurn = m.kind === "caro" ? (caroOpensA(m.board) ? m.a : m.b) : null;

  const head =
    m.status === "invite"
      ? me === m.b
        ? `${rival.player.name} mời bạn tỷ thí`
        : `Đang chờ ${rival.player.name}…`
      : m.status === "live"
        ? caroTurn
          ? `${caroTurn.player.id === s.me ? "Đến lượt bạn" : "Đến lượt đối thủ"} · ${caroFilled(m.board)}/${m.board.length} ô`
          : `Vòng ${m.round}/${m.max_rounds} · ăn ${m.wins_needed}`
        : m.status === "over"
          ? m.winner
            ? m.winner === s.me
              ? "Bạn thắng ván này"
              : `${rival.player.name} thắng ván này`
            : "Hòa ván này"
          : (REASON[m.reason] ?? "Đã đóng");

  return (
    <div
      className={`duel${m.status === "live" || m.status === "invite" ? " open" : ""}`}
    >
      <div className="duel-head">
        <span className="duel-kind">
          <Icon name={KIND_ICON[m.kind]} /> {KIND_NAME[m.kind]}
        </span>
        <small>{head}</small>
      </div>
      <DuelRow
        side={m.a}
        me={s.me}
        kind={m.kind}
        live={m.status === "live"}
        won={m.status === "over" && m.winner === m.a.player.id}
      />
      <DuelRow
        side={m.b}
        me={s.me}
        kind={m.kind}
        live={m.status === "live"}
        won={m.status === "over" && m.winner === m.b.player.id}
      />
      {/* Bàn caro nằm giữa hai hàng tên và khối kết quả: nó là mặt trận, còn hai thứ kia
          là chú thích. Chuỗi rỗng (xúc xắc, oẳn tù tì) thì không vẽ gì. */}
      {m.kind === "caro" && m.board ? (
        <>
          <CaroBoard
            board={m.board}
            line={m.result?.line}
            mine={me === m.a ? "a" : "b"}
            canPlay={!!caroTurn && m.status === "live" && !s.guest && caroTurn.player.id === s.me}
            onPlay={(cell) => void run(`/games/${m.id}/move`, { cell })}
          />
          <p className="caro-note">
            <i className="a" /> {m.a.player.name}
            <i className="b" /> {m.b.player.name}
            <em>đủ 5 ô liền ngang, dọc hoặc chéo là thắng</em>
          </p>
        </>
      ) : null}
      <LastRound m={m} me={s.me} />
      {m.status === "over" || m.status === "dead" ? (
        <small className="duel-at">{ago(m.at)}</small>
      ) : null}

      {s.guest ? null : m.status === "invite" && me === m.b ? (
        <div className="duel-acts">
          <button
            className="btn gold"
            onClick={() => void run(`/games/${m.id}/accept`)}
          >
            <Icon name="check" /> Đồng ý
          </button>
          <button
            className="btn"
            onClick={() => void run(`/games/${m.id}/decline`)}
          >
            Từ chối
          </button>
        </div>
      ) : m.status === "invite" && me === m.a ? (
        <div className="duel-acts">
          <button
            className="btn"
            onClick={() => void run(`/games/${m.id}/cancel`)}
          >
            Rút lời mời
          </button>
        </div>
      ) : m.status === "live" && me ? (
        me.moved ? (
          <p className="muted">
            Đã ra nước đi · chờ đối thủ{m.kind === "caro" ? "." : " vòng này."}
          </p>
        ) : m.kind === "dice" ? (
          <div className="duel-acts">
            <button
              className="btn gold"
              onClick={() => void run(`/games/${m.id}/move`)}
            >
              <Icon name="dice" /> Gieo xúc xắc
            </button>
            <button
              className="btn"
              onClick={() => void run(`/games/${m.id}/cancel`)}
            >
              Bỏ ván
            </button>
          </div>
        ) : m.kind === "caro" ? (
          <>
            {/* Nước đi của caro là một ô trên bàn, nên khối này chỉ còn hàng nhắc và nút
                bỏ ván — bấm ô nào thì bàn cờ ở trên đã nói rồi. */}
            <p className="muted">
              {caroTurn && caroTurn.player.id === s.me
                ? "Chạm một ô trống để đặt quân."
                : "Đang chờ đối thủ đặt ô."}
            </p>
            <div className="duel-acts">
              <button
                className="btn"
                onClick={() => void run(`/games/${m.id}/cancel`)}
              >
                Bỏ ván
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="region">Ra đòn</div>
            <div className="rps">
              {SIGNS.map((k) => (
                <button
                  key={k}
                  onClick={() => void run(`/games/${m.id}/move`, { pick: k })}
                >
                  <Icon name={SIGN_ICON[k]} />
                  <em>{SIGN_NAME[k]}</em>
                </button>
              ))}
            </div>
            <div className="duel-acts">
              <button
                className="btn"
                onClick={() => void run(`/games/${m.id}/cancel`)}
              >
                Bỏ ván
              </button>
            </div>
          </>
        )
      ) : null}
    </div>
  );
}

export function GameSheet({
  s,
  tick,
  onWaiting,
  onClose,
}: {
  s: Store;
  tick: number;
  onWaiting: (n: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState<GamesPayload | null>(null);

  // Bảng dựng lại mỗi lần người chơi đổi tab/HUD render, còn `load` thì phải đứng yên —
  // nếu nó phụ thuộc `s` (một object mới sau mỗi render) thì useEffect chạy vô hạn.
  const live = useRef({ s, onWaiting });
  live.current = { s, onWaiting };

  const load = useCallback(async () => {
    const { s: store, onWaiting: tell } = live.current;
    try {
      const r = await get<GamesPayload>("/games");
      setRows(r);
      // Chỉ lời mời dành cho mình đáng nhấp nháy ở góc bảng; ván đang chạy thì người
      // chơi đã nhìn thấy nó ngay trước mặt.
      tell(
        r.open.filter(
          (m) => m.status === "invite" && m.b.player.id === store.me,
        ).length,
      );
    } catch (e) {
      store.toast((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  // Hết cửa sổ "vừa xong" thì hàng phải rời bảng thật, không phải chờ tới lần mở bảng kế
  // tiếp: cửa sổ nằm ở máy chủ (nơi quyết danh sách), còn đồng hồ thì phải chạy ở chỗ đang
  // hiển thị nó. Không có nhịp này, một trận hạ màn vẫn ngồi ở "Đang tỷ thí" vô hạn trong
  // khi "Từng đấu" đã có nó từ lâu mà người chơi không thấy.
  useEffect(() => {
    const ms = rows?.result_ms ?? 0;
    if (!rows || !ms) return;
    const left = rows.open
      .filter((m) => m.status === "over")
      .map((m) => ms - (Date.now() - new Date(m.at).getTime()));
    if (!left.length) return;
    const timer = window.setTimeout(
      () => void load(),
      Math.max(500, Math.min(...left)),
    );
    return () => window.clearTimeout(timer);
  }, [rows, load]);

  const list = (tab === "open" ? rows?.open : rows?.history) ?? [];
  const cap = rows?.cap;
  const full = !!cap && cap.today >= cap.max;

  return (
    <Sheet
      title="Tỷ Thí"
      onClose={onClose}
      tabs={TABS}
      tab={tab}
      onTab={setTab}
    >
      <p className="muted">
        Xúc xắc: So điểm bằng tổng số nút của ba viên xúc xắc, cộng thêm Lộc.
      </p>
      <p className="muted">
        Oẳn tù tì: Đấu ba ván, ai thắng hai ván trước sẽ giành chiến thắng.
      </p>
      <p className="muted">
        Cờ caro: Bàn 9×9, bên mời đi trước, đủ 5 ô liền ngang, dọc hoặc chéo là thắng.
      </p>
      <p className="muted">
        Xúc xắc và oẳn tù tì mà hòa thì Độ May Mắn quyết; caro hòa khi bàn đã đầy.
      </p>
      <p className="muted">
        Thắng nhận 40 Điểm May Mắn, thua vẫn nhận được 12 Điểm May Mắn.
      </p>
      {cap ? (
        <p className={`duel-cap${full ? " full" : ""}`}>
          <Icon name={full ? "spark" : "incense"} /> Điểm tỷ thí hôm nay{" "}
          {fmt(cap.today)}/{fmt(cap.max)}
          {full
            ? " · Đã đạt giới hạn. Bạn vẫn có thể tiếp tục tỷ thí, nhưng sẽ không nhận thêm điểm."
            : null}
        </p>
      ) : null}
      {!rows ? (
        <div className="empty">Đang mở bảng…</div>
      ) : list.length ? (
        list.map((m) => (
          <Duel key={m.id} s={s} m={m} reload={() => void load()} />
        ))
      ) : (
        <div className="empty">
          {tab === "open"
            ? 'Chưa có ván nào. Chạm vào một người trong sảnh rồi bấm "Tỷ thí" để mời.'
            : "Chưa từng tỷ thí ván nào."}
        </div>
      )}
      <GuestGate s={s} what="Tỷ thí" />
    </Sheet>
  );
}
