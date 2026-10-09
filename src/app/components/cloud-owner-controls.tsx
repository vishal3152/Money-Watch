import { signOut } from "@/app/login/actions";
import { getCurrentOwnerEmail, getCurrentOwnerId } from "@/lib/cloud-auth/current-owner";
import { getTranslator } from "@/i18n/server";

/** Cloud-only header chrome. Dynamically imported so local/desktop never loads Supabase.
 * Gated on ownerId, not ownerEmail — both providers have an email today, but ownerId is
 * the one identity value every auth provider is guaranteed to resolve. */
export async function CloudOwnerControls() {
  const ownerId = await getCurrentOwnerId();
  const ownerEmail = await getCurrentOwnerEmail();
  const { t } = await getTranslator();

  if (!ownerId) {
    return null;
  }

  return (
    <>
      {ownerEmail ? (
        <span className="pw-header-email" title={ownerEmail}>
          {ownerEmail}
        </span>
      ) : null}
      <form action={signOut}>
        <button className="pw-menu" type="submit" aria-label={t("nav.signOut")}>
          <svg className="pw-menu-icon" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M8 3.5H4.8A1.3 1.3 0 0 0 3.5 4.8v10.4a1.3 1.3 0 0 0 1.3 1.3H8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M13 13.5 16.5 10 13 6.5M16.5 10H8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </form>
    </>
  );
}
