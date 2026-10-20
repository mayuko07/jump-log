import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppLesson } from '../data/lessonData';

export type ManualLesson = AppLesson & {
  manualId: string;
  source: 'manual';
};

export type LessonNotesMap = Record<string, string>;

const MANUAL_LESSONS_KEY = '@jump_log/manual_lessons_v1';
const LESSON_NOTES_KEY = '@jump_log/lesson_notes_v1';

export async function loadManualLessons(): Promise<ManualLesson[]> {
  const raw = await AsyncStorage.getItem(MANUAL_LESSONS_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as ManualLesson[];
  } catch {
    return [];
  }
}

export async function saveManualLessons(
  lessons: ManualLesson[]
): Promise<void> {
  await AsyncStorage.setItem(
    MANUAL_LESSONS_KEY,
    JSON.stringify(lessons)
  );
}

export async function loadLessonNotes(): Promise<LessonNotesMap> {
  const raw = await AsyncStorage.getItem(LESSON_NOTES_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as LessonNotesMap;
  } catch {
    return {};
  }
}

export async function saveLessonNotes(
  notes: LessonNotesMap
): Promise<void> {
  await AsyncStorage.setItem(
    LESSON_NOTES_KEY,
    JSON.stringify(notes)
  );
}
