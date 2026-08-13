export function FloatingNotePage() {
  return (
    <main className="flex h-screen flex-col bg-note p-5 text-stone-800">
      <header className="drag-region mb-5 flex items-center justify-between">
        <span className="text-sm text-stone-500">Wave 0</span>
        <h1 className="text-lg font-semibold">悬浮便利贴</h1>
        <span aria-hidden="true">•••</span>
      </header>
      <section className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-amber-300/70 text-center text-sm text-stone-500">
        工程基线已就绪<br />Wave 1 将实现任务列表
      </section>
    </main>
  );
}
