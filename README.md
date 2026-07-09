# Бэкенд часть Algavive

# !!Как запустить в локальном режиме!!

1. Скачайте код `git clone https://github.com/algavive/algavive_backend`
2. Установите в нем все зависимости через `npm install`
3. Создайте .dev.vars заполнив в нём следующее:

```env
TURNSTILE_SECRET=1x0000000000000000000000000000000AA 
JWT_SECRET=(ваш код)
# можно дополнительно SIMPREG = true , поставить если хотите включить классическую регистрацию(без гугл аутентификации).
```
4. Сгенерируйте JWT_SECRET через команду `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` и вставьте это значение
5. Запустите `npm start` , также можете одновременно фронтенд код запустить: https://github.com/algavive/algavive_frontend

# !!Как пользоваться миграцией базы данных(менять schema.sql)!!

# Если в локальном режиме

Это расчитано, если у вас в установлен Atlas( https://github.com/ariga/atlas ) и Makefile(обычно можно скачать через пакетные менеджеры или через интернет).

1. Когда появилась папка .wrangler при запуске локального деплоя, зайдите в неё и узнайте имя вашего файла .sqlite 
(еще рекомендую скачать DB Browser SQLite, чтобы просматривать локальную таблицу)

2. Зайдите в make и поменяете название локальной базы данных в `DB_FILE`.

3. Потом через команду `make`, меняя schema.sql, можете генерировать миграции, а применять через `npm run db:execute`.

# Если надо из деплоя достать базу данных

1. Надо создать файл wrangler.prod.toml с такими параметрами:
```yaml
name = "backend"
main = "src/index.ts"
compatibility_date = "2026-07-08"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = имя_вашей_созданной_базы_данных_из_cloudflreD1
database_id = айди_из_бд_D1 # С айди бд, надо осторожнее и просто так засвечивать не надо
```

2. Выполнить команду `npm run db:production:export-schema`
3. Проверить установлен ли sqlite3
4. Выполнить следущие команды:
```
make export-build
make export-diff
```
5. В execute.sql стоит проверить миграцию.
6. Запускать execution для продакшн бд `npm run db:production:execute`


# !!Как задеплоить!!
В index.ts стоит часть кода:

```typescript
const FRONTEND_URL = (BACKDEV_MODE: boolean): string => {
  return BACKDEV_MODE
    ? "http://localhost:5173"
    : "https://algavive.pages.dev"
}
```

При деплое стоит поменять на свою фронтенд ссылку, после ":".

Также загружайте код в cloudflare workers, с пустым wrangler.toml, но обязательно нужно регистрировать бд D1, через id.
Также и с Turnstile капчой(с SECRET).


# Как задеплоить через командную строку

Можете выполнить для деплоя в cloudflare workers, следующие команды:
```
npx wrangler login
npm run deploy:production #он считает ваш wrangler.prod.toml
```