# Website /download integration

На сайте делаем `/download` -> редирект на:
`https://github.com/BloodForg/BloodCraft_launcher/releases/latest/download/BloodCraft.dmg`

## macOS migration notice (v1.0.0)
Добавьте на страницу скачивания отдельный блок:

> ⚠️ Важно: обновление лаунчера.  
> Из-за обновления механизма автообновлений требуется один раз переустановить лаунчер вручную:  
> 1) Закройте старый BloodCraft  
> 2) Удалите BloodCraft из Applications  
> 3) Скачайте новую версию и перенесите в Applications  
> Дальше обновления будут устанавливаться автоматически.

## Nginx (example)
```nginx
location = /download {
    return 302 https://github.com/BloodForg/BloodCraft_launcher/releases/latest/download/BloodCraft.dmg;
}
```

## Next.js (example)
```js
// next.config.js
module.exports = {
  async redirects() {
    return [
      {
        source: '/download',
        destination: 'https://github.com/BloodForg/BloodCraft_launcher/releases/latest/download/BloodCraft.dmg',
        permanent: false
      }
    ];
  }
};
```
