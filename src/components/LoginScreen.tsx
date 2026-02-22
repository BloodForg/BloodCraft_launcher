import { useState } from 'react';
import logoUrl from '../assets/bloodcraft-logo.svg';
import { openExternal } from '../lib/external';
import { useLauncherStore } from '../store/useLauncherStore';

export const LoginScreen = () => {
  const { loginForm, setLoginForm, login, authLoading } = useLauncherStore((s) => ({
    loginForm: s.loginForm,
    setLoginForm: s.setLoginForm,
    login: s.login,
    authLoading: s.authLoading
  }));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await login();
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-bc-bg px-6 py-8 text-bc-text">
      <div className="mx-auto flex min-h-[85vh] max-w-[440px] items-center">
        <section className="panel w-full p-6">
          <div className="mb-5 flex items-center gap-3">
            <img src={logoUrl} alt="BloodCraft" className="h-12 w-12 rounded-xl" />
            <div>
              <p className="text-xl font-black">BloodCraft</p>
              <p className="text-xs text-bc-muted">Launcher Login</p>
            </div>
          </div>

          <h1 className="mb-1 text-2xl font-black">Вход</h1>
          <p className="mb-4 text-sm text-bc-muted">Авторизация через сайт BloodCraft</p>

          <div className="space-y-3">
            <input
              className="field"
              placeholder="Email или логин"
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
            <button className="btn-primary w-full" disabled={authLoading || submitting} onClick={handleSubmit}>
              {authLoading || submitting ? 'Вход...' : 'Войти'}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-bc-muted">
            <button className="hover:text-bc-text" onClick={() => openExternal('https://thebloodcraft.ru/register')}>
              Регистрация
            </button>
            <button className="hover:text-bc-text" onClick={() => openExternal('https://thebloodcraft.ru/forgot-password')}>
              Забыли пароль?
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
