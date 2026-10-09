import * as React from 'react';

/**
 * CollapsibleSectionList — from @paisa-watch/ui@0.1.0.
 */
export interface CollapsibleSectionListProps {
  headingId: string;
  heading: React.ReactNode;
  toggleLabel: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

export declare const CollapsibleSectionList: React.ComponentType<CollapsibleSectionListProps>;
