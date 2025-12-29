# A5C prompt (issue+agent+score fixture)

Issue id: `{{#print vars.issueId}}`
Run: `{{#print event.run_id}}`
Step: `{{#print event.step_id}}`
Attempt: `{{#print event.attempt}}`

## Instructions

{{#print event.instructions}}

## Issue events (raw JSON)

{{> "git://HEAD/.collab/issues/${{ vars.issueId }}/events/**/*.json" }}

## State snapshot

{{#printJSON event.state}}

