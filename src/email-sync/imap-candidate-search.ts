/**
 * IMAP SEARCH query for one email-alert-sync poll: unseen messages of any age,
 * or any message (seen or not) inside the recent window.
 *
 * When the server supports Gmail's X-GM-EXT-1, also drops Promotions and Social
 * category mail via X-GM-RAW — those tabs are marketing/noise for bank-alert
 * sync, and Gmail categories are not ordinary IMAP labels, so this is the only
 * reliable exclusion. Non-Gmail servers never see the gmraw clause.
 */
export function buildImapCandidateSearchQuery(options: {
  recentSince: Date;
  supportGmailRawSearch: boolean;
}): {
  or: Array<{ seen: false } | { since: Date }>;
  gmraw?: string;
} {
  const query: {
    or: Array<{ seen: false } | { since: Date }>;
    gmraw?: string;
  } = {
    or: [{ seen: false }, { since: options.recentSince }]
  };

  if (options.supportGmailRawSearch) {
    query.gmraw = "-category:promotions -category:social";
  }

  return query;
}
