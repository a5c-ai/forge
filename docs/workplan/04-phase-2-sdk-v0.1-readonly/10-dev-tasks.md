# Dev tasks
1. Implement Git access layer `IGit`:
   - `revParse(treeish)`
   - `lsTree(commit, path)`
   - `readBlob(commit, path)`
2. Implement filesystem model for `.collab/**` at a treeish.
3. Implement parsers:
   - JSON events
   - Markdown events: front matter + body
   - Bundles (NDJSON)
4. Implement ordering:
   - derive eventKey from filename
   - stable sort
5. Implement discovery:
   - read `.collab/discovery.json`
   - support multiple inbox refs
   - union rule for proposals
6. Implement render algorithms per RFC:
   - Issues: LWW/OR-Set/comment lifecycle
   - PRs: proposal/request + claim/bindHead + mergeRecord/close + deps/gates + agent/ops aggregation


