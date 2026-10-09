SheetSelect from @paisa-watch/ui. Use via `window.PaisaWatchUI.SheetSelect` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface SheetSelectProps {
  id: string;
  name?: string;
  label: string;
  value: string;
  options: readonly SheetSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  errorId?: string;
  invalid?: boolean;
  error?: string;
}
```
