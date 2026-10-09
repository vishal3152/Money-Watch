import Link from "next/link";

import { BrandMark } from "@/app/components/brand-mark";
import { HeaderLanguageSwitcher } from "@/app/components/header-language-switcher";
import { NavTabs } from "@/app/components/nav-tabs";
import { shouldShowNavTabs } from "@/app/components/nav-tabs-visibility";
import { isCloudMode } from "@/config/deployment-mode";
import { getLocale } from "@/i18n/server";
import { getCurrentOwnerId } from "@/lib/cloud-auth/current-owner";

export async function AppHeader() {
  const locale = await getLocale();
  const cloudMode = isCloudMode();
  const ownerId = await getCurrentOwnerId();
  const showNavTabs = shouldShowNavTabs({ isCloudMode: cloudMode, hasSession: ownerId !== null });

  let ownerControls = null;
  if (cloudMode) {
    const { CloudOwnerControls } = await import("@/app/components/cloud-owner-controls");
    ownerControls = <CloudOwnerControls />;
  }

  return (
    <header className="pw-header">
      <div className="pw-header-start">
        <Link className="pw-brand" href="/">
          <BrandMark />
          <span className="pw-brand-name">
            <span className="pw-brand-name-lead">Money</span> Watch
          </span>
        </Link>
        {showNavTabs ? <NavTabs /> : null}
      </div>
      <div className="pw-header-actions">
        <HeaderLanguageSwitcher currentLocale={locale} />
        {ownerControls}
      </div>
    </header>
  );
}
