# 🏴‍☠️ Sailing Kingdom Bot — Наръчник / User Guide

---

## 🇧🇬 БЪЛГАРСКИ

### 🚀 Първи стъпки — Настройка на нов сървър

**1. Включи Developer Mode**
Settings → Advanced → Developer Mode → десен клик на канал/роля → **Copy ID**

**2. Пълна конфигурация (само Админ):**
```
!setconfig level_up_channel         <id>     ← канал за level-up съобщения
!setconfig log_channel              <id>     ← канал за XP логове
!setconfig stats_channel            <id>     ← канал за !top класация
!setconfig admin_log_channel        <id>     ← канал за модерация логове
!setconfig welcome_channel          <id>     ← канал за нови членове
!setconfig belly_rush_channel       <id>     ← канал за Belly Rush панела
!setconfig belly_rush_roles_channel <id>     ← канал за !want команди
!setconfig reminders_channel        <id>     ← канал за напомняния
!setconfig repair_channel           <id>     ← канал за repair-ship команди
!setconfig translator_channel       <id>     ← канал за AI превода
!setconfig bot_status_channel       <id>     ← канал за Online/Offline статус
!setconfig bot_info_channel         <id>     ← канал за мануала с командите
!setconfig unit_build_channel       <id>     ← канал за !hero команди
!setconfig bounty_channel           <id>     ← канал за !wanted плакати
!setconfig rules_channel            <id>     ← канал с правилата (за welcome съобщение)
!setconfig general_channel          <id>     ← general chat (за welcome съобщение)
!setconfig rookies_role             <id>     ← роля за нови членове (автоматично се създава)
!setconfig player_role              <id>     ← роля след верификация (автоматично се създава)
!setconfig mod_role                 <id>     ← роля за модератори
!setconfig restricted_channel       <id>     ← канал с ограничения за менции
!setconfig protected_users     <id1,id2>     ← защитени потребители (ID-та с ,)
!setconfig leveling_enabled         false    ← спира XP системата за ТОЗИ сървър (по подразбиране: включена)
!setconfig bday_channel             <id>     ← канал за birthday (опционален)
!setconfig bday_user                <id>     ← user ID за birthday (опционален)
```

**3. Провери какво липсва:**
```
!checkconfig   ← показва конфигурирано ✅, липсващо ❌ и опционално ⚪
!getconfig     ← показва всички текущи стойности
```

> 💡 **Rookie** и **Player** ролите се създават автоматично ако не ги зададеш!

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
!mania-addguild ts  @ThousandSunny  #mania-ts   #general   ← Guild 1
!mania-addguild ms  @MarineShip     #mania-ms   #general   ← Guild 2
!mania-addguild gs  @GoatShip       #mania-gs   #general   ← Guild 3
```

**Управление:**
```
!mania-guilds              ← показва всички гилдии с каналите им
!mania-removeguild ts      ← маха гилдия
```

**Пускане на план:**
```
mania-plan ts          ← план за ts гилдия
mania-plan all         ← план за всички гилдии наведнъж
```
Ботът публикува плана с ✅ ❌ ⏳ в `#mania-ts` и изпраща известие с линк в `#general`.

**Проверка кой е гласувал:**
```
mania-list ts          ← показва потвърдени, отказали, пингва липсващите
```

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
!ship-add Sunny ☀️ @mugi-role      ← добавя кораб (ime, emodzi, roq)
!ship-add Marine ⚓ @mari-role      ← добавя втори кораб
!ship-add Goat 🐐 @goat-role       ← добавя трети кораб

!ship-list                          ← показва всички кораби и екипажи
!ship-remove Sunny                  ← маха кораб (и repair съобщенията му)
```

**Капитани (никога не се ресетват):**
```
!ship-captain @Luffy Sunny         ← задава капитан на кораб
!ship-uncaptain @Luffy             ← маха капитан
```

**Постоянен екипаж** (пише се в `belly_rush_roles_channel`):
```
!want Sunny                        ← постоянно място, не се ресетва при Reset
```

**Ръчен старт на панела:**
```
!setup                             ← изпраща панела веднага (иначе авт. Вт/Пт 10:00)
```

---

### ⚙️ Repair Ship

Работи в конфигурирания `repair_channel`. Само `repair @ship` е разрешено — всичко друго се трие.

```
!ship-addrepair Sunny {user} the sails are on fire!! 🔥   ← добавя съобщение
!ship-addrepair Sunny {user} Who broke the mast?! 💀      ← добавя второ
!ship-repairs Sunny                                        ← показва всички с ID-та
!ship-removerepair 1                                       ← маха по ID

