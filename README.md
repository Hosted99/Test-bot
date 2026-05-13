# 🏴‍☠️ Sailing Kingdom Bot — Наръчник / User Guide

---

## 🇧🇬 БЪЛГАРСКИ

### 🚀 Първи стъпки — Настройка на нов сървър

**1. Включи Developer Mode**
Settings → Advanced → Developer Mode
Десен клик на канал или роля → **Copy ID**

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

**3. Провери с `!getconfig` дали всичко е записано.**

---

### ⚔️ Mania — Настройка

Добави колкото гилдии искаш — няма ограничение:
```
!setconfig mania_main_channel <id>        ← главен канал за известия

!mania-addguild g1 @Guild1Role #mania-g1  ← добавя Guild 1
!mania-addguild g2 @Guild2Role #mania-g2  ← добавя Guild 2
!mania-addguild g3 @Guild3Role #mania-g3  ← добавя Guild 3 (или колкото искаш)

!mania-guilds                             ← показва всички гилдии
!mania-removeguild g3                     ← маха гилдия
```

**Как се организира Mania:**
```
mania-plan g1          ← стартира план за Guild 1 (реакции ✅ ❌ ⏳)
mania-plan g2          ← стартира план за Guild 2
mania-plan all         ← стартира за всички гилдии с @everyone

mania-list g1          ← кой е гласувал, кой липсва (пингва липсващите)
mania-dm g1            ← изпраща DM на всички, които не са гласували

mania-strategy         ← публикува бойния план
Kronos - @Luffy @Zoro
Hydra - @Nami @Sanji
```
Всеки ред = един бос. Разделяй с тире `-`.

---

### 🚢 Belly Rush — Настройка на кораби

Корабите са напълно динамични — добавяш каквито искаш:
```
!ship-add Sunny ☀️ @mugi-ship-role    ← добавя кораб
!ship-add Marine ⚓ @mari-ship-role
!ship-add Goat 🐐 @goat-ship-role

!ship-list                             ← показва всички кораби и екипажи
!ship-remove Sunny                     ← маха кораб
```

**Капитани (не се ресетват никога):**
```
!ship-captain @Luffy Sunny            ← задава капитан на кораб
!ship-uncaptain @Luffy                ← маха капитан
```

**Постоянен екипаж (потребителят сам го заявява):**
```
!want Sunny                           ← постоянно място, никога не се ресетва
```

**Ръчно пускане на панела:**
```
!setup                                ← изпраща панела за регистрация веднага
```
Панелът се пуска автоматично всеки **вторник и петък в 10:00**.

---

### 🎖️ Система за нива

Пиши в сървъра → печелиш XP автоматично.
- По-дълги съобщения → повече XP
- Снимки/файлове → бонус XP
- Спам → намален XP + предупреждения
- 3 предупреждения → 10 минути мут

```
!rank       ← твоето ниво и прогрес (изчезва след 60 сек)
!top        ← Топ 10 най-активни (само Админ)
!sync       ← ръчно запазване в базата (само Админ)
```

---

### 💰 Bounty система

```
!wanted              ← твоят Wanted плакат
!wanted @user        ← Wanted плакат на друг

!setbounty @user 500000000   ← задава 500M bounty (Мод/Админ)
!resetbounty @user           ← нулира до ฿0 (Мод/Админ)
```
Ролите (50M+ → 900M+) се сменят автоматично.

---

### ⚔️ Герои

Само в канал `#unit-build`:
```
!hero-list              ← всички налични герои
!hero mihawk            ← пълен билд на Mihawk
!hero luffy-cultiv1     ← Culti V1 вариант
```

---

### ⏰ Напомняния

```
!remind 0 21 * * * Raid time!   ← всеки ден в 21:00
!reminders                       ← твоите напомняния
!allreminders                    ← всички напомняния
!delete <id>                     ← изтрива напомняне
!cron                            ← наръчник за cron формата
```

| Cron пример | Кога |
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

### 🌐 AI Преводач

В канала `#ai-translator`:
- Пишеш на **всякакъв език** → превод на английски
- Отговаряш на чужденец на английски → превод обратно на неговия език
- Помни езика 5 часа | Cooldown: 5 секунди

---

### 🧹 Модерация

```
!clear 50                    ← трие последните 50 съобщения
!say Ahoy pirates!           ← ботът изпраща (твоята команда се трие)
!sendto #general Ahoy!       ← изпраща в конкретен канал

!addrole @user SpamLord      ← дава роля
!removerole @user SpamLord   ← маха роля
!addroleallts @роля          ← дава роля на всички с тага ᐪˢ☠️
!addroleallgm @роля          ← дава роща на всички с тага ᴳᴹ☠️
```

