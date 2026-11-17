# opencode-pinned-prompt

An [OpenCode](https://opencode.ai) desktop plugin that pins the
latest user prompt to the session header and jumps back to it.

The header slot (`session.header`) shows a quiet preview of your
newest prompt above the timeline, always visible while you scroll.
Click it to jump to that prompt in the transcript; the prompt row
flashes briefly so you can spot it in a long conversation.

## Features

- Always-visible preview of the latest user prompt in the session
  header.
- One click scrolls the transcript to that prompt, centered.
- A 2-second brightness highlight marks the target row and re-attaches
  itself if the app re-renders mid-animation.
- Skips prompts that are still being sent (steer or queue state), so
  the pin always points at a prompt that exists in the transcript.

## Install

Clone this repository into your OpenCode plugins directory and add it
to your `opencode.jsonc`:

1. Clone the plugin:

   ```
   git clone https://github.com/NguyenDTAnh/opencode-pinned-prompt \
     ~/.config/opencode/plugins/pinned-prompt
   ```

2. Register it in `~/.config/opencode/opencode.jsonc`:

   ```jsonc
   {
     "plugins": [
       "~/.config/opencode/plugins/pinned-prompt"
     ]
   }
   ```

3. Restart OpenCode Desktop.

The build output (`dist/gui-experimental.cjs`) is committed, so no
build step is required.

## Build from source

Requires [Bun](https://bun.sh). Install dependencies and build:

```
cd ~/.config/opencode/plugins/pinned-prompt
bun install
bunx vite build
```

## How it works

The plugin registers a `session.header` slot and renders the latest
committed user message. On click it resolves the message row through
the app's `message-<messageID>` anchor and scrolls the transcript to
it. The transcript is virtualized, so rows outside the render window
do not exist yet and its scroll offset is re-asserted on re-render;
the plugin walks the render window over to the target row first, then
lands on it, and keeps the highlight animation attached across node
replacements.

## License

MIT
