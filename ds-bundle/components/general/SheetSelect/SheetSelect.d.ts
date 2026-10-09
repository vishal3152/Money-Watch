import * as React from 'react';

/**
 * SheetSelect — from @paisa-watch/ui@0.1.0.
 */
export interface SheetSelectProps {
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

export declare const SheetSelect: React.ComponentType<SheetSelectProps>;
