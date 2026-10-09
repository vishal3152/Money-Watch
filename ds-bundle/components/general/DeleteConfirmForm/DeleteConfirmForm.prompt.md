DeleteConfirmForm from @paisa-watch/ui. Use via `window.PaisaWatchUI.DeleteConfirmForm` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface DeleteConfirmFormProps {
  action: (state: DeleteFormState, formData: FormData) => Promise<DeleteFormState>;
  hiddenFields: Record<string, string>;
  confirmLabel: string;
}
```
