import { parseJumpOneMail } from "./src/utils/parseJumpOneMail";

const subject = "【jump one】ご予約登録";

const body = `
ご予約内容
予約日　　　　　：　2026年9月15日(火)
レッスン　　　　：　jM Latin1
開講場所　　　　：　Tokorozawa Trampoline
予約時間　　　　：　15:30～16:15
インストラクター：　Kasumi
座席　　　　　　：　10
`;

const lesson = parseJumpOneMail(subject, body);

console.log(lesson);