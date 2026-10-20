import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppLesson } from '../data/lessonData';

export type ManualAttendanceStatus =
  | 'attended'
  | 'noShow';

export type ManualAttendanceMap = Record<
  string,
  ManualAttendanceStatus
>;

const STORAGE_KEY =
  '@jump_log/manual_attendance_v1';

export function getLessonId(
  lesson: AppLesson
): string {
  return [
    lesson.date,
    lesson.startTime,
    lesson.program,
    lesson.instructor,
    lesson.studio,
  ].join('|');
}

export async function loadManualAttendance(): Promise<ManualAttendanceMap> {
  try {
    const value =
      await AsyncStorage.getItem(STORAGE_KEY);

    if (!value) {
      return {};
    }

    const parsed = JSON.parse(
      value
    ) as Record<string, string>;

    // 以前のバージョンで保存された
    // notAttended が残っている場合は noShow に変換する
    const migrated: ManualAttendanceMap = {};

    for (const [id, status] of Object.entries(parsed)) {
      if (status === 'attended') {
        migrated[id] = 'attended';
      }

      if (
        status === 'noShow' ||
        status === 'notAttended'
      ) {
        migrated[id] = 'noShow';
      }
    }

    return migrated;
  } catch (error) {
    console.error(
      '手動判定の読み込みに失敗しました。',
      error
    );

    return {};
  }
}

export async function saveManualAttendance(
  attendance: ManualAttendanceMap
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(attendance)
    );
  } catch (error) {
    console.error(
      '手動判定の保存に失敗しました。',
      error
    );
  }
}

// 手動で設定した受講判定をすべて削除する。
// Gmail由来のレッスンデータは削除しない。
export async function clearManualAttendance(): Promise<void> {
  try {
    await AsyncStorage.removeItem(
      STORAGE_KEY
    );
  } catch (error) {
    console.error(
      '手動判定のリセットに失敗しました。',
      error
    );
  }
}