repair @Sunny                                              ← използване (от всеки)
```
`{user}` се заменя с @mention-а на кораба автоматично.

---

### 🎖️ Нива и XP (Per-сървър)

XP и нивата са **отделни за всеки сървър**.

```
!rank       ← твоето ниво и прогрес бар (изчезва след 60 сек)
!top        ← Топ 10 най-активни на ТОЗИ сървър (само Админ)
!sync       ← ръчно запазване в базата (само Админ)
```

**Включване/изключване на XP система:**
```
!setconfig leveling_enabled false   ← спира XP за ТОЗИ сървър
!setconfig leveling_enabled true    ← пуска XP отново
```
Пиши → печелиш XP. Снимки = бонус XP. Спам = намален XP + предупреждения (3 → мут 10 мин).

---

### 💰 Bounty (Per-сървър)

Bounty-то е **отделно за всеки сървър**.

```
!wanted              ← твоят Wanted плакат (в bounty_channel)
!wanted @user        ← Wanted плакат на друг потребител

!setbounty @user 500000000   ← задава 500M bounty и дава роля (Мод/Админ)
!resetbounty @user           ← нулира до ฿0 (Мод/Админ)
```
Ролите (50M+ → 900M+) се сменят автоматично.

---

### ⚔️ Герои (само в unit_build_channel)

```
!hero-list              ← всички налични герои
!hero mihawk            ← пълен билд на Mihawk
!hero luffy-cultiv1     ← Culti V1 вариант
```

---

### ⏰ Напомняния

```
!remind 0 21 * * * Raid!   ← всеки ден в 21:00 (в reminders_channel)
!reminders                  ← твоите напомняния
!allreminders               ← всички напомняния (статични + твоите)
!delete <id>                ← изтрива напомняне по ID
!cron                       ← наръчник за cron формата
```

| Cron пример | Кога |
|---|---|
| `0 12 * * *` | Всеки ден в 12:00 |
| `0 20 * * 1,3,5` | Пон, Сря, Пет в 20:00 |
| `30 19 * * 0` | Всяка неделя в 19:30 |
| `*/30 * * * *` | На всеки 30 минути |

---

### 🛂 Верификация на нови членове

1. Нов потребител влиза → автоматично получава **Rookie** роля (създава се ако няма)
2. Вижда Welcome съобщение с бутон **"Nickname"**
3. Въвежда nickname (трябва да включва гилдиен таг)
4. Получава **Player** роля и достъп до сървъра (създава се ако няма)

---

### 🌐 AI Преводач (в translator_channel)

- Пишеш на **всякакъв език** → превод на английски
- Отговаряш на чужденец на английски → превод обратно
- Помни езика 5 часа | Cooldown: 5 секунди

---

### 🧹 Модерация

```
!clear 50                  ← трие последните 50 съобщения
!say Ahoy!                 ← ботът изпраща (командата се трие)
!sendto #канал Ahoy!       ← изпраща в конкретен канал

!addrole @user Роля        ← дава роля
!removerole @user Роля     ← маха роля
!addroleallts @роля        ← дава роля на всички с тага ᐪˢ☠️
!addroleallgm @роля        ← дава роля на всички с тага ᴳᴹ☠️
```

---

### 💬 Автоматични реакции

```
good night / nighty night  ← лека нощ GIF
good morning / добро утро  ← добро утро GIF
```

---
---

## 🇬🇧 ENGLISH

### 🚀 Getting Started — New Server Setup

**1. Enable Developer Mode**
Settings → Advanced → Developer Mode → right-click channel/role → **Copy ID**

**2. Full configuration (Admin only):**
```
!setconfig level_up_channel         <id>     ← channel for level-up messages
!setconfig log_channel              <id>     ← channel for XP logs
!setconfig stats_channel            <id>     ← channel for !top leaderboard
!setconfig admin_log_channel        <id>     ← channel for moderation logs
!setconfig welcome_channel          <id>     ← channel for new members
!setconfig belly_rush_channel       <id>     ← channel for the Belly Rush panel
!setconfig belly_rush_roles_channel <id>     ← channel for !want commands
!setconfig reminders_channel        <id>     ← channel for reminders
!setconfig repair_channel           <id>     ← channel for repair-ship commands
!setconfig translator_channel       <id>     ← channel for AI translator
!setconfig bot_status_channel       <id>     ← channel for Online/Offline status
!setconfig bot_info_channel         <id>     ← channel for the bot manual
!setconfig unit_build_channel       <id>     ← channel for !hero commands
!setconfig bounty_channel           <id>     ← channel for !wanted posters
!setconfig rules_channel            <id>     ← rules channel (for welcome message)
!setconfig general_channel          <id>     ← general chat (for welcome message)
!setconfig rookies_role             <id>     ← role for new members (auto-created if not set)
!setconfig player_role              <id>     ← role after verification (auto-created if not set)
!setconfig mod_role                 <id>     ← moderator role
!setconfig restricted_channel       <id>     ← channel with mention restrictions
!setconfig protected_users     <id1,id2>     ← protected users (IDs separated by ,)
!setconfig leveling_enabled         false    ← disable XP system for THIS server (default: enabled)
!setconfig bday_channel             <id>     ← channel for birthday messages (optional)
!setconfig bday_user                <id>     ← user ID for birthday (optional)
```

**3. Check what's missing:**
```
!checkconfig   ← shows configured ✅, missing ❌ and optional ⚪
!getconfig     ← shows all current values
```

> 💡 **Rookie** and **Player** roles are created automatically if not configured!

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
!mania-addguild ts  @ThousandSunny  #mania-ts   #general   ← Guild 1
!mania-addguild ms  @MarineShip     #mania-ms   #general   ← Guild 2
!mania-addguild gs  @GoatShip       #mania-gs   #general   ← Guild 3
```

