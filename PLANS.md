# Execution Plan Template

Every major feature must have an execution plan in `.agent/execplans/YYYY-MM-DD-feature-name.md`.

## 1. Goal
Brief description of the goal.

## 2. Entry Points
Primary files to look at or run to see this feature in action.

## 3. Files-to-Touch
List of files that will be created or modified.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | Verify DB connection | `curl /health` -> `{"status": "healthy"}` |

## 5. Implementation Steps
1. Step 1
2. Step 2

## 6. Rollback Plan
How to undo changes if things go wrong.

## 7. Evidence
Links to screenshots, logs, or command outputs confirming success.
