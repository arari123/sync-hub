#!/bin/bash
# verify_fast.sh - Basic syntax checks without writing bytecode files

set -euo pipefail

echo "Running fast verification..."

python3 - <<'PY'
from pathlib import Path
import ast
import sys

patterns = (
    "app/*.py",
    "app/api/*.py",
    "app/core/*.py",
    "app/core/parsing/*.py",
    "app/core/chunking/*.py",
    "app/core/indexing/*.py",
    "tests/*.py",
)
files = []
for pattern in patterns:
    files.extend(sorted(Path(".").glob(pattern)))

if not files:
    print("No python files matched for verification.")
    sys.exit(1)

failed = False
for file_path in files:
    try:
        source = file_path.read_text(encoding="utf-8")
        ast.parse(source, filename=str(file_path))
    except SyntaxError as exc:
        failed = True
        print(f"[SYNTAX ERROR] {file_path}:{exc.lineno}:{exc.offset} {exc.msg}")
    except Exception as exc:  # noqa: BLE001
        failed = True
        print(f"[ERROR] {file_path}: {exc}")

if failed:
    sys.exit(1)

print(f"Syntax check passed for {len(files)} files.")
PY

echo "Running frontend design-token lint..."
python3 scripts/lint_frontend_design_tokens.py

echo "Running unit tests..."
python3 -m unittest discover -s tests -p 'test_*.py' -v
