import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

import { parseJumpOneMail } from '../utils/parseJumpOneMail';
import { Lesson } from '../types/Lesson';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
];

const CREDENTIALS_PATH = path.join(
  process.cwd(),
  'credentials.json'
);

const JUMP_ONE_QUERY =
  'from:jumponem@jumpone.jp ' +
  'subject:"【jump one】ご予約"';

export type GmailSyncResult = {
  lessons: Lesson[];
  historyId: string;
  mode: 'full' | 'partial';
  historyExpired: boolean;
};

function decodeBase64Url(data: string): string {
  const base64 = data
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  return Buffer
    .from(base64, 'base64')
    .toString('utf8');
}

function getTextBody(payload: any): string {
  if (
    payload.mimeType === 'text/plain' &&
    payload.body?.data
  ) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const text = getTextBody(part);
      if (text) return text;
    }
  }

  return '';
}

function getHeader(
  headers: any[] | undefined,
  name: string
): string {
  if (!headers) return '';

  const header = headers.find(
    (item) =>
      item.name?.toLowerCase() ===
      name.toLowerCase()
  );

  return header?.value ?? '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

async function createGmailClient() {
  const localAuth = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  const auth = new google.auth.OAuth2();

  auth.setCredentials({
    access_token:
      localAuth.credentials.access_token,
    refresh_token:
      localAuth.credentials.refresh_token,
    expiry_date:
      localAuth.credentials.expiry_date,
    token_type:
      localAuth.credentials.token_type,
    scope:
      localAuth.credentials.scope,
  });

  return google.gmail({
    version: 'v1',
    auth,
  });
}

async function getMessageIdsForFullSync(
  gmail: any
): Promise<string[]> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const response: any =
      await gmail.users.messages.list({
        userId: 'me',
        q: JUMP_ONE_QUERY,
        maxResults: 500,
        includeSpamTrash: true,
        pageToken,
      });

    const messages =
      response.data.messages ?? [];

    for (const message of messages) {
      if (message.id) {
        messageIds.push(message.id);
      }
    }

    pageToken =
      response.data.nextPageToken ??
      undefined;
  } while (pageToken);

  return messageIds;
}

async function getMessageIdsFromHistory(
  gmail: any,
  startHistoryId: string
): Promise<{
  messageIds: string[];
  historyId: string;
}> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const response: any =
      await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        maxResults: 500,
        pageToken,
      });

    const histories =
      response.data.history ?? [];

    for (const history of histories) {
      const added =
        history.messagesAdded ?? [];

      for (const item of added) {
        const id = item.message?.id;
        if (id) ids.add(id);
      }
    }

    if (response.data.historyId) {
      latestHistoryId =
        String(response.data.historyId);
    }

    pageToken =
      response.data.nextPageToken ??
      undefined;
  } while (pageToken);

  return {
    messageIds: [...ids],
    historyId: latestHistoryId,
  };
}

async function parseMessages(
  gmail: any,
  messageIds: string[]
): Promise<Lesson[]> {
  const lessons: Lesson[] = [];

  console.log(
    `取得対象メール: ${messageIds.length}件`
  );

  for (
    let i = 0;
    i < messageIds.length;
    i++
  ) {
    const messageId = messageIds[i];
    let success = false;

    while (!success) {
      try {
        const mail =
          await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
          });

        const payload = mail.data.payload;

        if (!payload) {
          success = true;
          continue;
        }

        const from = getHeader(
          payload.headers,
          'From'
        );

        const subject = getHeader(
          payload.headers,
          'Subject'
        );

        // history.list は Gmail 全体の追加メールを返すため、
        // JUMP ONE の予約メールだけをここで通す。
        if (
          !from
            .toLowerCase()
            .includes(
              'jumponem@jumpone.jp'
            ) ||
          !subject.includes(
            '【jump one】ご予約'
          )
        ) {
          success = true;
          continue;
        }

        const body = getTextBody(payload);

        const lesson = parseJumpOneMail(
          subject,
          body
        );

        if (lesson) {
          lesson.messageId =
            mail.data.id ?? messageId;

          if (mail.data.internalDate) {
            lesson.receivedAt =
              new Date(
                Number(
                  mail.data.internalDate
                )
              ).toISOString();
          }

          lessons.push(lesson);
        }

        success = true;
      } catch (error: any) {
        const status =
          error?.response?.status ??
          error?.code;

        if (
          status === 403 ||
          status === 429
        ) {
          console.log('');
          console.log(
            'Gmail API制限。60秒待機します...'
          );

          await sleep(60000);
          continue;
        }

        throw error;
      }
    }

    console.log(
      `${i + 1}/${messageIds.length} 完了`
    );

    await sleep(1200);
  }

  console.log('');
  console.log('==============================');
  console.log(
    `解析成功: ${lessons.length}件`
  );

  return lessons;
}

async function getCurrentHistoryId(
  gmail: any
): Promise<string> {
  // profile.historyId は現在のメールボックスの historyId。
  const profile =
    await gmail.users.getProfile({
      userId: 'me',
    });

  const historyId =
    profile.data.historyId;

  if (!historyId) {
    throw new Error(
      'Gmail historyId を取得できませんでした。'
    );
  }

  return String(historyId);
}

export async function syncJumpOneMails(
  startHistoryId?: string
): Promise<GmailSyncResult> {
  const gmail = await createGmailClient();

  if (!startHistoryId) {
    console.log('初回取得: 全期間');

    const messageIds =
      await getMessageIdsForFullSync(
        gmail
      );

    const lessons =
      await parseMessages(
        gmail,
        messageIds
      );

    const historyId =
      await getCurrentHistoryId(gmail);

    return {
      lessons,
      historyId,
      mode: 'full',
      historyExpired: false,
    };
  }

  console.log(
    `差分取得: historyId ${startHistoryId} 以降`
  );

  try {
    const {
      messageIds,
      historyId,
    } =
      await getMessageIdsFromHistory(
        gmail,
        startHistoryId
      );

    const lessons =
      await parseMessages(
        gmail,
        messageIds
      );

    return {
      lessons,
      historyId,
      mode: 'partial',
      historyExpired: false,
    };
  } catch (error: any) {
    const status =
      error?.response?.status ??
      error?.code;

    if (status !== 404) {
      throw error;
    }

    console.log('');
    console.log(
      '保存済みhistoryIdが古いため、全期間同期へ切り替えます。'
    );

    const messageIds =
      await getMessageIdsForFullSync(
        gmail
      );

    const lessons =
      await parseMessages(
        gmail,
        messageIds
      );

    const historyId =
      await getCurrentHistoryId(gmail);

    return {
      lessons,
      historyId,
      mode: 'full',
      historyExpired: true,
    };
  }
}

// 既存コードとの互換用。
// 新しい同期処理では syncJumpOneMails() を使う。
export async function getJumpOneMails(
  after?: Date
): Promise<Lesson[]> {
  const gmail = await createGmailClient();

  const afterQuery = after
    ? ` after:${Math.max(
        0,
        Math.floor(
          after.getTime() / 1000
        ) - 1
      )}`
    : '';

  const query =
    JUMP_ONE_QUERY + afterQuery;

  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const response: any =
      await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 500,
        includeSpamTrash: true,
        pageToken,
      });

    const messages =
      response.data.messages ?? [];

    for (const message of messages) {
      if (message.id) {
        messageIds.push(message.id);
      }
    }

    pageToken =
      response.data.nextPageToken ??
      undefined;
  } while (pageToken);

  return parseMessages(
    gmail,
    messageIds
  );
}
