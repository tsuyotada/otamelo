<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:user-project-rules -->
# User and project rules

## User environment
- The user uses Windows Command Prompt, not PowerShell.
- Give terminal commands for cmd.exe.
- Project path:
  C:\Users\TsuyotadaHirai\Desktop\ClaudCode\GW-apps\otamelo

## User skill level
- The user cannot read code comfortably.
- Explain code-related findings and changes in beginner-friendly Japanese.
- Before editing code, first explain:
  1. Which files are related
  2. What those files do
  3. What change you plan to make
- Do not edit code until the user approves, unless the user explicitly asks you to implement immediately.

## Working style
- Prefer small, safe, minimal changes.
- Avoid large refactors unless clearly necessary.
- If there are multiple possible fixes, explain the options simply and recommend one.
- After editing, summarize:
  1. What changed
  2. Which files changed
  3. How to test it
  4. What to check visually or by using the app

## App goal
- This is an Otamatone-style web app.
- Prioritize simple UI, responsive interaction, and stable sound behavior.

## Next.js rule
- Before writing Next.js-related code, read the relevant guide in `node_modules/next/dist/docs/` when needed.
- Heed deprecation notices.
<!-- END:user-project-rules -->