import { shopOdds, xpTable } from '@tftiq/shared/mechanics';
import type { AssistantSection, Lang } from './contracts.ts';

export type StrategyState = {
  level: number | null;
  xp: number | null;
  gold: number | null;
  hp: number | null;
  stage: string | null;
  streak: { kind: 'win' | 'loss'; count: number } | null;
  goal: 'top4' | 'win' | 'econ' | 'streak' | null;
};

export type StrategyAction = 'level' | 'roll' | 'hold' | 'clarify';

export type StrategyAnalysis = {
  state: StrategyState;
  nextLevel: number | null;
  xpNeeded: number | null;
  xpMissing: number | null;
  costGold: number | null;
  goldAfter: number | null;
  canLevel: boolean;
  maxLevel: boolean;
  action: StrategyAction;
  odds: number[] | null;
  missing: ('level' | 'gold' | 'hp')[];
};

export type StrategyPlan = {
  status: 'answered' | 'needs_clarification';
  answer: string;
  sections: AssistantSection[];
  limitations: string[];
  followUpQuestions: string[];
};

const MAX_LEVEL = 10;

const STRATEGY_MARKERS =
  /\b(roll|reroll|len cap|len 7|len 8|len 9|level up|up cap|giu vang|giu tien|tich vang|pivot|chuyen bai|board|frontline|tank|do manh|manh khong|yeu|streak|econ|kinh te|all ?in|nen lam gi|lam gi day|what should i do|what do i do)\b/;
const QUESTION_FORM = /(\?|\bnen\b|\bshould\b|\bhay\b|\bkhi nao\b|\bwhen\b|\bco\b.*\bkhong\b)/;
const BOARD_CONTEXT = /\b(board|frontline|tank|do manh|manh khong)\b/;
const ACTION_MARKER = /\b(roll|reroll|len cap|level up|up cap|giu vang|giu tien|tich vang|pivot|chuyen bai|all ?in|board|frontline|tank|do manh|manh khong)\b/;
const COMP_QUESTION = /\b(comp|comps|doi hinh|team|build|composition)\b/;

function matchInt(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function bounded(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (value < min || value > max) return null;
  return value;
}

export function parseStrategyState(text: string): StrategyState {
  // "Tướng 2 vàng" / "2-cost champion" is a unit cost, not the player's gold —
  // strip those phrases before scanning for level/gold/HP state.
  const cleaned = normalizeDiacritics(text).replace(/\b(?:tuong|champion|general)\s*\d(?:\s*(?:vang|gold|cost|costs))?\b/g, ' ');
  const stage = cleaned.match(/\b(?:stage|vong)\s*(\d)\s*[- ]?\s*(\d)?/);
  const streak = cleaned.match(/\b(\d)\s*(win|thang|loss|thua)\b/);
  return {
    level: bounded(matchInt(cleaned, /\b(?:level|lvl|lv|cap)\s*(\d{1,2})\b/), 1, MAX_LEVEL),
    xp: bounded(matchInt(cleaned, /\b(\d{1,3})\s*(?:xp|kn|kinh nghiem)\b/), 0, 300),
    gold: bounded(matchInt(cleaned, /\b(\d{1,3})\s*(?:vang|gold|g)\b/), 0, 300),
    hp: bounded(
      matchInt(cleaned, /\b(\d{1,3})\s*(?:hp|mau)\b/) ?? matchInt(cleaned, /\b(?:hp|mau)\s*(\d{1,3})\b/),
      1,
      200
    ),
    stage: stage ? `${stage[1]}${stage[2] ? `-${stage[2]}` : ''}` : null,
    streak: streak
      ? { kind: /win|thang/.test(streak[2]) ? 'win' : 'loss', count: Number(streak[1]) }
      : null,
    goal: /top\s*4/.test(cleaned)
      ? 'top4'
      : /top\s*1|thang lobby|win lobby/.test(cleaned)
        ? 'win'
        : /kinh te|econ|tich vang/.test(cleaned)
          ? 'econ'
          : /giu streak|win streak|loss streak|chuoi/.test(cleaned)
            ? 'streak'
            : null,
  };
}

// parseStrategyState is called on pre-normalized text in the orchestrator, but
// be defensive when it receives raw Vietnamese ("vàng", "máu") directly.
function normalizeDiacritics(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\p{M}/gu, '');
}

