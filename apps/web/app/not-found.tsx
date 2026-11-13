export default function NotFound() {
  return (
    <main className="js-main mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
      <section className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <p className="js-kicker">404</p>
        <h1 className="js-page-title">页面不存在 / Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          你访问的页面可能已被移动或删除。 / The page you are looking for may have been moved or removed.
        </p>
        <a
          className="mt-6 inline-block rounded-xl border border-accent bg-accent-soft px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-hover"
          href="/"
        >
          返回首页 / Back to home
        </a>
      </section>
    </main>
  );
}
