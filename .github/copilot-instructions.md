# Critical Rule for Vertex AI / Gemini Tool Usage
When inspecting or reading any `.json` file or schema file (especially files containing `$ref` or `$defs` like `i18nStringMap`):
1. NEVER use a standard file-read tool or MCP schema tool that returns raw JSON directly, as the Vertex AI API crashes on `$ref` keys inside JSON tool responses.
2. Instead, ALWAYS read the file using a terminal/bash command with a plain-text prefix so the tool output is not parsed as raw JSON (for example: `echo "FILE_CONTENT:" && cat <filename>` or `Write-Output "FILE_CONTENT:"; Get-Content <filename>`).

# Critical Rule for Personal Fork (`ioshn/HaejeokRisuai_c4`) — NEVER Target Upstream
This repository (`ioshn/HaejeokRisuai_c4`) is a personal fork.
1. **NEVER** open, suggest, or link a Pull Request targeting the upstream parent repository (`nevaeh5379/HaejeokRisuai` or any other upstream).
2. All Pull Requests, merges, and pushes MUST strictly target `ioshn/HaejeokRisuai_c4` (`origin/main`).
3. Do NOT add an `upstream` git remote locally unless explicitly asked for a one-off sync, and NEVER generate bare `/compare/main...<branch>` GitHub URLs (which GitHub redirects to upstream on forks). If a web compare URL is ever needed, it MUST explicitly specify the fork base: `https://github.com/ioshn/HaejeokRisuai_c4/compare/ioshn:HaejeokRisuai_c4:main...ioshn:HaejeokRisuai_c4:<branch>?expand=1`.
4. When using `create_pull_request` or GitHub tools, ALWAYS explicitly pass `repo: { owner: "ioshn", name: "HaejeokRisuai_c4" }` and `base: "main"`.