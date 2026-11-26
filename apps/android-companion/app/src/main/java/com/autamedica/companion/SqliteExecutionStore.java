package com.autamedica.companion;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Durable SQLite WAL checkpoint & structured event log store for ExecutionStateMachine.
 * Survives process kills, low-memory eviction, and app restarts.
 */
final class SqliteExecutionStore extends SQLiteOpenHelper
        implements ExecutionStateMachine.ContextPersistence, ExecutionStateMachine.LogSink {

    private static final String DB_NAME = "companion_runtime.db";
    private static final int DB_VERSION = 1;
    private static final String TABLE_CHECKPOINTS = "checkpoints";
    private static final String TABLE_EVENTS = "job_events";
    private static final int MAX_STORED_EVENTS = 1000;

    private static volatile SqliteExecutionStore sharedInstance;

    static SqliteExecutionStore getInstance(Context context) {
        SqliteExecutionStore existing = sharedInstance;
        if (existing != null) return existing;
        synchronized (SqliteExecutionStore.class) {
            if (sharedInstance == null) {
                sharedInstance = new SqliteExecutionStore(context.getApplicationContext());
            }
            return sharedInstance;
        }
    }

    private SqliteExecutionStore(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.enableWriteAheadLogging();
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS " + TABLE_CHECKPOINTS + " ("
            + "persist_key TEXT PRIMARY KEY, "
            + "context_json TEXT NOT NULL, "
            + "updated_at_ms INTEGER NOT NULL)"
        );
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS " + TABLE_EVENTS + " ("
            + "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            + "timestamp_ms INTEGER NOT NULL, "
            + "run_id TEXT NOT NULL, "
            + "step_index INTEGER NOT NULL, "
            + "step_action TEXT NOT NULL, "
            + "from_state TEXT NOT NULL, "
            + "to_state TEXT NOT NULL, "
            + "duration_ms INTEGER NOT NULL, "
            + "reason TEXT NOT NULL, "
            + "error TEXT NOT NULL)"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_job_events_ts ON " + TABLE_EVENTS + "(id DESC)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Additive schema evolution only.
    }

    @Override
    public synchronized void save(String key, String json) {
        if (key == null || json == null) return;
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("persist_key", key);
        cv.put("context_json", json);
        cv.put("updated_at_ms", System.currentTimeMillis());
        db.insertWithOnConflict(TABLE_CHECKPOINTS, null, cv, SQLiteDatabase.CONFLICT_REPLACE);
    }

    @Override
    public synchronized String load(String key) {
        if (key == null) return null;
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor c = db.query(
                TABLE_CHECKPOINTS,
                new String[]{"context_json"},
                "persist_key = ?",
                new String[]{key},
                null,
                null,
                null)) {
            if (c.moveToFirst()) {
                return c.getString(0);
            }
            return null;
        }
    }

    @Override
    public synchronized void clear(String key) {
        if (key == null) return;
        getWritableDatabase().delete(TABLE_CHECKPOINTS, "persist_key = ?", new String[]{key});
    }

    @Override
    public synchronized void append(ExecutionStateMachine.LogEntry entry) {
        if (entry == null) return;
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("timestamp_ms", entry.timestampMs);
        cv.put("run_id", entry.runId);
        cv.put("step_index", entry.stepIndex);
        cv.put("step_action", entry.stepAction);
        cv.put("from_state", entry.fromState == null ? "" : entry.fromState.name());
        cv.put("to_state", entry.toState == null ? "" : entry.toState.name());
        cv.put("duration_ms", entry.durationMs);
        cv.put("reason", entry.reason);
        cv.put("error", entry.error);
        db.insert(TABLE_EVENTS, null, cv);
        db.execSQL(
            "DELETE FROM " + TABLE_EVENTS + " WHERE id NOT IN ("
            + "SELECT id FROM " + TABLE_EVENTS + " ORDER BY id DESC LIMIT " + MAX_STORED_EVENTS + ")"
        );
    }

    @Override
    public synchronized List<ExecutionStateMachine.LogEntry> recent(int limit) {
        int cap = Math.max(1, Math.min(200, limit));
        SQLiteDatabase db = getReadableDatabase();
        List<ExecutionStateMachine.LogEntry> out = new ArrayList<>();
        try (Cursor c = db.query(
                TABLE_EVENTS,
                new String[]{"timestamp_ms", "run_id", "step_index", "step_action", "from_state", "to_state", "duration_ms", "reason", "error"},
                null,
                null,
                null,
                null,
                "id DESC",
                String.valueOf(cap))) {
            while (c.moveToNext()) {
                ExecutionStateMachine.State from = parseStateNullable(c.getString(4));
                ExecutionStateMachine.State to = parseStateNullable(c.getString(5));
                out.add(new ExecutionStateMachine.LogEntry(
                    c.getLong(0),
                    c.getString(1),
                    c.getInt(2),
                    c.getString(3),
                    from,
                    to,
                    c.getLong(6),
                    c.getString(7),
                    c.getString(8)
                ));
            }
        }
        Collections.reverse(out);
        return out;
    }

    private static ExecutionStateMachine.State parseStateNullable(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        try {
            return ExecutionStateMachine.parseState(raw);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}
