import clsx from 'clsx';
import { useMemo } from 'react';
import { useLauncherStore } from '../store/useLauncherStore';
import { StatusBadge } from '../components/StatusBadge';
import { TARGET_MINECRAFT_VERSION } from '../config/version';

export const ServersPage = () => {
  const { servers, selectedServerId, setSelectedServer, filter, setFilter } = useLauncherStore((s) => ({
    servers: s.servers,
    selectedServerId: s.selectedServerId,
    setSelectedServer: s.setSelectedServer,
    filter: s.serverFilter,
    setFilter: s.setServerFilter
  }));

  const filtered = useMemo(() => {
    return servers.filter((s) => {
      if (filter.onlineOnly && s.status !== 'Online') return false;
      if (filter.version !== 'Все версии' && s.version !== filter.version) return false;
      if (filter.type !== 'Все типы' && !s.tags.includes(filter.type)) return false;
      return true;
    });
  }, [servers, filter]);

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="mb-3 text-xl font-black">Сервера</h2>
        <div className="grid gap-2 md:grid-cols-4">
          <select className="field" value={filter.type} onChange={(e) => setFilter({ type: e.target.value })}>
            <option>Все типы</option>
            <option>Survival</option>
            <option>PvE</option>
            <option>PvP</option>
            <option>SkyBlock</option>
          </select>

          <select className="field" value={filter.version} onChange={(e) => setFilter({ version: e.target.value })}>
            <option>Все версии</option>
            <option>{TARGET_MINECRAFT_VERSION}</option>
          </select>

          <label className="inline-flex items-center gap-2 rounded-[18px] border border-white/10 bg-bc-cardSoft px-4 text-sm">
            <input type="checkbox" checked={filter.onlineOnly} onChange={(e) => setFilter({ onlineOnly: e.target.checked })} />
            Только online
          </label>
        </div>
      </section>

      <section className="space-y-2">
        {filtered.map((server) => {
          const active = selectedServerId === server.id;
          return (
            <button
              key={server.id}
              onClick={() => setSelectedServer(server.id)}
              className={clsx('hover-card relative w-full rounded-[20px] border bg-bc-card p-4 text-left', {
                'border-white/10': !active,
                'border-[#59E11D2E] shadow-accent': active
              })}
            >
              <span className={clsx('absolute inset-y-3 left-0 w-1 rounded-r', active ? 'bg-bc-accent' : 'bg-transparent')} />

              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-semibold">{server.name}</h3>
                <StatusBadge status={server.status} />
              </div>

              <p className="mb-3 text-sm text-bc-muted">{server.shortDesc}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-bc-muted">
                <span>{server.playersOnline}/{server.maxPlayers}</span>
                <span>•</span>
                <span>{server.version}</span>
                <span>•</span>
                <span>{server.tags.join(', ')}</span>
              </div>
            </button>
          );
        })}

        {!filtered.length && (
          <div className="panel p-6 text-center">
            <p className="text-sm text-bc-muted">Ничего не найдено по текущим фильтрам</p>
            <button className="btn-secondary mt-3" onClick={() => setFilter({ type: 'Все типы', version: 'Все версии', onlineOnly: false })}>
              Сбросить фильтры
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
