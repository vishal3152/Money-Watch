import * as React from 'react';

/**
 * LedgerFilter — from @paisa-watch/ui@0.1.0.
 */
export interface LedgerFilterProps {
  rows: LedgerFilterRow[];
  headingId: string;
  toggleLabel: string;
}

export declare const LedgerFilter: React.ComponentType<LedgerFilterProps>;
