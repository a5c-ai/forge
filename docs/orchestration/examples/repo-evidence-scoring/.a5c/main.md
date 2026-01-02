{{#include "git://HEAD/.a5c/prompt/shared.md" }}
{{#include "git://HEAD/.a5c/prompt/profiles/{{vars.profile}}.md" }}

# A5C prompt (repo-evidence-scoring)

## Task

Run: `{{#print event.run_id}}`
Step: `{{#print event.step_id}}`
Attempt: `{{#print event.attempt}}`
Profile: `{{#print (event.agent && event.agent.profile) || vars.profile || "default"}}`

{{ event.instructions }}
