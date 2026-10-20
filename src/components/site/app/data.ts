// The sample agency the website's drawings of the app show: one week, its clients, its people, what came
// in. Made up; the pay lines and payroll files beside it come from the real engine and exporters
// (src/server/site/), passed in as `Demo`.
import type { SourceKind, StatusKind } from "@/components/site/app/kit";

export interface DemoLine {
  label: string;
  hours: string;
  amount: string;
  explain: string;
}

export interface DemoFile {
  system: string;
  filename: string;
  preview: string[];
  workers: string;
  gross: string;
  theirs: string;
  difference: string;
}

/** What the server works out for the drawings: one Illinois week's pay lines, and the five files. */
export interface Demo {
  lines: DemoLine[];
  total: string;
  files: DemoFile[];
}

export const CLIENTS = {
  northgate: { name: "Northgate Logistics", color: "#5b7fe0" },
  prairie: { name: "Prairie Line Manufacturing", color: "#d08a4a" },
  harbor: { name: "Harbor Foods Distribution", color: "#3f9d6e" },
  lakeshore: { name: "Lakeshore Cold Storage", color: "#9a6ad6" },
  midway: { name: "Midway Packaging", color: "#c46b6b" },
} as const;
export type ClientKey = keyof typeof CLIENTS;

/** What came in on Monday morning. `subject` is a key under site.app.inbox. */
export const INBOX: { id: string; kind: SourceKind; from: string; client: ClientKey; subject: "s1" | "s2" | "s3" | "s4" | "s5" | "s6"; workers: number; time: string; status: StatusKind }[] = [
  { id: "IN-318", kind: "email", from: "Lena Ortiz", client: "northgate", subject: "s1", workers: 12, time: "8:42", status: "check" },
  { id: "IN-317", kind: "text", from: "María José Fernández Ruiz", client: "northgate", subject: "s2", workers: 1, time: "8:31", status: "done" },
  { id: "IN-316", kind: "photo", from: "Prairie Line Manufacturing", client: "prairie", subject: "s3", workers: 9, time: "8:05", status: "done" },
  { id: "IN-315", kind: "clock", from: "Harbor Foods Distribution", client: "harbor", subject: "s4", workers: 14, time: "7:58", status: "done" },
  { id: "IN-314", kind: "portal", from: "Lakeshore Cold Storage", client: "lakeshore", subject: "s5", workers: 6, time: "7:40", status: "done" },
  { id: "IN-313", kind: "sheet", from: "Midway Packaging", client: "midway", subject: "s6", workers: 5, time: "7:12", status: "done" },
];

/** The week by worker, Monday to Sunday ("" for a day off). Tran's is the week the engine pays. */
export const WEEK: { name: string; client: ClientKey; days: string[]; total: string; from: SourceKind; sure: number; doubt?: number }[] = [
  { name: "Robert Jones", client: "northgate", days: ["8", "8", "8", "8", "8", "", ""], total: "40:00", from: "email", sure: 0.55, doubt: 4 },
  { name: "María José Fernández Ruiz", client: "northgate", days: ["8", "8", "6", "8", "8", "", ""], total: "38:00", from: "text", sure: 0.97 },
  { name: "Tran Nguyen", client: "prairie", days: ["10", "8", "9", "8", "13", "", ""], total: "48:00", from: "photo", sure: 0.98 },
  { name: "Jesús Delgado", client: "prairie", days: ["8", "8", "8", "8", "8", "4", ""], total: "44:00", from: "photo", sure: 0.96 },
  { name: "Anita Patel", client: "harbor", days: ["8", "8", "8", "8", "8", "", ""], total: "40:00", from: "clock", sure: 1 },
  { name: "Kateryna Bondarenko", client: "harbor", days: ["7:30", "8", "8", "8", "8", "", ""], total: "39:30", from: "clock", sure: 1 },
  { name: "DeShawn Carter", client: "lakeshore", days: ["", "10", "10", "10", "10", "", ""], total: "40:00", from: "portal", sure: 1 },
  { name: "Olivia Chen", client: "midway", days: ["6", "6", "6", "6", "6", "", ""], total: "30:00", from: "sheet", sure: 0.99 },
];

/** The week's pay run by worker (sample figures beside Tran's, which the engine works out). */
export const RUN: { name: string; state: string; reg: string; ot: string; dt: string; gross: string }[] = [
  { name: "Robert Jones", state: "IL", reg: "40:00", ot: "—", dt: "—", gross: "$730.00" },
  { name: "María José Fernández Ruiz", state: "IL", reg: "38:00", ot: "—", dt: "—", gross: "$693.50" },
  { name: "Jesús Delgado", state: "IL", reg: "40:00", ot: "4:00", dt: "—", gross: "$839.50" },
  { name: "Anita Patel", state: "IL", reg: "40:00", ot: "—", dt: "—", gross: "$760.00" },
  { name: "DeShawn Carter", state: "IL", reg: "40:00", ot: "—", dt: "—", gross: "$716.00" },
];

export const INVOICES: { no: string; client: ClientKey; total: string; status: "sent" | "draft" | "paid" | "approved"; hours: string }[] = [
  { no: "INV-1044", client: "northgate", total: "$24,114.25", status: "approved", hours: "486:00" },
  { no: "INV-1043", client: "prairie", total: "$14,212.50", status: "draft", hours: "301:30" },
  { no: "INV-1042", client: "harbor", total: "$9,880.00", status: "sent", hours: "214:00" },
  { no: "INV-1041", client: "lakeshore", total: "$6,412.00", status: "paid", hours: "142:00" },
  { no: "INV-1040", client: "midway", total: "$3,960.00", status: "paid", hours: "88:00" },
];

export const APPROVALS: { client: ClientKey; who: string; status: "approved" | "opened" | "sent"; time: string; workers: number; hours: string }[] = [
  { client: "northgate", who: "Lena Ortiz", status: "approved", time: "9:14", workers: 12, hours: "486:00" },
  { client: "harbor", who: "Sam Whitaker", status: "approved", time: "9:02", workers: 14, hours: "551:30" },
  { client: "prairie", who: "Joan Mercer", status: "opened", time: "8:57", workers: 9, hours: "301:30" },
  { client: "lakeshore", who: "Ray Okafor", status: "sent", time: "8:50", workers: 6, hours: "142:00" },
  { client: "midway", who: "Priya Raman", status: "sent", time: "8:50", workers: 5, hours: "88:00" },
];
