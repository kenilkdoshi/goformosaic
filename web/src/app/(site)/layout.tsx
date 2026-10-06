import Link from "next/link";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-brand-700">
            GoForMosaic
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-stone-500">
          <span>© {new Date().getFullYear()} GoForMosaic</span>
          <Link href="/privacy" className="underline hover:text-stone-800">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </>
  );
}
