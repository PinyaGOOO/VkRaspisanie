# PRK VK Bot

Версия бота расписания для ВКонтакте.  
Оригинальный Telegram-бот переписан на VK Long Poll API без сторонних VK-библиотек.

---

## Требования

- Node.js 18+
- npm
- python3 + pip (для xlsx2html)
- Сообщество ВКонтакте с включёнными сообщениями

---

## Установка на Arch Linux

```bash
# 1. Распакуй бота
cd /opt
unzip vkbot.zip -d vkbot
cd vkbot

# 2. Установи Node.js и npm
sudo pacman -S nodejs npm

# 3. Установи зависимости
npm install

# 4. Установи Python-зависимости
pip install -r modules/python/requirements.txt --break-system-packages
```

---

## Настройка

Отредактируй cfg.json:

```json
{
  "vk": {
    "token":   "vk1.a.ТВОЙ_ТОКЕН_СООБЩЕСТВА",
    "groupId": 123456789,
    "admins": {
      "ВАШ_VK_ID": true
    }
  }
}
```

### Где взять токен и groupId

1. Зайди в управление своим сообществом ВКонтакте
2. Работа с API → Создать ключ. Разрешения: Управление, Сообщения
3. Настройки → Работа с API → Long Poll API → Включи, выбери версию 5.199
   Включи события: Сообщения (входящие), Событие кнопки
4. groupId — это число из URL сообщества (vk.com/club123456789)

### Как узнать свой VK ID

Зайди на vk.com/id0 — тебя перенаправит на твою страницу с настоящим ID в URL.

---

## Запуск

```bash
node index.js
```

### Автозапуск через systemd

Создай файл /etc/systemd/system/vkbot.service:

```ini
[Unit]
Description=PRK VK Bot
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=/opt/vkbot
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vkbot
sudo systemctl status vkbot
```

---

## Отличия от Telegram-версии

| Telegram             | VK                                                        |
|----------------------|-----------------------------------------------------------|
| grammy               | Встроенный VK Long Poll (axios, form-data)               |
| Inline keyboard      | Inline keyboard (тип callback)                           |
| replyWithMediaGroup  | photos.getMessagesUploadServer + messages.send           |
| callback_query       | message_event                                            |
| Команды (/start)     | Пользователь пишет «Начать»                              |

---

## Структура проекта

```
vkbot/
├── index.js                    <- Точка входа
├── cfg.json                    <- Конфиг (токен, admins)
├── vk/
│   ├── main.js                 <- Логика бота
│   ├── vkapi.js                <- VK API + Long Poll
│   ├── requestqueue.js         <- Очередь задач
│   ├── commands/               <- Команды (start, groups, peoples, rooms...)
│   ├── commands_func/          <- Callback-функции
│   ├── helpers/buttonFormater.js
│   └── modules/updatedelivery.js
├── database/db.js              <- SQLite (без изменений)
├── downloader/                 <- Скачивание расписания (без изменений)
├── modules/                    <- Excel парсинг/генерация (без изменений)
└── helpers/                    <- Утилиты (без изменений)
```
