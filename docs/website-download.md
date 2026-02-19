# Website /download integration

На сайте делаем `/download` -> редирект на:
`https://github.com/BloodForg/BloodCraft_launcher/releases/latest/download/BloodCraft.dmg`

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
