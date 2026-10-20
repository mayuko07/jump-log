import fs from 'fs';
import path from 'path';

import { Lesson } from './src/types/Lesson';

import {
  aggregateLessons,
  getPastLessons,
} from './src/utils/aggregateLessons';

const CACHE_PATH = path.join(
  process.cwd(),
  'jumpone-mails.json'
);

function main() {
  // ========================================
  // Gmailキャッシュを読み込む
  // ========================================

  if (!fs.existsSync(CACHE_PATH)) {
    console.error(
      'jumpone-mails.json がありません。先に syncGmail.ts を実行してください。'
    );
    return;
  }

  const json = fs.readFileSync(
    CACHE_PATH,
    'utf8'
  );

  const mails: Lesson[] =
    JSON.parse(json);

  const lessons =
    aggregateLessons(mails);

  const past =
    getPastLessons(lessons);

  console.log('');
  console.log('================================');
  console.log(' jump LOG 履歴解析');
  console.log('================================');

  console.log(
    `保存メール: ${mails.length}件`
  );

  console.log(
    `ユニークレッスン: ${lessons.length}件`
  );

  console.log(
    `終了済み: ${past.length}件`
  );

  // ========================================
  // 最終キャンセル
  // ========================================

  const cancelled =
    past.filter(
      (lesson) =>
        lesson.status === 'cancelled'
    );

  // ========================================
  // 最終予約が生きている
  // ========================================

  const active =
    past.filter(
      (lesson) =>
        lesson.status === 'active'
    );

  // ========================================
  // 現在のメールだけでは状態不明
  // ========================================

  const unknown =
    past.filter(
      (lesson) =>
        lesson.status === 'unknown'
    );

  console.log('');
  console.log('===== 最終状態 =====');

  console.log(
    `ACTIVE: ${active.length}件`
  );

  console.log(
    `CANCELLED: ${cancelled.length}件`
  );

  console.log(
    `UNKNOWN: ${unknown.length}件`
  );

  // ========================================
  // 再予約
  // ========================================

  const reRegistered =
    past.filter(
      (lesson) =>
        lesson.cancelled &&
        lesson.status === 'active'
    );

  console.log('');
  console.log('===== キャンセル後の再予約 =====');

  console.log(
    `${reRegistered.length}件`
  );

  for (const lesson of reRegistered) {
    console.log(
      `${lesson.date} ${lesson.startTime} | ` +
      `${lesson.program} | ` +
      `${lesson.instructor}`
    );
  }

  // ========================================
  // 手動確認が必要な候補
  //
  // ACTIVEだが確認メールが残っていない
  // ========================================

  const needsReview =
    active.filter(
      (lesson) =>
        !lesson.confirmed
    );

  console.log('');
  console.log('===== 手動確認候補 =====');

  console.log(
    `${needsReview.length}件`
  );

  for (const lesson of needsReview) {
    console.log(
      `${lesson.date} ${lesson.startTime} | ` +
      `${lesson.program} | ` +
      `${lesson.instructor} | ` +
      `${lesson.studio}`
    );
  }

  // ========================================
  // 今後の予約
  // ========================================

  const pastKeys =
    new Set(past.map((lesson) =>
      [
        lesson.date,
        lesson.startTime,
        lesson.program,
        lesson.instructor,
        lesson.studio,
      ].join('|')
    ));

  const future =
    lessons.filter(
      (lesson) =>
        !pastKeys.has(
          [
            lesson.date,
            lesson.startTime,
            lesson.program,
            lesson.instructor,
            lesson.studio,
          ].join('|')
        ) &&
        lesson.status === 'active'
    );

  console.log('');
  console.log('===== 今後の予約 =====');

  console.log(
    `${future.length}件`
  );

  for (const lesson of future) {
    console.log(
      `${lesson.date} ${lesson.startTime} | ` +
      `${lesson.program} | ` +
      `${lesson.instructor} | ` +
      `${lesson.studio}`
    );
  }
}

main();