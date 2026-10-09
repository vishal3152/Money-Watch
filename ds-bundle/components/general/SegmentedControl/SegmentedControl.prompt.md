SegmentedControl from @paisa-watch/ui. Use via `window.PaisaWatchUI.SegmentedControl` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface SegmentedControlProps {
  name?: string;
  value: string;
  options: readonly SegmentOption[];
  onChange: (value: string) => void;
  "aria-label": string;
  disabled?: boolean;
}
```
