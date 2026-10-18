/** Keep sequential focus in the active modal, including its initial heading. */
export function trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== "Tab" || event.defaultPrevented || !dialog) return;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
  )).filter((element) => !element.closest('[hidden],[inert],fieldset:disabled'));
  const first = controls[0];
  const last = controls.at(-1);
  if (!first) { event.preventDefault(); dialog.focus(); return; }
  const active = document.activeElement as HTMLElement | null;
  if (!active || !controls.includes(active) ||
    (!event.shiftKey && active === last) || (event.shiftKey && active === first)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
