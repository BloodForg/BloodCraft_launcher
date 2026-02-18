import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLauncherStore, selectSelectedProfile, selectSelectedServer } from '../store/useLauncherStore';
import { openExternal } from '../lib/external';
import { PlayButton } from './PlayButton';
import { StatusBadge } from './StatusBadge';

export const ServerDetailsPanel = () => {
  const {
    tab,
    dynamicBannerIndex,
    promos,
    nextDynamicBanner,
    setDynamicBannerIndex,
    playState,
    launchProgress,
    playSelectedServer,
    cyclePlayState,
    profiles,
    selectedProfileId,
    setSelectedProfile
  } = useLauncherStore((s) => ({
    tab: s.tab,
    dynamicBannerIndex: s.dynamicBannerIndex,
    promos: s.promos,
    nextDynamicBanner: s.nextDynamicBanner,
    setDynamicBannerIndex: s.setDynamicBannerIndex,
    playState: s.playState,
    launchProgress: s.launchProgress,
    playSelectedServer: s.playSelectedServer,
    cyclePlayState: s.cyclePlayState,
    profiles: s.profiles,
    selectedProfileId: s.selectedProfileId,
    setSelectedProfile: s.setSelectedProfile
  }));

  const selectedServer = useLauncherStore(selectSelectedServer);
  const selectedProfile = useLauncherStore(selectSelectedProfile);

  useEffect(() => {
    const id = setInterval(() => nextDynamicBanner(), 5000);
    return () => clearInterval(id);
  }, [nextDynamicBanner]);

  if (tab !== 'servers' && tab !== 'home') {
    return null;
  }

  const dynamic = promos[dynamicBannerIndex] ?? promos[0];
  const effectivePlayState = selectedServer?.status === 'Offline' ? 'disabled' : playState;

  return (
    <aside className="w-[380px] shrink-0 space-y-4">
      <section className="panel overflow-hidden p-4">
        <AnimatePresence mode="wait">
          {selectedServer && (
            <motion.div
              key={selectedServer.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="relative mb-3 h-[190px] overflow-hidden rounded-[18px]">
                <img src={selectedServer.bannerUrl} className="h-full w-full object-cover" alt={selectedServer.name} />
                <div className="absolute inset-0 bg-gradient-to-b from-[#170f14]/80 via-transparent to-[#11151B]" />
                <div className="absolute inset-x-3 bottom-3">
                  <h3 className="text-xl font-black">{selectedServer.name}</h3>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <StatusBadge status={selectedServer.status} />
                <span className="text-xs text-bc-muted">
                  ping {selectedServer.pingMs || '-'}ms · {selectedServer.playersOnline}/{selectedServer.maxPlayers}
                </span>
              </div>

              <p className="mb-3 text-sm text-bc-muted">{selectedServer.longDesc}</p>

              <button className="mb-3 text-xs text-bc-muted hover:text-bc-text" onClick={() => openExternal(`https://bloodcraft.example/servers/${selectedServer.id}`)}>
                Подробнее на сайте
              </button>

              <PlayButton state={effectivePlayState} progress={launchProgress} onClick={playSelectedServer} />
              <button className="btn-ghost mt-2 w-full text-xs" onClick={cyclePlayState}>
                Переключить state (demo)
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="panel p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Профиль игры</h3>
        <select className="field mb-3" value={selectedProfileId} onChange={(e) => setSelectedProfile(e.target.value)}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="space-y-2 rounded-[16px] border border-white/10 bg-bc-cardSoft p-3 text-sm">
          <p>
            <span className="text-bc-muted">Версия:</span> {selectedProfile.minecraftVersion}
          </p>
          <p>
            <span className="text-bc-muted">Моды:</span> {selectedProfile.modsSummary}
          </p>
          <p>
            <span className="text-bc-muted">JVM:</span> {selectedProfile.jvmArgs}
          </p>
        </div>
      </section>

      <section className="panel overflow-hidden p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Динамические баннеры</h3>

        {dynamic && (
          <AnimatePresence mode="wait">
            <motion.div
              key={dynamic.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              className="relative h-[130px] overflow-hidden rounded-[16px]"
            >
              <img src={dynamic.bannerUrl} className="h-full w-full object-cover" alt={dynamic.title} />
              <div className="absolute inset-0 bg-gradient-to-b from-[#170f14]/70 via-transparent to-[#11151B]" />
              <div className="absolute inset-x-3 bottom-3">
                <p className="text-sm font-semibold">{dynamic.title}</p>
                <p className="text-xs text-bc-muted">{dynamic.text}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        <div className="mt-3 flex justify-center gap-1.5">
          {promos.map((promo, idx) => (
            <button
              key={promo.id}
              className={`h-2 w-2 rounded-full transition-all ${idx === dynamicBannerIndex ? 'bg-bc-accent' : 'bg-white/20'}`}
              onClick={() => setDynamicBannerIndex(idx)}
            />
          ))}
        </div>
      </section>
    </aside>
  );
};