---

### 💬 Автоматични реакции

- `good night` / `nighty night` → лека нощ с GIF
- `good morning` / `добро утро` → добро утро с GIF

---
---

## 🇬🇧 ENGLISH

### 🚀 Getting Started — New Server Setup

**1. Enable Developer Mode**
Settings → Advanced → Developer Mode
Right-click any channel or role → **Copy ID**

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

**3. Verify everything saved with `!getconfig`.**

---

### ⚔️ Mania — Setup

Add as many guilds as you want — no limit:
```
!setconfig mania_main_channel <id>         ← main notification channel

!mania-addguild g1 @Guild1Role #mania-g1   ← add Guild 1
!mania-addguild g2 @Guild2Role #mania-g2   ← add Guild 2
!mania-addguild g3 @Guild3Role #mania-g3   ← add Guild 3 (or as many as you need)

!mania-guilds                              ← list all configured guilds
!mania-removeguild g3                      ← remove a guild
```

**How to run a Mania:**
```
mania-plan g1          ← start plan for Guild 1 (adds ✅ ❌ ⏳ reactions)
mania-plan g2          ← start plan for Guild 2
mania-plan all         ← start for all guilds with @everyone

mania-list g1          ← shows who voted, who is missing (pings missing members)
mania-dm g1            ← sends DM to everyone who hasn't voted

mania-strategy         ← post the battle plan
Kronos - @Luffy @Zoro
Hydra - @Nami @Sanji
```
Each line = one boss. Separate boss and players with a dash `-`.

---

### 🚢 Belly Rush — Ship Setup

Ships are fully dynamic — add whatever you need:
```
!ship-add Sunny ☀️ @mugi-ship-role    ← add a ship
!ship-add Marine ⚓ @mari-ship-role
!ship-add Goat 🐐 @goat-ship-role

!ship-list                             ← view all ships and current crews
!ship-remove Sunny                     ← remove a ship
```

**Captains (never get reset):**
```
!ship-captain @Luffy Sunny            ← set a permanent captain
!ship-uncaptain @Luffy                ← remove captain status
```

**Permanent crew (users request it themselves):**
```
!want Sunny                           ← permanent spot, never reset
```

**Manually trigger the panel:**
```
!setup                                ← send the registration panel immediately
```
The panel posts automatically every **Tuesday and Friday at 10:00**.

---

### 🎖️ Leveling System

Chat in the server → earn XP automatically.
- Longer messages → more XP
- Images/files → bonus XP
- Spamming → reduced XP + warnings
- 3 warnings → 10 minute mute

```
!rank       ← your level and progress bar (auto-deletes after 60s)
!top        ← Top 10 most active pirates (Admin only)
!sync       ← manually flush XP to database (Admin only)
```

---

### 💰 Bounty System

```
!wanted              ← your own Wanted poster
!wanted @user        ← someone else's Wanted poster

!setbounty @user 500000000   ← set a 500M bounty (Mod/Admin)
!resetbounty @user           ← reset to ฿0 (Mod/Admin)
```
Bounty roles (50M+ → 900M+) swap automatically.

---

### ⚔️ Hero Builds

Only works in the `#unit-build` channel:
```
!hero-list              ← all available heroes
!hero mihawk            ← full Mihawk build
!hero luffy-cultiv1     ← Luffy Culti V1 variant
```

---

### ⏰ Reminders

```
!remind 0 21 * * * Raid time!   ← every day at 21:00
!reminders                       ← your active reminders
!allreminders                    ← all reminders (static + yours)
!delete <id>                     ← delete a reminder
!cron                            ← cron format guide
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

### 🌐 AI Translator

In the `#ai-translator` channel:
- Write in **any language** → translated to English
- Reply to a non-English user in English → translates back to their language
- Remembers language for 5 hours | Cooldown: 5 seconds

---

### 🧹 Moderation

```
!clear 50                    ← delete last 50 messages
!say Ahoy pirates!           ← bot sends the message (your command is deleted)
!sendto #general Ahoy!       ← send to a specific channel

!addrole @user SpamLord      ← give a role
!removerole @user SpamLord   ← remove a role
!addroleallts @role          ← give role to everyone with ᐪˢ☠️ tag
!addroleallgm @role          ← give role to everyone with ᴳᴹ☠️ tag
```

---

### 💬 Automatic Reactions

- `good night` / `nighty night` → bot wishes you good night with a GIF
- `good morning` / `добро утро` → bot greets you with a random GIF

---

> 📌 **Tip:** Every server is independent. Configs, ships, guilds and captains are saved separately per server.
