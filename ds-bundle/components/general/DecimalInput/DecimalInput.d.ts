import * as React from 'react';

/**
 * DecimalInput — from @paisa-watch/ui@0.1.0.
 */
export interface DecimalInputProps {
value?: string; defaultValue?: string; name?: string; id?: string; placeholder?: string; required?: boolean; disabled?: boolean; readOnly?: boolean; className?: string; allowNegative?: boolean; onValueChange?: (value: string) => void; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export declare const DecimalInput: React.ComponentType<DecimalInputProps>;
