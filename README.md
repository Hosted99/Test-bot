# 🏴‍☠️ Sailing Kingdom Bot — Наръчник / User Guide

---

## 🇧🇬 БЪЛГАРСКИ

### 🚀 Първи стъпки — Настройка на нов сървър

**1. Включи Developer Mode**
Settings → Advanced → Developer Mode → десен клик на канал/роля → **Copy ID**

**2. Основна конфигурация (само Админ):**
```
!setconfig level_up_channel   <id>   ← канал за level-up съобщения
!setconfig log_channel        <id>   ← канал за XP логове
!setconfig stats_channel      <id>   ← канал за !top класация
!setconfig admin_log_channel  <id>   ← канал за модерация логове
!setconfig welcome_channel    <id>   ← канал за нови членове
!setconfig belly_rush_channel <id>   ← канал за Belly Rush панела
!setconfig reminders_channel  <id>   ← канал за напомняния
!setconfig translator_channel <id>   ← канал за AI превода
!setconfig bot_status_channel <id>   ← канал за статус на бота
!setconfig rookies_role       <id>   ← роля за нови членове
!setconfig player_role        <id>   ← роля след верификация
```
Провери с `!getconfig`.

---

### ⚔️ Mania — Настройка и употреба

**Добавяне на гилдия:**
```
!mania-addguild ts @ThousandSunny #mania-strategy #general
                ↑        ↑               ↑             ↑
               ключ    ролята      канал за         канал където
              (ти       на         гласуване        всички виждат
             избираш)  гилдията                     известието
```

**Колкото гилдии искаш:**
```
!mania-addguild ts  @ThousandSunny  #mania-ts   #general      ← Guild 1
!mania-addguild ms  @MarineShip     #mania-ms   #general      ← Guild 2
!mania-addguild gs  @GoatShip       #mania-gs   #announcements ← Guild 3
```

**Управление:**
```
!mania-guilds              ← показва всички гилдии с каналите им
!mania-removeguild ts      ← маха гилдия
```

**Пускане на план:**
```
mania-plan ts          ← план за Thousand Sunny
mania-plan ms          ← план за Marine Ship
mania-plan all         ← план за всички гилдии наведнъж
```
Ботът публикува плана с ✅ ❌ ⏳ в `#mania-strategy` и изпраща известие с линк в `#general`.

**Проверка кой е гласувал:**
```
mania-list ts          ← показва потвърдени, отказали, пингва липсващите
```
Известието за липсващите се изпраща и в `#general`.

**DM на незагласувалите:**
```
mania-dm ts            ← изпраща лично съобщение на всички незагласували
```

**Стратегия:**
```
mania-strategy
Kronos - @Luffy @Zoro      ← Бос - Играчи
Hydra - @Nami @Sanji       ← всеки ред = един бос
Cerberus - @Robin          ← разделяй с тире -
```

---

### 🚢 Belly Rush — Настройка на кораби

```
!ship-add Sunny ☀️ @mugi-role      ← добавя кораб (име, емоджи, роля)
!ship-add Marine ⚓ @mari-role      ← добавя втори кораб
!ship-add Goat 🐐 @goat-role       ← добавя трети кораб

!ship-list                          ← показва всички кораби и екипажи
!ship-remove Sunny                  ← маха кораб
```

**Капитани (никога не се ресетват):**
```
!ship-captain @Luffy Sunny         ← задава капитан на кораб
!ship-uncaptain @Luffy             ← маха капитан
```

**Постоянен екипаж (потребителят сам заявява):**
```
!want Sunny                        ← заявява постоянно място, не се ресетва при Reset
```

**Ръчен старт на панела:**
```
!setup                             ← изпраща панела веднага (иначе автоматично Вт/Пт 10:00)
```

---

### 🎖️ Нива и XP

```
!rank       ← твоето ниво и прогрес бар (изчезва след 60 сек)
!top        ← Топ 10 най-активни потребители (само Админ)
!sync       ← ръчно запазване на XP в базата (само Админ)
```
Пиши в сървъра → печелиш XP автоматично.
Снимки/файлове = бонус XP | Спам = намален XP + предупреждения (3 → мут 10 мин)

---

### 💰 Bounty

