import { Show } from "solid-js"
import { Plugin, Slot } from "@opencode/plugin/gui"
import type { SessionMessageUser } from "@opencode/client"

// Ghim prompt (tin nhắn user) mới nhất của session lên đầu: slot session.header
// là hàng tiêu đề của timeline, luôn hiển thị phía trên khi cuộn hội thoại.
// Click vào ghim để nhảy tới đúng vị trí prompt đó trong transcript.

export default Plugin.define({
  setup(ctx) {
    const styles = {
      trigger: {
        "max-width": "52ch",
        overflow: "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
        opacity: "0.6",
        "font-size": "0.85em",
        cursor: "pointer",
        position: "relative",
      },
    }

    ctx.add(Slot, {
      at: "session.header",
      order: 10,
      render: (input) => {
        // Prompt user mới nhất: type "user", bỏ qua message sau revert boundary,
        // ẩn trong session subagent.
        const latest = (): SessionMessageUser | undefined => {
          const id = input.session.id
          if (!id) return undefined
          const data = input.session.server.data
          const info = data.session.get(id)
          if (info?.parentID) return undefined
          const boundary = info?.revert?.messageID
          // Prompt steer/queue chưa vào transcript: pin phải trỏ tới hàng có thật để click cuộn được.
          const pending = new Set(data.session.pending.list(id).map((item) => item.id))
          const messages = data.session.message.list(id) ?? []
          for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i]
            if (message.type !== "user") continue
            if (boundary && message.id >= boundary) continue
            if (pending.has(message.id)) continue
            if (message.text.trim()) return message
          }
          return undefined
        }

        // Nhảy tới prompt: hàng mang id `message-<messageID>` (anchor của app).
        // Transcript là virtualizer và tự ghi lại scrollOffset (scrollAdjustment/follow), nên scroll
        // mượt viết trực tiếp scrollTop giữa chừng bị huỷ (teleport). Đường ghi duy nhất mà app
        // không ghi đè là kéo scrollbar thumb của nó — drag bằng pointer event tổng hợp bên dưới.
        const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))

        let seekRun = 0
        const jump = async (event: MouseEvent, message: SessionMessageUser) => {
          event.stopPropagation()
          const run = ++seekRun
          const container = [...document.querySelectorAll("[data-scrollable]")].find((el) => el.clientHeight > 300)
          if (!container) return
          const findRow = () => document.getElementById(`message-${message.id}`) as HTMLElement | null
          const centerOffset = (row: HTMLElement) =>
            Math.max(
              0,
              container.scrollTop +
                row.getBoundingClientRect().top -
                container.getBoundingClientRect().top -
                (container.clientHeight - row.offsetHeight) / 2,
            )

          let row = findRow()
          // Kéo scrollbar thumb của app bằng pointer event tổng hợp: đây là đường ghi scroll mà
          // virtualizer chấp nhận (cùng đường với kéo chuột của người dùng — app đang trong trạng
          // thái drag nên không có cơ chế nào ghi đè scrollTop giữa chừng).
          const firePointer = (el: Element, type: string, x: number, y: number, buttons: number) =>
            el.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 7,
                pointerType: "mouse",
                isPrimary: true,
                buttons,
                button: 0,
                clientX: x,
                clientY: y,
              }),
            )
          const vThumb = () =>
            ([...document.querySelectorAll(".scroll-view__thumb")].find(
              (el) => (el as HTMLElement).dataset.orientation === "vertical" && el.getBoundingClientRect().height > 8,
            ) ?? null) as HTMLElement | null
          const dragTo = async (offset: number, steps: number, onStep?: () => HTMLElement | null) => {
            const thumb = vThumb()
            if (!thumb) {
              container.scrollTop = offset
              await nextFrame()
              return onStep?.() ?? null
            }
            const track = thumb.parentElement.getBoundingClientRect()
            const tr0 = thumb.getBoundingClientRect()
            const x = tr0.x + tr0.width / 2
            const y0 = tr0.y + tr0.height / 2
            const grabOffset = tr0.height / 2
            const targetY = (v: number) => {
              const n = Math.max(1, container.clientHeight - 8 - thumb.getBoundingClientRect().height)
              const max = Math.max(1, container.scrollHeight - container.clientHeight)
              return track.y + 4 + grabOffset + (Math.min(Math.max(0, v), max) / max) * n
            }
            firePointer(thumb, "pointerdown", x, y0, 1)
            const yEnd = targetY(offset)
            for (let i = 1; i <= steps; i++) {
              if (run !== seekRun) break
              firePointer(thumb, "pointermove", x, y0 + ((yEnd - y0) * i) / steps, 1)
              await nextFrame()
              const hit = onStep?.()
              if (hit) {
                firePointer(thumb, "pointerup", x, yEnd, 0)
                return hit
              }
            }
            firePointer(thumb, "pointerup", x, yEnd, 0)
            await nextFrame()
            return onStep?.() ?? null
          }

          if (!row) {
            // Đích (prompt mới nhất) thường gần đáy: thử đáy trước, rồi quét từ đỉnh xuống,
            // mỗi frame kiểm tra một lần — hàng sẽ hiện ra khi quét đi qua vị trí của nó.
            row = await dragTo(container.scrollHeight, 10, () => findRow())
          }
          if (!row) {
            row = await dragTo(0, 16, () => findRow())
          }
          if (!row) {
            row = await dragTo(container.scrollHeight, 16, () => findRow())
          }
          if (!row || run !== seekRun) return

          // Highlight hai nhịp sáng 2.1s; khi app re-render (đang stream) node hàng bị thay mới,
          // nên gắn lại animation với thời gian còn lại thay vì để animation chết theo node.
          const HIGHLIGHT_MS = 2100
          const HIGHLIGHT_KEYFRAMES = [
            { filter: "brightness(1)" },
            { filter: "brightness(1.8)", offset: 0.2 },
            { filter: "brightness(1.5)", offset: 0.45 },
            { filter: "brightness(1.8)", offset: 0.65 },
            { filter: "brightness(1)" },
          ]
          const highlight = async () => {
            const startAt = performance.now()
            while (performance.now() - startAt < HIGHLIGHT_MS) {
              const current = findRow()
              if (!current || run !== seekRun) return
              if (current.getAnimations().length === 0) {
                current.animate(HIGHLIGHT_KEYFRAMES, {
                  duration: HIGHLIGHT_MS - (performance.now() - startAt),
                  easing: "ease-in-out",
                })
              }
              await new Promise((resolve) => setTimeout(resolve, 150))
            }
          }

          await dragTo(centerOffset(row), 12)
          for (let i = 0; i < 6; i++) {
            await nextFrame()
            await nextFrame()
            if (run !== seekRun) return
            const current = findRow()
            if (!current) return
            if (Math.abs(centerOffset(current) - container.scrollTop) <= 2) break
            container.scrollTop = centerOffset(current)
          }
          await highlight()
        }

        return (
          <Show when={latest()}>
            {(message) => (
              <span
                data-pinned-prompt=""
                style={styles.trigger}
                title={message().text}
                onClick={(event) => jump(event, message())}
              >
                {message().text}
              </span>
            )}
          </Show>
        )
      },
    })
  },
})
