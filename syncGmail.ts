import fs from 'fs';
import path from 'path';

import {
  syncJumpOneMails,
} from './src/services/gmail';
import { Lesson } from './src/types/Lesson';

const CACHE_PATH = path.join(
  process.cwd(),
  'jumpone-mails.json'
);

const SYNC_STATE_PATH = path.join(
  process.cwd(),
  'jumpone-sync-state.json'
);

type SyncState = {
  historyId: string;
  syncedAt: string;
};

function loadExistingMails(): Lesson[] {
  if (!fs.existsSync(CACHE_PATH)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(
      CACHE_PATH,
      'utf8'
    );

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? (parsed as Lesson[])
      : [];
  } catch {
    throw new Error(
      'jumpone-mails.json を読み込めませんでした。' +
      '既存ファイルは上書きしていません。'
    );
  }
}

function loadSyncState():
  SyncState | undefined {
  if (!fs.existsSync(SYNC_STATE_PATH)) {
    return undefined;
  }

  try {
    const raw = fs.readFileSync(
      SYNC_STATE_PATH,
      'utf8'
    );

    const parsed = JSON.parse(raw);

    if (
      typeof parsed?.historyId !==
      'string'
    ) {
      return undefined;
    }

    return {
      historyId: parsed.historyId,
      syncedAt:
        typeof parsed.syncedAt ===
        'string'
          ? parsed.syncedAt
          : '',
    };
  } catch {
    throw new Error(
      'jumpone-sync-state.json を読み込めませんでした。' +
      '既存ファイルは変更していません。'
    );
  }
}

function mergeByMessageId(
  existing: Lesson[],
  incoming: Lesson[]
): {
  merged: Lesson[];
  added: number;
} {
  const knownIds = new Set(
    existing
      .map((mail) => mail.messageId)
      .filter(
        (id): id is string =>
          typeof id === 'string' &&
          id.length > 0
      )
  );

  const newMails: Lesson[] = [];

  for (const mail of incoming) {
    if (
      mail.messageId &&
      knownIds.has(mail.messageId)
    ) {
      continue;
    }

    newMails.push(mail);

    if (mail.messageId) {
      knownIds.add(mail.messageId);
    }
  }

  const merged = [
    ...existing,
    ...newMails,
  ].sort((a, b) => {
    const aTime = a.receivedAt
      ? Date.parse(a.receivedAt)
      : 0;

    const bTime = b.receivedAt
      ? Date.parse(b.receivedAt)
      : 0;

    return bTime - aTime;
  });

  return {
    merged,
    added: newMails.length,
  };
}

function writeJsonAtomically(
  filePath: string,
  value: unknown
): void {
  const tempPath =
    `${filePath}.tmp`;

  fs.writeFileSync(
    tempPath,
    JSON.stringify(value, null, 2),
    'utf8'
  );

  fs.renameSync(
    tempPath,
    filePath
  );
}

async function main() {
  console.log(
    'GmailからJUMP ONEメールを同期します...'
  );
  console.log('');

  const existing =
    loadExistingMails();

  const state =
    loadSyncState();

  console.log(
    `既存保存件数: ${existing.length}件`
  );

  if (state?.historyId) {
    console.log(
      `保存済みhistoryId: ${state.historyId}`
    );

    if (state.syncedAt) {
      console.log(
        `前回同期: ${state.syncedAt}`
      );
    }
  } else {
    console.log(
      'historyId未保存 → 初回の全期間同期を行います'
    );
  }

  console.log('');

  const result =
    await syncJumpOneMails(
      state?.historyId
    );

  const { merged, added } =
    mergeByMessageId(
      existing,
      result.lessons
    );

  // Gmail取得・解析が正常に完了した場合だけ保存。
  // メール本体を先に保存し、その後historyIdを進める。
  // 途中で失敗した場合は、次回同期で同じ差分を再取得できる。
  writeJsonAtomically(
    CACHE_PATH,
    merged
  );

  const nextState: SyncState = {
    historyId: result.historyId,
    syncedAt: new Date().toISOString(),
  };

  writeJsonAtomically(
    SYNC_STATE_PATH,
    nextState
  );

  console.log('');
  console.log('================================');
  console.log(' Gmail同期完了');
  console.log('================================');
  console.log(
    `同期方式: ${
      result.mode === 'partial'
        ? 'historyId差分同期'
        : '全期間同期'
    }`
  );

  if (result.historyExpired) {
    console.log(
      '※ 古いhistoryIdが無効だったため全期間同期しました'
    );
  }

  console.log(
    `今回解析: ${result.lessons.length}件`
  );
  console.log(
    `新規追加: ${added}件`
  );
  console.log(
    `保存合計: ${merged.length}件`
  );
  console.log(
    `次回historyId: ${result.historyId}`
  );
  console.log(
    `メール保存先: ${CACHE_PATH}`
  );
  console.log(
    `同期状態保存先: ${SYNC_STATE_PATH}`
  );
}

main().catch((error) => {
  console.error('');
  console.error('同期に失敗しました。');
  console.error(
    '既存データとhistoryIdは可能な限り保持されています。'
  );
  console.error(error);
  process.exitCode = 1;
});