**Management:**
```
!mania-guilds              ← list all guilds with their channels
!mania-removeguild ts      ← remove a guild
```

**Start a plan:**
```
mania-plan ts          ← plan for ts guild
mania-plan all         ← plan for ALL guilds at once
```
Bot posts the plan with ✅ ❌ ⏳ in `#mania-ts` and sends a notification with a link to `#general`.

**Check who voted:**
```
mania-list ts          ← shows confirmed, declined and pings missing members
```

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

!ship-list                          ← view all ships and crews
!ship-remove Sunny                  ← remove ship (also removes its repair messages)
```

**Captains (never get reset):**
```
!ship-captain @Luffy Sunny         ← set a permanent captain
!ship-uncaptain @Luffy             ← remove captain status
```

**Permanent crew** (type in `belly_rush_roles_channel`):
```
!want Sunny                        ← permanent spot, never removed by Reset
```

**Manually trigger the panel:**
```
!setup                             ← send the panel now (otherwise auto Tue/Fri 10:00)
```

---

### ⚙️ Repair Ship

Works in the configured `repair_channel`. Only `repair @ship` is allowed — everything else gets deleted.

```
!ship-addrepair Sunny {user} the sails are on fire!! 🔥   ← add a message
!ship-addrepair Sunny {user} Who broke the mast?! 💀      ← add another
!ship-repairs Sunny                                        ← list all with IDs
!ship-removerepair 1                                       ← remove by ID

repair @Sunny                                              ← usage (any member)
```
`{user}` is automatically replaced with the ship's @mention.

---

### 🎖️ Leveling (Per-server)

XP and levels are **separate per server**.

```
!rank       ← your level and progress bar (auto-deletes after 60s)
!top        ← Top 10 most active on THIS server (Admin only)
!sync       ← manually flush XP to database (Admin only)
```

**Enable/disable XP system:**
```
!setconfig leveling_enabled false   ← disable XP for THIS server
!setconfig leveling_enabled true    ← enable XP again
```
Chat → earn XP. Images = bonus XP. Spamming = reduced XP + warnings (3 → 10 min mute).

---

### 💰 Bounty (Per-server)

Bounty is **separate per server**.

```
!wanted              ← your Wanted poster (posted in bounty_channel)
!wanted @user        ← someone else's Wanted poster

!setbounty @user 500000000   ← set a 500M bounty and assign role (Mod/Admin)
!resetbounty @user           ← reset to ฿0 (Mod/Admin)
```
Bounty roles (50M+ → 900M+) swap automatically.

---

### ⚔️ Heroes (only in unit_build_channel)

```
!hero-list              ← list all available heroes
!hero mihawk            ← full Mihawk build guide
!hero luffy-cultiv1     ← Luffy Culti V1 variant
```

---

### ⏰ Reminders

```
!remind 0 21 * * * Raid!   ← every day at 21:00 (posts in reminders_channel)
!reminders                  ← your active reminders
!allreminders               ← all reminders (static + yours)
!delete <id>                ← delete a reminder by ID
!cron                       ← cron format guide
```

| Cron example | When it runs |
|---|---|
| `0 12 * * *` | Every day at 12:00 |
| `0 20 * * 1,3,5` | Mon, Wed, Fri at 20:00 |
| `30 19 * * 0` | Every Sunday at 19:30 |
| `*/30 * * * *` | Every 30 minutes |

---

### 🛂 New Member Verification

1. New user joins → automatically gets **Rookie** role (auto-created if missing)
2. Sees a Welcome message with a **"Nickname"** button
3. Types nickname (must include guild tag)
4. Gets **Player** role and full server access (auto-created if missing)

---

### 🌐 AI Translator (in translator_channel)

- Write in **any language** → automatically translated to English
- Reply to a non-English user in English → translates back to their language
- Remembers each user's language for 5 hours | Cooldown: 5 seconds

---

### 🧹 Moderation

```
!clear 50                  ← delete last 50 messages
!say Ahoy!                 ← bot sends the message (your command is deleted)
!sendto #channel Ahoy!     ← send to a specific channel

!addrole @user Role        ← give a role
!removerole @user Role     ← remove a role
!addroleallts @role        ← give role to everyone with ᐪˢ☠️ tag
!addroleallgm @role        ← give role to everyone with ᴳᴹ☠️ tag
```

---

### 💬 Automatic Reactions

```
good night / nighty night  ← bot replies with a good night GIF
good morning / добро утро  ← bot replies with a random good morning GIF
```

---

> 📌 **Важно / Important:**
> Всичко е **per-сървър** и напълно независимо.
> Everything is **per-server** and fully independent.
