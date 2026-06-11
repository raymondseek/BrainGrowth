import { writeFile } from "node:fs/promises";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const today = new Date();
today.setHours(20, 45, 0, 0);

const snapshots = [];
let noteCount = 38;
let bodyCount = 14200;
let uniqueTagCount = 24;

for (let index = 89; index >= 0; index -= 1) {
  const date = new Date(today.getTime() - index * MS_PER_DAY);
  const dayIndex = 89 - index;
  const weeklyPulse = Math.max(0, Math.sin(dayIndex / 4));
  const focusBurst = dayIndex > 56 && dayIndex < 73 ? 1.8 : 1;
  const quietWeek = dayIndex > 28 && dayIndex < 36 ? 0.25 : 1;

  if (dayIndex > 0) {
    noteCount += Math.round((dayIndex % 3 === 0 ? 1 : 0) * quietWeek + (dayIndex % 17 === 0 ? 2 : 0));
    bodyCount += Math.round((90 + weeklyPulse * 130 + (dayIndex % 6) * 18) * focusBurst * quietWeek);
    uniqueTagCount += dayIndex % 11 === 0 || dayIndex === 62 || dayIndex === 70 ? 1 : 0;
  }

  snapshots.push({
    date: toDateKey(date),
    capturedAt: toTimestamp(date),
    noteCount,
    bodyCount,
    uniqueTagCount
  });
}

const data = {
  schemaVersion: 1,
  snapshots,
  lastSuccessfulScanAt: snapshots[snapshots.length - 1].capturedAt
};

await writeFile("demo-data.json", `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Wrote demo-data.json with ${snapshots.length} snapshots.`);

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function toTimestamp(date) {
  return `${toDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}+08:00`;
}
