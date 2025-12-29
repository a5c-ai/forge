# A5C prompt (fixture repo-min)

Run: `{{#print event.run_id}}`
Step: `{{#print event.step_id}}`
Attempt: `{{#print event.attempt}}`

## Instructions

{{#print event.instructions}}

## Agent profile

{{#print (event.agent && event.agent.profile) || vars.profile || "default"}}

## State snapshot

{{#printJSON event.state}}

