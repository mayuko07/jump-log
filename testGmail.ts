import { getJumpOneMails } from './src/services/gmail';

import {
  aggregateLessons,
  getPastLessons,
} from './src/utils/aggregateLessons';

async function main() {
  const mails = await getJumpOneMails();

  const lessons = aggregateLessons(mails);
  const past = getPastLessons(lessons);

  console.log('');
  console.log('================================');
  console.log('   時系列集約テスト');
  console.log('================================');

  console.log(`メール総数: ${mails.length}件`);
  console.log(`ユニークレッスン: ${lessons.length}件`);
  console.log(`終了済みレッスン: ${past.length}件`);

  // ========================================
  // キャンセル歴があるのに最終状態がactive
  //
  // つまり
  // 予約 → キャンセル → 再予約
  // が起きた可能性が高いレッスン
  // ========================================

  const reRegistered = lessons.filter(
    (lesson) =>
      lesson.cancelled &&
      lesson.status === 'active'
  );

  console.log('');
  console.log('================================');
  console.log(' キャンセル後に再予約されたレッスン');
  console.log('================================');

  console.log(`合計: ${reRegistered.length}件`);
  console.log('');

  reRegistered.forEach((lesson, index) => {
    console.log(
      `${index + 1}. ` +
      `${lesson.date} ${lesson.startTime} | ` +
      `${lesson.program} | ` +
      `${lesson.instructor} | ` +
      `${lesson.studio} | ` +
      `メール${lesson.eventCount}通`
    );
  });

  // ========================================
  // 最終状態
  // ========================================

  const active =
    past.filter(
      (lesson) =>
        lesson.status === 'active'
    );

  const cancelled =
    past.filter(
      (lesson) =>
        lesson.status === 'cancelled'
    );

  const unknown =
    past.filter(
      (lesson) =>
        lesson.status === 'unknown'
    );

  console.log('');
  console.log('================================');
  console.log('   終了済みレッスンの最終状態');
  console.log('================================');

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
  // ACTIVEのうち確認メールあり
  // ========================================

  const confirmedActive =
    active.filter(
      (lesson) => lesson.confirmed
    );

  // ACTIVEだが確認メールが残っていない
  const unconfirmedActive =
    active.filter(
      (lesson) => !lesson.confirmed
    );

  console.log('');
  console.log('================================');
  console.log('   ACTIVEの内訳');
  console.log('================================');

  console.log(
    `確認メールあり: ${confirmedActive.length}件`
  );

  console.log(
    `確認メールなし: ${unconfirmedActive.length}件`
  );

  // ========================================
  // 確認メールなしACTIVE一覧
  // ========================================

  console.log('');
  console.log('================================');
  console.log(' ACTIVEだが確認メールなし');
  console.log('================================');

  unconfirmedActive.forEach(
    (lesson, index) => {

      console.log(
        `${index + 1}. ` +
        `${lesson.date} ${lesson.startTime} | ` +
        `${lesson.program} | ` +
        `${lesson.instructor} | ` +
        `${lesson.studio}`
      );
    }
  );
}

main().catch(console.error);