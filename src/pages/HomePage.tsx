import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useLauncherStore, selectSelectedProfile, selectSelectedServer } from '../store/useLauncherStore';

export const HomePage = () => {
  const { news, promos, promoIndex, nextPromo, setPromoIndex, playSelectedServer } = useLauncherStore((s) => ({
    news: s.news,
    promos: s.promos,
    promoIndex: s.promoIndex,
    nextPromo: s.nextPromo,
    setPromoIndex: s.setPromoIndex,
    playSelectedServer: s.playSelectedServer
  }));

  const selectedServer = useLauncherStore(selectSelectedServer);
  const selectedProfile = useLauncherStore(selectSelectedProfile);

  useEffect(() => {
    const id = setInterval(() => nextPromo(), 5000);
    return () => clearInterval(id);
  }, [nextPromo]);

  const promo = promos[promoIndex];

  return (
    <div className="space-y-4">
      <section className="panel relative overflow-hidden p-6">
        <div className="absolute right-[-120px] top-[-80px] h-64 w-64 rounded-full bg-[#E11D2E]/10 blur-3xl" />
        <h2 className="mb-2 text-3xl font-black">Добро пожаловать в BloodCraft</h2>
        <p className="max-w-2xl text-sm text-bc-muted">Минималистичный премиальный лаунчер в едином стиле с сайтом. Все игровые действия в этом шаблоне работают как UI-заглушки.</p>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="panel p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Последние новости</h3>
          <div className="space-y-2">
            {news.map((item) => (
              <article key={item.id} className="hover-card flex gap-3 rounded-[18px] border border-white/10 bg-bc-cardSoft p-2.5">
                <img src={item.bannerUrl} alt={item.title} className="h-16 w-24 rounded-[12px] object-cover" />
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-bc-muted">{item.excerpt}</p>
                  <p className="mt-1 text-[11px] text-bc-muted">{item.date}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Промо / Ивенты</h3>
          {promo && (
            <AnimatePresence mode="wait">
              <motion.div
                key={promo.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                className="relative h-[180px] overflow-hidden rounded-[18px]"
              >
                <img src={promo.bannerUrl} className="h-full w-full object-cover" alt={promo.title} />
                <div className="absolute inset-0 bg-gradient-to-b from-[#180f14]/70 via-transparent to-[#11151B]" />
                <div className="absolute inset-x-4 bottom-3">
                  <p className="text-lg font-bold">{promo.title}</p>
                  <p className="text-sm text-bc-muted">{promo.text}</p>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          <div className="mt-3 flex justify-center gap-1.5">
            {promos.map((p, idx) => (
              <button key={p.id} className={`h-2 w-2 rounded-full ${idx === promoIndex ? 'bg-bc-accent' : 'bg-white/20'}`} onClick={() => setPromoIndex(idx)} />
            ))}
          </div>
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Быстрый старт</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[16px] border border-white/10 bg-bc-cardSoft p-3 text-sm">
            <p className="text-bc-muted">Сервер</p>
            <p className="font-semibold">{selectedServer?.name ?? 'Не выбран'}</p>
          </div>
          <div className="rounded-[16px] border border-white/10 bg-bc-cardSoft p-3 text-sm">
            <p className="text-bc-muted">Профиль</p>
            <p className="font-semibold">{selectedProfile.name}</p>
          </div>
          <button className="btn-primary" onClick={playSelectedServer}>
            Играть
          </button>
        </div>
      </section>
    </div>
  );
};