export function isStrategyQuestion(text: string): boolean {
  if (!STRATEGY_MARKERS.test(text) || !QUESTION_FORM.test(text)) return false;
  const state = parseStrategyState(text);
  const hasState = state.level !== null || state.gold !== null || state.hp !== null || state.streak !== null;
  if (hasState || BOARD_CONTEXT.test(text)) return true;
  return ACTION_MARKER.test(text) && !COMP_QUESTION.test(text);
}

export function analyzeStrategy(text: string): StrategyAnalysis | null {
  if (!isStrategyQuestion(text)) return null;
  const state = parseStrategyState(text);
  const missing: StrategyAnalysis['missing'] = [];
  if (state.level === null) missing.push('level');
  if (state.gold === null) missing.push('gold');
  if (state.hp === null) missing.push('hp');

  const maxLevel = state.level !== null && state.level >= MAX_LEVEL;
  const nextLevel = state.level !== null && !maxLevel ? state.level + 1 : null;
  const targetXp = nextLevel !== null ? xpTable.find((entry) => entry.level === nextLevel)?.xp ?? null : null;
  const xpMissing = targetXp !== null ? Math.max(0, targetXp - (state.xp ?? 0)) : null;
  const canLevel = xpMissing !== null && state.gold !== null && state.gold >= xpMissing;
  const goldAfter = canLevel && state.gold !== null && xpMissing !== null ? state.gold - xpMissing : null;
  const odds = state.level !== null ? shopOdds.find((entry) => entry.level === state.level)?.odds ?? null : null;

  let action: StrategyAction = 'clarify';
  if (missing.length === 0 || (maxLevel && state.gold !== null && state.hp !== null)) {
    if (maxLevel) action = state.hp !== null && state.hp <= 35 ? 'roll' : 'hold';
    else if (!canLevel) action = state.hp !== null && state.hp <= 40 ? 'roll' : 'hold';
    else if (state.hp !== null && state.hp <= 35) action = 'roll';
    else action = goldAfter !== null && goldAfter < 10 ? 'hold' : 'level';
  }
  if (missing.length && !(maxLevel && state.gold !== null && state.hp !== null)) action = 'clarify';

  return {
    state,
    nextLevel,
    xpNeeded: targetXp,
    xpMissing,
    costGold: xpMissing,
    goldAfter,
    canLevel,
    maxLevel,
    action,
    odds,
    missing: maxLevel ? missing.filter((entry) => entry !== 'level') : missing,
  };
}

