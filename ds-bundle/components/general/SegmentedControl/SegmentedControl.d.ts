import * as React from 'react';

/**
 * SegmentedControl — from @paisa-watch/ui@0.1.0.
 */
export interface SegmentedControlProps {
  name?: string;
  value: string;
  options: readonly SegmentOption[];
  onChange: (value: string) => void;
  "aria-label": string;
  disabled?: boolean;
}

export declare const SegmentedControl: React.ComponentType<SegmentedControlProps>;
