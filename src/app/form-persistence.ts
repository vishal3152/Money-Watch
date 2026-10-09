/**
 * React 19 resets a <form> whenever its Server Action promise fulfills —
 * including validation failures returned via useActionState. Capture submitted
 * string fields and bump formKey so the client can remount inputs with
 * defaultValue={values[…]} and restore what the user typed.
 */
export type PersistedFormValues = Record<string, string>;

export type FormPersistence = {
  values: PersistedFormValues;
  formKey: string;
};

export type PersistFormOptions = {
  /** Field names that must never round-trip through action state (passwords, API keys). */
  omitKeys?: readonly string[];
};

export function persistFormValues(
  formData: FormData,
  options: PersistFormOptions = {}
): PersistedFormValues {
  const omit = new Set(options.omitKeys ?? []);
  const values: PersistedFormValues = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !omit.has(key)) {
      values[key] = value;
    }
  }
  return values;
}

export function withPersistedFormState<T extends object>(
  formData: FormData,
  state: T,
  options: PersistFormOptions = {}
): T & FormPersistence {
  return {
    ...state,
    values: persistFormValues(formData, options),
    formKey: crypto.randomUUID()
  };
}
