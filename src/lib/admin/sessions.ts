import { sql } from "../db";

export type RecordSessionInput = {
  sessionId: string;
  userId: string | null;
  firstPath: string | null;
};

export async function recordDailySession({
  sessionId,
  userId,
  firstPath,
}: RecordSessionInput): Promise<void> {
  try {
    await sql`
      INSERT INTO daily_sessions (session_id, day, user_id, first_path)
      VALUES (${sessionId}, CURRENT_DATE, ${userId}, ${firstPath})
      ON CONFLICT (session_id, day) DO NOTHING
    `;
  } catch (err) {
    console.error("[admin] recordDailySession failed:", err);
  }
}
