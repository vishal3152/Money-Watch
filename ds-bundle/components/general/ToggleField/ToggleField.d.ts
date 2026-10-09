import * as React from 'react';

/**
 * ToggleField — from @paisa-watch/ui@0.1.0.
 */
export interface ToggleFieldProps {
  id: string;
  name: string;
  label: string;
  help?: string;
  defaultChecked?: boolean;
}

export declare const ToggleField: React.ComponentType<ToggleFieldProps>;
