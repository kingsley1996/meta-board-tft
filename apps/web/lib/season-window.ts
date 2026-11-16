// A new season's PBE runs while the live game is still on the previous set, so "which season is
// coming" is carried by the fetched feed (`pbe.json.set`) while its *name* is typed by a person
// (`set.json.upcoming`). The two are kept apart on purpose: the number is measurable, the name is
// what Riot announces, and an unlabeled or stale label is a rotation bug rather than a typo.
//
// Nothing here invents a Vietnamese name. A season whose translation Riot has not published yet
// shows the English one, the same rule a patch row follows.
import type { Localized } from '@tftiq/shared/patch-notes';

export type UpcomingSeason = { number: number; name: Localized };
export type SeasonFile = { number: number; upcoming?: UpcomingSeason | null };

/**
 * The season the preview board is describing, or null when the feed still measures the live one.
 * Throws when the window is open without a name to show, and when a name outlives the window —
 * the field lives for four to six weeks and is deleted on launch day.
 */
export function previewSeason(season: SeasonFile, pbeSet: number | null): UpcomingSeason | null {
  const upcoming = season.upcoming ?? null;
  const window = pbeSet !== null && pbeSet > season.number;

  if (!window) {
    if (upcoming) {
      throw new Error(
        `set.json còn "upcoming" mùa ${upcoming.number} trong khi feed preview đã trở lại mùa ${pbeSet ?? season.number} — xoá "upcoming" vào ngày bản mới lên live`,
      );
    }
    return null;
  }
  if (!upcoming) {
    throw new Error(
      `feed preview đang mô tả mùa ${pbeSet} trong khi set.json chưa ghi tên — thêm "upcoming" với đúng tên Riot công bố, không tự dịch`,
    );
  }
  if (upcoming.number !== pbeSet) {
    throw new Error(
      `set.json.upcoming ghi mùa ${upcoming.number} trong khi feed preview đang ở mùa ${pbeSet} — sửa set.json theo feed`,
    );
  }
  return upcoming;
}
