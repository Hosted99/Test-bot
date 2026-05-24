# 🏴‍☠️ Sailing Kingdom Bot — Наръчник / User Guide

---

## 🇧🇬 БЪЛГАРСКИ

### 🚀 Първи стъпки — Настройка на нов сървър

**1. Включи Developer Mode**
Settings → Advanced → Developer Mode → десен клик на канал/роля → **Copy ID**

**2. Пълна конфигурация (само Админ):**
```
!setconfig level_up_channel         <id>  ← канал за level-up съобщения
!setconfig log_channel              <id>  ← канал за db логове
!setconfig stats_channel            <id>  ← канал за !top класация
!setconfig admin_log_channel        <id>  ← канал за модерация логове
!setconfig welcome_channel          <id>  ← канал за нови членове
!setconfig belly_rush_channel       <id>  ← канал за Belly Rush панела
!setconfig belly_rush_roles_channel <id>  ← канал за !want команди
!setconfig reminders_channel        <id>  ← канал за напомняния
!setconfig repair_channel           <id>  ← канал за repair-ship команди
!setconfig translator_channel       <id>  ← канал за двупосочен AI превод
!setconfig bot_status_channel       <id>  ← канал за Online/Offline статус
!setconfig bot_info_channel         <id>  ← канал за мануала с командите
!setconfig unit_build_channel       <id>  ← канал за !hero команди
!setconfig bounty_channel           <id>  ← канал за !wanted плакати
!setconfig rules_channel            <id>  ← канал с правилата (за welcome)
!setconfig general_channel          <id>  ← general chat (за welcome)
!setconfig rookies_role             <id>  ← роля за нови членове (авт. се създава)
!setconfig player_role              <id>  ← роля след верификация (авт. се създава)
!setconfig mod_role                 <id>  ← роля за модератори
!setconfig restricted_channel       <id>  ← канал с ограничения за менции
!setconfig protected_users     <id1,id2>  ← защитени потребители (ID-та с ,)
!setconfig bday_channel             <id>  ← канал за birthday (опционален)
!setconfig bday_user                <id>  ← user ID за birthday (опционален)
```

**3. Провери какво липсва:**
```
!checkconfig   ← конфигурирано ✅, липсващо ❌, статус на системите 🟢/🔴
!getconfig     ← всички текущи стойности
```

> 💡 **Rookie** и **Player** ролите се създават автоматично!

---

### 🎖️ Leveling & XP — Активиране с парола

Изключен по подразбиране. Паролата се дава само от собственика на бота.

```
!leveling-enable <парола>   ← активира XP за ТОЗИ сървър
!leveling-disable           ← спира (само Админ)

!rank       ← ниво и прогрес бар (изчезва след 60 сек)
!top        ← Топ 10 най-активни (само Админ)
!sync       ← ръчно запазване (само Админ)
```

---

### 🌐 Преводни системи — Активиране с парола

#### 1. Флаг реакция превод
Реагираш с флаг → превод в канала, изчезва след 2 мин. Всеки получава свой превод.
```
!translate-enable <парола>   ← активира за ТОЗИ сървър
!translate-disable           ← спира (само Админ)
```
Поддържа 50+ езика. Работи в **всички канали**.

#### 2. Авто-превод на не-английски съобщения
Не-английско съобщение → автоматичен превод на английски под него. **Не изчезва.**
```
!auto-translate-enable <парола>   ← активира за ТОЗИ сървър
!auto-translate-disable           ← спира (само Админ)
```
Работи в **всички канали** освен `#ai-translator` и admin канали.
Игнорира: команди с `!`, много кратки съобщения, предимно латински текст.

#### 3. AI Канален преводач (#translator_channel)
За разговор между хора на различни езици.
- Пишеш на **всякакъв език** → превод на английски
- Отговаряш на английски → превод обратно на езика му
- Помни езика 5 часа | Cooldown: 5 сек

---

### ⚔️ Mania — Настройка и употреба

```
!mania-addguild ts @ThousandSunny #mania-strategy #general
!mania-guilds              ← показва всички гилдии
!mania-removeguild ts      ← маха гилдия

mania-plan ts / all        ← стартира план с ✅ ❌ ⏳
mania-list ts              ← показва гласувалите, пингва липсващите
mania-dm ts                ← DM на незагласувалите

mania-strategy
Kronos - @Luffy @Zoro      ← всеки ред = един бос
Hydra - @Nami @Sanji
```

