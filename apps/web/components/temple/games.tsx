// Tỷ thí giữa hai người chơi thật: xúc xắc và oẳn tù tì.
//
// Trận nằm trong database nên bảng này chỉ đọc lại những gì máy chủ đã quyết — nước đi
// nào thắng, vòng mấy, ai được cộng bao nhiêu. Độ May hiện ra cạnh tên mỗi bên vì nó là
// một phần của luật: vòng hòa oẳn tù tì nghiêng về phía lộc nặng hơn, và người chơi
// cần thấy vì sao mình thua một vòng mà hai đòn giống hệt nhau.
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
import { Sound } from "./engine";
import { luckyShower } from "./effects";
import { Icon, Sheet, ago, fmt, GuestGate, type Store } from "./ui";
import { Ava } from "./people";

const TABS = [
  { id: "open", label: "Đang tỷ thí" },
  { id: "hist", label: "Từng đấu" },
];

// Tên hai môn tỷ thí — HUD cũng dùng để viết thẻ thông báo, nên để một chỗ.
export const KIND_NAME: Record<GameKind, string> = {
  dice: "Xúc Xắc",
  rps: "Oẳn Tù Tì",
};
const KIND_ICON: Record<GameKind, string> = { dice: "dice", rps: "scissors" };

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

// Nước đi của một bên. Khi vòng oẳn tù tì còn chờ đối thủ, máy chủ giấu đòn của họ và
// chỉ trả `{bonus}` — có mặt ở đó để biết họ đã oẳn, không có mặt để đọc được ra gì.
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
        <small>
          Độ May {side.player.luck} · +{side.player.bonus} lộc
          {side.player.id === me ? " (bạn)" : ""}
        </small>
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
  const same = m.kind === "rps" && !!r.a.pick && r.a.pick === r.b.pick;
  const mine = r.winner && r.winner === (me === m.a.player.id ? "a" : "b");
  const who = !r.winner
    ? "hòa vòng này"
    : mine
      ? "bạn thắng vòng này"
      : `${r.winner === "a" ? m.a.player.name : m.b.player.name} thắng vòng này`;
  return (
    <div className="duel-last">
      <div className="duel-last-head">
        <Icon name={r.winner ? "check" : "spark"} /> Vòng {r.round} ·{" "}
        <b>{who}</b>
      </div>
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
      Sound.tap();
      const r = await post<GameReply>(path, body);
      if (r.over && r.outcome) {
        s.apply(r);
        Sound.spark();
        if (r.outcome === "win") luckyShower(18);
        // Ván vẫn chơi và vẫn phân thắng thua, chỉ cái ví là đứng lại: nói rõ là trần
        // hôm nay chứ không để "+0 Điểm May" tự nó thành một câu đố.
        const capped =
          r.cap &&
          r.cap.nominal !== undefined &&
          (r.cap.awarded ?? 0) < r.cap.nominal;
        s.toast(
          `<svg class="i"><use href="#i-${r.outcome === "win" ? "trophy" : "spark"}"/></svg> ${OUTCOME[r.outcome]} ván ${KIND_NAME[m.kind]} · +${fmt(r.gained ?? 0)} Điểm May${capped ? " · trần hôm nay" : ""}`,
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

  const head =
    m.status === "invite"
      ? me === m.b
        ? `${rival.player.name} mời bạn tỷ thí`
        : `Đang chờ ${rival.player.name}…`
      : m.status === "live"
        ? `Vòng ${m.round}/${m.max_rounds} · ăn ${m.wins_needed}`
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
          <p className="muted">Đã ra nước đi · chờ đối thủ vòng này.</p>
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
      <p className="muted">Nếu hòa, kết quả sẽ do Độ May Mắn quyết định.</p>
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
