# `git a5c agent generate-context`

Renders a Markdown prompt/context document from a JSON event payload and a template.

This is meant to be called:

- directly by humans (to preview prompts)
- from agent step hooks (to build a prompt before calling `git a5c agent run`)

## Usage

```bash
git a5c agent generate-context \
  --in event.json \
  --template .a5c/main.md \
  --var profile=default \
  --out prompt.md
```

Flags:

- `--in <path>`: input JSON file (default: stdin)
- `--template <path|uri>`: template path/URI (default: `.a5c/main.md`)
- `--var k=v`: may be repeated, becomes `vars.k` in templates
- `--out <path>`: write output file (default: stdout)
- `--token <t>`: GitHub token for `github://...` templates (or env `A5C_AGENT_GITHUB_TOKEN` / `GITHUB_TOKEN`)

## Template model

Templates are evaluated with these top-level values:

- `event`: the input JSON payload
- `github`: alias for `event` (kept for compatibility with some older templates)
- `env`: current process environment
- `vars`: a key/value map from `--var` and include-args

The engine evaluates expressions as JavaScript (via `new Function`) in strict mode.

## Syntax

### Interpolation: `{{ expr }}`

```md
Hello {{ event.name }}
```

### Dollar expressions: `${{ expr }}`

`${{ ... }}` is expanded early (before include processing), so it is useful for building include URIs or other dynamic strings.

```md
{{> "git://${{ vars.ref }}/.a5c/partial.md" }}
```

### Conditionals: `{{#if expr}} ... {{/if}}`

```md
{{#if env.CI }}Running on CI{{/if}}
```

### Loops: `{{#each expr}} ... {{/each}}`

Within an `each` block:

- `this` refers to the current item

```md
{{#each event.items }}- {{ this.id }}: {{ this.title }}
{{/each}}
```

### Includes: `{{> uri [k=v]... }}`

Includes inline another template.

```md
{{> .a5c/partials/header.md }}
{{> .a5c/partials/section.md name=World }}
```

Include args become `vars.*` for the included template.

#### Alternate include form: `{{#include ... }}`

The engine also supports:

```md
{{#include .a5c/partials/header.md }}
{{#include "./section.md" name=World }}
```

This is equivalent to `{{> ... }}`.

Dynamic include URIs are supported:

- `$ {{ ... }}` expansions inside the URI string (`"git://${{ vars.ref }}/..."`)
- `{{ ... }}` expansions inside the URI string (`"git://{{ vars.ref }}/..."`)

Includes can also be invoked from expressions via the `include(uri)` helper:

```md
{{ include("./section.md") }}
```

### Printers

These are convenient for dumping structured values:

- `{{#print expr}}`
- `{{#printJSON expr}}`
- `{{#printYAML expr}}`
- `{{#printXML expr}}`

Examples:

```md
{{#printJSON event }}
{{#printYAML vars }}
```

The same functionality exists as expression helpers:

- `toJSON(value, indent?)`
- `toYAML(value)`
- `toXML(value)`

### Pipes

Expressions support a simple pipe syntax:

`a | fn(b, c) | g()` becomes `g(fn(a, b, c))`.

This is mainly useful with helper functions:

```md
{{ this | select("title") }}
{{ event | toJSON(2) }}
```

### Selecting values: `select(value, path)`

`select` extracts a nested value by path:

```md
{{ select(event, "repository.full_name") }}
```

## Template URIs

- `file://...` (absolute file URIs)
- repo-local paths (relative to the repo root)
- `github://owner/repo/<ref>/<path>` (ref may include slashes)
- `git://<ref>/<path>` (read a file from the local repo at a git ref; ref may include slashes)

Globs are supported for `file://...`, repo-local paths, `github://...`, and `git://...`.

Note: `github://...` (especially globs) typically requires a GitHub token to list files.

### Protocol-relative includes: `//...`

If an include URI starts with `//` it inherits the scheme from the current template URI.
This is mainly useful for keeping templates portable when switching between `file://...`, `github://...`, and `git://...` includes.

For example, if your root template is `git://HEAD/.a5c/main.md`, then using `{{> //partials/section.md }}` keeps the include inside the same git-ref snapshot.
Without the leading `//`, the include is treated as a local file path and read from the working tree.

## Redaction and input shaping

Before rendering, the CLI removes a few noisy fields (if present) from the input object:

- `script`, `event_type`, `original_event`, `client_payload`

If the input contains `original_event`, the renderer first merges it into the top-level input object.

When printing (`#printJSON`, `toJSON`, etc.), objects under an `env` key are masked.

## Limitations / gotchas

- Templates are evaluated as JavaScript expressions and are not sandboxed; treat templates as trusted code.
- Include args (`k=v`) are parsed by splitting on whitespace; quoting and spaces inside values are not supported.
- `--var` values are strings (or `true` if passed as `--var k` with no `=v`).
- Missing include targets are treated as empty content.
