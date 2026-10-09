import { redirect } from "next/navigation";

import { SeedLoaderForm } from "@/app/dev/seed/seed-loader-form";

export default function DevSeedPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/");
  }

  return (
    <main className="pw-main">
      <SeedLoaderForm />
    </main>
  );
}
