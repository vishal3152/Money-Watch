/** Visual required marker. Pair with the control's `required` attribute — do not rely on color alone. */
export function RequiredMark() {
  return (
    <span className="pw-required-mark" aria-hidden="true">
      *
    </span>
  );
}