export function buildStrategyPlan(analysis: StrategyAnalysis, lang: Lang, patch: string): StrategyPlan {
  const vi = lang === 'vi';
  const { state, nextLevel, xpNeeded, xpMissing, costGold, goldAfter, canLevel, maxLevel, action, odds } = analysis;

  if (analysis.missing.length) {
    const labels = analysis.missing
      .map((entry) => (entry === 'level' ? (vi ? 'level hiện tại' : 'current level') : entry))
      .join(', ');
    return {
      status: 'needs_clarification',
      answer: vi
        ? `Để tính chính xác, mình cần ${labels}. Bạn cho mình level, số vàng và HP hiện tại nhé (ví dụ: level 7, 40 vàng, 30 HP). Board đang có những tướng nào cũng giúp ích.`
        : `To calculate this I need your ${labels}. Share your level, gold and HP (for example: level 7, 40 gold, 30 HP). The units on your board help too.`,
      sections: [
        {
          heading: vi ? 'Cần thêm dữ kiện' : 'Missing information',
          points: [
            vi
              ? 'Thiếu level/vàng/HP thì không thể tính chi phí lên cấp hay so sánh roll với giữ vàng.'
              : 'Without level, gold and HP I cannot compute level-up cost or compare rolling with holding.',
            vi
              ? 'Trạng thái board và lobby có thể đảo ngược khuyến nghị, nên mình không đoán.'
              : 'Board and lobby state can flip the recommendation, so I will not guess.',
          ],
        },
      ],
      limitations: [
        vi
          ? 'Không có tích hợp đọc game state; mọi số liệu phải do bạn cung cấp.'
          : 'There is no live game-state integration; you must provide the numbers.',
      ],
      followUpQuestions: vi
        ? ['Level 7, 40 vàng, 30 HP nên roll hay lên 8?', 'Board này gồm những tướng nào?', 'Bạn đang nhắm top 4 hay top 1?']
        : ['Level 7, 40 gold, 30 HP: roll or level to 8?', 'Which units are on your board?', 'Are you playing for top 4 or top 1?'],
    };
  }

  const primary = vi
    ? {
        roll: 'Ưu tiên roll để ổn định board và giữ máu.',
        level: `Ưu tiên lên cấp ${nextLevel}.`,
        hold: 'Ưu tiên giữ vàng, chưa roll và chưa lên cấp.',
        clarify: '',
      }[action]
    : {
        roll: 'Prioritise rolling to stabilise your board and preserve HP.',
        level: `Prioritise levelling to ${nextLevel}.`,
        hold: 'Hold your gold for now; do not roll or level yet.',
        clarify: '',
      }[action];

  const costLine = maxLevel
    ? vi
      ? `Bạn đang ở cấp tối đa ${state.level ?? MAX_LEVEL}, không còn mốc lên cấp.`
      : `You are at the max level ${state.level ?? MAX_LEVEL}; there is no further level-up.`
    : vi
      ? `Level ${state.level} → ${nextLevel} cần ${xpNeeded} XP${state.xp ? ` (bạn có ${state.xp} XP, còn thiếu ${xpMissing})` : ''}, tương đương ${costGold} vàng. Bạn có ${state.gold} vàng${canLevel ? `, còn ${goldAfter} vàng sau khi lên` : `, còn thiếu ${(costGold ?? 0) - (state.gold ?? 0)} vàng`}.`
      : `Level ${state.level} → ${nextLevel} needs ${xpNeeded} XP${state.xp ? ` (you have ${state.xp} XP, ${xpMissing} short)` : ''}, which costs ${costGold} gold. You hold ${state.gold} gold${canLevel ? `, leaving ${goldAfter} after the level` : `, ${(costGold ?? 0) - (state.gold ?? 0)} short`}.`;
  const oddsLine =
    odds && state.level !== null
      ? vi
        ? `Ở cấp ${state.level}, mỗi ô shop có ${odds[3]}% tướng 4 vàng và ${odds[4]}% tướng 5 vàng.`
        : `At level ${state.level} each shop slot is ${odds[3]}% for a 4-cost and ${odds[4]}% for a 5-cost.`
      : '';
  const streakLine = state.streak
    ? vi
      ? `Chuỗi hiện tại: ${state.streak.count} ${state.streak.kind === 'win' ? 'thắng' : 'thua'}.`
      : `Current streak: ${state.streak.count} ${state.streak.kind}.`
    : '';
  const basis = [costLine, oddsLine, streakLine].filter(Boolean);

  const tradeoffs = maxLevel
    ? vi
      ? [
          'Bạn đã ở cấp tối đa, nên không còn đánh đổi roll hay lên cấp; chỉ còn roll để nâng sao hay giữ vàng.',
          action === 'roll'
            ? 'Roll lúc này đổi vàng lấy nâng cấp tức thì, nhưng không còn mốc cấp để hướng tới.'
            : 'Giữ vàng giúp tích lũy cho vòng sau; nếu board đang thua nhiều, roll để ổn định vẫn hợp lý.',
        ]
      : [
          'You are at max level, so the roll-versus-level trade-off is gone; it is only roll for upgrades or hold gold.',
          action === 'roll'
            ? 'Rolling trades gold for immediate upgrades, with no further level spike to save for.'
            : 'Holding gold builds for later rounds; if your board keeps losing, stabilising with rolls is still reasonable.',
        ]
    : vi
    ? [
        action === 'level'
          ? `Lên ${nextLevel} tốn ${costGold} vàng và để lại ${goldAfter} vàng, nên bạn khó roll mạnh ngay sau đó.`
          : `Tiết kiệm ${costGold} vàng để lên ${nextLevel} giúp mở pool 4/5 vàng, nhưng phải chịu thêm vài vòng với board hiện tại.`,
        action === 'roll'
          ? `Roll giúp giữ máu ngay, nhưng trì hoãn lên ${nextLevel} và có thể lỡ nhịp tướng 4/5 vàng.`
          : `Roll lúc này có thể tìm nâng cấp tức thì; đổi lại bạn mất vàng dự trữ và bỏ lỡ mốc lên cấp.`,
        state.hp !== null && state.hp <= 35
          ? vi
            ? `HP ${state.hp} đang thấp, nên ưu tiên ổn định; nếu board đã đủ mạnh để thắng liên tục thì lên cấp vẫn hợp lý.`
            : `At ${state.hp} HP, stabilising comes first; if your board already wins rounds, levelling is still reasonable.`
          : vi
            ? `HP ${state.hp} còn thoải mái, nên nghiêng về giữ vàng/đầu tư dài hạn nếu board không thua liên tục.`
            : `At ${state.hp} HP you can afford to invest long-term unless your board keeps losing.`,
      ]
    : [
        action === 'level'
          ? `Levelling to ${nextLevel} costs ${costGold} gold and leaves ${goldAfter}, so you cannot roll hard right after.`
          : `Saving ${costGold} gold for ${nextLevel} opens the 4/5-cost pool but means a few more rounds on your current board.`,
        action === 'roll'
          ? `Rolling stabilises you now but delays ${nextLevel} and can miss the 4/5-cost spike.`
          : `Rolling now can find immediate upgrades but spends your reserve and delays the level spike.`,
        state.hp !== null && state.hp <= 35
          ? `At ${state.hp} HP stabilising comes first; if your board already wins rounds, levelling is still reasonable.`
          : `At ${state.hp} HP you can invest long-term unless your board keeps losing.`,
      ];

  const assumptions = vi
    ? [
        'Chưa có thông tin board/bench, nên hành động chính dựa trên level, vàng và HP.',
        state.xp ? `Dùng ${state.xp} XP hiện tại bạn cung cấp; 1 vàng = 1 XP.` : 'Giả định 0 XP hiện tại; nếu bạn còn XP, chi phí lên cấp thấp hơn.',
        'Không có dữ liệu lobby/đối thủ hay mục tiêu cụ thể của bạn.',
      ]
    : [
        'No board or bench data was provided, so the main action uses level, gold and HP only.',
        state.xp ? `Using the ${state.xp} XP you provided; 1 gold = 1 XP.` : 'Assumes 0 current XP; any XP you already hold lowers the cost.',
        'No lobby, opponent or personal-goal data.',
      ];
  const stillMissing = vi
    ? ['Board hiện tại và bench (để đánh giá độ mạnh)', 'Nhịp lobby/đối thủ', 'Mục tiêu top 4 hay top 1']
    : ['Current board and bench strength', 'Lobby tempo and opponents', 'Top 4 or top 1 goal'];
  const missingPoint = vi ? `Nếu bổ sung: ${stillMissing.join('; ')}.` : `If you add: ${stillMissing.join('; ')}.`;

  return {
    status: 'answered',
    answer: vi
      ? `${primary} ${costLine}${state.hp !== null ? ` HP hiện tại ${state.hp}.` : ''} Mình chưa có board/lobby nên đây là khuyến nghị theo số liệu bạn cung cấp, không phải tỉ lệ thắng.`
      : `${primary} ${costLine}${state.hp !== null ? ` Current HP: ${state.hp}.` : ''} I do not have your board or lobby, so this is a numbers-based recommendation, not a win-rate prediction.`,
    sections: [
      { heading: vi ? 'Khuyến nghị' : 'Recommendation', points: [primary] },
      { heading: vi ? 'Căn cứ' : 'Basis', points: basis },
      { heading: vi ? 'Đánh đổi' : 'Trade-offs', points: tradeoffs },
      { heading: vi ? 'Giả định' : 'Assumptions', points: assumptions },
      { heading: vi ? 'Còn thiếu' : 'Still missing', points: [missingPoint] },
    ],
    limitations: [
      vi
        ? 'Khuyến nghị là heuristic từ bảng XP/shop odds, không phải tỉ lệ thắng hay mô phỏng.'
        : 'This is a heuristic from the XP and shop-odds tables, not a win-rate or simulation.',
      vi
        ? `Số liệu hệ thống theo Set 18 patch ${patch}; giá trị có thể đổi khi game cập nhật.`
        : `System numbers are Set 18 patch ${patch}; values can change with game updates.`,
    ],
    followUpQuestions: vi
      ? ['Board hiện tại gồm những tướng nào?', 'Bạn muốn top 4 hay top 1?', 'Nên roll ở cấp nào?']
      : ['Which units are on your board?', 'Are you playing for top 4 or top 1?', 'At which level should I roll?'],
  };
}
