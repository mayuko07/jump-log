export type Lesson = {
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

  // Gmail側の情報
  messageId?: string;
  receivedAt?: string;
};