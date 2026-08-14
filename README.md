# PrinterHub MVP

PrinterHub — MVP автономной точки печати. Пользователь сканирует QR‑код, открывает мобильный сайт, загружает PDF и следит за заданием. Mac Agent сам забирает задание по исходящему HTTPS‑соединению и передаёт его локальному CUPS. CUPS и Mac не публикуются в интернете.

Экран аппарата открывается по адресу `/kiosk/{deviceId}`. На нём пользователь выбирает сайт или Telegram и получает QR‑код, уже привязанный к конкретному аппарату. Мобильная загрузка открывается по адресу `/print/{deviceId}`.

## Архитектура

```text
iPhone → Next.js / Vercel → Neon (задания)
                       ↘ Private Vercel Blob (временный PDF)
Mac Agent → HTTPS polling → API → CUPS → Brother
```

Репозиторий — npm workspaces:

- `apps/web` — Next.js App Router, UI и API
- `apps/agent` — Node.js/TypeScript worker для macOS
- `packages/contracts` — общие схемы API и статусы

PDF загружается напрямую в приватный Blob по подписанному URL. Backend и Agent независимо проверяют magic bytes, размер и число страниц. Оригинальное имя файла остаётся только в `sessionStorage` браузера.

Один заказ поддерживает до 5 PDF. Пользователь может дозагрузить или удалить документ и выбрать страницы. Перед mock‑оплатой backend повторно проверяет каждый PDF и рассчитывает стоимость. После подтверждения оплаты выбранные страницы объединяются в один временный PDF и только тогда создаётся `print_job`. Поэтому Agent не видит неоплаченные заказы и печатает комплект документов атомарно.

`deviceId` — стабильный уникальный slug аппарата, например `printer-001`. Он входит в kiosk/mobile URL, каждое задание и каждый запрос Agent. Backend проверяет устройство повторно, поэтому Agent забирает только задания со своим `deviceId`.

## Требования

- Node.js 20 или новее
- `pdfinfo` на Mac (`brew install poppler`, если команды нет)
- Для `PRINT_MODE=real`: настроенный CUPS и команда `lp`
- Для production: Vercel, Neon Postgres и приватный Vercel Blob

## Локальный запуск

Установите зависимости:

```bash
npm install
```

Без `DATABASE_URL` web автоматически использует in-memory БД, а без Blob token — локальное временное хранилище `.data/`. Эти адаптеры предназначены только для разработки и тестов.

Запустите web:

```bash
npm run dev
```

Экран первого аппарата:

```text
http://localhost:3000/kiosk/printer-001
```

Локальный PIN по умолчанию — `123456`. Для своего значения скопируйте `apps/web/.env.example` в `apps/web/.env.local` и заполните секреты.

В другом терминале запустите Agent:

```bash
cp apps/agent/.env.example apps/agent/.env.local
npm run agent
```

Agent по умолчанию работает в `dry-run` и использует локальный development token. `.env.local` исключён из Git.

## Режимы печати

### Dry run

```dotenv
PRINT_MODE=dry-run
```

Agent скачивает и повторно проверяет PDF, проводит задание через все статусы и возвращает fake CUPS ID. `lp` не запускается.

### Реальная печать

Сначала проверьте очередь и capabilities установленного драйвера:

```bash
lpstat -p -d
lpoptions -p Brother_DCP_1600_series -l
```

Затем измените Agent env:

```dotenv
PRINT_MODE=real
PRINTER_NAME=Brother_DCP_1600_series
```

Agent проверяет очередь при запуске. Для команды `lp` он использует только A4 и односторонние параметры, которые реально объявлены `lpoptions`. Команда запускается без shell; пользовательские значения не становятся аргументами.

Чтобы добавить другой принтер, создайте новую запись устройства с новым `DEVICE_ID`, настройте отдельный Agent и откройте `/kiosk/{deviceId}` на его touchscreen. У каждого аппарата должны быть свои `DEVICE_ID`, `DEVICE_TOKEN` и CUPS queue. Перенастраивать уже работающие аппараты не нужно.

## Production database

Создайте Neon database, укажите `DATABASE_URL` и примените схему:

```bash
npm run db:migrate
```

Миграция применяет базовую схему и таблицы `orders` / `order_documents`. Имена пользовательских файлов в БД не сохраняются.

Создайте или обновите `printer-001` и получите новый токен:

```bash
DEVICE_ID=printer-001 PRINTER_NAME=Brother_DCP_1600_series npm run device:provision
```

Команда показывает plaintext token один раз. Сохраните его только в `apps/agent/.env.local` с правами `0600` и не добавляйте в Git.

Для второго аппарата выполните ту же команду с другим идентификатором и очередью:

```bash
DEVICE_ID=printer-002 PRINTER_NAME=Second_Printer_Queue npm run device:provision
```

## Переменные окружения

Web/Vercel:

- `DATABASE_URL` — Neon Postgres
- `BLOB_READ_WRITE_TOKEN` — приватный Vercel Blob
- `STORAGE_DRIVER=blob`
- `SESSION_SECRET` — подпись PIN‑сессий
- `REQUEST_HASH_SECRET` — HMAC технических rate-limit идентификаторов
- `KIOSK_PIN` — общий PIN пилотной точки, минимум 6 символов
- `CRON_SECRET` — защита endpoint очистки
- `NEXT_PUBLIC_TELEGRAM_BOT_URL` — необязательная HTTPS‑ссылка на бота, например `https://t.me/printerhub_bot`; kiosk добавляет `start={deviceId}` автоматически

Тариф MVP хранится централизованно в `packages/contracts`: 1 сомони за выбранную чёрно‑белую страницу. Финальная сумма всегда пересчитывается backend. Текущая оплата демонстрационная и не списывает деньги; до интеграции Alif/Humo нельзя считать её настоящим платёжным подтверждением.

Mac Agent:

- `API_BASE_URL` — production URL без завершающего `/`
- `DEVICE_ID`, `DEVICE_TOKEN` — идентификатор и отдельный секрет устройства
- `PRINTER_NAME` — точное имя CUPS queue
- `PRINT_MODE=dry-run|real`
- `POLL_INTERVAL_MS` — интервал polling, по умолчанию 2 секунды
- `PDFINFO_PATH` — необязательный абсолютный путь к `pdfinfo`

## Приватность и жизненный цикл

- PDF хранится под UUID без исходного filename
- После `completed`, `failed` или `expired` Blob удаляется сразу
- Неудачную очистку повторяют последующие запросы и ежедневный Vercel Cron
- Незавершённое задание истекает через 15 минут
- Метаданные без содержимого и filename удаляются через 7 дней
- Orphan uploads очищаются эксплуатационной проверкой Blob не позднее чем через 24 часа
- Содержимое PDF, токены, PIN, cookies и персональные данные не логируются

## Проверки

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Проверка production выполняется в `dry-run`: открыть URL с телефона, ввести PIN, загрузить тестовый PDF, дождаться четырёх статусов и убедиться, что Blob удалён. `real` smoke test выполняется только когда очередь Brother снова видна в `lpstat`.

## Vercel deployment

1. Создайте Vercel project с Root Directory `apps/web`
2. Подключите публичный GitHub repository для automatic deployments
3. Создайте Neon integration и приватный Blob store в европейском регионе
4. Добавьте перечисленные env variables для Production
5. Выполните миграцию и provisioning устройства
6. Разверните production и укажите URL/token в Mac Agent

`apps/web/vercel.json` запускает защищённую очистку раз в день. Backend никогда не вызывает `lp`: физическая печать существует только в локальном Agent.
