import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Keyboard,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import {
  AppLesson,
  lessonData,
} from './src/data/lessonData';

import {
  clearManualAttendance,
  getLessonId,
  loadManualAttendance,
  ManualAttendanceMap,
  saveManualAttendance,
} from './src/utils/manualAttendance';

import {
  LessonNotesMap,
  loadLessonNotes,
  loadManualLessons,
  ManualLesson,
  saveLessonNotes,
  saveManualLessons,
} from './src/utils/lessonRecords';


type Screen =
  | 'home'
  | 'history'
  | 'calendar'
  | 'body'
  | 'review'
  | 'add'
  | 'ir'
  | 'program'
  | 'studio'
  | 'import';

type CountItem = {
  name: string;
  count: number;
};

type HistoryFilter =
  | 'all'
  | 'review'
  | 'attended'
  | 'noShow'
  | 'cancelled';

type PeriodMode =
  | 'all'
  | 'year'
  | 'month';

type TrackedLesson = AppLesson & {
  manualId?: string;
  source?: 'gmail' | 'manual';
};

type LessonCaloriesMap = Record<string, number>;

type BodyMetric = {
  date: string;
  weight?: number;
  bodyFat?: number;
  source: 'manual';
};

type BodyMetricsMap = Record<string, BodyMetric>;

const LESSON_CALORIES_STORAGE_KEY =
  '@jump_log/lesson_calories_v1';

const BODY_METRICS_STORAGE_KEY =
  '@jump_log/body_metrics_v1';

async function loadBodyMetrics(): Promise<BodyMetricsMap> {
  try {
    const raw = await AsyncStorage.getItem(BODY_METRICS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as BodyMetricsMap : {};
  } catch {
    return {};
  }
}

async function saveBodyMetrics(metrics: BodyMetricsMap) {
  await AsyncStorage.setItem(
    BODY_METRICS_STORAGE_KEY,
    JSON.stringify(metrics)
  );
}

async function loadLessonCalories(): Promise<LessonCaloriesMap> {
  try {
    const raw = await AsyncStorage.getItem(
      LESSON_CALORIES_STORAGE_KEY
    );

    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: LessonCaloriesMap = {};

    Object.entries(parsed).forEach(([key, value]) => {
      if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0
      ) {
        result[key] = value;
      }
    });

    return result;
  } catch {
    return {};
  }
}

async function saveLessonCalories(
  calories: LessonCaloriesMap
): Promise<void> {
  await AsyncStorage.setItem(
    LESSON_CALORIES_STORAGE_KEY,
    JSON.stringify(calories)
  );
}

function getTrackedLessonId(
  lesson: TrackedLesson
): string {
  if (lesson.manualId) {
    return `manual:${lesson.manualId}`;
  }

  return `gmail:${getLessonId(lesson)}`;
}

function normalizeMasterValue(
  value: string
): string {
  return value.trim().replace(/\s+/g, ' ');
}

type ProgramColor = {
  main: string;
  soft: string;
};

function getProgramColor(program: string): ProgramColor {
  const value = normalizeMasterValue(program);

  // jumpone-jockeys の表示画像から実測したPROGRAMカラー。
  if (/^Rj0\b/i.test(value)) return { main: '#FF99FF', soft: '#FF99FF' };
  if (/^Rj1\b/i.test(value)) return { main: '#FF66CC', soft: '#FF66CC' };
  if (/^Rj2\b/i.test(value)) return { main: '#FF0066', soft: '#FF0066' };
  if (/^Rj3\b/i.test(value)) return { main: '#FF0000', soft: '#FF0000' };

  if (/^Dj1\b/i.test(value)) return { main: '#33CCFF', soft: '#33CCFF' };
  if (/^Dj2\b/i.test(value)) return { main: '#0066FF', soft: '#0066FF' };

  if (/^Bj1\b/i.test(value)) return { main: '#66FF66', soft: '#66FF66' };
  if (/^Bj2\b/i.test(value)) return { main: '#009900', soft: '#009900' };

  // ヨガ系はサイト同様、白背景＋文字色として扱うためmainのみ使用。
  if (/^EYB\b/i.test(value)) return { main: '#FF00FF', soft: '#FFFFFF' };
  if (/^RYB\b/i.test(value)) return { main: '#3CB371', soft: '#FFFFFF' };

  // Jump MIX
  if (/^(jM|jump MIX)\b/i.test(value)) return { main: '#FFCCFF', soft: '#FFCCFF' };

  // PILATES PROGRAMはサイト表示に合わせて黄色で統一。
  if (/^(UPP|LOW)\b/i.test(value)) return { main: '#FFFF00', soft: '#FFFF00' };

  // 画像で実色を確認できていないPROGRAMは推測色を付けない。
  return { main: '#666666', soft: '#F1F1F1' };
}


function getLessonProgramColor(
  lesson: TrackedLesson
): ProgramColor {
  if (isPilates(lesson)) {
    return {
      main: '#FFFF00',
      soft: '#FFFF00',
    };
  }

  return getProgramColor(lesson.program);
}

// ========================================
// 基本判定
// ========================================

function isPilates(lesson: TrackedLesson): boolean {
  return lesson.studio
    .toLowerCase()
    .includes('pilates');
}

function getHistoryLessons(): AppLesson[] {
  return lessonData;
}

function getAttendanceCandidates(): AppLesson[] {
  return lessonData.filter(
    (lesson) =>
      lesson.evidence !== 'cancelled'
  );
}

// ========================================
// Gmail情報の表示
// ========================================

function getMailEvidenceLabel(
  lesson: TrackedLesson
): string {
  if (lesson.source === 'manual') {
    return '手動で追加';
  }

  switch (lesson.evidence) {
    case 'confirmed':
      return 'Gmail: 確認メールあり';

    case 'reserved':
      return 'Gmail: 予約登録あり';

    case 'cancelled':
      return 'Gmail: キャンセル確認';

    case 'unknown':
      return 'Gmail: 情報不足';

    default:
      return '';
  }
}

// ========================================
// 集計
// ========================================

function countByInstructor(
  lessons: TrackedLesson[]
): CountItem[] {
  const counts = new Map<string, number>();

  for (const lesson of lessons) {
    counts.set(
      lesson.instructor,
      (counts.get(lesson.instructor) ?? 0) + 1
    );
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function countByProgram(
  lessons: TrackedLesson[]
): CountItem[] {
  const counts = new Map<string, number>();

  for (const lesson of lessons) {
    counts.set(
      lesson.program,
      (counts.get(lesson.program) ?? 0) + 1
    );
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}


function countByStudio(
  lessons: TrackedLesson[]
): CountItem[] {
  const counts = new Map<string, number>();

  for (const lesson of lessons) {
    const studio =
      normalizeMasterValue(lesson.studio) ||
      '店舗不明';

    counts.set(
      studio,
      (counts.get(studio) ?? 0) + 1
    );
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name)
    );
}


type ImportRow = {
  rowNumber: number;
  date: string;
  startTime: string;
  program: string;
  instructor: string;
  studio: string;
  note: string;
  valid: boolean;
  error: string;
};

type ImportColumnMap = {
  date: string | null;
  startTime: string | null;
  program: string | null;
  instructor: string | null;
  studio: string | null;
  note: string | null;
};

function normalizeImportHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s　_\-・:：/\\()[\]（）]/g, '');
}

function findImportColumn(
  headers: string[],
  candidates: string[]
): string | null {
  const normalizedCandidates = candidates.map(
    normalizeImportHeader
  );

  for (const header of headers) {
    const normalized = normalizeImportHeader(header);
    if (normalizedCandidates.includes(normalized)) {
      return header;
    }
  }

  for (const header of headers) {
    const normalized = normalizeImportHeader(header);
    if (
      normalizedCandidates.some(
        (candidate) =>
          candidate.length >= 2 &&
          normalized.includes(candidate)
      )
    ) {
      return header;
    }
  }

  return null;
}

function detectImportColumns(
  headers: string[]
): ImportColumnMap {
  return {
    date: findImportColumn(headers, [
      'date',
      '日付',
      '受講日',
      'レッスン日',
      'lessondate',
    ]),
    startTime: findImportColumn(headers, [
      'starttime',
      'time',
      '開始時間',
      '開始時刻',
      '時間',
      '時刻',
      'レッスン時間',
    ]),
    program: findImportColumn(headers, [
      'program',
      'programname',
      'プログラム',
      'プログラム名',
      'lesson',
      'lessonname',
      'レッスン',
      'レッスン名',
    ]),
    instructor: findImportColumn(headers, [
      'instructor',
      'ir',
      'instructorname',
      'インストラクター',
      'インストラクター名',
      '担当ir',
      '担当',
    ]),
    studio: findImportColumn(headers, [
      'studio',
      'shop',
      'store',
      '店舗',
      '店舗名',
      'スタジオ',
      'スタジオ名',
    ]),
    note: findImportColumn(headers, [
      'note',
      'memo',
      'comment',
      '感想',
      'メモ',
      '備考',
    ]),
  };
}

function excelSerialToDateString(value: number): string {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return '';

  return (
    `${parsed.y}-` +
    `${String(parsed.m).padStart(2, '0')}-` +
    `${String(parsed.d).padStart(2, '0')}`
  );
}

function normalizeImportedDate(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return excelSerialToDateString(value);
  }

  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const normalized = raw
    .replace(/[年月.]/g, '-')
    .replace(/日/g, '')
    .replace(/\//g, '-')
    .replace(/\s.*$/, '');

  const match = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  return (
    `${year}-` +
    `${String(month).padStart(2, '0')}-` +
    `${String(day).padStart(2, '0')}`
  );
}

function normalizeImportedTime(value: unknown): string {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    const fraction = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(
      fraction * 24 * 60
    ) % (24 * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;

    return (
      `${String(hour).padStart(2, '0')}:` +
      `${String(minute).padStart(2, '0')}`
    );
  }

  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const colonMatch = raw.match(
    /(\d{1,2})\s*[:：]\s*(\d{1,2})/
  );
  if (colonMatch) {
    const hour = Number(colonMatch[1]);
    const minute = Number(colonMatch[2]);
    if (hour <= 23 && minute <= 59) {
      return (
        `${String(hour).padStart(2, '0')}:` +
        `${String(minute).padStart(2, '0')}`
      );
    }
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 3 || digits.length === 4) {
    const hour = Number(digits.slice(0, -2));
    const minute = Number(digits.slice(-2));
    if (hour <= 23 && minute <= 59) {
      return (
        `${String(hour).padStart(2, '0')}:` +
        `${String(minute).padStart(2, '0')}`
      );
    }
  }

  return '';
}

function makeImportRows(
  rawRows: Record<string, unknown>[],
  columns: ImportColumnMap
): ImportRow[] {
  return rawRows.map((row, index) => {
    const date = columns.date
      ? normalizeImportedDate(row[columns.date])
      : '';
    const startTime = columns.startTime
      ? normalizeImportedTime(row[columns.startTime])
      : '';
    const program = columns.program
      ? normalizeMasterValue(
          String(row[columns.program] ?? '')
        )
      : '';
    const instructor = columns.instructor
      ? normalizeMasterValue(
          String(row[columns.instructor] ?? '')
        )
      : '';
    const studio = columns.studio
      ? normalizeMasterValue(
          String(row[columns.studio] ?? '')
        )
      : '';
    const note = columns.note
      ? String(row[columns.note] ?? '')
          .trim()
          .slice(0, 100)
      : '';

    const missing: string[] = [];
    if (!date) missing.push('日付');
    if (!startTime) missing.push('時間');
    if (!program) missing.push('PROGRAM');
    if (!instructor) missing.push('IR');
    if (!studio) missing.push('店舗');

    return {
      rowNumber: index + 2,
      date,
      startTime,
      program,
      instructor,
      studio,
      note,
      valid: missing.length === 0,
      error:
        missing.length > 0
          ? `${missing.join('・')}を確認`
          : '',
    };
  });
}

function importDuplicateKey(
  lesson: Pick<
    TrackedLesson,
    'date' | 'startTime' | 'program' | 'instructor' | 'studio'
  >
): string {
  return [
    lesson.date,
    lesson.startTime,
    normalizeMasterValue(lesson.program).toLowerCase(),
    normalizeMasterValue(lesson.instructor).toLowerCase(),
    normalizeMasterValue(lesson.studio).toLowerCase(),
  ].join('|');
}


// ========================================
// App
// ========================================

