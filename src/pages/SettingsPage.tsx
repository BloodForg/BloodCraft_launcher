import { useLauncherStore } from '../store/useLauncherStore';

export const SettingsPage = () => {
  const {
    settings,
    setMemoryGb,
    setInstallPath,
    setJavaPath,
    setSettingFlag,
    saveSettings,
    logs,
    clearLogs,
    addToast,
    addLog
  } = useLauncherStore((s) => ({
    settings: s.settings,
    setMemoryGb: s.setMemoryGb,
    setInstallPath: s.setInstallPath,
    setJavaPath: s.setJavaPath,
    setSettingFlag: s.setSettingFlag,
    saveSettings: s.saveSettings,
    logs: s.logs,
    clearLogs: s.clearLogs,
    addToast: s.addToast,
    addLog: s.addLog
  }));

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="mb-3 text-xl font-black">Настройки</h2>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-bc-muted">Память</h3>
            <input type="range" min={2} max={16} value={settings.memoryGb} onChange={(e) => setMemoryGb(Number(e.target.value))} className="w-full accent-[#E11D2E]" />
            <p className="mt-2 text-sm">Выделено: {settings.memoryGb} GB</p>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-bc-muted">Установка</h3>
            <input className="field mb-2" value={settings.installPath} onChange={(e) => setInstallPath(e.target.value)} />
            <button className="btn-ghost" onClick={() => addToast('Выбор пути (заглушка)')}>
              Выбрать...
            </button>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-bc-muted">Java</h3>
            <button className="btn-ghost mb-2" onClick={() => addToast('Autodetect Java (заглушка)')}>
              Autodetect
            </button>
            <input className="field mb-2" value={settings.javaPath} onChange={(e) => setJavaPath(e.target.value)} />
            <button className="btn-ghost" onClick={() => addToast('Проверка Java (заглушка)')}>
              Проверить
            </button>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-bc-muted">Клиент</h3>
            <label className="mb-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.autoUpdate} onChange={(e) => setSettingFlag('autoUpdate', e.target.checked)} />
              Автообновление
            </label>
            <label className="mb-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.showLogs} onChange={(e) => setSettingFlag('showLogs', e.target.checked)} />
              Показывать логи
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.windowedMode} onChange={(e) => setSettingFlag('windowedMode', e.target.checked)} />
              Оконный режим
            </label>
          </div>
        </div>

        <button className="btn-primary mt-4" onClick={saveSettings}>
          Сохранить
        </button>
      </section>

      <section className="panel p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Логи</h3>
        <div className="mb-3 h-40 overflow-auto rounded-[16px] border border-white/10 bg-[#0F1216] p-3 font-mono text-xs text-bc-muted">
          {logs.length ? logs.map((line, idx) => <p key={`${line}-${idx}`}>{line}</p>) : <p>Логи пусты</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => addToast('Скопировано (заглушка)')}>
            Copy
          </button>
          <button className="btn-ghost" onClick={clearLogs}>
            Clear
          </button>
          <button className="btn-ghost" onClick={() => addToast('Open logs folder (заглушка)')}>
            Open logs folder
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Repair</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => addLog('[REPAIR] Проверка файлов (заглушка)')}>
            Проверить файлы
          </button>
          <button className="btn-secondary" onClick={() => addLog('[REPAIR] Сброс кэша (заглушка)')}>
            Сбросить кэш
          </button>
          <button className="btn-secondary" onClick={() => addLog('[REPAIR] Переустановка клиента (заглушка)')}>
            Переустановить клиент
          </button>
        </div>
      </section>
    </div>
  );
};
