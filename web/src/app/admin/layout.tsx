import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin — GoForMosaic", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="flex-1 bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <Link href="/admin" className="font-semibold">
            <span className="text-brand-700">GoForMosaic</span> Admin
          </Link>
          <div className="flex items-center gap-4 text-sm text-stone-600">
            <span className="hidden sm:inline">{admin.name}</span>
            <a href="/.auth/logout?post_logout_redirect_uri=/" className="underline">
              Sign out
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
