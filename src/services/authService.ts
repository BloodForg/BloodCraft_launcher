import type { AuthResponse, User } from '../types';
import userMock from '../mocks/user.mock.json';

const MOCK_TOKEN = 'mock_bloodcraft_token_2026';

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

export const authService = {
  async login(login: string, password: string): Promise<AuthResponse> {
    await delay();
    if (!login || !password) {
      throw new Error('Введите логин и пароль');
    }

    return {
      token: MOCK_TOKEN,
      user: {
        ...userMock,
        username: login.includes('@') ? userMock.username : login
      }
    } as AuthResponse;
  },

  async logout(): Promise<void> {
    await delay(180);
  },

  async me(): Promise<User> {
    await delay(200);
    return userMock as User;
  }
};

// Future API endpoints:
// POST /api/auth/login
// GET /api/auth/me