export default function App() {
  const [screen, setScreen] =
    useState<Screen>('home');

  const [
    manualAttendance,
    setManualAttendance,
  ] = useState<ManualAttendanceMap>({});

  const [manualLessons, setManualLessons] =
    useState<ManualLesson[]>([]);

  const [lessonNotes, setLessonNotes] =
    useState<LessonNotesMap>({});

  const [lessonCalories, setLessonCalories] =
    useState<LessonCaloriesMap>({});

  const [bodyMetrics, setBodyMetrics] =
    useState<BodyMetricsMap>({});

  const [loaded, setLoaded] =
    useState(false);

  const [googleConnected, setGoogleConnected] =
    useState(false);

  const [googleEmail, setGoogleEmail] =
    useState<string | null>(null);

  const [googleAuthBusy, setGoogleAuthBusy] =
    useState(false);

  useEffect(() => {
    async function load() {
      const [
        savedAttendance,
        savedManualLessons,
        savedNotes,
        savedCalories,
        savedBodyMetrics,
      ] = await Promise.all([
        loadManualAttendance(),
        loadManualLessons(),
        loadLessonNotes(),
        loadLessonCalories(),
        loadBodyMetrics(),
      ]);

      setManualAttendance(savedAttendance);
      setManualLessons(savedManualLessons);
      setLessonNotes(savedNotes);
      setLessonCalories(savedCalories);
      setBodyMetrics(savedBodyMetrics);

      // Expo Go UI preview: native Google Sign-In is disabled.
      setGoogleConnected(false);
      setGoogleEmail(null);

      setLoaded(true);
    }

    load();
  }, []);

  // Gmail由来 + 手動追加を同じHISTORYで扱う
  const historyLessons = useMemo<TrackedLesson[]>(
    () => [
      ...lessonData.map((lesson) => ({
        ...lesson,
        source: 'gmail' as const,
      })),
      ...manualLessons,
    ].sort((a, b) =>
      `${b.date} ${b.startTime}`.localeCompare(
        `${a.date} ${a.startTime}`
      )
    ),
    [manualLessons]
  );

  // Gmailキャンセル以外を受講判定対象にする
  const candidates = useMemo(
    () =>
      historyLessons.filter(
        (lesson) =>
          lesson.evidence !== 'cancelled'
      ),
    [historyLessons]
  );

  // 受講済み
  const attendedLessons = useMemo(
    () =>
      candidates.filter(
        (lesson) =>
          manualAttendance[
            getTrackedLessonId(lesson)
          ] === 'attended'
      ),
    [candidates, manualAttendance]
  );

  // 無断キャンセル
  const noShowCount = useMemo(
    () =>
      candidates.filter(
        (lesson) =>
          manualAttendance[
            getTrackedLessonId(lesson)
          ] === 'noShow'
      ).length,
    [candidates, manualAttendance]
  );

  // 未確認
  const reviewCount =
    candidates.length -
    attendedLessons.length -
    noShowCount;
   // 未確認のうち、Gmail確認メールがある件数
const confirmedReviewCount =
  candidates.filter(
    (lesson) =>
      lesson.evidence === 'confirmed' &&
      manualAttendance[
        getTrackedLessonId(lesson)
      ] === undefined
  ).length;

    // 未確認のうち、それ以外
const otherReviewCount =
  reviewCount -
  confirmedReviewCount;

  // Gmailキャンセル
  const cancelledCount =
    historyLessons.filter(
      (lesson) =>
        lesson.evidence === 'cancelled'
    ).length;

  // ========================================
  // 個別の手動判定
  // ========================================

  async function setAttendance(
    lesson: TrackedLesson,
    status:
      | 'attended'
      | 'noShow'
      | undefined
  ) {
    if (
      lesson.evidence === 'cancelled'
    ) {
      return;
    }

    const id = getTrackedLessonId(lesson);

    const next: ManualAttendanceMap = {
      ...manualAttendance,
    };

    if (status === undefined) {
      delete next[id];
    } else {
      next[id] = status;
    }

    setManualAttendance(next);
    await saveManualAttendance(next);
  }

  async function addManualLesson(
    lesson: ManualLesson,
    note: string
  ) {
    const nextLessons = [
      ...manualLessons,
      lesson,
    ];

    setManualLessons(nextLessons);
    await saveManualLessons(nextLessons);

    const id = getTrackedLessonId(lesson);
    const nextAttendance: ManualAttendanceMap = {
      ...manualAttendance,
      [id]: 'attended',
    };

    setManualAttendance(nextAttendance);
    await saveManualAttendance(nextAttendance);

    if (note.trim()) {
      const nextNotes = {
        ...lessonNotes,
        [id]: note.trim().slice(0, 100),
      };
      setLessonNotes(nextNotes);
      await saveLessonNotes(nextNotes);
    }

    setScreen('history');
  }


  async function importLessons(
    rows: ImportRow[]
  ): Promise<{
    imported: number;
    duplicates: number;
  }> {
    const existingKeys = new Set(
      historyLessons.map(importDuplicateKey)
    );

    const accepted: ImportRow[] = [];
    let duplicates = 0;

    for (const row of rows) {
      if (!row.valid) continue;

      const key = importDuplicateKey({
        date: row.date,
        startTime: row.startTime,
        program: row.program,
        instructor: row.instructor,
        studio: row.studio,
      });

      if (existingKeys.has(key)) {
        duplicates += 1;
        continue;
      }

      existingKeys.add(key);
      accepted.push(row);
    }

    if (accepted.length === 0) {
      return { imported: 0, duplicates };
    }

    const stamp = Date.now();

    const newLessons: ManualLesson[] =
      accepted.map((row, index) => ({
        manualId:
          `import-${stamp}-${index}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
        source: 'manual',
        date: row.date,
        startTime: row.startTime,
        endTime: '',
        program: row.program,
        instructor: row.instructor,
        studio: row.studio,
        seat: null,
        evidence: 'unknown',
      }));

    const nextLessons = [
      ...manualLessons,
      ...newLessons,
    ];

    const nextAttendance: ManualAttendanceMap = {
      ...manualAttendance,
    };

    const nextNotes: LessonNotesMap = {
      ...lessonNotes,
    };

    newLessons.forEach((lesson, index) => {
      const id = getTrackedLessonId(lesson);
      nextAttendance[id] = 'attended';

      const note = accepted[index].note;
      if (note) {
        nextNotes[id] = note;
      }
    });

    setManualLessons(nextLessons);
    setManualAttendance(nextAttendance);
    setLessonNotes(nextNotes);

    await Promise.all([
      saveManualLessons(nextLessons),
      saveManualAttendance(nextAttendance),
      saveLessonNotes(nextNotes),
    ]);

    return {
      imported: newLessons.length,
      duplicates,
    };
  }

  async function saveNote(
    lesson: TrackedLesson,
    note: string
  ) {
    const id = getTrackedLessonId(lesson);
    const next = { ...lessonNotes };

    if (note.trim()) {
      next[id] = note.trim().slice(0, 100);
    } else {
      delete next[id];
    }

    setLessonNotes(next);
    await saveLessonNotes(next);
  }

  async function setLessonCaloriesValue(
    lesson: TrackedLesson,
    calories: number | undefined
  ) {
    const id = getTrackedLessonId(lesson);
    const next = { ...lessonCalories };

    if (calories === undefined) {
      delete next[id];
    } else {
      next[id] = calories;
    }

    setLessonCalories(next);
    await saveLessonCalories(next);
  }

  async function saveBodyMetric(metric: BodyMetric) {
    const next = { ...bodyMetrics, [metric.date]: metric };
    setBodyMetrics(next);
    await saveBodyMetrics(next);
  }

  async function deleteBodyMetric(date: string) {
    const next = { ...bodyMetrics };
    delete next[date];
    setBodyMetrics(next);
    await saveBodyMetrics(next);
  }

  // ========================================
  // 手動判定を全部リセット
  // ========================================

  function resetAttendance() {
    Alert.alert(
      '手動判定をリセット',
      '「受講済み」と「無断キャンセル」の手動設定をすべて未確認に戻します。\n\nGmailから復元した予約・キャンセル情報は削除されません。',
      [
        {
          text: 'やめる',
          style: 'cancel',
        },
        {
          text: 'リセットする',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '本当にリセットしますか？',
              'すべての手動判定を未確認に戻します。',
              [
                {
                  text: 'やめる',
                  style: 'cancel',
                },
                {
                  text: 'リセットを実行',
                  style: 'destructive',
                  onPress: async () => {
                    await clearManualAttendance();
                    setManualAttendance({});

                    Alert.alert(
                      'リセット完了',
                      '手動判定をすべて未確認に戻しました。'
                    );
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  // ========================================
  // 読み込み中
  // ========================================

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>
            jump LOG
          </Text>
        </View>

        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  // ========================================
  // 各画面
  // ========================================

  if (screen === 'history') {
    return (
      <HistoryScreen
        lessons={historyLessons}
        manualAttendance={
          manualAttendance
        }
        lessonNotes={lessonNotes}
        lessonCalories={lessonCalories}
        onSetAttendance={
          setAttendance
        }
        onSetLessonCalories={setLessonCaloriesValue}
        onSaveNote={saveNote}
        onAddLesson={() =>
          setScreen('add')
        }
        onOpenQuickReview={() =>
          setScreen('review')
        }
        onResetAttendance={
          resetAttendance
        }
        onBack={() =>
          setScreen('home')
        }
      />
    );
  }

  if (screen === 'review') {
    return (
      <QuickReviewScreen
        lessons={candidates}
        manualAttendance={manualAttendance}
        lessonNotes={lessonNotes}
        onSetAttendance={setAttendance}
        onSaveNote={saveNote}
        onBack={() =>
          setScreen('history')
        }
      />
    );
  }

  if (screen === 'add') {
    return (
      <AddLessonScreen
        existingLessons={historyLessons}
        onSave={addManualLesson}
        onBack={() =>
          setScreen('history')
        }
      />
    );
  }

  if (screen === 'body') {
    return (
      <BodyMetricsScreen
        metrics={bodyMetrics}
        lessons={attendedLessons}
        lessonCalories={lessonCalories}
        onSave={saveBodyMetric}
        onDelete={deleteBodyMetric}
        onBack={() => setScreen('home')}
      />
    );
  }

  if (screen === 'calendar') {
    return (
      <CalendarScreen
        lessons={attendedLessons}
        lessonCalories={lessonCalories}
        onSetLessonCalories={setLessonCaloriesValue}
        onBack={() =>
          setScreen('home')
        }
      />
    );
  }

  if (screen === 'import') {
    return (
      <ImportLessonsScreen
        existingLessons={historyLessons}
        onImport={importLessons}
        onBack={() =>
          setScreen('home')
        }
        onOpenHistory={() =>
          setScreen('history')
        }
      />
    );
  }

  if (screen === 'studio') {
    return (
      <StudioScreen
        lessons={attendedLessons}
        onBack={() =>
          setScreen('home')
        }
      />
    );
  }

  if (screen === 'ir') {
    return (
      <InstructorScreen
        lessons={attendedLessons}
        onBack={() =>
          setScreen('home')
        }
      />
    );
  }

  if (screen === 'program') {
    return (
      <ProgramScreen
        lessons={attendedLessons}
        onBack={() =>
          setScreen('home')
        }
      />
    );
  }

  async function connectGoogle() {
    Alert.alert(
      'Gmail連携',
      'Expo GoでのUI確認中はGmail連携を無効にしています。Development BuildではGoogle Sign-Inを利用できます。'
    );
  }

  async function disconnectGoogle() {
    setGoogleConnected(false);
    setGoogleEmail(null);
  }

  // ========================================
  // HOME
  // ========================================

  const jumpCount =
    attendedLessons.filter(
      (lesson) =>
        !isPilates(lesson)
    ).length;

  const pilatesCount =
    attendedLessons.filter(
      (lesson) =>
        isPilates(lesson)
    ).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.container
        }
      >
        <Text style={styles.title}>
          jump LOG
        </Text>

        <View style={styles.totalArea}>
          <Text style={styles.label}>
            TOTAL LESSONS
          </Text>

          <Text style={styles.count}>
            {attendedLessons.length}
          </Text>

          <Text style={styles.totalNote}>
            受講済みレッスン
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <SummaryBox
            number={jumpCount}
            label="JUMP"
          />

          <SummaryBox
            number={pilatesCount}
            label="PILATES"
          />

          <SummaryBox
            number={reviewCount}
            label="未確認"
          />
        </View>

        <View style={styles.reviewBreakdown}>
          <Text style={styles.reviewBreakdownText}>
            未確認の内訳
          </Text>

          <View style={styles.reviewBreakdownRow}>
            <Text style={styles.reviewBreakdownItem}>
              確認メールあり {confirmedReviewCount}件
            </Text>

            <Text style={styles.reviewBreakdownItem}>
              その他の未確認 {otherReviewCount}件
            </Text>
          </View>
        </View>

        <View style={styles.subSummary}>
          <Text style={styles.subSummaryText}>
            キャンセル {cancelledCount}件
          </Text>

          <Text style={styles.subSummaryText}>
            無断キャンセル {noShowCount}件
          </Text>
        </View>

        <View style={styles.googleAuthCard}>
          <Text style={styles.googleAuthTitle}>
            Gmail連携
          </Text>

          <Text style={styles.googleAuthStatus}>
            {googleConnected
              ? `連携中${googleEmail ? ` · ${googleEmail}` : ''}`
              : '未連携'}
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.googleAuthButton,
              pressed && styles.cardPressed,
            ]}
            disabled={googleAuthBusy}
            onPress={
              googleConnected
                ? disconnectGoogle
                : connectGoogle
            }
          >
            <Text style={styles.googleAuthButtonText}>
              {googleAuthBusy
                ? '処理中...'
                : googleConnected
                ? 'Google連携を解除'
                : 'GoogleでGmailを連携'}
            </Text>
          </Pressable>
        </View>

        <MenuCard
          title="HISTORY"
          subtitle="過去の予約・受講履歴"
          onPress={() =>
            setScreen('history')
          }
        />

        <MenuCard
          title="CALENDAR"
          subtitle="カレンダーで受講プログラムを見る"
          onPress={() =>
            setScreen('calendar')
          }
        />

        <MenuCard
          title="BODY"
          subtitle="体重・体脂肪率"
          onPress={() =>
            setScreen('body')
          }
        />

        <MenuCard
          title="IR"
          subtitle="インストラクター別の受講回数"
          onPress={() =>
            setScreen('ir')
          }
        />

        <MenuCard
          title="PROGRAM"
          subtitle="プログラム別の受講回数"
          onPress={() =>
            setScreen('program')
          }
        />

        <MenuCard
          title="STUDIO"
          subtitle="店舗別の受講回数"
          onPress={() =>
            setScreen('studio')
          }
        />

        <MenuCard
          title="IMPORT"
          subtitle="CSV / Excelから受講履歴を取り込む"
          onPress={() =>
            setScreen('import')
          }
        />
      </ScrollView>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}


function ImportLessonsScreen({
  existingLessons,
  onImport,
  onBack,
  onOpenHistory,
}: {
  existingLessons: TrackedLesson[];
  onImport: (
    rows: ImportRow[]
  ) => Promise<{
    imported: number;
    duplicates: number;
  }>;
  onBack: () => void;
  onOpenHistory: () => void;
}) {
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [columns, setColumns] =
    useState<ImportColumnMap | null>(null);
  const [busy, setBusy] = useState(false);

  const existingKeys = useMemo(
    () =>
      new Set(
        existingLessons.map(importDuplicateKey)
      ),
    [existingLessons]
  );

  const validRows = rows.filter(
    (row) => row.valid
  );

  const duplicateCount = validRows.filter(
    (row) =>
      existingKeys.has(
        importDuplicateKey({
          date: row.date,
          startTime: row.startTime,
          program: row.program,
          instructor: row.instructor,
          studio: row.studio,
        })
      )
  ).length;

  const importableCount =
    validRows.length - duplicateCount;

  async function chooseFile() {
    try {
      setBusy(true);

      const result =
        await DocumentPicker.getDocumentAsync({
          type: [
            'text/csv',
            'text/comma-separated-values',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ],
          copyToCacheDirectory: true,
          multiple: false,
        });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const buffer = await response.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: false,
      });

      const firstSheetName =
        workbook.SheetNames[0];

      if (!firstSheetName) {
        Alert.alert(
          '読み込めませんでした',
          'シートが見つかりません。'
        );
        return;
      }

      const sheet =
        workbook.Sheets[firstSheetName];

      const rawRows =
        XLSX.utils.sheet_to_json<
          Record<string, unknown>
        >(sheet, {
          defval: '',
          raw: true,
        });

      if (rawRows.length === 0) {
        Alert.alert(
          'データがありません',
          '1行目を見出し、2行目以降をレッスンデータとして読み込みます。'
        );
        return;
      }

      const headers = Object.keys(rawRows[0]);
      const detected =
        detectImportColumns(headers);

      setFileName(asset.name);
      setSheetName(firstSheetName);
      setColumns(detected);
      setRows(
        makeImportRows(rawRows, detected)
      );
    } catch (error) {
      console.error(error);
      Alert.alert(
        'ファイルを読み込めませんでした',
        'CSV / Excelファイルの形式を確認してください。'
      );
    } finally {
      setBusy(false);
    }
  }

  async function executeImport() {
    if (importableCount === 0) {
      Alert.alert(
        '取り込めるデータがありません',
        '必須項目と重複を確認してください。'
      );
      return;
    }

    Alert.alert(
      '受講履歴を取り込みますか？',
      `${importableCount}件を「受講済み」としてHISTORYへ追加します。`,
      [
        {
          text: 'やめる',
          style: 'cancel',
        },
        {
          text: '取り込む',
          onPress: async () => {
            setBusy(true);
            try {
              const result =
                await onImport(rows);

              Alert.alert(
                '取り込み完了',
                `${result.imported}件を追加しました。` +
                  (result.duplicates > 0
                    ? `\n重複 ${result.duplicates}件はスキップしました。`
                    : ''),
                [
                  {
                    text: 'HISTORYを見る',
                    onPress: onOpenHistory,
                  },
                  {
                    text: '閉じる',
                    style: 'cancel',
                  },
                ]
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  const detectedLabels = columns
    ? [
        ['日付', columns.date],
        ['時間', columns.startTime],
        ['PROGRAM', columns.program],
        ['IR', columns.instructor],
        ['店舗', columns.studio],
        ['MEMO', columns.note],
      ]
    : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.listContainer
        }
      >
        <Header
          title="IMPORT"
          onBack={onBack}
        />

        <Text style={styles.sectionDescription}>
          CSV / Excelから過去の受講履歴を一括登録
        </Text>

        <View style={styles.importInfoCard}>
          <Text style={styles.importInfoTitle}>
            対応する列
          </Text>
          <Text style={styles.importInfoText}>
            必須：日付・時間・PROGRAM・IR・店舗
          </Text>
          <Text style={styles.importInfoText}>
            任意：MEMO
          </Text>
          <Text style={styles.importInfoHint}>
            1行目の見出しから列を自動判定します。取り込み前に必ずプレビューできます。
          </Text>
        </View>

        <Pressable
          style={styles.importFileButton}
          onPress={chooseFile}
          disabled={busy}
        >
          <Text style={styles.importFileButtonText}>
            {busy
              ? '読み込み中...'
              : 'CSV / Excelを選択'}
          </Text>
        </Pressable>

        {fileName ? (
          <>
            <View style={styles.importFileCard}>
              <Text style={styles.importFileName}>
                {fileName}
              </Text>
              <Text style={styles.importFileMeta}>
                シート：{sheetName}
              </Text>
              <Text style={styles.importFileMeta}>
                データ：{rows.length}件
              </Text>
            </View>

            <Text style={styles.importSectionTitle}>
              列の自動判定
            </Text>

            <View style={styles.importDetectedCard}>
              {detectedLabels.map(
                ([label, value]) => (
                  <View
                    key={String(label)}
                    style={styles.importDetectedRow}
                  >
                    <Text style={styles.importDetectedLabel}>
                      {label}
                    </Text>
                    <Text
                      style={[
                        styles.importDetectedValue,
                        !value &&
                          styles.importDetectedMissing,
                      ]}
                    >
                      {value ?? '見つかりません'}
                    </Text>
                  </View>
                )
              )}
            </View>

            <View style={styles.importSummaryRow}>
              <View style={styles.importSummaryBox}>
                <Text style={styles.importSummaryNumber}>
                  {importableCount}
                </Text>
                <Text style={styles.importSummaryLabel}>
                  取込可能
                </Text>
              </View>

              <View style={styles.importSummaryBox}>
                <Text style={styles.importSummaryNumber}>
                  {duplicateCount}
                </Text>
                <Text style={styles.importSummaryLabel}>
                  重複
                </Text>
              </View>

              <View style={styles.importSummaryBox}>
                <Text style={styles.importSummaryNumber}>
                  {rows.length -
                    validRows.length}
                </Text>
                <Text style={styles.importSummaryLabel}>
                  要確認
                </Text>
              </View>
            </View>

            <Text style={styles.importSectionTitle}>
              プレビュー
            </Text>

            {rows.slice(0, 30).map((row) => {
              const duplicate =
                row.valid &&
                existingKeys.has(
                  importDuplicateKey({
                    date: row.date,
                    startTime: row.startTime,
                    program: row.program,
                    instructor: row.instructor,
                    studio: row.studio,
                  })
                );

              return (
                <View
                  key={row.rowNumber}
                  style={[
                    styles.importPreviewCard,
                    !row.valid &&
                      styles.importPreviewError,
                  ]}
                >
                  <View style={styles.importPreviewTop}>
                    <Text style={styles.importPreviewDate}>
                      {row.date || '日付不明'}{' '}
                      {row.startTime || '--:--'}
                    </Text>

                    <Text
                      style={[
                        styles.importPreviewStatus,
                        duplicate &&
                          styles.importDuplicateText,
                        !row.valid &&
                          styles.importErrorText,
                      ]}
                    >
                      {!row.valid
                        ? '要確認'
                        : duplicate
                        ? '重複'
                        : '取込OK'}
                    </Text>
                  </View>

                  {row.program ? (
                    <ProgramBadge
                      program={row.program}
                    />
                  ) : null}

                  <Text style={styles.importPreviewMeta}>
                    {row.instructor || 'IR不明'}
                    {'  ·  '}
                    {row.studio || '店舗不明'}
                  </Text>

                  {!row.valid ? (
                    <Text style={styles.importErrorText}>
                      {row.rowNumber}行目：
                      {row.error}
                    </Text>
                  ) : null}
                </View>
              );
            })}

            {rows.length > 30 ? (
              <Text style={styles.importMoreText}>
                プレビューは先頭30件を表示しています。
                残り {rows.length - 30}件
              </Text>
            ) : null}

            <Pressable
              style={[
                styles.importExecuteButton,
                (importableCount === 0 ||
                  busy) &&
                  styles.importDisabledButton,
              ]}
              onPress={executeImport}
              disabled={
                importableCount === 0 ||
                busy
              }
            >
              <Text style={styles.importExecuteButtonText}>
                {importableCount}件をHISTORYへ取り込む
              </Text>
            </Pressable>

            <Text style={styles.importFootnote}>
              取り込んだ行は「受講済み」として登録されます。同じ日付・時間・PROGRAM・IR・店舗の履歴は重複としてスキップします。
            </Text>
          </>
        ) : null}
      </ScrollView>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}



// ========================================
// HOME部品
// ========================================

function SummaryBox({
  number,
  label,
}: {
  number: number;
  label: string;
}) {
  return (
    <View style={styles.summaryBox}>
      <Text style={styles.summaryNumber}>
        {number}
      </Text>

      <Text style={styles.summaryLabel}>
        {label}
      </Text>
    </View>
  );
}

function MenuCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View>
        <Text style={styles.cardTitle}>
          {title}
        </Text>

        <Text style={styles.cardText}>
          {subtitle}
        </Text>
      </View>

      <Text style={styles.arrow}>
        ›
      </Text>
    </Pressable>
  );
}

// ========================================
// 共通ヘッダー
// ========================================

function Header({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={15}
      >
        <Text style={styles.back}>
          ‹
        </Text>
      </Pressable>

      <Text style={styles.headerTitle}>
        {title}
      </Text>
    </View>
  );
}

// ========================================
// CALENDAR
// ========================================

function BodyTrendChart({
  title,
  unit,
  points,
}: {
  title: string;
  unit: string;
  points: Array<{ date: string; value: number }>;
}) {
  const width = 300;
  const height = 160;
  const left = 38;
  const right = 10;
  const top = 18;
  const bottom = 30;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  if (points.length === 0) {
    return (
      <View style={styles.bodyChartCard}>
        <Text style={styles.bodyChartTitle}>{title}</Text>
        <Text style={styles.bodyChartEmpty}>
          まだデータがありません
        </Text>
      </View>
    );
  }

  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding =
    rawMin === rawMax
      ? Math.max(Math.abs(rawMin) * 0.05, 1)
      : (rawMax - rawMin) * 0.12;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = max - min || 1;

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? left + chartWidth / 2
        : left + (index / (points.length - 1)) * chartWidth;
    const y =
      top + ((max - point.value) / range) * chartHeight;
    return { ...point, x, y };
  });

  const polyline = coords
    .map((point) => `${point.x},${point.y}`)
    .join(' ');

  const firstDate = points[0].date.slice(5).replace('-', '/');
  const lastDate =
    points[points.length - 1].date.slice(5).replace('-', '/');

  return (
    <View style={styles.bodyChartCard}>
      <View style={styles.bodyChartHeader}>
        <Text style={styles.bodyChartTitle}>{title}</Text>
        <Text style={styles.bodyChartLatest}>
          {points[points.length - 1].value} {unit}
        </Text>
      </View>

      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line
          x1={left}
          y1={top}
          x2={left}
          y2={top + chartHeight}
          stroke="#DDDDDD"
          strokeWidth="1"
        />
        <Line
          x1={left}
          y1={top + chartHeight}
          x2={width - right}
          y2={top + chartHeight}
          stroke="#DDDDDD"
          strokeWidth="1"
        />

        <SvgText
          x={left - 5}
          y={top + 4}
          fontSize="9"
          textAnchor="end"
          fill="#777777"
        >
          {rawMax}
        </SvgText>
        <SvgText
          x={left - 5}
          y={top + chartHeight}
          fontSize="9"
          textAnchor="end"
          fill="#777777"
        >
          {rawMin}
        </SvgText>

        {coords.length > 1 ? (
          <Polyline
            points={polyline}
            fill="none"
            stroke="#111111"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {coords.map((point, index) => (
          <Circle
            key={`${point.date}-${index}`}
            cx={point.x}
            cy={point.y}
            r="3.5"
            fill="#111111"
          />
        ))}

        <SvgText
          x={left}
          y={height - 7}
          fontSize="9"
          textAnchor="start"
          fill="#777777"
        >
          {firstDate}
        </SvgText>
        <SvgText
          x={width - right}
          y={height - 7}
          fontSize="9"
          textAnchor="end"
          fill="#777777"
        >
          {lastDate}
        </SvgText>
      </Svg>
    </View>
  );
}


function BodyMetricsScreen({
  metrics,
  lessons,
  lessonCalories,
  onSave,
  onDelete,
  onBack,
}: {
  metrics: BodyMetricsMap;
  lessons: TrackedLesson[];
  lessonCalories: LessonCaloriesMap;
  onSave: (metric: BodyMetric) => Promise<void>;
  onDelete: (date: string) => Promise<void>;
  onBack: () => void;
}) {
  const now = new Date();
  const today =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');

  const records = useMemo(
    () => Object.values(metrics).sort((a, b) => b.date.localeCompare(a.date)),
    [metrics]
  );

  const weightPoints = useMemo(
    () =>
      Object.values(metrics)
        .filter((item) => item.weight !== undefined)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((item) => ({
          date: item.date,
          value: item.weight as number,
        })),
    [metrics]
  );

  const bodyFatPoints = useMemo(
    () =>
      Object.values(metrics)
        .filter((item) => item.bodyFat !== undefined)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((item) => ({
          date: item.date,
          value: item.bodyFat as number,
        })),
    [metrics]
  );

  const caloriePoints = useMemo(
    () =>
      lessons
        .map((lesson) => ({
          date: lesson.date,
          value:
            lessonCalories[getTrackedLessonId(lesson)],
        }))
        .filter(
          (item): item is { date: string; value: number } =>
            item.value !== undefined
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [lessons, lessonCalories]
  );

  const last30Summary = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);

    const inRange = (dateString: string) => {
      const value = new Date(`${dateString}T12:00:00`);
      return value >= start && value <= end;
    };

    const recentLessons = lessons.filter((lesson) =>
      inRange(lesson.date)
    );

    const recentCalories = recentLessons
      .map(
        (lesson) =>
          lessonCalories[getTrackedLessonId(lesson)]
      )
      .filter(
        (value): value is number =>
          value !== undefined
      );

    const calorieTotal = recentCalories.reduce(
      (sum, value) => sum + value,
      0
    );

    const recentBody = Object.values(metrics)
      .filter((item) => inRange(item.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const weights = recentBody.filter(
      (item) => item.weight !== undefined
    );
    const bodyFats = recentBody.filter(
      (item) => item.bodyFat !== undefined
    );

    const weightFirst = weights[0]?.weight;
    const weightLast =
      weights[weights.length - 1]?.weight;
    const bodyFatFirst = bodyFats[0]?.bodyFat;
    const bodyFatLast =
      bodyFats[bodyFats.length - 1]?.bodyFat;

    return {
      lessonCount: recentLessons.length,
      calorieTotal,
      calorieCount: recentCalories.length,
      calorieAverage:
        recentCalories.length > 0
          ? Math.round(
              calorieTotal / recentCalories.length
            )
          : undefined,
      weightFirst,
      weightLast,
      weightChange:
        weightFirst !== undefined &&
        weightLast !== undefined
          ? Math.round(
              (weightLast - weightFirst) * 10
            ) / 10
          : undefined,
      bodyFatFirst,
      bodyFatLast,
      bodyFatChange:
        bodyFatFirst !== undefined &&
        bodyFatLast !== undefined
          ? Math.round(
              (bodyFatLast - bodyFatFirst) * 10
            ) / 10
          : undefined,
    };
  }, [lessons, lessonCalories, metrics]);

  function signedValue(
    value: number | undefined,
    unit: string
  ) {
    if (value === undefined) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value} ${unit}`;
  }

  function editRecord(record: BodyMetric) {
    setDate(record.date);
    setWeight(record.weight === undefined ? '' : String(record.weight));
    setBodyFat(record.bodyFat === undefined ? '' : String(record.bodyFat));
  }

  async function handleSave() {
    const w = weight.trim() ? Number(weight) : undefined;
    const f = bodyFat.trim() ? Number(bodyFat) : undefined;

    if (w !== undefined && (!Number.isFinite(w) || w < 20 || w > 300)) {
      Alert.alert('入力を確認してください', '体重は20〜300 kgの範囲で入力してください。');
      return;
    }
    if (f !== undefined && (!Number.isFinite(f) || f < 1 || f > 70)) {
      Alert.alert('入力を確認してください', '体脂肪率は1〜70 %の範囲で入力してください。');
      return;
    }
    if (w === undefined && f === undefined) {
      Alert.alert('入力してください', '体重または体脂肪率を入力してください。');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('日付を確認してください', '日付は 2026-09-20 の形式で入力してください。');
      return;
    }

    await onSave({
      date,
      weight: w === undefined ? undefined : Math.round(w * 10) / 10,
      bodyFat: f === undefined ? undefined : Math.round(f * 10) / 10,
      source: 'manual',
    });
    Keyboard.dismiss();
    Alert.alert('保存しました', `${date.replaceAll('-', '/')} の記録`);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Header title="BODY" onBack={onBack} />
        <Text style={styles.sectionDescription}>
          体重・体脂肪率を日付ごとに記録
        </Text>

        <Text style={styles.bodySummaryTitle}>
          LAST 30 DAYS
        </Text>

        <View style={styles.bodySummaryGrid}>
          <View style={styles.bodySummaryCard}>
            <Text style={styles.bodySummaryLabel}>
              LESSONS
            </Text>
            <Text style={styles.bodySummaryValue}>
              {last30Summary.lessonCount}
            </Text>
            <Text style={styles.bodySummarySub}>
              回受講
            </Text>
          </View>

          <View style={styles.bodySummaryCard}>
            <Text style={styles.bodySummaryLabel}>
              CALORIES
            </Text>
            <Text style={styles.bodySummaryValueSmall}>
              {last30Summary.calorieCount > 0
                ? last30Summary.calorieTotal.toLocaleString()
                : '—'}
            </Text>
            <Text style={styles.bodySummarySub}>
              {last30Summary.calorieAverage === undefined
                ? 'kcal'
                : `kcal · 平均 ${last30Summary.calorieAverage}`}
            </Text>
          </View>

          <View style={styles.bodySummaryCard}>
            <Text style={styles.bodySummaryLabel}>
              WEIGHT
            </Text>
            <Text style={styles.bodySummaryValueSmall}>
              {signedValue(
                last30Summary.weightChange,
                'kg'
              )}
            </Text>
            <Text style={styles.bodySummarySub}>
              {last30Summary.weightFirst !== undefined &&
              last30Summary.weightLast !== undefined
                ? `${last30Summary.weightFirst} → ${last30Summary.weightLast} kg`
                : '記録が2点以上必要'}
            </Text>
          </View>

          <View style={styles.bodySummaryCard}>
            <Text style={styles.bodySummaryLabel}>
              BODY FAT
            </Text>
            <Text style={styles.bodySummaryValueSmall}>
              {signedValue(
                last30Summary.bodyFatChange,
                '%'
              )}
            </Text>
            <Text style={styles.bodySummarySub}>
              {last30Summary.bodyFatFirst !== undefined &&
              last30Summary.bodyFatLast !== undefined
                ? `${last30Summary.bodyFatFirst} → ${last30Summary.bodyFatLast} %`
                : '記録が2点以上必要'}
            </Text>
          </View>
        </View>

        <Text style={styles.bodySummaryNote}>
          同じ30日間の記録を並べて表示しています。運動による変化を直接示すものではありません。
        </Text>

        <View style={styles.bodyInputCard}>
          <Text style={styles.bodyInputLabel}>DATE</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="2026-09-20"
            style={styles.bodyDateInput}
          />

          <Text style={styles.bodyInputLabel}>WEIGHT</Text>
          <View style={styles.bodyValueRow}>
            <TextInput
              value={weight}
              onChangeText={(v) => setWeight(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="例：56.3"
              style={styles.bodyValueInput}
            />
            <Text style={styles.bodyUnit}>kg</Text>
          </View>

          <Text style={styles.bodyInputLabel}>BODY FAT</Text>
          <View style={styles.bodyValueRow}>
            <TextInput
              value={bodyFat}
              onChangeText={(v) => setBodyFat(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="例：28.3"
              style={styles.bodyValueInput}
            />
            <Text style={styles.bodyUnit}>%</Text>
          </View>

          <Pressable
            style={styles.bodyKeyboardButton}
            onPress={() => Keyboard.dismiss()}
          >
            <Text style={styles.bodyKeyboardButtonText}>
              キーボードを閉じる
            </Text>
          </Pressable>

          <Pressable style={styles.bodySaveButton} onPress={handleSave}>
            <Text style={styles.bodySaveButtonText}>保存</Text>
          </Pressable>
        </View>

        <Text style={styles.bodyChartSectionTitle}>
          TREND
        </Text>

        <BodyTrendChart
          title="WEIGHT"
          unit="kg"
          points={weightPoints}
        />

        <BodyTrendChart
          title="BODY FAT"
          unit="%"
          points={bodyFatPoints}
        />

        <BodyTrendChart
          title="CALORIES"
          unit="kcal"
          points={caloriePoints}
        />

        <Text style={styles.bodyHistoryTitle}>HISTORY</Text>

        {records.length === 0 ? (
          <Text style={styles.calendarEmptyText}>まだ記録はありません</Text>
        ) : (
          records.map((record) => (
            <Pressable
              key={record.date}
              style={styles.bodyHistoryRow}
              onPress={() => editRecord(record)}
            >
              <View>
                <Text style={styles.bodyHistoryDate}>
                  {record.date.replaceAll('-', '/')}
                </Text>
                <Text style={styles.bodyHistorySource}>手入力</Text>
              </View>
              <View style={styles.bodyHistoryValues}>
                <Text style={styles.bodyHistoryValue}>
                  {record.weight === undefined ? '—' : `${record.weight} kg`}
                </Text>
                <Text style={styles.bodyHistoryValue}>
                  {record.bodyFat === undefined ? '—' : `${record.bodyFat} %`}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        {metrics[date] ? (
          <Pressable
            style={styles.bodyDeleteButton}
            onPress={() =>
              Alert.alert(
                '記録を削除',
                `${date.replaceAll('-', '/')} の記録を削除しますか？`,
                [
                  { text: 'やめる', style: 'cancel' },
                  {
                    text: '削除',
                    style: 'destructive',
                    onPress: async () => {
                      await onDelete(date);
                      setWeight('');
                      setBodyFat('');
                    },
                  },
                ]
              )
            }
          >
            <Text style={styles.bodyDeleteText}>この日の記録を削除</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}


// ========================================
// CALENDAR
// ========================================

function CalendarScreen({
  lessons,
  lessonCalories,
  onSetLessonCalories,
  onBack,
}: {
  lessons: TrackedLesson[];
  lessonCalories: LessonCaloriesMap;
  onSetLessonCalories: (
    lesson: TrackedLesson,
    calories: number | undefined
  ) => Promise<void>;
  onBack: () => void;
}) {
  const initialMonth = useMemo(() => {
    const latest = [...lessons]
      .map((lesson) => lesson.date.slice(0, 7))
      .filter(Boolean)
      .sort()
      .pop();

    return latest ?? new Date().toISOString().slice(0, 7);
  }, [lessons]);

  const [monthKey, setMonthKey] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calorieLesson, setCalorieLesson] =
    useState<TrackedLesson | null>(null);
  const [calorieInput, setCalorieInput] = useState('');


  const [year, month] = monthKey.split('-').map(Number);

  const monthLessons = useMemo(
    () =>
      lessons
        .filter((lesson) => lesson.date.startsWith(`${monthKey}-`))
        .sort((a, b) =>
          `${a.date} ${a.startTime}`.localeCompare(
            `${b.date} ${b.startTime}`
          )
        ),
    [lessons, monthKey]
  );

  const lessonsByDate = useMemo(() => {
    const map: Record<string, TrackedLesson[]> = {};

    monthLessons.forEach((lesson) => {
      if (!map[lesson.date]) {
        map[lesson.date] = [];
      }
      map[lesson.date].push(lesson);
    });

    return map;
  }, [monthLessons]);

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  function moveMonth(offset: number) {
    const next = new Date(year, month - 1 + offset, 1);
    const nextKey = `${next.getFullYear()}-${String(
      next.getMonth() + 1
    ).padStart(2, '0')}`;

    setMonthKey(nextKey);
    setSelectedDate(null);
  }

  const selectedLessons = selectedDate
    ? lessonsByDate[selectedDate] ?? []
    : [];

  function openCalorieEditor(lesson: TrackedLesson) {
    const saved =
      lessonCalories[getTrackedLessonId(lesson)];

    setCalorieLesson(lesson);
    setCalorieInput(
      saved === undefined ? '' : String(saved)
    );
  }

  async function commitCalories() {
    if (!calorieLesson) return;

    const trimmed = calorieInput.trim();

    if (!trimmed) {
      await onSetLessonCalories(
        calorieLesson,
        undefined
      );
      setCalorieLesson(null);
      return;
    }

    const value = Number(trimmed);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 3000
    ) {
      Alert.alert(
        '入力を確認してください',
        '消費カロリーは0〜3000 kcalの数字で入力してください。'
      );
      return;
    }

    await onSetLessonCalories(
      calorieLesson,
      Math.round(value)
    );
    setCalorieLesson(null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Header title="CALENDAR" onBack={onBack} />

        <View style={styles.calendarMonthHeader}>
          <Pressable
            style={styles.calendarMonthButton}
            onPress={() => moveMonth(-1)}
          >
            <Text style={styles.calendarMonthArrow}>‹</Text>
          </Pressable>

          <Text style={styles.lessonCalendarMonthTitle}>
            {year}年 {month}月
          </Text>

          <Pressable
            style={styles.calendarMonthButton}
            onPress={() => moveMonth(1)}
          >
            <Text style={styles.calendarMonthArrow}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.calendarMonthCount}>
          {monthLessons.length} 回受講
        </Text>

        <View style={styles.lessonCalendarWeekRow}>
          {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
            <Text key={day} style={styles.calendarWeekText}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.lessonCalendarGrid}>
          {cells.map((day, index) => {
            if (day === null) {
              return (
                <View
                  key={`blank-${index}`}
                  style={styles.lessonCalendarDayCell}
                />
              );
            }

            const date = `${monthKey}-${String(day).padStart(2, '0')}`;
            const dayLessons = lessonsByDate[date] ?? [];
            const selected = selectedDate === date;

            return (
              <Pressable
                key={date}
                style={[
                  styles.lessonCalendarDayCell,
                  selected && styles.calendarDayCellSelected,
                ]}
                onPress={() =>
                  setSelectedDate(
                    selected ? null : date
                  )
                }
              >
                <Text style={styles.calendarDayNumber}>
                  {day}
                </Text>

                <View style={styles.calendarPrograms}>
                  {dayLessons.slice(0, 3).map((lesson) => {
                    const color = getLessonProgramColor(lesson);

                    return (
                      <View
                        key={getTrackedLessonId(lesson)}
                        style={[
                          styles.calendarProgramChip,
                          {
                            backgroundColor: color.soft,
                            borderColor: color.main,
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={styles.calendarProgramText}
                        >
                          {lesson.program}
                        </Text>
                      </View>
                    );
                  })}

                  {dayLessons.length > 3 ? (
                    <Text style={styles.calendarMoreText}>
                      +{dayLessons.length - 3}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {selectedDate ? (
          <View style={styles.calendarDetailCard}>
            <Text style={styles.calendarDetailDate}>
              {selectedDate.replaceAll('-', '/')}
            </Text>

            {selectedLessons.length === 0 ? (
              <Text style={styles.calendarEmptyText}>
                受講記録はありません
              </Text>
            ) : (
              selectedLessons.map((lesson) => {
                const color = getLessonProgramColor(lesson);

                return (
                  <View
                    key={getTrackedLessonId(lesson)}
                    style={styles.calendarDetailRow}
                  >
                    <View
                      style={[
                        styles.calendarDetailColor,
                        { backgroundColor: color.main },
                      ]}
                    />

                    <View style={styles.calendarDetailBody}>
                      <Text style={styles.calendarDetailProgram}>
                        {lesson.program}
                      </Text>
                      <Text style={styles.calendarDetailMeta}>
                        {lesson.startTime}–{lesson.endTime} ·{' '}
                        {formatInstructorName(lesson.instructor)} ·{' '}
                        {lesson.studio}
                      </Text>

                      <Pressable
                        style={styles.calorieButton}
                        onPress={() => openCalorieEditor(lesson)}
                      >
                        <Text style={styles.calorieButtonText}>
                          {lessonCalories[getTrackedLessonId(lesson)] ===
                          undefined
                            ? '🔥 消費カロリーを入力'
                            : `🔥 ${
                                lessonCalories[
                                  getTrackedLessonId(lesson)
                                ]
                              } kcal  編集`}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <Text style={styles.calendarHint}>
            日付をタップすると、その日のレッスンを表示します
          </Text>
        )}
      </ScrollView>

      <Modal
        visible={calorieLesson !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCalorieLesson(null)}
      >
        <View style={styles.calorieModalOverlay}>
          <View style={styles.calorieModalCard}>
            <Text style={styles.calorieModalTitle}>
              🔥 消費カロリー
            </Text>

            {calorieLesson ? (
              <>
                <Text style={styles.calorieModalProgram}>
                  {calorieLesson.program}
                </Text>
                <Text style={styles.calorieModalMeta}>
                  {calorieLesson.date.replaceAll('-', '/')} ·{' '}
                  {calorieLesson.startTime}–{calorieLesson.endTime}
                </Text>
              </>
            ) : null}

            <Text style={styles.calorieOfficialGuide}>
              参考：jump one公式では45分間で450〜800 kcal消費と案内されています
            </Text>

            <View style={styles.calorieInputRow}>
              <TextInput
                value={calorieInput}
                onChangeText={(value) =>
                  setCalorieInput(
                    value.replace(/[^0-9]/g, '')
                  )
                }
                keyboardType="number-pad"
                placeholder="例：280"
                maxLength={4}
                style={styles.calorieInput}
                autoFocus
              />
              <Text style={styles.calorieUnit}>kcal</Text>
            </View>

            <Pressable
              style={styles.calorieKeyboardDone}
              onPress={() => Keyboard.dismiss()}
            >
              <Text style={styles.calorieKeyboardDoneText}>
                キーボードを閉じる
              </Text>
            </Pressable>

            <Text style={styles.calorieModalHint}>
              時計がなくても、計測した値や自分で確認した値を入力できます。
            </Text>

            <View style={styles.calorieModalActions}>
              <Pressable
                style={styles.calorieCancelButton}
                onPress={() => setCalorieLesson(null)}
              >
                <Text style={styles.calorieCancelText}>
                  キャンセル
                </Text>
              </Pressable>

              <Pressable
                style={styles.calorieSaveButton}
                onPress={commitCalories}
              >
                <Text style={styles.calorieSaveText}>
                  保存
                </Text>
              </Pressable>
            </View>

            {calorieLesson &&
            lessonCalories[
              getTrackedLessonId(calorieLesson)
            ] !== undefined ? (
              <Pressable
                style={styles.calorieDeleteButton}
                onPress={async () => {
                  await onSetLessonCalories(
                    calorieLesson,
                    undefined
                  );
                  setCalorieLesson(null);
                }}
              >
                <Text style={styles.calorieDeleteText}>
                  入力値を削除
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}


// ========================================
// HISTORY
// ========================================

function HistoryScreen({
  lessons,
  manualAttendance,
  lessonNotes,
  lessonCalories,
  onSetAttendance,
  onSetLessonCalories,
  onSaveNote,
  onAddLesson,
  onOpenQuickReview,
  onResetAttendance,
  onBack,
}: {
  lessons: TrackedLesson[];

  manualAttendance:
    ManualAttendanceMap;

  lessonNotes: LessonNotesMap;

  lessonCalories: LessonCaloriesMap;

  onSetAttendance: (
    lesson: TrackedLesson,
    status:
      | 'attended'
      | 'noShow'
      | undefined
  ) => void;

  onSetLessonCalories: (
    lesson: TrackedLesson,
    calories: number | undefined
  ) => Promise<void>;

  onSaveNote: (
    lesson: TrackedLesson,
    note: string
  ) => void;

  onAddLesson: () => void;

  onOpenQuickReview: () => void;

  onResetAttendance: () => void;

  onBack: () => void;
}) {
  const [filter, setFilter] =
    useState<HistoryFilter>('all');

  const [historyInstructor, setHistoryInstructor] =
    useState<string | null>(null);

  const [historyProgram, setHistoryProgram] =
    useState<string | null>(null);

  const [noteLesson, setNoteLesson] =
    useState<TrackedLesson | null>(null);

  const [noteDraft, setNoteDraft] =
    useState('');

  const [historyCalorieLesson, setHistoryCalorieLesson] =
    useState<TrackedLesson | null>(null);

  const [historyCalorieInput, setHistoryCalorieInput] =
    useState('');

  const historyInstructors = useMemo(
    () =>
      Array.from(
        new Set(
          lessons.map(
            (lesson) => lesson.instructor
          )
        )
      ).sort(),
    [lessons]
  );

  const historyPrograms = useMemo(
    () =>
      Array.from(
        new Set(
          lessons.map(
            (lesson) => lesson.program
          )
        )
      ).sort(),
    [lessons]
  );

  const filteredLessons = useMemo(
    () =>
      lessons.filter((lesson) => {
        const manualStatus =
          manualAttendance[
            getTrackedLessonId(lesson)
          ];

        let statusMatches = true;

        if (filter === 'review') {
          statusMatches =
            lesson.evidence !== 'cancelled' &&
            manualStatus === undefined;
        }

        if (filter === 'attended') {
          statusMatches =
            manualStatus === 'attended';
        }

        if (filter === 'noShow') {
          statusMatches =
            manualStatus === 'noShow';
        }

        if (filter === 'cancelled') {
          statusMatches =
            lesson.evidence === 'cancelled';
        }

        const instructorMatches =
          historyInstructor === null ||
          lesson.instructor ===
            historyInstructor;

        const programMatches =
          historyProgram === null ||
          lesson.program === historyProgram;

        return (
          statusMatches &&
          instructorMatches &&
          programMatches
        );
      }),
    [
      lessons,
      manualAttendance,
      filter,
      historyInstructor,
      historyProgram,
    ]
  );

  function openHistoryCalorieEditor(
    lesson: TrackedLesson
  ) {
    const saved =
      lessonCalories[getTrackedLessonId(lesson)];

    setHistoryCalorieInput(
      saved === undefined ? '' : String(saved)
    );
    setHistoryCalorieLesson(lesson);
  }

  async function saveHistoryCalories() {
    if (!historyCalorieLesson) return;

    const trimmed =
      historyCalorieInput.trim();

    if (!trimmed) {
      await onSetLessonCalories(
        historyCalorieLesson,
        undefined
      );
      setHistoryCalorieLesson(null);
      return;
    }

    const value = Number(trimmed);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 3000
    ) {
      Alert.alert(
        '入力を確認してください',
        '消費カロリーは0〜3000 kcalの数字で入力してください。'
      );
      return;
    }

    await onSetLessonCalories(
      historyCalorieLesson,
      Math.round(value)
    );
    setHistoryCalorieLesson(null);
  }

  function openLesson(
    lesson: TrackedLesson
  ) {
    // Gmailでキャンセルが確認できている
    if (
      lesson.evidence === 'cancelled'
    ) {
      Alert.alert(
        'キャンセル',
        `${lesson.date} ${lesson.startTime}
${lesson.program}
${formatInstructorName(lesson.instructor)} · ${lesson.studio}

Gmailのキャンセル情報から、この予約はキャンセルとして記録されています。`,
        [
          {
            text: '閉じる',
            style: 'cancel',
          },
        ]
      );

      return;
    }

    Alert.alert(
      lesson.program,
      `${lesson.date} ${lesson.startTime}
${formatInstructorName(lesson.instructor)} · ${lesson.studio}

実際の受講状況を選択してください。`,
      [
        {
          text: '受講済み',
          onPress: () =>
            onSetAttendance(
              lesson,
              'attended'
            ),
        },

        {
          text: '無断キャンセル',
          onPress: () =>
            onSetAttendance(
              lesson,
              'noShow'
            ),
        },

        {
          text: '感想を書く・編集',
          onPress: () => {
            const id =
              getTrackedLessonId(lesson);
            setNoteDraft(
              lessonNotes[id] ?? ''
            );
            setNoteLesson(lesson);
          },
        },

        {
          text: '未確認に戻す',
          onPress: () =>
            onSetAttendance(
              lesson,
              undefined
            ),
        },

        {
          text: '🔥 消費カロリーを入力',
          onPress: () =>
            openHistoryCalorieEditor(lesson),
        },

        {
          text: '閉じる',
          style: 'cancel',
        },
      ]
    );
  }

  let previousMonth = '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.listContainer
        }
      >
        <Header
          title="HISTORY"
          onBack={onBack}
        />

        <Text
          style={styles.sectionDescription}
        >
          Gmailの予約履歴と実際の受講状況を管理
        </Text>

        <Pressable
          style={styles.addLessonButton}
          onPress={onAddLesson}
        >
          <Text style={styles.addLessonButtonText}>
            ＋ レッスンを手動追加
          </Text>
        </Pressable>

        <Pressable
          style={styles.quickReviewButton}
          onPress={onOpenQuickReview}
        >
          <Text style={styles.quickReviewButtonText}>
            未確認を連続判定
          </Text>
          <Text style={styles.quickReviewButtonSubtext}>
            受講済み / 無断キャンセル / あとで
          </Text>
        </Pressable>

        <View style={styles.legend}>
          <Text style={styles.legendText}>
            ✓ 受講済み
          </Text>

          <Text style={styles.legendText}>
            キャンセル
          </Text>

          <Text style={styles.legendText}>
            × 無断キャンセル
          </Text>

          <Text style={styles.legendText}>
            ? 未確認
          </Text>
        </View>

        <View style={styles.filterWrap}>
          <FilterChip
            label={`すべて ${lessons.length}`}
            active={filter === 'all'}
            onPress={() => setFilter('all')}
          />

          <FilterChip
            label={`未確認 ${
              lessons.filter(
                (lesson) =>
                  lesson.evidence !== 'cancelled' &&
                  manualAttendance[
                    getTrackedLessonId(lesson)
                  ] === undefined
              ).length
            }`}
            active={filter === 'review'}
            onPress={() => setFilter('review')}
          />

          <FilterChip
            label={`受講済み ${
              lessons.filter(
                (lesson) =>
                  manualAttendance[
                    getTrackedLessonId(lesson)
                  ] === 'attended'
              ).length
            }`}
            active={filter === 'attended'}
            onPress={() => setFilter('attended')}
          />

          <FilterChip
            label={`無断キャンセル ${
              lessons.filter(
                (lesson) =>
                  manualAttendance[
                    getTrackedLessonId(lesson)
                  ] === 'noShow'
              ).length
            }`}
            active={filter === 'noShow'}
            onPress={() => setFilter('noShow')}
          />

          <FilterChip
            label={`キャンセル ${
              lessons.filter(
                (lesson) =>
                  lesson.evidence === 'cancelled'
              ).length
            }`}
            active={filter === 'cancelled'}
            onPress={() => setFilter('cancelled')}
          />
        </View>

        <View style={styles.historyDrillArea}>
          <Text style={styles.historyDrillTitle}>
            IRで絞り込み
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              styles.horizontalChips
            }
          >
            <FilterChip
              label="すべて"
              active={historyInstructor === null}
              onPress={() =>
                setHistoryInstructor(null)
              }
            />

            {historyInstructors.map(
              (instructor) => (
                <FilterChip
                  key={formatInstructorName(instructor)}
                  label={formatInstructorName(instructor)}
                  active={
                    historyInstructor ===
                    instructor
                  }
                  onPress={() =>
                    setHistoryInstructor(
                      instructor
                    )
                  }
                />
              )
            )}
          </ScrollView>

          <Text style={styles.historyDrillTitle}>
            PROGRAMで絞り込み
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              styles.horizontalChips
            }
          >
            <FilterChip
              label="すべて"
              active={historyProgram === null}
              onPress={() =>
                setHistoryProgram(null)
              }
            />

            {historyPrograms.map(
              (program) => (
                <FilterChip
                  key={program}
                  label={program}
                  active={
                    historyProgram === program
                  }
                  onPress={() =>
                    setHistoryProgram(program)
                  }
                />
              )
            )}
          </ScrollView>

          <Text style={styles.filteredCount}>
            表示中 {filteredLessons.length}件
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.resetButton,
            pressed && styles.cardPressed,
          ]}
          onPress={onResetAttendance}
        >
          <Text style={styles.resetButtonTitle}>
            手動判定をリセット
          </Text>

          <Text style={styles.resetButtonText}>
            受講済み・無断キャンセルをすべて未確認へ
          </Text>
        </Pressable>

        {filteredLessons.map(
          (lesson, index) => {
            const id =
              getTrackedLessonId(lesson);

            const manualStatus =
              manualAttendance[id];

            const month =
              lesson.date.slice(0, 7);

            const showMonth =
              month !== previousMonth;

            previousMonth = month;

            let statusLabel =
              '? 未確認';

            let statusStyle:
              StyleProp<TextStyle> =
              styles.statusReview;

            if (
              lesson.evidence ===
              'cancelled'
            ) {
              statusLabel =
                'キャンセル';

              statusStyle =
                styles.statusCancelled;
            } else if (
              manualStatus ===
              'attended'
            ) {
              statusLabel =
                '✓ 受講済み';

              statusStyle =
                styles.statusAttended;
            } else if (
              manualStatus ===
              'noShow'
            ) {
              statusLabel =
                '× 無断キャンセル';

              statusStyle =
                styles.statusNoShow;
            }

            return (
              <View
                key={`${id}-${index}`}
              >
                {showMonth && (
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    {month.replace(
                      '-',
                      '.'
                    )}
                  </Text>
                )}

                <Pressable
                  style={({ pressed }) => [
                    styles.historyRow,

                    lesson.evidence ===
                      'cancelled' &&
                      styles.cancelledRow,

                    pressed &&
                      styles.cardPressed,
                  ]}
                  onPress={() =>
                    openLesson(lesson)
                  }
                >
                  <View style={styles.dateArea}>
                    <Text style={styles.date}>
                      {lesson.date
                        .slice(5)
                        .replace('-', '/')}
                    </Text>

                    <Text style={styles.time}>
                      {lesson.startTime}
                    </Text>
                  </View>

                  <View style={styles.lessonArea}>
                    <View
                      style={[
                        styles.programBadge,
                        {
                          backgroundColor:
                            getLessonProgramColor(
                              lesson
                            ).main,
                        },
                      ]}
                    >
                      <Text style={styles.programBadgeText}>
                        {lesson.program}
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.lessonDetail
                      }
                    >
                      {formatInstructorName(lesson.instructor)}
                      {'  ·  '}
                      {lesson.studio}
                    </Text>

                    <Text
                      style={
                        styles.mailEvidence
                      }
                    >
                      {getMailEvidenceLabel(
                        lesson
                      )}
                    </Text>

                    <Text style={statusStyle}>
                      {statusLabel}
                    </Text>

                    {lessonCalories[id] !== undefined ? (
                      <Text style={styles.historyCalorieText}>
                        🔥 {lessonCalories[id]} kcal
                      </Text>
                    ) : null}

                    {lessonNotes[id] ? (
                      <Text
                        style={styles.notePreview}
                        numberOfLines={2}
                      >
                        MEMO: {lessonNotes[id]}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          }
        )}
      </ScrollView>

      <Modal
        visible={historyCalorieLesson !== null}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setHistoryCalorieLesson(null)
        }
      >
        <View style={styles.calorieModalOverlay}>
          <View style={styles.calorieModalCard}>
            <Text style={styles.calorieModalTitle}>
              🔥 消費カロリー
            </Text>

            {historyCalorieLesson ? (
              <>
                <Text style={styles.calorieModalProgram}>
                  {historyCalorieLesson.program}
                </Text>
                <Text style={styles.calorieModalMeta}>
                  {historyCalorieLesson.date.replaceAll('-', '/')} ·{' '}
                  {historyCalorieLesson.startTime}–
                  {historyCalorieLesson.endTime}
                </Text>
              </>
            ) : null}

            <View style={styles.calorieInputRow}>
              <TextInput
                value={historyCalorieInput}
                onChangeText={(value) =>
                  setHistoryCalorieInput(
                    value.replace(/[^0-9]/g, '')
                  )
                }
                keyboardType="number-pad"
                placeholder="例：280"
                maxLength={4}
                style={styles.calorieInput}
                autoFocus
              />
              <Text style={styles.calorieUnit}>kcal</Text>
            </View>

            <Pressable
              style={styles.calorieKeyboardDone}
              onPress={() => Keyboard.dismiss()}
            >
              <Text style={styles.calorieKeyboardDoneText}>
                キーボードを閉じる
              </Text>
            </Pressable>

            <View style={styles.calorieModalActions}>
              <Pressable
                style={styles.calorieCancelButton}
                onPress={() =>
                  setHistoryCalorieLesson(null)
                }
              >
                <Text style={styles.calorieCancelText}>
                  キャンセル
                </Text>
              </Pressable>

              <Pressable
                style={styles.calorieSaveButton}
                onPress={saveHistoryCalories}
              >
                <Text style={styles.calorieSaveText}>
                  保存
                </Text>
              </Pressable>
            </View>

            {historyCalorieLesson &&
            lessonCalories[
              getTrackedLessonId(historyCalorieLesson)
            ] !== undefined ? (
              <Pressable
                style={styles.calorieDeleteButton}
                onPress={async () => {
                  await onSetLessonCalories(
                    historyCalorieLesson,
                    undefined
                  );
                  setHistoryCalorieLesson(null);
                }}
              >
                <Text style={styles.calorieDeleteText}>
                  入力値を削除
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={noteLesson !== null}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setNoteLesson(null)
        }
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              レッスンの感想
            </Text>

            {noteLesson ? (
              <>
                <Text style={styles.modalSubtitle}>
                  {noteLesson.date} {noteLesson.startTime}
                </Text>
                <Text
                  style={[
                    styles.modalSubtitle,
                    {
                      color: getProgramColor(
                        noteLesson.program
                      ).main,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {noteLesson.program}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {formatInstructorName(noteLesson.instructor)}
                </Text>
              </>
            ) : null}

            <TextInput
              value={noteDraft}
              onChangeText={(value) =>
                setNoteDraft(value.slice(0, 100))
              }
              multiline
              maxLength={100}
              placeholder="レッスンの感想を100字程度で記録"
              style={styles.noteInput}
              textAlignVertical="top"
            />

            <Text style={styles.characterCount}>
              {noteDraft.length} / 100
            </Text>

            <View style={styles.modalButtonRow}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  setNoteLesson(null)
                }
              >
                <Text style={styles.secondaryButtonText}>
                  キャンセル
                </Text>
              </Pressable>

              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  if (noteLesson) {
                    onSaveNote(
                      noteLesson,
                      noteDraft
                    );
                  }
                  setNoteLesson(null);
                }}
              >
                <Text style={styles.primaryButtonText}>
                  保存
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}



function QuickReviewScreen({
  lessons,
  manualAttendance,
  lessonNotes,
  onSetAttendance,
  onSaveNote,
  onBack,
}: {
  lessons: TrackedLesson[];
  manualAttendance: ManualAttendanceMap;
  lessonNotes: LessonNotesMap;
  onSetAttendance: (
    lesson: TrackedLesson,
    value: 'attended' | 'noShow' | undefined
  ) => void;
  onSaveNote: (
    lesson: TrackedLesson,
    note: string
  ) => void;
  onBack: () => void;
}) {
  const reviewLessons = useMemo(
    () =>
      lessons.filter(
        (lesson) =>
          manualAttendance[
            getTrackedLessonId(lesson)
          ] === undefined
      ),
    [lessons, manualAttendance]
  );

  const [skippedIds, setSkippedIds] =
    useState<string[]>([]);

  const currentLesson =
    reviewLessons.find(
      (lesson) =>
        !skippedIds.includes(
          getTrackedLessonId(lesson)
        )
    ) ?? null;

  const [note, setNote] = useState('');

  useEffect(() => {
    if (!currentLesson) {
      setNote('');
      return;
    }

    setNote(
      lessonNotes[
        getTrackedLessonId(currentLesson)
      ] ?? ''
    );
  }, [currentLesson, lessonNotes]);

  async function decide(
    value: 'attended' | 'noShow'
  ) {
    if (!currentLesson) return;

    if (note.trim()) {
      await onSaveNote(
        currentLesson,
        note
      );
    }

    await onSetAttendance(
      currentLesson,
      value
    );
  }

  function skip() {
    if (!currentLesson) return;

    setSkippedIds((current) => [
      ...current,
      getTrackedLessonId(currentLesson),
    ]);
  }

  const remaining =
    reviewLessons.length;

  if (!currentLesson) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.reviewContainer}>
          <Header
            title="REVIEW"
            onBack={onBack}
          />

          <View style={styles.reviewDoneCard}>
            <Text style={styles.reviewDoneTitle}>
              今回の確認は終了
            </Text>

            <Text style={styles.reviewDoneText}>
              未確認 {remaining}件
            </Text>

            {remaining > 0 ? (
              <Text style={styles.reviewDoneHint}>
                「あとで」にしたレッスンは未確認のまま残っています。
              </Text>
            ) : (
              <Text style={styles.reviewDoneHint}>
                すべてのレッスンを判定しました。
              </Text>
            )}

            <Pressable
              style={styles.primaryButton}
              onPress={onBack}
            >
              <Text style={styles.primaryButtonText}>
                HISTORYへ戻る
              </Text>
            </Pressable>
          </View>
        </View>

        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  const id =
    getTrackedLessonId(currentLesson);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.reviewContainer
        }
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title="REVIEW"
          onBack={onBack}
        />

        <Text style={styles.reviewProgress}>
          未確認 残り {remaining}件
        </Text>

        <View style={styles.reviewLessonCard}>
          <Text style={styles.reviewDate}>
            {currentLesson.date}
          </Text>

          <Text style={styles.reviewTime}>
            {currentLesson.startTime}
            {currentLesson.endTime
              ? ` - ${currentLesson.endTime}`
              : ''}
          </Text>

          <View
            style={[
              styles.reviewProgramBadge,
              {
                backgroundColor:
                  getLessonProgramColor(
                    currentLesson
                  ).main,
              },
            ]}
          >
            <Text style={styles.reviewProgramBadgeText}>
              {currentLesson.program}
            </Text>
          </View>

          <Text style={styles.reviewMeta}>
            {formatInstructorName(currentLesson.instructor)}
            {'  ·  '}
            {currentLesson.studio}
          </Text>

          <Text style={styles.reviewEvidence}>
            {getMailEvidenceLabel(
              currentLesson
            )}
          </Text>
        </View>

        <Text style={styles.reviewMemoLabel}>
          感想（受講した場合・100字まで）
        </Text>

        <TextInput
          key={id}
          value={note}
          onChangeText={(value) =>
            setNote(value.slice(0, 100))
          }
          multiline
          maxLength={100}
          placeholder="あとから編集もできます"
          style={styles.noteInput}
          textAlignVertical="top"
        />

        <Text style={styles.characterCount}>
          {note.length} / 100
        </Text>

        <Pressable
          style={styles.attendedButton}
          onPress={() =>
            decide('attended')
          }
        >
          <Text style={styles.attendedButtonText}>
            ✓ 受講した
          </Text>
        </Pressable>

        <Pressable
          style={styles.noShowButton}
          onPress={() =>
            decide('noShow')
          }
        >
          <Text style={styles.noShowButtonText}>
            × 無断キャンセル
          </Text>
        </Pressable>

        <Pressable
          style={styles.skipButton}
          onPress={skip}
        >
          <Text style={styles.skipButtonText}>
            あとで
          </Text>
        </Pressable>

        <Text style={styles.reviewHint}>
          「あとで」は判定を保存せず、今回の確認だけスキップします。
        </Text>
      </ScrollView>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}



function formatDateValue(
  year: number,
  monthIndex: number,
  day: number
): string {
  return (
    `${year}-` +
    `${String(monthIndex + 1).padStart(2, '0')}-` +
    `${String(day).padStart(2, '0')}`
  );
}

function parseDateValue(value: string): Date {
  const [year, month, day] =
    value.split('-').map(Number);

  if (
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    Number.isFinite(day)
  ) {
    return new Date(year, month - 1, day);
  }

  return new Date();
}

function CalendarPickerModal({
  visible,
  value,
  onChoose,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChoose: (value: string) => void;
  onClose: () => void;
}) {
  const initial = parseDateValue(value);

  const [viewYear, setViewYear] =
    useState(initial.getFullYear());

  const [viewMonth, setViewMonth] =
    useState(initial.getMonth());

  useEffect(() => {
    if (!visible) return;

    const selected =
      parseDateValue(value);

    setViewYear(selected.getFullYear());
    setViewMonth(selected.getMonth());
  }, [visible, value]);

  const firstWeekday =
    new Date(
      viewYear,
      viewMonth,
      1
    ).getDay();

  const daysInMonth =
    new Date(
      viewYear,
      viewMonth + 1,
      0
    ).getDate();

  const cells: Array<
    number | null
  > = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day += 1
  ) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  function moveMonth(delta: number) {
    const next = new Date(
      viewYear,
      viewMonth + delta,
      1
    );

    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const weekdays = [
    '日',
    '月',
    '火',
    '水',
    '木',
    '金',
    '土',
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.calendarBackdrop}>
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Pressable
              style={styles.calendarArrow}
              onPress={() => moveMonth(-1)}
            >
              <Text style={styles.calendarArrowText}>
                ‹
              </Text>
            </Pressable>

            <Text style={styles.calendarMonthTitle}>
              {viewYear}年 {viewMonth + 1}月
            </Text>

            <Pressable
              style={styles.calendarArrow}
              onPress={() => moveMonth(1)}
            >
              <Text style={styles.calendarArrowText}>
                ›
              </Text>
            </Pressable>
          </View>

          <View style={styles.calendarWeekRow}>
            {weekdays.map((weekday) => (
              <Text
                key={weekday}
                style={styles.calendarWeekday}
              >
                {weekday}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {cells.map((day, index) => {
              if (day === null) {
                return (
                  <View
                    key={`blank-${index}`}
                    style={styles.calendarDayCell}
                  />
                );
              }

              const dateValue =
                formatDateValue(
                  viewYear,
                  viewMonth,
                  day
                );

              const selected =
                dateValue === value;

              return (
                <Pressable
                  key={dateValue}
                  style={[
                    styles.calendarDayCell,
                    selected &&
                      styles.calendarSelectedDay,
                  ]}
                  onPress={() => {
                    onChoose(dateValue);
                    onClose();
                  }}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      selected &&
                        styles.calendarSelectedDayText,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={styles.modalCloseButton}
            onPress={onClose}
          >
            <Text style={styles.modalCloseText}>
              閉じる
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function formatTimeInput(
  value: string
): string {
  const digits = value
    .replace(/[^\x30-\x39]/g, '')
    .slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return (
    `${digits.slice(0, 2)}:` +
    `${digits.slice(2)}`
  );
}


function AddLessonScreen({
  existingLessons,
  onSave,
  onBack,
}: {
  existingLessons: TrackedLesson[];
  onSave: (
    lesson: ManualLesson,
    note: string
  ) => void;
  onBack: () => void;
}) {
  const today = new Date();
  const defaultDate =
    `${today.getFullYear()}-` +
    `${String(today.getMonth() + 1).padStart(2, '0')}-` +
    `${String(today.getDate()).padStart(2, '0')}`;

  const [date, setDate] = useState(defaultDate);
  const [calendarVisible, setCalendarVisible] =
    useState(false);
  const [startTime, setStartTime] = useState('1000');
  const [program, setProgram] = useState('');
  const [instructor, setInstructor] = useState('');
  const [studio, setStudio] = useState('');
  const [note, setNote] = useState('');

  const [selector, setSelector] = useState<
    'program' | 'instructor' | 'studio' | null
  >(null);

  const programOptions = useMemo(
    () =>
      Array.from(
        new Set(
          existingLessons
            .map((lesson) =>
              normalizeMasterValue(lesson.program)
            )
            .filter(Boolean)
        )
      ).sort(),
    [existingLessons]
  );

  const instructorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          existingLessons
            .map((lesson) =>
              normalizeMasterValue(lesson.instructor)
            )
            .filter(Boolean)
        )
      ).sort(),
    [existingLessons]
  );

  const studioOptions = useMemo(
    () =>
      Array.from(
        new Set(
          existingLessons
            .map((lesson) =>
              normalizeMasterValue(lesson.studio)
            )
            .filter(Boolean)
        )
      ).sort(),
    [existingLessons]
  );

  const options =
    selector === 'program'
      ? programOptions
      : selector === 'instructor'
      ? instructorOptions
      : studioOptions;

  const selectorTitle =
    selector === 'program'
      ? 'PROGRAM'
      : selector === 'instructor'
      ? 'IR'
      : '店舗';

  function choose(value: string) {
    const normalized =
      normalizeMasterValue(value);

    if (!normalized) return;

    if (selector === 'program') {
      setProgram(normalized);
    } else if (selector === 'instructor') {
      setInstructor(normalized);
    } else if (selector === 'studio') {
      setStudio(normalized);
    }

    setSelector(null);
  }

  function submit() {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      Alert.alert(
        '日付を確認してください',
        'YYYY-MM-DD の形式で入力してください。'
      );
      return;
    }

    if (
      !/^\d{2}:\d{2}$/.test(startTime) ||
      Number(startTime.slice(0, 2)) > 23 ||
      Number(startTime.slice(3, 5)) > 59
    ) {
      Alert.alert(
        '時間を確認してください',
        '4桁の半角数字で入力してください。例：1815 → 18:15'
      );
      return;
    }

    if (!program || !instructor || !studio) {
      Alert.alert(
        '未入力があります',
        'PROGRAM・IR・店舗を選択してください。'
      );
      return;
    }

    const lesson: ManualLesson = {
      manualId:
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      source: 'manual',
      date,
      startTime,
      endTime: '',
      program,
      instructor,
      studio,
      seat: null,
      evidence: 'unknown',
    };

    onSave(lesson, note);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.listContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title="ADD LESSON"
          onBack={onBack}
        />

        <Text style={styles.sectionDescription}>
          Gmailに残っていない受講履歴を手動で追加
        </Text>

        <FieldLabel label="日付" />
        <Pressable
          style={styles.selectButton}
          onPress={() =>
            setCalendarVisible(true)
          }
        >
          <Text style={styles.selectValue}>
            {date}
          </Text>
          <Text style={styles.calendarIcon}>
            ▦
          </Text>
        </Pressable>

        <FieldLabel label="開始時間" />
        <TextInput
          value={startTime}
          onChangeText={(value) =>
            setStartTime(
              formatTimeInput(value)
            )
          }
          placeholder="1815"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={5}
          style={styles.formInput}
        />
        <Text style={styles.inputHint}>
          半角数字4桁で入力（例：1815 → 18:15）
        </Text>

        <FieldLabel label="PROGRAM" />
        <SelectButton
          value={program}
          placeholder="PROGRAMを選択"
          onPress={() =>
            setSelector('program')
          }
        />

        <FieldLabel label="IR" />
        <SelectButton
          value={instructor}
          placeholder="IRを選択"
          onPress={() =>
            setSelector('instructor')
          }
        />

        <FieldLabel label="店舗" />
        <SelectButton
          value={studio}
          placeholder="店舗を選択"
          onPress={() =>
            setSelector('studio')
          }
        />

        <FieldLabel label="感想（100字まで）" />
        <TextInput
          value={note}
          onChangeText={(value) =>
            setNote(value.slice(0, 100))
          }
          multiline
          maxLength={100}
          placeholder="今日のレッスンの感想"
          style={styles.noteInput}
          textAlignVertical="top"
        />
        <Text style={styles.characterCount}>
          {note.length} / 100
        </Text>

        <Pressable
          style={styles.saveLessonButton}
          onPress={submit}
        >
          <Text style={styles.saveLessonButtonText}>
            受講済みとして追加
          </Text>
        </Pressable>
      </ScrollView>

      <CalendarPickerModal
        visible={calendarVisible}
        value={date}
        onChoose={setDate}
        onClose={() =>
          setCalendarVisible(false)
        }
      />

      <MasterSelectModal
        visible={selector !== null}
        title={selectorTitle}
        options={options}
        onChoose={choose}
        onClose={() => setSelector(null)}
      />

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function FieldLabel({
  label,
}: {
  label: string;
}) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
    </Text>
  );
}

function SelectButton({
  value,
  placeholder,
  onPress,
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.selectButton}
      onPress={onPress}
    >
      <Text
        style={
          value
            ? styles.selectValue
            : styles.selectPlaceholder
        }
      >
        {value || placeholder}
      </Text>
      <Text style={styles.selectArrow}>⌄</Text>
    </Pressable>
  );
}

function MasterSelectModal({
  visible,
  title,
  options,
  onChoose,
  onClose,
  formatOption,
}: {
  visible: boolean;
  title: string;
  options: string[];
  onChoose: (value: string) => void;
  onClose: () => void;
  formatOption?: (value: string) => string;
}) {
  const [newValue, setNewValue] =
    useState('');

  useEffect(() => {
    if (!visible) {
      setNewValue('');
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.masterModalCard}>
          <Text style={styles.modalTitle}>
            {title}を選択
          </Text>

          <ScrollView
            style={styles.masterOptionList}
            keyboardShouldPersistTaps="handled"
          >
            {options.map((option) => (
              <Pressable
                key={option}
                style={styles.masterOption}
                onPress={() =>
                  onChoose(option)
                }
              >
                <Text style={styles.masterOptionText}>
                  {formatOption ? formatOption(option) : option}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.newMasterLabel}>
            候補にない場合
          </Text>

          <View style={styles.newMasterRow}>
            <TextInput
              value={newValue}
              onChangeText={setNewValue}
              placeholder={`新しい${title}`}
              style={styles.newMasterInput}
            />
            <Pressable
              style={styles.newMasterButton}
              onPress={() => {
                if (newValue.trim()) {
                  onChoose(newValue);
                }
              }}
            >
              <Text style={styles.newMasterButtonText}>
                追加
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.modalCloseButton}
            onPress={onClose}
          >
            <Text style={styles.modalCloseText}>
              閉じる
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        active && styles.filterChipActive,
      ]}
    >
      <Text
        style={[
          styles.filterChipText,
          active && styles.filterChipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}


// ========================================
// IR
// ========================================


function StudioScreen({
  lessons,
  onBack,
}: {
  lessons: TrackedLesson[];
  onBack: () => void;
}) {
  const {
    periodMode,
    setPeriodMode,
    filteredLessons,
    periodLabel,
    hasPrevious,
    hasNext,
    goPrevious,
    goNext,
  } = usePeriodFilter(lessons);

  const studios =
    countByStudio(filteredLessons);

  const [
    selectedStudio,
    setSelectedStudio,
  ] = useState<string | null>(null);

  const selectedLessons =
    selectedStudio === null
      ? []
      : filteredLessons.filter(
          (lesson) =>
            normalizeMasterValue(
              lesson.studio
            ) === selectedStudio
        );

  const irBreakdown =
    countByInstructor(selectedLessons);

  const programBreakdown =
    countByProgram(selectedLessons);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.listContainer
        }
      >
        <Header
          title="STUDIO"
          onBack={onBack}
        />

        <Text
          style={styles.sectionDescription}
        >
          受講済みレッスンのみ集計
        </Text>

        <PeriodSelector
          mode={periodMode}
          onModeChange={setPeriodMode}
          label={periodLabel}
          onPrevious={goPrevious}
          onNext={goNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          lessonCount={
            filteredLessons.length
          }
        />

        {studios.length === 0 ? (
          <Text style={styles.emptyText}>
            HISTORY から受講済みレッスンを設定してください。
          </Text>
        ) : (
          <>
            <HorizontalCountBars
              items={studios}
              selectedName={selectedStudio}
              onPressItem={(name) =>
                setSelectedStudio(
                  selectedStudio === name
                    ? null
                    : name
                )
              }
            />

            {selectedStudio !== null ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailTitle}>
                  {selectedStudio}
                </Text>

                <Text style={styles.detailSubtitle}>
                  IR別
                </Text>
                <HorizontalCountBars
                  items={irBreakdown}
                  formatName={formatInstructorName}
                />

                <Text style={styles.detailSubtitle}>
                  PROGRAM別
                </Text>

                <View style={styles.studioProgramBreakdown}>
                {programBreakdown.map((item) => {
                  const maxProgramCount =
                    programBreakdown.length > 0
                      ? programBreakdown[0].count
                      : 1;

                  return (
                    <View
                      style={styles.programBreakdownRow}
                      key={item.name}
                    >
                      <View style={styles.programBreakdownHeader}>
                        <View style={styles.programBreakdownName}>
                          <ProgramBadge program={item.name} />
                        </View>

                        <Text style={styles.drillCount}>
                          {item.count}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.programBreakdownTrack,
                          styles.studioProgramBarTrack,
                        ]}
                      >
                        <View
                          style={[
                            styles.programBreakdownBar,
                            {
                              width: `${
                                (item.count /
                                  maxProgramCount) *
                                100
                              }%`,
                              backgroundColor:
                                getProgramColor(
                                  item.name
                                ).main,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}


function InstructorScreen({
  lessons,
  onBack,
}: {
  lessons: TrackedLesson[];
  onBack: () => void;
}) {
  const {
    filteredLessons,
    periodMode,
    setPeriodMode,
    periodLabel,
    goPrevious,
    goNext,
    hasPrevious,
    hasNext,
  } = usePeriodFilter(lessons);

  const [selectedInstructor, setSelectedInstructor] =
    useState<string | null>(null);

  const instructors =
    countByInstructor(filteredLessons);

  const selectedInstructorLessons =
    selectedInstructor === null
      ? []
      : filteredLessons.filter(
          (lesson) =>
            lesson.instructor ===
            selectedInstructor
        );

  const instructorPrograms =
    countByProgram(
      selectedInstructorLessons
    );

  const instructorMonthlyTrend =
    selectedInstructor === null
      ? []
      : getMonthlyTrend(
          lessons,
          (lesson) =>
            lesson.instructor === selectedInstructor
        );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.listContainer
        }
      >
        <Header
          title="IR"
          onBack={onBack}
        />

        <Text
          style={styles.sectionDescription}
        >
          受講済みレッスンのみ集計
        </Text>

        <PeriodSelector
          mode={periodMode}
          onModeChange={setPeriodMode}
          label={periodLabel}
          onPrevious={goPrevious}
          onNext={goNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          lessonCount={filteredLessons.length}
        />

        {instructors.length === 0 ? (
          <Text style={styles.emptyText}>
            HISTORYから受講済みレッスンを設定してください。
          </Text>
        ) : (
          <>
            <HorizontalCountBars
              items={instructors}
              selectedName={selectedInstructor}
              showRank
              formatName={formatInstructorName}
              onPressItem={(name) =>
                setSelectedInstructor(
                  selectedInstructor === name
                    ? null
                    : name
                )
              }
            />

            {selectedInstructor !== null && (
              <View style={styles.drillCard}>
                <Text style={styles.drillTitle}>
                  {formatInstructorName(selectedInstructor)}
                </Text>

                <Text style={styles.drillSubtitle}>
                  {periodLabel} · {selectedInstructorLessons.length}回
                </Text>

                <MonthlyTrendBars
                  title={`${formatInstructorName(selectedInstructor)} の月別推移`}
                  items={instructorMonthlyTrend}
                />

                <Text style={styles.breakdownLabel}>
                  PROGRAM内訳
                </Text>

                {instructorPrograms.map(
                  (item, index) => {
                    const maxProgramCount =
                      instructorPrograms.length > 0
                        ? instructorPrograms[0].count
                        : 1;

                    return (
                      <View
                        style={styles.programBreakdownRow}
                        key={item.name}
                      >
                        <View style={styles.programBreakdownHeader}>
                          <Text style={styles.drillRank}>
                            {index + 1}
                          </Text>

                          <View style={styles.programBreakdownName}>
                            <ProgramBadge program={item.name} />
                          </View>

                          <Text style={styles.drillCount}>
                            {item.count}
                          </Text>
                        </View>

                        <View style={styles.programBreakdownBarRow}>
                          <View style={styles.programBreakdownRankSpacer} />
                          <View style={styles.programBreakdownTrack}>
                            <View
                              style={[
                                styles.programBreakdownBar,
                                {
                                  width: `${
                                    (item.count /
                                      maxProgramCount) *
                                    100
                                  }%`,
                                  backgroundColor:
                                    getProgramColor(
                                      item.name
                                    ).main,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                    );
                  }
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

// ========================================
// PROGRAM
// ========================================

function ProgramScreen({
  lessons,
  onBack,
}: {
  lessons: TrackedLesson[];
  onBack: () => void;
}) {
  const {
    filteredLessons,
    periodMode,
    setPeriodMode,
    periodLabel,
    goPrevious,
    goNext,
    hasPrevious,
    hasNext,
  } = usePeriodFilter(lessons);

  const [selectedProgram, setSelectedProgram] =
    useState<string | null>(null);

  const programs =
    countByProgram(filteredLessons);

  const selectedProgramLessons =
    selectedProgram === null
      ? []
      : filteredLessons.filter(
          (lesson) =>
            lesson.program ===
            selectedProgram
        );

  const programInstructors =
    countByInstructor(
      selectedProgramLessons
    );

  const programMonthlyTrend =
    selectedProgram === null
      ? []
      : getMonthlyTrend(
          lessons,
          (lesson) =>
            lesson.program === selectedProgram
        );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.listContainer
        }
      >
        <Header
          title="PROGRAM"
          onBack={onBack}
        />

        <Text
          style={styles.sectionDescription}
        >
          受講済みレッスンのみ集計
        </Text>

        <PeriodSelector
          mode={periodMode}
          onModeChange={setPeriodMode}
          label={periodLabel}
          onPrevious={goPrevious}
          onNext={goNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          lessonCount={filteredLessons.length}
        />

        {programs.length === 0 ? (
          <Text style={styles.emptyText}>
            HISTORYから受講済みレッスンを設定してください。
          </Text>
        ) : (
          <>
            <HorizontalCountBars
              items={programs}
              selectedName={selectedProgram}
              colorByProgram
              onPressItem={(name) =>
                setSelectedProgram(
                  selectedProgram === name
                    ? null
                    : name
                )
              }
            />

            {selectedProgram !== null && (
              <View style={styles.drillCard}>
                <ProgramBadge
                  program={selectedProgram}
                />

                <Text style={styles.drillSubtitle}>
                  {periodLabel} · {selectedProgramLessons.length}回
                </Text>

                <MonthlyTrendBars
                  title={`${selectedProgram} の月別推移`}
                  items={programMonthlyTrend}
                />

                <Text style={styles.breakdownLabel}>
                  IR内訳
                </Text>

                {programInstructors.map(
                  (item, index) => (
                    <View
                      style={styles.drillRow}
                      key={formatInstructorName(item.name)}
                    >
                      <Text style={styles.drillRank}>
                        {index + 1}
                      </Text>

                      <Text style={styles.drillName}>
                        {formatInstructorName(item.name)}
                      </Text>

                      <Text style={styles.drillCount}>
                        {item.count}
                      </Text>
                    </View>
                  )
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function usePeriodFilter(
  lessons: TrackedLesson[]
) {
  const [periodMode, setPeriodMode] =
    useState<PeriodMode>('all');

  const years = useMemo(
    () =>
      Array.from(
        new Set(
          lessons.map((lesson) =>
            lesson.date.slice(0, 4)
          )
        )
      ).sort(),
    [lessons]
  );

  const months = useMemo(
    () =>
      Array.from(
        new Set(
          lessons.map((lesson) =>
            lesson.date.slice(0, 7)
          )
        )
      ).sort(),
    [lessons]
  );

  const [yearIndex, setYearIndex] =
    useState(
      Math.max(years.length - 1, 0)
    );

  const [monthIndex, setMonthIndex] =
    useState(
      Math.max(months.length - 1, 0)
    );

  const currentYear =
    years[yearIndex] ?? '';

  const currentMonth =
    months[monthIndex] ?? '';

  const filteredLessons = useMemo(
    () => {
      if (periodMode === 'year') {
        return lessons.filter(
          (lesson) =>
            lesson.date.startsWith(
              currentYear
            )
        );
      }

      if (periodMode === 'month') {
        return lessons.filter(
          (lesson) =>
            lesson.date.startsWith(
              currentMonth
            )
        );
      }

      return lessons;
    },
    [
      lessons,
      periodMode,
      currentYear,
      currentMonth,
    ]
  );

  const periodLabel =
    periodMode === 'year'
      ? currentYear
        ? `${currentYear}年`
        : 'データなし'
      : periodMode === 'month'
        ? currentMonth
          ? `${currentMonth.slice(0, 4)}年${Number(
              currentMonth.slice(5, 7)
            )}月`
          : 'データなし'
        : '全期間';

  function changeMode(
    mode: PeriodMode
  ) {
    setPeriodMode(mode);

    if (mode === 'year') {
      setYearIndex(
        Math.max(years.length - 1, 0)
      );
    }

    if (mode === 'month') {
      setMonthIndex(
        Math.max(months.length - 1, 0)
      );
    }
  }

  const hasPrevious =
    periodMode === 'year'
      ? yearIndex > 0
      : periodMode === 'month'
        ? monthIndex > 0
        : false;

  const hasNext =
    periodMode === 'year'
      ? yearIndex < years.length - 1
      : periodMode === 'month'
        ? monthIndex < months.length - 1
        : false;

  function goPrevious() {
    if (periodMode === 'year') {
      setYearIndex((index) =>
        Math.max(index - 1, 0)
      );
    }

    if (periodMode === 'month') {
      setMonthIndex((index) =>
        Math.max(index - 1, 0)
      );
    }
  }

  function goNext() {
    if (periodMode === 'year') {
      setYearIndex((index) =>
        Math.min(
          index + 1,
          years.length - 1
        )
      );
    }

    if (periodMode === 'month') {
      setMonthIndex((index) =>
        Math.min(
          index + 1,
          months.length - 1
        )
      );
    }
  }

  return {
    filteredLessons,
    periodMode,
    setPeriodMode: changeMode,
    periodLabel,
    goPrevious,
    goNext,
    hasPrevious,
    hasNext,
  };
}



type MonthlyCountItem = {
  key: string;
  label: string;
  count: number;
};

function getMonthlyTrend(
  lessons: TrackedLesson[],
  predicate: (lesson: TrackedLesson) => boolean
): MonthlyCountItem[] {
  const matched = lessons.filter(predicate);

  if (matched.length === 0) return [];

  const keys = matched
    .map((lesson) => lesson.date.slice(0, 7))
    .filter((key) => /^\d{4}-\d{2}$/.test(key))
    .sort();

  if (keys.length === 0) return [];

  const [startYear, startMonth] =
    keys[0].split('-').map(Number);
  const [endYear, endMonth] =
    keys[keys.length - 1].split('-').map(Number);

  const counts = new Map<string, number>();

  matched.forEach((lesson) => {
    const key = lesson.date.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const result: MonthlyCountItem[] = [];
  let year = startYear;
  let month = startMonth;

  while (
    year < endYear ||
    (year === endYear && month <= endMonth)
  ) {
    const key =
      `${year}-${String(month).padStart(2, '0')}`;

    result.push({
      key,
      label: `${year}.${String(month).padStart(2, '0')}`,
      count: counts.get(key) ?? 0,
    });

    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  return result;
}

function MonthlyTrendBars({
  title,
  items,
}: {
  title: string;
  items: MonthlyCountItem[];
}) {
  if (items.length === 0) return null;

  const max = Math.max(
    1,
    ...items.map((item) => item.count)
  );

  return (
    <View style={styles.monthlyTrendCard}>
      <Text style={styles.monthlyTrendTitle}>
        {title}
      </Text>
      <Text style={styles.monthlyTrendCaption}>
        月別受講回数
      </Text>

      {items.map((item) => (
        <View
          key={item.key}
          style={styles.monthlyTrendRow}
        >
          <Text style={styles.monthlyTrendLabel}>
            {item.label}
          </Text>

          <View style={styles.monthlyTrendTrack}>
            {item.count > 0 ? (
              <View
                style={[
                  styles.monthlyTrendBar,
                  {
                    width: `${(item.count / max) * 100}%`,
                  },
                ]}
              />
            ) : null}
          </View>

          <Text style={styles.monthlyTrendValue}>
            {item.count}
          </Text>
        </View>
      ))}
    </View>
  );
}


function formatInstructorName(name: string): string {
  const trimmed = name.trim();
  return trimmed.endsWith('さん')
    ? trimmed
    : `${trimmed}さん`;
}



function ProgramBadge({
  program,
  showRank,
}: {
  program: string;
  showRank?: string;
}) {
  return (
    <View style={styles.programBadgeLine}>
      {showRank ? (
        <Text style={styles.programBadgeRank}>
          {showRank}
        </Text>
      ) : null}

      <View
        style={[
          styles.programSummaryBadge,
          {
            backgroundColor:
              getProgramColor(program).main,
          },
        ]}
      >
        <Text style={styles.programSummaryBadgeText}>
          {program}
        </Text>
      </View>
    </View>
  );
}


function HorizontalCountBars({
  items,
  onPressItem,
  selectedName,
  showRank = false,
  formatName,
  colorByProgram = false,
}: {
  items: CountItem[];
  onPressItem?: (name: string) => void;
  selectedName?: string | null;
  showRank?: boolean;
  formatName?: (name: string) => string;
  colorByProgram?: boolean;
}) {
  const max =
    items.length > 0
      ? Math.max(
          ...items.map(
            (item) => item.count
          )
        )
      : 1;

  return (
    <View style={styles.chartCard}>
      {items.map((item, index) => {
        const rank =
          index === 0
            ? 1
            : items[index - 1].count === item.count
            ? items
                .slice(0, index)
                .findIndex(
                  (previous) =>
                    previous.count === item.count
                ) + 1
            : index + 1;

        return (
        <Pressable
          key={item.name}
          disabled={!onPressItem}
          onPress={() =>
            onPressItem?.(item.name)
          }
          style={[
            styles.chartRow,
            selectedName === item.name &&
              styles.selectedChartRow,
          ]}
        >
          <View style={styles.chartHeader}>
            {colorByProgram ? (
              <View style={styles.chartName}>
                <ProgramBadge
                  program={item.name}
                  showRank={
                    showRank ? `${rank}位` : undefined
                  }
                />
              </View>
            ) : (
              <Text style={styles.chartName}>
                {showRank
                  ? `${rank}位  ${
                      formatName
                        ? formatName(item.name)
                        : item.name
                    }`
                  : formatName
                  ? formatName(item.name)
                  : item.name}
              </Text>
            )}

            <Text style={styles.chartValue}>
              {item.count}
            </Text>
          </View>

          <View style={styles.chartTrack}>
            <View
              style={[
                styles.chartBar,
                {
                  width: `${
                    (item.count / max) * 100
                  }%`,
                  ...(colorByProgram
                    ? {
                        backgroundColor:
                          getProgramColor(
                            item.name
                          ).main,
                      }
                    : {}),
                },
              ]}
            />
          </View>
        </Pressable>
        );
      })}
    </View>
  );
}


function PeriodSelector({
  mode,
  onModeChange,
  label,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  lessonCount,
}: {
  mode: PeriodMode;
  onModeChange: (
    mode: PeriodMode
  ) => void;
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  lessonCount: number;
}) {
  return (
    <View style={styles.periodArea}>
      <View style={styles.periodModeRow}>
        <FilterChip
          label="全期間"
          active={mode === 'all'}
          onPress={() =>
            onModeChange('all')
          }
        />

        <FilterChip
          label="年ごと"
          active={mode === 'year'}
          onPress={() =>
            onModeChange('year')
          }
        />

        <FilterChip
          label="月ごと"
          active={mode === 'month'}
          onPress={() =>
            onModeChange('month')
          }
        />
      </View>

      <View style={styles.periodNavigator}>
        <Pressable
          onPress={onPrevious}
          disabled={!hasPrevious}
          hitSlop={10}
        >
          <Text
            style={[
              styles.periodArrow,
              !hasPrevious &&
                styles.periodArrowDisabled,
            ]}
          >
            ‹
          </Text>
        </Pressable>

        <View style={styles.periodCenter}>
          <Text style={styles.periodLabel}>
            {label}
          </Text>

          <Text style={styles.periodCount}>
            {lessonCount}回受講
          </Text>
        </View>

        <Pressable
          onPress={onNext}
          disabled={!hasNext}
          hitSlop={10}
        >
          <Text
            style={[
              styles.periodArrow,
              !hasNext &&
                styles.periodArrowDisabled,
            ]}
          >
            ›
          </Text>
        </Pressable>
      </View>
    </View>
  );
}


// ========================================
// STYLE
// ========================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    fontSize: 28,
    fontWeight: '700',
  },

  container: {
    paddingTop: 50,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 40,
  },

  totalArea: {
    alignItems: 'center',
    marginBottom: 25,
  },

  label: {
    fontSize: 14,
    color: '#777',
    letterSpacing: 2,
  },

  count: {
    fontSize: 64,
    fontWeight: '700',
    marginTop: 5,
  },

  totalNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },

  summaryBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },

  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
  },

  summaryLabel: {
    fontSize: 11,
    color: '#777',
    marginTop: 5,
  },

  reviewBreakdown: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  reviewBreakdownText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginBottom: 7,
  },

  reviewBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    flexWrap: 'wrap',
  },

  reviewBreakdownItem: {
    fontSize: 12,
    color: '#666',
  },

  subSummary: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 30,
  },

  subSummaryText: {
    fontSize: 12,
    color: '#777',
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cardPressed: {
    opacity: 0.55,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
  },

  cardText: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
  },

  arrow: {
    fontSize: 36,
    color: '#aaa',
  },

  listContainer: {
    paddingTop: 35,
    paddingHorizontal: 24,
    paddingBottom: 50,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },

  back: {
    fontSize: 46,
    lineHeight: 46,
    marginRight: 15,
  },

  headerTitle: {
    fontSize: 30,
    fontWeight: '700',
  },

  sectionDescription: {
    color: '#777',
    fontSize: 15,
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 15,
    marginBottom: 15,
  },

  legend: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 15,
    marginBottom: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },

  legendText: {
    fontSize: 12,
    color: '#666',
  },

  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },

  filterChip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  filterChipActive: {
    backgroundColor: '#222',
    borderColor: '#222',
  },

  filterChipText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },

  filterChipTextActive: {
    color: '#fff',
  },

  periodArea: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 22,
  },

  periodModeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  periodNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: 8,
  },

  periodCenter: {
    alignItems: 'center',
  },

  periodLabel: {
    fontSize: 17,
    fontWeight: '700',
  },

  periodCount: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },

  periodArrow: {
    fontSize: 34,
    color: '#222',
    lineHeight: 36,
  },

  periodArrowDisabled: {
    color: '#ddd',
  },

  historyDrillArea: {
    marginBottom: 16,
  },

  historyDrillTitle: {
    fontSize: 12,
    color: '#777',
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 8,
  },

  horizontalChips: {
    gap: 8,
    paddingRight: 18,
    paddingBottom: 10,
  },

  filteredCount: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },

  selectedDrillItem: {
    borderWidth: 2,
    borderColor: '#222',
  },

  drillCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginTop: 8,
    marginBottom: 20,
  },

  drillTitle: {
    fontSize: 18,
    fontWeight: '700',
  },

  drillSubtitle: {
    fontSize: 12,
    color: '#777',
    marginTop: 5,
    marginBottom: 14,
  },

  drillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },

  drillRank: {
    width: 28,
    color: '#999',
    fontSize: 12,
  },

  drillName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },

  drillCount: {
    fontSize: 16,
    fontWeight: '700',
  },

  programBadgeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },

  programBadgeRank: {
    color: '#777',
    fontSize: 12,
    marginRight: 8,
  },

  programSummaryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: '100%',
  },

  programSummaryBadgeText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '700',
  },

  programBreakdownRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },

  programBreakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  programBreakdownName: {
    flex: 1,
  },

  programBreakdownBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  programBreakdownRankSpacer: {
    width: 28,
  },

  programBreakdownTrack: {
    flex: 1,
    height: 9,
    backgroundColor: '#e5e5e5',
    borderRadius: 5,
    overflow: 'hidden',
  },

  programBreakdownBar: {
    height: '100%',
    borderRadius: 5,
  },

  studioProgramBreakdown: {
    marginHorizontal: 18,
  },

  studioProgramBarTrack: {
    marginTop: 10,
  },

  calendarMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  calendarMonthButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthArrow: {
    fontSize: 34,
    fontWeight: '300',
    color: '#111111',
  },
  calendarMonthTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
  },
  calendarMonthCount: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#666666',
    marginBottom: 16,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    paddingBottom: 8,
  },
  calendarWeekText: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#777777',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  calendarDayCell: {
    width: '14.2857%',
    minHeight: 88,
    paddingHorizontal: 2,
    paddingTop: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  calendarDayCellSelected: {
    backgroundColor: '#F3F3F3',
  },
  calendarDayNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 5,
    paddingLeft: 2,
  },
  calendarPrograms: {
    gap: 3,
    width: '100%',
  },
  calendarProgramChip: {
    width: '100%',
    height: 22,
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 3,
  },
  calendarProgramText: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
    color: '#111111',
  },
  calendarMoreText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#666666',
    paddingLeft: 2,
  },
  calendarDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 18,
    marginBottom: 20,
  },
  calendarDetailDate: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 12,
  },
  calendarDetailRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  calendarDetailColor: {
    width: 5,
    borderRadius: 3,
    marginRight: 10,
  },
  calendarDetailBody: {
    flex: 1,
  },
  calendarDetailProgram: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  calendarDetailMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#666666',
  },
  calendarEmptyText: {
    fontSize: 13,
    color: '#777777',
  },
  calendarHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#777777',
    marginBottom: 24,
  },

  bodySummaryTitle: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#444444',
  },
  bodySummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bodySummaryCard: {
    width: '48%',
    minHeight: 112,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E3E3',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  bodySummaryLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#777777',
  },
  bodySummaryValue: {
    marginTop: 9,
    fontSize: 30,
    fontWeight: '900',
    color: '#111111',
  },
  bodySummaryValueSmall: {
    marginTop: 12,
    fontSize: 21,
    fontWeight: '900',
    color: '#111111',
  },
  bodySummarySub: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#777777',
  },
  bodySummaryNote: {
    marginTop: 10,
    fontSize: 10,
    lineHeight: 15,
    color: '#888888',
  },

  bodyChartSectionTitle: {
    marginTop: 28,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#444444',
  },
  bodyChartCard: {
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E3E3',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  bodyChartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  bodyChartTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#555555',
  },
  bodyChartLatest: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111111',
  },
  bodyChartEmpty: {
    paddingVertical: 28,
    textAlign: 'center',
    fontSize: 13,
    color: '#888888',
  },

  bodyInputCard: {
    marginTop: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E3E3E3',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  bodyInputLabel: {
    marginTop: 14,
    marginBottom: 7,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#777777',
  },
  bodyDateInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#D8D8D8',
    borderRadius: 13,
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  bodyValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bodyValueInput: {
    flex: 1,
    height: 54,
    borderWidth: 1,
    borderColor: '#D8D8D8',
    borderRadius: 13,
    paddingHorizontal: 14,
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
  },
  bodyUnit: {
    width: 42,
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '800',
    color: '#444444',
  },
  bodyKeyboardButton: {
    alignSelf: 'flex-end',
    paddingVertical: 9,
  },
  bodyKeyboardButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#555555',
  },
  bodySaveButton: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#111111',
  },
  bodySaveButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bodyHistoryTitle: {
    marginTop: 28,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#444444',
  },
  bodyHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  bodyHistoryDate: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  bodyHistorySource: {
    marginTop: 3,
    fontSize: 10,
    color: '#888888',
  },
  bodyHistoryValues: {
    alignItems: 'flex-end',
    gap: 3,
  },
  bodyHistoryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#222222',
  },
  bodyDeleteButton: {
    alignItems: 'center',
    marginTop: 22,
    paddingVertical: 12,
  },
  bodyDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#777777',
  },

  historyCalorieText: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '800',
    color: '#333333',
  },

  calorieButton: {
    alignSelf: 'flex-start',
    marginTop: 9,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  calorieButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#222222',
  },
  calorieModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  calorieModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
  },
  calorieModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111111',
  },
  calorieModalProgram: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  calorieModalMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#777777',
  },
  calorieOfficialGuide: {
    marginTop: 16,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#666666',
  },

  calorieInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
  },
  calorieInput: {
    flex: 1,
    height: 54,
    borderWidth: 1,
    borderColor: '#D8D8D8',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
    backgroundColor: '#FAFAFA',
  },
  calorieUnit: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '800',
    color: '#444444',
  },
  calorieKeyboardDone: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  calorieKeyboardDoneText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#555555',
  },

  calorieModalHint: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    color: '#777777',
  },
  calorieModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  calorieCancelButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#EEEEEE',
  },
  calorieCancelText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#444444',
  },
  calorieSaveButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#111111',
  },
  calorieSaveText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  calorieDeleteButton: {
    alignItems: 'center',
    paddingTop: 16,
  },
  calorieDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#777777',
  },

  importInfoCard: {
    backgroundColor: '#f7f7f7',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },

  importInfoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },

  importInfoText: {
    fontSize: 13,
    color: '#333',
    marginBottom: 4,
  },

  importInfoHint: {
    fontSize: 12,
    color: '#777',
    lineHeight: 18,
    marginTop: 6,
  },

  importFileButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 16,
  },

  importFileButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  importFileCard: {
    borderWidth: 1,
    borderColor: '#e4e4e4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },

  importFileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },

  importFileMeta: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },

  importSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginTop: 4,
    marginBottom: 10,
  },

  importDetectedCard: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  importDetectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  importDetectedLabel: {
    fontSize: 12,
    color: '#777',
    width: 80,
  },

  importDetectedValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    color: '#111',
    fontWeight: '600',
  },

  importDetectedMissing: {
    color: '#c0392b',
  },

  importSummaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },

  importSummaryBox: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },

  importSummaryNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },

  importSummaryLabel: {
    fontSize: 11,
    color: '#777',
    marginTop: 3,
  },

  importPreviewCard: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
    backgroundColor: '#fff',
  },

  importPreviewError: {
    borderColor: '#e6b8b2',
    backgroundColor: '#fff9f8',
  },

  importPreviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  importPreviewDate: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },

  importPreviewStatus: {
    fontSize: 11,
    color: '#277a42',
    fontWeight: '700',
  },

  importDuplicateText: {
    color: '#777',
  },

  importErrorText: {
    color: '#c0392b',
    fontSize: 11,
    marginTop: 7,
  },

  importPreviewMeta: {
    color: '#666',
    fontSize: 12,
    marginTop: 7,
  },

  importMoreText: {
    textAlign: 'center',
    color: '#777',
    fontSize: 12,
    marginVertical: 8,
  },

  importExecuteButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
  },

  importDisabledButton: {
    opacity: 0.35,
  },

  importExecuteButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  importFootnote: {
    color: '#777',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
    marginBottom: 20,
  },

  resetButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  resetButtonTitle: {
    fontSize: 14,
    fontWeight: '700',
  },

  resetButtonText: {
    color: '#777',
    fontSize: 12,
    marginTop: 4,
  },

  historyRow: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
  },

  cancelledRow: {
    opacity: 0.65,
  },

  dateArea: {
    width: 80,
  },

  date: {
    fontSize: 17,
    fontWeight: '700',
  },

  time: {
    color: '#777',
    marginTop: 4,
  },

  lessonArea: {
    flex: 1,
  },

  lessonName: {
    fontSize: 17,
    fontWeight: '700',
  },

  programBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },

  programBadgeText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },


  lessonDetail: {
    color: '#666',
    marginTop: 5,
  },

  mailEvidence: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
  },

  statusReview: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
  },

  statusAttended: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
  },

  statusNoShow: {
    fontSize: 13,
    color: '#888',
    fontWeight: '700',
    marginTop: 5,
  },

  statusCancelled: {
    fontSize: 13,
    color: '#888',
    fontWeight: '700',
    marginTop: 5,
  },

  detailBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
  },

  detailTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },

  detailSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    marginTop: 8,
    marginBottom: 8,
  },

  monthlyTrendCard: {
    marginTop: 14,
    marginBottom: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },

  monthlyTrendTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 3,
  },

  monthlyTrendCaption: {
    fontSize: 12,
    color: '#777',
    marginBottom: 14,
  },

  monthlyTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  monthlyTrendLabel: {
    width: 66,
    fontSize: 12,
    color: '#666',
  },

  monthlyTrendTrack: {
    flex: 1,
    height: 9,
    backgroundColor: '#e5e5e5',
    borderRadius: 5,
    overflow: 'hidden',
  },

  monthlyTrendBar: {
    height: '100%',
    backgroundColor: '#222',
    borderRadius: 5,
  },

  monthlyTrendValue: {
    width: 30,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
  },

  breakdownLabel: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 8,
  },

  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },

  chartRow: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },

  selectedChartRow: {
    backgroundColor: '#f0f0f0',
  },

  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  chartName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingRight: 12,
  },

  chartValue: {
    fontSize: 15,
    fontWeight: '700',
  },

  chartTrack: {
    height: 9,
    backgroundColor: '#e5e5e5',
    borderRadius: 5,
    overflow: 'hidden',
  },

  chartBar: {
    height: '100%',
    backgroundColor: '#222',
    borderRadius: 5,
  },

  quickReviewButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d6d6d6',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 18,
  },

  quickReviewButtonText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '800',
  },

  quickReviewButtonSubtext: {
    color: '#777',
    fontSize: 11,
    marginTop: 3,
  },

  reviewContainer: {
    padding: 24,
    paddingBottom: 48,
  },

  reviewProgress: {
    fontSize: 14,
    fontWeight: '700',
    color: '#777',
    marginBottom: 14,
  },

  reviewLessonCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
    marginBottom: 22,
  },

  reviewDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
  },

  reviewTime: {
    fontSize: 15,
    color: '#777',
    marginTop: 4,
  },

  reviewProgram: {
    fontSize: 27,
    fontWeight: '800',
    marginTop: 20,
  },

  reviewProgramBadge: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
    marginBottom: 8,
  },

  reviewProgramBadgeText: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '800',
  },


  reviewMeta: {
    fontSize: 17,
    color: '#555',
    marginTop: 8,
  },

  reviewEvidence: {
    fontSize: 13,
    color: '#888',
    marginTop: 18,
  },

  reviewMemoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    marginBottom: 8,
  },

  attendedButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },

  attendedButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },

  noShowButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },

  noShowButtonText: {
    color: '#222',
    fontSize: 16,
    fontWeight: '700',
  },

  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },

  skipButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '700',
  },

  reviewHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
  },

  reviewDoneCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    marginTop: 30,
  },

  reviewDoneTitle: {
    fontSize: 23,
    fontWeight: '800',
    marginBottom: 10,
  },

  reviewDoneText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },

  reviewDoneHint: {
    fontSize: 14,
    lineHeight: 21,
    color: '#777',
    marginBottom: 22,
  },

  addLessonButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 18,
  },

  addLessonButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  notePreview: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: '#555',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },

  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
  },

  masterModalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    maxHeight: '82%',
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },

  modalSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: '#666',
    marginBottom: 14,
  },

  noteInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#d6d6d6',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },

  characterCount: {
    textAlign: 'right',
    color: '#777',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 14,
  },

  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },

  primaryButton: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },

  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },

  secondaryButton: {
    flex: 1,
    backgroundColor: '#eee',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },

  secondaryButtonText: {
    color: '#222',
    fontWeight: '700',
  },

  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },

  calendarCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
  },

  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  calendarArrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  calendarArrowText: {
    fontSize: 34,
    color: '#222',
  },

  lessonCalendarMonthTitle: {
    fontSize: 19,
    fontWeight: '800',
  },

  lessonCalendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },

  calendarWeekday: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#777',
  },

  lessonCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    marginBottom: 18,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#DDDDDD',
  },

  lessonCalendarDayCell: {
    width: '14.2857%',
    height: 112,
    paddingHorizontal: 3,
    paddingTop: 7,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DDDDDD',
    overflow: 'hidden',
  },

  calendarDayText: {
    fontSize: 15,
    color: '#222',
  },

  calendarSelectedDay: {
    backgroundColor: '#111',
  },

  calendarSelectedDayText: {
    color: '#fff',
    fontWeight: '800',
  },

  calendarIcon: {
    fontSize: 20,
    color: '#666',
  },

  inputHint: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    marginBottom: 2,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    marginTop: 12,
    marginBottom: 7,
  },

  formInput: {
    borderWidth: 1,
    borderColor: '#d6d6d6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    backgroundColor: '#fff',
  },

  selectButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#d6d6d6',
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },

  selectValue: {
    fontSize: 16,
    color: '#111',
    flex: 1,
  },

  selectPlaceholder: {
    fontSize: 16,
    color: '#999',
    flex: 1,
  },

  selectArrow: {
    fontSize: 20,
    color: '#666',
  },

  saveLessonButton: {
    marginTop: 22,
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },

  saveLessonButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  masterOptionList: {
    maxHeight: 330,
    marginTop: 8,
    marginBottom: 14,
  },

  masterOption: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },

  masterOptionText: {
    fontSize: 16,
  },

  newMasterLabel: {
    fontSize: 12,
    color: '#777',
    marginBottom: 7,
  },

  newMasterRow: {
    flexDirection: 'row',
    gap: 8,
  },

  newMasterInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d6d6d6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },

  newMasterButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },

  newMasterButtonText: {
    color: '#fff',
    fontWeight: '700',
  },

  modalCloseButton: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },

  modalCloseText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#555',
  },

  rankingItem: {
    marginBottom: 25,
  },

  rankingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9,
  },

  rankingName: {
    fontSize: 18,
    fontWeight: '600',
  },

  rankingCount: {
    fontSize: 18,
    fontWeight: '700',
  },

  barBackground: {
    height: 8,
    backgroundColor: '#ddd',
    borderRadius: 4,
    overflow: 'hidden',
  },

  bar: {
    height: '100%',
    backgroundColor: '#222',
    borderRadius: 4,
  },

  programRow: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  rank: {
    width: 35,
    color: '#888',
    fontSize: 15,
  },

  programName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },

  programCount: {
    fontSize: 20,
    fontWeight: '700',
  },

  emptyText: {
    color: '#777',
    fontSize: 15,
    lineHeight: 24,
  },

  googleAuthCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },

  googleAuthTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },

  googleAuthStatus: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },

  googleAuthButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },

  googleAuthButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});