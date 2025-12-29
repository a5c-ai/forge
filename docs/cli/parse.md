# `git a5c parse`

`parse` converts tool logs (currently **Codex CLI stdout**) into a stream of structured JSON events.

## Usage (Codex)

The only supported parser type is `codex`:

```bash
git a5c parse --type codex
```

Input is read from stdin. Output is JSONL to stdout by default.

## Common patterns

### Parse a saved log file

```bash
cat codex.log | git a5c parse --type codex > codex.jsonl
```

PowerShell:

```powershell
Get-Content codex.log | git a5c parse --type codex | Set-Content codex.jsonl
```

### Write JSONL to a file while still printing to stdout

```bash
cat codex.log | git a5c parse --type codex --out artifacts/codex.jsonl
```

`--out` is resolved relative to `--repo`.

### Pretty-print each event (debugging)

```bash
cat codex.log | git a5c parse --type codex --pretty
```

### Live parsing while capturing a raw log

```bash
codex run ... 2>&1 | tee codex.log | git a5c parse --type codex --out codex.jsonl
```

## Event types

The parser emits JSON objects with a `type` field like:

- `banner`
- `tokens_used`
- `thinking`
- `codex`
- `exec`
- `exec_result`

The original line(s) are preserved in `raw`.

