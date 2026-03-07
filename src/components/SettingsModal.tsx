import { useLauncherStore } from '../store/useLauncherStore';
import { useSettingsStore } from '../store/useSettingsStore';

interface Props {
  appVersion: string;
  onCheckUpdates: () => Promise<void>;
  onOpenUpdateFolder: () => Promise<void>;
  onOpenUpdaterLogPath: () => Promise<void>;
  onOpenLogsDir: () => Promise<void>;
  onOpenLatestLog: () => Promise<void>;
  onDiagnoseConnection: () => Promise<void>;
}

export const SettingsModal = ({ appVersion, onCheckUpdates, onOpenUpdateFolder, onOpenUpdaterLogPath, onOpenLogsDir, onOpenLatestLog, onDiagnoseConnection }: Props) => {
  const { settingsOpen, setSettingsOpen } = useLauncherStore((s) => ({
    settingsOpen: s.settingsOpen,
    setSettingsOpen: s.setSettingsOpen
  }));
  const { gamePath, ramGb, javaMode, javaPath, setGamePath, setRamGb, setJavaMode, setJavaPath } = useSettingsStore();

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="panel w-full max-w-[680px] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-black">Настройки лаунчера</h3>
          <button className="btn-ghost" onClick={() => setSettingsOpen(false)}>
            Закрыть
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-3">
            <p className="mb-2 text-xs uppercase text-bc-muted">Папка игры</p>
            <input className="field" value={gamePath} onChange={(e) => setGamePath(e.target.value)} />
          </div>
          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-3">
            <p className="mb-2 text-xs uppercase text-bc-muted">RAM</p>
            <input
              type="range"
              min={2}
              max={16}
              value={ramGb}
              onChange={(e) => setRamGb(Number(e.target.value))}
              className="w-full accent-[#E11D2E]"
            />
            <p className="mt-2 text-sm">{ramGb} GB</p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-3">
            <p className="mb-2 text-xs uppercase text-bc-muted">Java</p>
            <select className="field mb-2" value={javaMode} onChange={(e) => setJavaMode(e.target.value as 'auto' | 'custom')}>
              <option value="auto">Auto</option>
              <option value="custom">Выбрать путь</option>
            </select>
            <input className="field" value={javaPath} onChange={(e) => setJavaPath(e.target.value)} placeholder="/path/to/java" />
          </div>
          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-3">
            <p className="mb-2 text-xs uppercase text-bc-muted">Обновления и сервис</p>
            <div className="grid gap-2">
              <button className="btn-secondary" onClick={onCheckUpdates}>
                Проверить обновления
              </button>
              <button className="btn-secondary" onClick={onOpenUpdateFolder}>
                Открыть папку updates
              </button>
              <button className="btn-secondary" onClick={onOpenUpdaterLogPath}>
                Показать путь updater.log
              </button>
              <button className="btn-secondary" onClick={onDiagnoseConnection}>
                Проверить соединение
              </button>
              <button className="btn-secondary" onClick={onOpenLogsDir}>
                Открыть папку логов
              </button>
              <button className="btn-secondary" onClick={onOpenLatestLog}>
                Открыть последний лог
              </button>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-bc-muted">Версия лаунчера: {appVersion}</p>
      </div>
    </div>
  );
};
