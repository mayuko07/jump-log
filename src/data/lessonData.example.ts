
// GitHub公開用のサンプルデータです。
// 実際の予約・受講履歴は含まれていません。
// 初回セットアップ時に lessonData.ts にコピーして使用します。

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

export const lessonData: AppLesson[] = [
  {
    date: '2026-09-10',
    startTime: '10:00',
    endTime: '10:45',
    program: 'Sample Program A',
    instructor: 'Sample Instructor A',
    studio: 'Sample Studio',
    seat: 1,
    evidence: 'confirmed',
  },
  {
    date: '2026-09-12',
    startTime: '11:00',
    endTime: '11:45',
    program: 'Sample Program B',
    instructor: 'Sample Instructor B',
    studio: 'Sample Studio',
    seat: 2,
    evidence: 'reserved',
  },
  {
    date: '2026-09-14',
    startTime: '14:00',
    endTime: '14:45',
    program: 'Sample Program C',
    instructor: 'Sample Instructor A',
    studio: 'Sample Studio',
    seat: 3,
    evidence: 'cancelled',
  },
];
