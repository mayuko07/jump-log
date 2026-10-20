import { Lesson } from "../types/Lesson";

export type JumpOneMailType =
  | "registered"
  | "confirmed"
  | "cancelled";

export function parseJumpOneMail(
  subject: string,
  body: string
): Lesson | null {

  let mailType: JumpOneMailType;

  if (subject.includes("ご予約キャンセル")) {
    mailType = "cancelled";
  } else if (subject.includes("ご予約確認")) {
    mailType = "confirmed";
  } else if (subject.includes("ご予約登録")) {
    mailType = "registered";
  } else {
    return null;
  }

  // 登録メールと確認メールで「：」前後の空白が違っても取得できるようにする
  const dateMatch = body.match(
    /予約日\s*[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/
  );

  const programMatch = body.match(
    /レッスン\s*[：:]\s*([^\r\n]+)/
  );

  const studioMatch = body.match(
    /開講場所\s*[：:]\s*([^\r\n]+)/
  );

  const timeMatch = body.match(
    /予約時間\s*[：:]\s*(\d{1,2}:\d{2})[～〜~-](\d{1,2}:\d{2})/
  );

  const instructorMatch = body.match(
    /インストラクター\s*[：:]\s*([^\r\n]+)/
  );

  const seatMatch = body.match(
    /座席\s*[：:]\s*(\d+)/
  );

  if (
    !dateMatch ||
    !programMatch ||
    !studioMatch ||
    !timeMatch ||
    !instructorMatch
  ) {
    return null;
  }

  const [, year, month, day] = dateMatch;

  // 確認メールでは
  // 「Dj1 EDM1 [10]」
  // のように座席番号がレッスン名の後ろに付くので除去する
  const rawProgram = programMatch[1].trim();

  const program = rawProgram
    .replace(/\s*\[\d+\]\s*$/, "")
    .trim();

  // 登録メールなら「座席：10」
  // 確認メールなら「レッスン：Dj1 EDM1 [10]」
  let seat: number | undefined;

  if (seatMatch) {
    seat = Number(seatMatch[1]);
  } else {
    const bracketSeat = rawProgram.match(/\[(\d+)\]\s*$/);

    if (bracketSeat) {
      seat = Number(bracketSeat[1]);
    }
  }

  return {
    date:
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,

    startTime: timeMatch[1],
    endTime: timeMatch[2],

    program,
    instructor: instructorMatch[1].trim(),
    studio: studioMatch[1]
      .trim()
      .replace(/\s+Trampoline$/, ""),

    seat,

    registered: mailType === "registered",
    confirmed: mailType === "confirmed",
    cancelled: mailType === "cancelled",
  };
}