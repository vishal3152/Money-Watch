import * as React from 'react';

/**
 * DeleteConfirmForm — from @paisa-watch/ui@0.1.0.
 */
export interface DeleteConfirmFormProps {
  action: (state: DeleteFormState, formData: FormData) => Promise<DeleteFormState>;
  hiddenFields: Record<string, string>;
  confirmLabel: string;
}

export declare const DeleteConfirmForm: React.ComponentType<DeleteConfirmFormProps>;
