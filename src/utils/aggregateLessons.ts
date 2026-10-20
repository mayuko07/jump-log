import { Lesson } from '../types/Lesson';

export type LessonStatus =
  | 'active'
  | 'cancelled'
  | 'unknown';

export type AggregatedLesson = {
  date: string;
  startTime: string;
  endTime: string;
  program: string;
  instructor: string;
  studio: string;
  seat?: number;

  registered: boolean;
  confirmed: boolean;
  cancelled: boolean;

  status: LessonStatus;

  // このレッスンに関係するメール数
  eventCount: number;

  // 最後に届いた関連メール
  lastReceivedAt?: string;
};

// ========================================
// 同じレッスンを識別するキー
//
// seatはキーに入れない。
// キャンセル→再予約で座席が変わっても
// 同じレッスンとして扱うため。
// ========================================

function lessonKey(lesson: Lesson): string {
  return [
    lesson.date,
    lesson.startTime,
    lesson.program.trim().toLowerCase(),
    lesson.instructor.trim().toLowerCase(),
    lesson.studio.trim().toLowerCase(),
  ].join('|');
}

// ========================================
// Gmail受信日時で並べる
// ========================================

function sortByReceivedAt(
  a: Lesson,
  b: Lesson
): number {
  const timeA = a.receivedAt
    ? new Date(a.receivedAt).getTime()
    : 0;

  const timeB = b.receivedAt
    ? new Date(b.receivedAt).getTime()
    : 0;

  return timeA - timeB;
}

// ========================================
// メールをレッスン単位に統合
// ========================================

export function aggregateLessons(
  mails: Lesson[]
): AggregatedLesson[] {

  const groups =
    new Map<string, Lesson[]>();

  // まず同じレッスンごとにメールをまとめる
  for (const mail of mails) {
    const key = lessonKey(mail);

    const group =
      groups.get(key) ?? [];

    group.push(mail);

    groups.set(key, group);
  }

  const result: AggregatedLesson[] = [];

  // ========================================
  // 各レッスンのメールを時系列で処理
  // ========================================

  for (const events of groups.values()) {

    events.sort(sortByReceivedAt);

    let active = false;

    let everRegistered = false;
    let everConfirmed = false;
    let everCancelled = false;

    let latestSeat: number | undefined;

    for (const event of events) {

      if (event.seat !== undefined) {
        latestSeat = event.seat;
      }

      // 予約登録
      //
      // キャンセル後に再登録された場合、
      // 再びactiveに戻す。
      if (event.registered) {
        everRegistered = true;
        active = true;
      }

      // 予約確認
      //
      // 「確認メールはキャンセル後にも
      // 届く可能性がある」ため、
      // active状態そのものは変更しない。
      if (event.confirmed) {
        everConfirmed = true;
      }

      // キャンセル
      if (event.cancelled) {
        everCancelled = true;
        active = false;
      }
    }

    const latest =
      events[events.length - 1];

    let status: LessonStatus;

    if (active) {
      status = 'active';
    } else if (everCancelled) {
      status = 'cancelled';
    } else {
      status = 'unknown';
    }

    result.push({
      date: latest.date,
      startTime: latest.startTime,
      endTime: latest.endTime,
      program: latest.program,
      instructor: latest.instructor,
      studio: latest.studio,
      seat: latestSeat,

      registered: everRegistered,
      confirmed: everConfirmed,
      cancelled: everCancelled,

      status,

      eventCount: events.length,

      lastReceivedAt:
        latest.receivedAt,
    });
  }

  // 新しいレッスンから順
  return result.sort((a, b) => {
    const dateA =
      `${a.date}T${a.startTime}`;

    const dateB =
      `${b.date}T${b.startTime}`;

    return dateB.localeCompare(dateA);
  });
}

// ========================================
// 終了済みレッスン
//
// JUMP ONEは日本なのでJSTを明示する。
// ========================================

export function getPastLessons(
  lessons: AggregatedLesson[]
): AggregatedLesson[] {

  const now = new Date();

  return lessons.filter((lesson) => {

    const end =
      new Date(
        `${lesson.date}T${lesson.endTime}:00+09:00`
      );

    return end < now;
  });
}