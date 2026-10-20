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

const OUTPUT_PATH = path.join(
  process.cwd(),
  'src',
  'data',
  'lessonData.ts'
);

function main() {
  if (!fs.existsSync(CACHE_PATH)) {
    console.error(
      'jumpone-mails.json がありません。'
    );
    return;
  }

  const mails: Lesson[] = JSON.parse(
    fs.readFileSync(CACHE_PATH, 'utf8')
  );

  const lessons = aggregateLessons(mails);
  const past = getPastLessons(lessons);

  /*
   * 現段階では
   * Gmailから完全に受講確定できないため、
   * 終了済みレッスンを状態付きでアプリへ渡す。
   */
  const appLessons = past.map((lesson) => {
    let evidence:
      | 'confirmed'
      | 'reserved'
      | 'cancelled'
      | 'unknown';

    if (lesson.status === 'cancelled') {
      evidence = 'cancelled';
    } else if (
      lesson.status === 'active' &&
      lesson.confirmed
    ) {
      evidence = 'confirmed';
    } else if (lesson.status === 'active') {
      evidence = 'reserved';
    } else {
      evidence = 'unknown';
    }

    return {
      date: lesson.date,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      program: lesson.program,
      instructor: lesson.instructor,
      studio: lesson.studio,
      seat: lesson.seat ?? null,
      evidence,
    };
  });

  const output = `
// このファイルは generateAppData.ts から自動生成されます。
// 直接編集しないでください。

export type AppLessonEvidence =
  | 'confirmed'
  | 'reserved'
  | 'cancelled'
  | 'unknown';

export type AppLesson = {
  date: string;
  startTime: string;
  endTime: string;
  program: string;
  instructor: string;
  studio: string;
  seat: number | null;
  evidence: AppLessonEvidence;
};

export const lessonData: AppLesson[] =
${JSON.stringify(appLessons, null, 2)};
`;

  fs.mkdirSync(
    path.dirname(OUTPUT_PATH),
    {
      recursive: true,
    }
  );

  fs.writeFileSync(
    OUTPUT_PATH,
    output,
    'utf8'
  );

  console.log('');
  console.log('================================');
  console.log(' jump LOG アプリデータ生成完了');
  console.log('================================');
  console.log(`メール: ${mails.length}件`);
  console.log(`終了済みレッスン: ${appLessons.length}件`);
  console.log('');
  console.log(
    'src/data/lessonData.ts を生成しました。'
  );
}

main();