---

### 🚢 Belly Rush — Кораби и екипаж

```
!ship-add Sunny ☀️ @mugi-role      ← добавя кораб
!ship-remove Sunny                  ← маха кораб
!ship-list                          ← всички кораби и екипажи
!ship-captain @Luffy Sunny         ← постоянен капитан (не се ресетва)
!ship-uncaptain @Luffy             ← маха капитан
!ship-listpermanent                 ← показва всички постоянни членове
!ship-removepermanent @user        ← маха от постоянен екипаж
!want Sunny                        ← заявява постоянно място (в belly_rush_roles_channel)
!setup                             ← изпраща панела веднага (авт. Вт/Пт 10:00)
```

---

### ⚙️ Repair Ship

Само в `repair_channel`. Само `repair @ship` е разрешено.
```
!ship-addrepair Sunny {user} sails on fire!! 🔥   ← добавя съобщение
!ship-repairs Sunny                                ← показва всички с ID-та
!ship-removerepair 1                               ← маха по ID
repair @Sunny                                      ← използване (от всеки)
```

---

### 💰 Bounty (Per-сървър)

```
!wanted / !wanted @user              ← Wanted плакат
!setbounty @user 500000000           ← задава bounty (Мод/Админ)
!resetbounty @user                   ← нулира до ฿0 (Мод/Админ)
```

---

### ⚔️ Герои (само в unit_build_channel)

```
!hero-list              ← всички герои
!hero mihawk            ← пълен билд
!hero luffy-cultiv1     ← Culti V1 вариант
```

---

### ⏰ Напомняния

```
!remind 0 21 * * * Raid!   ← всеки ден в 21:00
!reminders                  ← твоите напомняния
!allreminders               ← всички напомняния
!delete <id>                ← изтрива по ID
!cron                       ← наръчник за cron формата
```

---

### 🛂 Верификация

1. Нов потребител → **Rookie** роля (автоматично)
2. Натиска **"Nickname"** → въвежда nickname с гилдиен таг
3. Получава **Player** роля и достъп

---

### 🧹 Модерация

```
!clear 50                  ← трие последните 50 съобщения
!say Ahoy!                 ← ботът изпраща (командата се трие)
!sendto #канал Ahoy!       ← изпраща в конкретен канал
!addrole @user Роля        ← дава роля
!removerole @user Роля     ← маха роля
!addroleallts @роля        ← дава роля на всички с ᐪˢ☠️
!addroleallgm @роля        ← дава роля на всички с ᴳᴹ☠️
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
!setconfig level_up_channel         <id>  ← channel for level-up messages
!setconfig log_channel              <id>  ← channel for XP logs
!setconfig stats_channel            <id>  ← channel for !top leaderboard
!setconfig admin_log_channel        <id>  ← channel for moderation logs
!setconfig welcome_channel          <id>  ← channel for new members
!setconfig belly_rush_channel       <id>  ← channel for the Belly Rush panel
!setconfig belly_rush_roles_channel <id>  ← channel for !want commands
!setconfig reminders_channel        <id>  ← channel for reminders
!setconfig repair_channel           <id>  ← channel for repair-ship commands
!setconfig translator_channel       <id>  ← channel for two-way AI translator
!setconfig bot_status_channel       <id>  ← channel for Online/Offline status
!setconfig bot_info_channel         <id>  ← channel for the bot manual
!setconfig unit_build_channel       <id>  ← channel for !hero commands
!setconfig bounty_channel           <id>  ← channel for !wanted posters
!setconfig rules_channel            <id>  ← rules channel (for welcome message)
!setconfig general_channel          <id>  ← general chat (for welcome message)
!setconfig rookies_role             <id>  ← role for new members (auto-created)
!setconfig player_role              <id>  ← role after verification (auto-created)
!setconfig mod_role                 <id>  ← moderator role
!setconfig restricted_channel       <id>  ← channel with mention restrictions
!setconfig protected_users     <id1,id2>  ← protected users (IDs separated by ,)
!setconfig bday_channel             <id>  ← birthday channel (optional)
!setconfig bday_user                <id>  ← birthday user ID (optional)
```

**3. Check what's missing:**
```
!checkconfig   ← configured ✅, missing ❌, system status 🟢/🔴
!getconfig     ← all current values
```

> 💡 **Rookie** and **Player** roles are created automatically!

