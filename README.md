# Бэкенд часть Algavive

В index.ts стоит часть кода:

`
const FRONTEND_URL = (BACKDEV_MODE: boolean): string => {
  return BACKDEV_MODE
    ? "http://localhost:5173"
    : "https://algavive.pages.dev"
}
`

При деплое можете поменять на свою ссылку