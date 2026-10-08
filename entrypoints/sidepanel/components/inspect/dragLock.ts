/**
 * A drag that never runs out of room: the pointer is locked to the handle,
 * so a scrub keeps going past the panel's edge and the screen's.
 *
 * Ported from Nudge UI's `tokens/dragPointerLock.ts` (MIT, © 2026 Charles
 * Smart; see THIRD_PARTY_NOTICES.md). Where the lock is refused (a frame
 * that may not lock, a test page), the drag still works from the pointer's
 * own position, so `onMove` is told how far the pointer has gone either way.
 */
export function startDragLock(
  handle: HTMLElement,
  startX: number,
  onMove: (dx: number, e: MouseEvent) => void,
  onEnd: () => void,
): () => void {
  const doc = handle.ownerDocument;
  let dx = 0;
  let locked = false;
  let stopped = false;

  const isLocked = () => doc.pointerLockElement === handle;
  const onLockChange = () => {
    if (isLocked()) locked = true;
    else if (locked) end();
  };
  const onMouseMove = (e: MouseEvent) => {
    if (stopped) return;
    dx = isLocked() ? dx + e.movementX : e.clientX - startX;
    onMove(dx, e);
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) end();
  };

  function stop() {
    if (stopped) return;
    stopped = true;
    doc.removeEventListener('mousemove', onMouseMove);
    doc.removeEventListener('mouseup', onMouseUp);
    doc.removeEventListener('pointerlockchange', onLockChange);
    if (isLocked()) doc.exitPointerLock();
  }
  function end() {
    if (stopped) return;
    stop();
    onEnd();
  }

  doc.addEventListener('mousemove', onMouseMove);
  doc.addEventListener('mouseup', onMouseUp);
  doc.addEventListener('pointerlockchange', onLockChange);
  try {
    // Older engines return nothing; a refusal keeps the plain drag.
    const request = handle.requestPointerLock?.() as unknown as Promise<void> | undefined;
    if (request && typeof request.catch === 'function') request.catch(() => {});
  } catch {
    // Plain drag.
  }
  return stop;
}
