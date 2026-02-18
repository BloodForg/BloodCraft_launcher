import { useLauncherStore } from '../store/useLauncherStore';

export const DownloadsPage = () => {
  const { downloads, patchDownload } = useLauncherStore((s) => ({
    downloads: s.downloads,
    patchDownload: s.patchDownload
  }));

  const empty = downloads.length === 0;

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="mb-3 text-xl font-black">Загрузки / Обновления</h2>
        {empty ? (
          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-6 text-center text-bc-muted">Нет активных загрузок</div>
        ) : (
          <div className="space-y-3">
            {downloads.map((task) => (
              <div key={task.id} className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{task.title}</span>
                  <span className="text-bc-muted">{task.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-bc-accent transition-all duration-200 ease-premium" style={{ width: `${task.progress}%` }} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patchDownload(task.id, { status: 'paused' })}>
                    Пауза
                  </button>
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patchDownload(task.id, { status: 'downloading' })}>
                    Продолжить
                  </button>
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patchDownload(task.id, { progress: 0, status: 'completed' })}>
                    Отменить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
