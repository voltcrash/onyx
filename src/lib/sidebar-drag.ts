export type SidebarSide = "left" | "right";

const HOLD_MS = 300;
const SLOP_PX = 6;

export interface SidebarDragHost {
  side(): SidebarSide;
  /** Shows where the sidebar would dock, or clears it with undefined. */
  setDropSide(side: SidebarSide | undefined): void;
  dock(side: SidebarSide): void;
}

/** Holding a sidebar toggle picks it up; releasing it over either half of the window docks the sidebar there. */
export function startSidebarDrag(event: PointerEvent, host: SidebarDragHost): void {
  if (event.button !== 0 || !event.isPrimary) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let dropSide: SidebarSide | undefined;
  const holdTimer = window.setTimeout(() => {
    dragging = true;
    host.setDropSide(host.side());
  }, HOLD_MS);
  const onMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    if (dragging) {
      moveEvent.preventDefault();
      dropSide = moveEvent.clientX > window.innerWidth / 2 ? "right" : "left";
      host.setDropSide(dropSide);
    } else if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > SLOP_PX) {
      finish();
    }
  };
  const onUp = (upEvent: PointerEvent) => {
    if (upEvent.pointerId !== event.pointerId) return;
    if (dragging) {
      host.dock(dropSide ?? host.side());
      // The release would otherwise land as a click and toggle the sidebar.
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      window.setTimeout(
        () => window.removeEventListener("click", swallowClick, { capture: true }),
        0,
      );
    }
    finish();
  };
  const onCancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId === event.pointerId) finish();
  };
  const onContextMenu = (menuEvent: Event) => {
    if (dragging) menuEvent.preventDefault();
  };
  function swallowClick(clickEvent: Event): void {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
  }
  function finish(): void {
    window.clearTimeout(holdTimer);
    host.setDropSide(undefined);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("contextmenu", onContextMenu);
  }
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("contextmenu", onContextMenu);
}
