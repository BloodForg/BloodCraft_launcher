import clsx from 'clsx';
import type { TabKey } from '../types';
import { useLauncherStore } from '../store/useLauncherStore';
import { LogoMark } from './LogoMark';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'home', label: 'Главная' },
  { key: 'servers', label: 'Сервера' },
  { key: 'downloads', label: 'Загрузки' },
  { key: 'profile', label: 'Профиль' },
  { key: 'settings', label: 'Настройки' }
];

export const TopBar = () => {
  const tab = useLauncherStore((s) => s.tab);
  const setTab = useLauncherStore((s) => s.setTab);

  return (
    <header className="panel mb-4 flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="shadow-accent rounded-full">
          <LogoMark />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-wide">BloodCraft</h1>
          <p className="text-xs text-bc-muted">Launcher</p>
        </div>
      </div>

      <nav className="flex items-center gap-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={clsx('pill', tab === item.key && 'pill-active')}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
};