---

### 🎖️ Leveling & XP — Password Activation

Disabled by default. Password provided only by the bot owner.

```
!leveling-enable <password>   ← activate XP for THIS server
!leveling-disable             ← disable (Admin only)

!rank       ← level and progress bar (auto-deletes after 60s)
!top        ← Top 10 most active (Admin only)
!sync       ← manually flush XP to database (Admin only)
```

---

### 🌐 Translation Systems — Password Activation

#### 1. Flag Reaction Translator
React with a flag → translation in channel, disappears after 2 min. Each user gets their own translation.
```
!translate-enable <password>   ← activate for THIS server
!translate-disable             ← disable (Admin only)
```
Supports 50+ languages. Works in **all channels**.

#### 2. Auto-Translate Non-English Messages
Non-English message → automatic English translation below it. **Does not disappear.**
```
!auto-translate-enable <password>   ← activate for THIS server
!auto-translate-disable             ← disable (Admin only)
```
Works in **all channels** except `#ai-translator` and admin channels.
Ignores: `!` commands, very short messages, mostly Latin text.

#### 3. AI Channel Translator (#translator_channel)
For conversation between people speaking different languages.
- Write in **any language** → translated to English
- Reply in English → translates back to their language
- Remembers language for 5 hours | Cooldown: 5 seconds

---

### ⚔️ Mania — Setup & Usage

```
!mania-addguild ts @ThousandSunny #mania-strategy #general
!mania-guilds              ← list all guilds
!mania-removeguild ts      ← remove a guild

mania-plan ts / all        ← start plan with ✅ ❌ ⏳
mania-list ts              ← show votes, ping missing members
mania-dm ts                ← DM everyone who hasn't voted

mania-strategy
Kronos - @Luffy @Zoro      ← each line = one boss
Hydra - @Nami @Sanji
```

---

### 🚢 Belly Rush — Ships & Crew

```
!ship-add Sunny ☀️ @mugi-role      ← add a ship
!ship-remove Sunny                  ← remove a ship
!ship-list                          ← view all ships and crews
!ship-captain @Luffy Sunny         ← set permanent captain (never reset)
!ship-uncaptain @Luffy             ← remove captain
!ship-listpermanent                 ← list all permanent crew members
!ship-removepermanent @user        ← remove from permanent crew
!want Sunny                        ← request permanent spot (in belly_rush_roles_channel)
!setup                             ← manually send panel (auto Tue/Fri 10:00)
```

---

### ⚙️ Repair Ship

Only in `repair_channel`. Only `repair @ship` is allowed.
```
!ship-addrepair Sunny {user} sails on fire!! 🔥   ← add a message
!ship-repairs Sunny                                ← list all with IDs
!ship-removerepair 1                               ← remove by ID
repair @Sunny                                      ← usage (any member)
```

---

### 💰 Bounty (Per-server)

```
!wanted / !wanted @user              ← Wanted poster
!setbounty @user 500000000           ← set bounty (Mod/Admin)
!resetbounty @user                   ← reset to ฿0 (Mod/Admin)
```

---

### ⚔️ Heroes (only in unit_build_channel)

```
!hero-list              ← all available heroes
!hero mihawk            ← full build guide
!hero luffy-cultiv1     ← Culti V1 variant
```

---

### ⏰ Reminders

```
!remind 0 21 * * * Raid!   ← every day at 21:00
!reminders                  ← your reminders
!allreminders               ← all reminders
!delete <id>                ← delete by ID
!cron                       ← cron format guide
```

---

### 🛂 New Member Verification

1. New user joins → **Rookie** role (automatic)
2. Clicks **"Nickname"** → enters nickname with guild tag
3. Gets **Player** role and full server access

---

### 🧹 Moderation

```
!clear 50                  ← delete last 50 messages
!say Ahoy!                 ← bot sends the message (command deleted)
!sendto #channel Ahoy!     ← send to a specific channel
!addrole @user Role        ← give a role
!removerole @user Role     ← remove a role
!addroleallts @role        ← give role to everyone with ᐪˢ☠️
!addroleallgm @role        ← give role to everyone with ᴳᴹ☠️
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
>
> 🔐 **Leveling, Flag Translate и Auto-Translate** се активират с парола от собственика на бота.
> 🔐 **Leveling, Flag Translate and Auto-Translate** are activated with a password from the bot owner.
