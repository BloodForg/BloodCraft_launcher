import { useMemo } from 'react';
import { useLauncherStore } from '../store/useLauncherStore';
import { openExternal } from '../lib/external';

export const Sidebar = () => {
  const {
    token,
    user,
    authLoading,
    loginForm,
    setLoginForm,
    login,
    logout,
    simulateLoginToggle,
    statusTotalOnline,
    statusPopular,
    statusUpdatedAt,
    refreshStatus,
    addToast
  } = useLauncherStore((s) => ({
    token: s.token,
    user: s.user,
    authLoading: s.authLoading,
    loginForm: s.loginForm,
    setLoginForm: s.setLoginForm,
    login: s.login,
    logout: s.logout,
    simulateLoginToggle: s.simulateLoginToggle,
    statusTotalOnline: s.statusTotalOnline,
    statusPopular: s.statusPopular,
    statusUpdatedAt: s.statusUpdatedAt,
    refreshStatus: s.refreshStatus,
    addToast: s.addToast
  }));

  const updatedSeconds = useMemo(() => Math.max(1, Math.floor((Date.now() - statusUpdatedAt) / 1000)), [statusUpdatedAt]);

  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-4">
      <section className="panel p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Авторизация</h3>

        {!token ? (
          <div className="space-y-3">
            <input
              className="field"
              placeholder="Email или username"
              value={loginForm.login}
              onChange={(e) => setLoginForm({ login: e.target.value })}
            />
            <input
              className="field"
              placeholder="Пароль"
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ password: e.target.value })}
            />

            <button className="btn-primary w-full" onClick={login} disabled={authLoading}>
              {authLoading ? 'Вход...' : 'Войти'}
            </button>

            <div className="flex items-center justify-between text-xs text-bc-muted">
              <button className="hover:text-bc-text" onClick={() => openExternal('https://bloodcraft.example/register')}>
                Регистрация
              </button>
              <button className="hover:text-bc-text" onClick={() => openExternal('https://bloodcraft.example/forgot')}>
                Забыли пароль
              </button>
            </div>

            <p className="text-xs text-bc-muted">Авторизация через сайт BloodCraft</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-bc-cardSoft p-2.5">
              <img src={user?.avatarUrl} alt="avatar" className="h-11 w-11 rounded-full border border-white/10" />
              <div>
                <p className="text-sm font-semibold">{user?.username}</p>
                <p className="text-xs text-bc-muted">{user?.email}</p>
              </div>
            </div>
            <button className="btn-secondary w-full" onClick={logout}>
              Выйти
            </button>
          </div>
        )}

        <button className="mt-3 text-[11px] text-bc-muted hover:text-bc-text" onClick={simulateLoginToggle}>
          Simulate login
        </button>
      </section>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-bc-muted">Мониторинг</h3>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={refreshStatus}>
            Refresh
          </button>
        </div>
        <p className="mb-3 text-2xl font-black">{statusTotalOnline} online</p>
        <div className="space-y-2">
          {statusPopular.map((server) => (
            <div key={server.id} className="flex items-center justify-between rounded-[14px] border border-white/10 bg-bc-cardSoft px-3 py-2">
              <span className="text-sm">{server.name}</span>
              <span className="text-xs text-bc-muted">{server.playersOnline}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-bc-muted">Обновлено {updatedSeconds} сек назад</p>
      </section>

      <section className="panel p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-bc-muted">Быстрые действия</h3>
        <div className="grid gap-2">
          <button className="btn-secondary" onClick={() => addToast('Открыть папку игры (заглушка)')}>
            Открыть папку игры
          </button>
          <button className="btn-secondary" onClick={() => addToast('Очистка кэша (заглушка)')}>
            Очистить кэш
          </button>
          <button className="btn-secondary" onClick={() => addToast('Проверка обновлений (заглушка)')}>
            Проверить обновления
          </button>
        </div>
      </section>
    </aside>
  );
};
