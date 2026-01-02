
{{#include "git://HEAD/.a5c/prompt/shared.md" }}
{{#include "git://HEAD/.a5c/prompt/profiles/{{vars.profile}}.md" }}

# A5C prompt

## Task

Run: `{{#print event.run_id}}`
Step: `{{#print event.step_id}}`
Attempt: `{{#print event.attempt}}`
Profile: `{{#print (event.agent && event.agent.profile) || vars.profile || "default"}}`

{{ event.instructions }}

## Repository context

### Key files

{{#include "git://HEAD/README.md" }}

### Source

{{#include "git://HEAD/src/index.js" }}

### Tests

{{#include "git://HEAD/test/index.test.js" }}

### Current status

If you need additional context, inspect the repo tree and changed files.
