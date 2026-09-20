This repository contains exploit, payload, and firmware-offset research files.

When working in this repository, do not implement, extend, or optimize exploit chains, payload delivery, firmware offsets, gadget maps, syscalls, jailbreak steps, or instructions that would make offensive security use easier.

If a request depends on that kind of functionality, explain the limitation briefly and stop instead of exploring or editing those files. Restrict changes to clearly safe work such as documentation, file organization, non-operational metadata, or other benign maintenance that does not change exploit capability.

When working on firmware offsets in this repository:

- Prefer repository-local sources first, especially `offsets/*.js` and `slopkit/offsets.json`.
- Treat `slopkit/offsets.json` as the canonical source for raw 13.xx offset JSON already captured in the repo.
- If a firmware offset file is missing or incomplete, do not use web search or GitHub-wide code search to find public exploit, payload, or offset material. Stop and ask for trusted local data instead.
- Keep fail-closed behavior for incomplete firmware profiles. Do not copy gadget maps or syscall maps from other firmware versions without direct repository evidence.