```
!wanted              ← твоят Wanted плакат
!wanted @user        ← Wanted плакат на друг потребител

!setbounty @user 500000000   ← задава 500M bounty и дава роля (Мод/Админ)
!resetbounty @user           ← нулира bounty до ฿0 (Мод/Админ)
```
Ролите (50M+ → 900M+) се сменят автоматично.

---

### ⚔️ Герои (само в #unit-build)

```
!hero-list              ← списък с всички налични герои
!hero mihawk            ← пълен билд на Mihawk
!hero luffy-cultiv1     ← Culti V1 вариант на Luffy
```

---

### ⏰ Напомняния

```
!remind 0 21 * * * Raid!   ← създава напомняне (всеки ден в 21:00)
!reminders                  ← показва твоите напомняния
!allreminders               ← показва всички напомняния (статични + твоите)
!delete <id>                ← изтрива напомняне по ID
!cron                       ← наръчник за cron формата с примери
```

| Cron пример | Кога се изпълнява |
|---|---|
| `0 12 * * *` | Всеки ден в 12:00 |
| `0 20 * * 1,3,5` | Пон, Сря, Пет в 20:00 |
| `30 19 * * 0` | Всяка неделя в 19:30 |
| `*/30 * * * *` | На всеки 30 минути |

---

### 🛂 Верификация на нови членове

1. Нов потребител влиза → автоматично получава **Rookie** роля
2. Вижда Welcome съобщение с бутон **"Nickname"**
3. Въвежда nickname (трябва да включва гилдиен таг)
4. Получава **Player** роля и достъп до сървъра

---

### 🌐 AI Преводач (в #ai-translator)

- Пишеш на **всякакъв език** → превод на английски автоматично
- Отговаряш на чужденец на английски → превод обратно на неговия език
- Помни езика на потребителя 5 часа | Cooldown: 5 секунди

---

### 🧹 Модерация

```
!clear 50                  ← трие последните 50 съобщения
!say Ahoy!                 ← ботът изпраща съобщението (твоята команда се трие)
!sendto #канал Ahoy!       ← изпраща съобщение в конкретен канал

!addrole @user Роля        ← дава роля на потребител
!removerole @user Роля     ← маха роля от потребител
!addroleallts @роля        ← дава роля на всички с тага ᐪˢ☠️
!addroleallgm @роля        ← дава роля на всички с тага ᴳᴹ☠️
```

---

### 💬 Автоматични реакции

```
good night / nighty night  ← ботът отговаря с лека нощ GIF
good morning / добро утро  ← ботът отговаря с добро утро GIF
```

---
---

## 🇬🇧 ENGLISH

### 🚀 Getting Started — New Server Setup

**1. Enable Developer Mode**
Settings → Advanced → Developer Mode → right-click channel/role → **Copy ID**

**2. Basic configuration (Admin only):**
```
!setconfig level_up_channel   <id>   ← channel for level-up messages
!setconfig log_channel        <id>   ← channel for XP logs
!setconfig stats_channel      <id>   ← channel for !top leaderboard
!setconfig admin_log_channel  <id>   ← channel for moderation logs
!setconfig welcome_channel    <id>   ← channel for new members
!setconfig belly_rush_channel <id>   ← channel for the Belly Rush panel
!setconfig reminders_channel  <id>   ← channel for reminders
!setconfig translator_channel <id>   ← channel for AI translator
!setconfig bot_status_channel <id>   ← channel for bot status/manual
!setconfig rookies_role       <id>   ← role for new members
!setconfig player_role        <id>   ← role after verification
```
Verify with `!getconfig`.

---

### ⚔️ Mania — Setup & Usage

**Add a guild:**
```
!mania-addguild ts @ThousandSunny #mania-strategy #general
                ↑        ↑               ↑              ↑
               key     guild's       channel where   channel where
            (you       role          voting happens  everyone sees
            choose)                                  the notification
```

**Add as many guilds as you want:**
```
!mania-addguild ts  @ThousandSunny  #mania-ts   #general       ← Guild 1
!mania-addguild ms  @MarineShip     #mania-ms   #general       ← Guild 2
!mania-addguild gs  @GoatShip       #mania-gs   #announcements ← Guild 3
```

**Management:**
```
!mania-guilds              ← list all guilds with their channels
!mania-removeguild ts      ← remove a guild
```

