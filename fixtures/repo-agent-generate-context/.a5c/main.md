# Root

Hello {{ event.name }}.

{{#if env.A5C_TEST_FLAG }}FLAG={{ env.A5C_TEST_FLAG }}{{/if}}

List:
{{#each event.items }}- {{ this.x }}
{{/each}}

Git include:
{{> "git://${{ vars.ref }}/.a5c/partial.md" }}

