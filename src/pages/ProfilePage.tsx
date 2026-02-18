import { useLauncherStore } from '../store/useLauncherStore';
import { openExternal } from '../lib/external';

export const ProfilePage = () => {
  const { token, user, logout } = useLauncherStore((s) => ({ token: s.token, user: s.user, logout: s.logout }));

  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <h2 className="mb-4 text-xl font-black">Профиль</h2>

        {token && user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <img src={user.avatarUrl} alt={user.username} className="h-20 w-20 rounded-full border border-white/10" />
              <div>
                <p className="text-2xl font-black">{user.username}</p>
                <p className="text-sm text-bc-muted">{user.email}</p>
                <p className="text-xs text-bc-muted">Статус: авторизован</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => openExternal('https://bloodcraft.example/profile')}>
                Открыть профиль на сайте
              </button>
              <button className="btn-secondary" onClick={logout}>
                Выйти
              </button>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-4 text-sm text-bc-muted">Скин: заглушка (подключение позже)</div>
          </div>
        ) : (
          <div className="rounded-[18px] border border-white/10 bg-bc-cardSoft p-5 text-sm text-bc-muted">Вы не авторизованы</div>
        )}
      </section>
    </div>
  );
};
