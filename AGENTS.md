# Sync-Hub Management Rules

## Development Flow
1. **PRD**: Define requirements in `docs/prd/*.md`.
2. **PLANS**: Create execution plans in `.agent/execplans/*.md` based on `PLANS.md` template.
3. **Execution**: Implement following the plan.
4. **Verification**: Run `verify` scripts to pass requirements.

## Rules & Prohibitions
- **Language**: Use Korean for documentation and user communication, English for code and variables.
- **No Placeholders**: Never leave `TODO` or empty bodies without justification.
- **Atomic Commits**: Group changes by logical sub-tasks.
- **Done = Verify**: A task is only "Done" if `verify` or `verify:fast` passes.
- **Git Push Discipline**: 작업 단위 완료 시 `verify:fast`(또는 `verify`) 통과 후 커밋하고 원격에 `git push`까지 수행한다. 원격 미설정/권한 오류로 push가 불가하면 사유를 즉시 공유한다.
- **GPU Usage**: GPU-heavy tasks (OCR) must use `docker-compose.gpu.yml`.

## Command Guide
- `npm run verify`: Run all tests and lint (to be implemented).
- `npm run verify:fast`: Run fast unit tests (to be implemented).
- `sudo docker-compose up -d`: Start services.

## Repo Map (Quick Link)
See [docs/repo-map.md](docs/repo-map.md) for details.
