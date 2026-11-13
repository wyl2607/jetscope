'use client';

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="js-main mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
      <section className="rounded-2xl border border-danger bg-danger-soft p-8 text-center">
        <p className="js-kicker">Error</p>
        <h1 className="js-page-title">页面暂时无法显示 / Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          服务端出现异常，请重试。 / The server hit an unexpected error. Please try again.
        </p>
        <button
          className="mt-6 inline-block rounded-xl border border-danger bg-danger-soft px-4 py-2 text-sm font-semibold text-danger hover:bg-surface"
          onClick={() => reset()}
          type="button"
        >
          重试 / Try again
        </button>
      </section>
    </main>
  );
}
