#!/bin/bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TASK_FILE="$PROJECT_DIR/codex_task.md"
RESULT_FILE="$PROJECT_DIR/codex_result.md"
LOG_FILE="$PROJECT_DIR/.claude/codex_run.log"
STAMP_FILE="$PROJECT_DIR/.claude/.last_codex_task_hash"

# codex_task.md が無ければ何もしない
if [ ! -f "$TASK_FILE" ]; then
  exit 0
fi

# 同じ内容で何回も実行しない
CURRENT_HASH="$(shasum "$TASK_FILE" | awk '{print $1}')"
LAST_HASH=""

if [ -f "$STAMP_FILE" ]; then
  LAST_HASH="$(cat "$STAMP_FILE")"
fi

if [ "$CURRENT_HASH" = "$LAST_HASH" ]; then
  exit 0
fi

echo "$CURRENT_HASH" > "$STAMP_FILE"

mkdir -p "$PROJECT_DIR/.claude"

{
  echo "======================================"
  echo "START: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "TASK : $TASK_FILE"
} >> "$LOG_FILE"

cd "$PROJECT_DIR"

codex exec --full-auto -o "$RESULT_FILE" - < "$TASK_FILE" >> "$LOG_FILE" 2>&1

{
  echo "END  : $(date '+%Y-%m-%d %H:%M:%S')"
  echo "RESULT: $RESULT_FILE"
  echo "======================================"
} >> "$LOG_FILE"
