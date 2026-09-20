import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const matchRecords = sqliteTable("match_records", {
  matchId: text("match_id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  rulesVersion: text("rules_version").notNull(),
  buildVersion: text("build_version").notNull(),
  mode: text("mode").notNull(),
  playerIds: text("player_ids").notNull(),
  playerNames: text("player_names").notNull(),
  completed: integer("completed").notNull().default(0),
  starred: integer("starred").notNull().default(0),
  recordJson: text("record_json").notNull(),
}, (table) => [
  index("match_records_created_at_idx").on(table.createdAt),
  index("match_records_rules_version_idx").on(table.rulesVersion),
  index("match_records_mode_idx").on(table.mode),
]);
