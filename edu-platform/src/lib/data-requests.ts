/** طلب الطالب على بياناته. الصياغات هنا لأن صفحة الحساب ولوحة المالك تقرآنها معًا */
export type DataRequestKind = "delete" | "copy";
export type DataRequestStatus = "open" | "done" | "declined" | "withdrawn";

export const DATA_REQUEST_LABELS: Record<DataRequestKind, string> = {
  delete: "حذف الحساب",
  copy: "نسخة من البيانات",
};

export const DATA_REQUEST_NOTE_MAX = 500;
