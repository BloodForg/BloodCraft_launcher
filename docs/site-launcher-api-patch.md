# Next.js patch: launcher auth endpoints

Если backend `thebloodcraft.ru` ещё не содержит launcher-auth API, добавьте минимальные route handlers.

## Required endpoints
- `POST /api/launcher/login`
- `GET /api/launcher/me`
- `POST /api/launcher/refresh`

## Suggested contract

### POST /api/launcher/login
Request:
```json
{ "login": "email-or-username", "password": "***" }
```
Response:
```json
{
  "accessToken": "jwt-access",
  "refreshToken": "jwt-refresh",
  "user": {
    "username": "BloodPlayer",
    "email": "player@example.com",
    "avatarUrl": "https://..."
  }
}
```

### GET /api/launcher/me
Headers:
```http
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "user": {
    "username": "BloodPlayer",
    "email": "player@example.com",
    "avatarUrl": "https://..."
  }
}
```

### POST /api/launcher/refresh
Request:
```json
{ "refreshToken": "jwt-refresh" }
```
Response:
```json
{
  "accessToken": "jwt-access-new",
  "refreshToken": "jwt-refresh-new",
  "user": {
    "username": "BloodPlayer",
    "email": "player@example.com",
    "avatarUrl": "https://..."
  }
}
```

## Notes
- `401` on invalid credentials/expired token.
- Keep short error messages in response (`message`), full details in server logs.
- Launcher already maps `401` to friendly text in UI.