**Start a plan:**
```
mania-plan ts          ← plan for Thousand Sunny
mania-plan ms          ← plan for Marine Ship
mania-plan all         ← plan for ALL guilds at once
```
Bot posts the plan with ✅ ❌ ⏳ in `#mania-strategy` and sends a notification with a link to `#general`.

**Check who voted:**
```
mania-list ts          ← shows confirmed, declined and pings missing members
```
The missing members alert is also sent to `#general`.

**DM non-voters:**
```
mania-dm ts            ← sends a DM to everyone who hasn't voted yet
```

**Post the strategy:**
```
mania-strategy
Kronos - @Luffy @Zoro      ← Boss - Players
Hydra - @Nami @Sanji       ← each line = one boss
Cerberus - @Robin          ← separate with dash -
```

---

### 🚢 Belly Rush — Ship Setup

```
!ship-add Sunny ☀️ @mugi-role      ← add a ship (name, emoji, role)
!ship-add Marine ⚓ @mari-role      ← add second ship
!ship-add Goat 🐐 @goat-role       ← add third ship

!ship-list                          ← view all ships and current crews
!ship-remove Sunny                  ← remove a ship
```

**Captains (never get reset):**
```
!ship-captain @Luffy Sunny         ← set a permanent captain
!ship-uncaptain @Luffy             ← remove captain status
```

**Permanent crew (users request it themselves):**
```
!want Sunny                        ← permanent spot, never removed by Reset
```

**Manually trigger the panel:**
```
!setup                             ← send the panel now (otherwise auto Tue/Fri 10:00)
```

---

### 🎖️ Leveling

```
!rank       ← your level and progress bar (auto-deletes after 60s)
!top        ← Top 10 most active users (Admin only)
!sync       ← manually flush XP to database (Admin only)
```
Chat in the server → earn XP automatically.
Images/files = bonus XP | Spamming = reduced XP + warnings (3 → 10 min mute)

---

### 💰 Bounty

```
!wanted              ← your own Wanted poster
!wanted @user        ← someone else's Wanted poster

!setbounty @user 500000000   ← set a 500M bounty and assign role (Mod/Admin)
!resetbounty @user           ← reset bounty to ฿0 (Mod/Admin)
```
Bounty roles (50M+ → 900M+) swap automatically.

---

### ⚔️ Heroes (only in #unit-build)

```
!hero-list              ← list all available heroes
!hero mihawk            ← full Mihawk build guide
!hero luffy-cultiv1     ← Luffy Culti V1 variant
```

---

### ⏰ Reminders

```
!remind 0 21 * * * Raid!   ← create a reminder (every day at 21:00)
!reminders                  ← show your active reminders
!allreminders               ← show all reminders (static + yours)
!delete <id>                ← delete a reminder by ID
!cron                       ← cron format guide with examples
```

| Cron example | When it runs |
|---|---|
| `0 12 * * *` | Every day at 12:00 |
| `0 20 * * 1,3,5` | Mon, Wed, Fri at 20:00 |
| `30 19 * * 0` | Every Sunday at 19:30 |
| `*/30 * * * *` | Every 30 minutes |

---

### 🛂 New Member Verification

1. New user joins → automatically gets **Rookie** role
2. Sees a Welcome message with a **"Nickname"** button
3. Types their nickname (must include guild tag)
4. Gets **Player** role and full server access

---

### 🌐 AI Translator (in #ai-translator)

- Write in **any language** → automatically translated to English
- Reply to a non-English user in English → translates back to their language
- Remembers each user's language for 5 hours | Cooldown: 5 seconds

---

### 🧹 Moderation

```
!clear 50                  ← delete last 50 messages
!say Ahoy!                 ← bot sends the message (your command is deleted)
!sendto #channel Ahoy!     ← send a message to a specific channel

!addrole @user Role        ← give a role to a user
!removerole @user Role     ← remove a role from a user
!addroleallts @role        ← give role to everyone with the ᐪˢ☠️ tag
!addroleallgm @role        ← give role to everyone with the ᴳᴹ☠️ tag
```

---

### 💬 Automatic Reactions

```
good night / nighty night  ← bot replies with a good night GIF
good morning / добро утро  ← bot replies with a random good morning GIF
```

---

> 📌 Every server is fully independent — configs, guilds, ships and captains are all stored separately per server. No code changes needed.
