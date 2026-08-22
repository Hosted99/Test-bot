# 🏴‍☠️ Sailing Kingdom Bot — Наръчник / User Guide
а
## 🇬🇧 ENGLISH

### 🚀 Getting Started — New Server Setup

**1. Enable Developer Mode**
Settings → Advanced → Developer Mode → right-click channel/role → **Copy ID**

**2. Full configuration (Admin only):**
```
!setconfig level_up_channel         <id>  ← channel for level-up messages
!setconfig log_channel              <id>  ← channel for DB sync log
!setconfig stats_channel            <id>  ← channel for !top leaderboard
!setconfig admin_log_channel        <id>  ← channel for mod logs + crew approvals
!setconfig welcome_channel          <id>  ← channel for new members
!setconfig belly_rush_channel       <id>  ← channel for the Belly Rush panel
!setconfig crew_approval_channel    <id>  ← channel for permanent crew approvals (optional)
!setconfig belly_rush_roles_channel <id>  ← channel for ship commands only (!want, !ship-captain, etc — everything else auto-deleted)
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
!setconfig blacklist_channel        <id>  ← channel for the live Belly Rush blacklist embed (optional)
!setconfig shipless_list_channel    <id>  ← channel for the auto-updating list of members without a ship (optional)
!setconfig ship_status_channel      <id>  ← channel where !shipstatus always posts, regardless of where typed (optional)
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
React with a flag → translation in channel, disappears after 2 min.
```
!translate-enable <password>   ← activate for THIS server
!translate-disable             ← disable (Admin only)
```
Supports 50+ languages. Works in **all channels**.

#### 2. Auto-Translate Non-English Messages
Non-English message → English translation below it. **Does not disappear.**
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

**Ship management (Admin):**
```
!ship-add Sunny ☀️ @mugi-role      ← add a ship
!ship-remove Sunny                  ← remove a ship
!ship-list                          ← view all ships and crews
!ship-captain @Luffy Sunny         ← set permanent captain (never reset)
!ship-uncaptain @Luffy             ← remove captain
!setup                             ← manually send panel (auto Tue/Fri 10:00)
```

**Permanent crew:**
```
!want Sunny                        ← request permanent spot (requires Mod approval)
!ship-addpermanent @user Sunny     ← add directly without approval (Mod/Admin)
!ship-removepermanent @user        ← remove from permanent crew (Mod/Admin)
!ship-listpermanent                 ← list all permanent crew members (Mod/Admin)
```

```
> [!NOTE]
> ### 💡 **Important Note on Permissions:**
> In order for your moderators to use ship admin commands and the fleet reset button **without needing full Discord Administrator permissions**, you must first register your server's moderator role using:
> `!setconfig mod_role <role-id>`
    > The role must have the following Discord permissions enabled
        > * View Channels
        > * Manage Roles
        > * Mention @everyone, @here, and All Roles
    > The bot will automatically recognize members with this role as authorized managers for the fleet on a per-server basis!

> 💡 When a user types `!want Sunny`, the bot sends a request to `crew_approval_channel` (or `admin_log_channel` if that isn't set) with **✅ Approve** / **❌ Deny** buttons. A Mod or Admin clicks the button and the user gets a DM with the result.

> ⚠️ **The `belly_rush_roles_channel` accepts commands only.** Any message that isn't a `!` command (e.g. `!want`, `!ship-captain`, `!ship-list`) is auto-deleted with a warning: *"this channel is only for ship selection commands"*.

> 📌 **Pinned instructions (edit-in-place, never repost):**
> `!post-roles-info` — posts the rules card in `belly_rush_roles_channel` *(Admin)*
> `!post-crew-info` — posts the ship-management/approval guide in `crew_approval_channel` (or `admin_log_channel` if that's not set) *(Admin)*
> Run either command again any time to **edit** the same message with fresh text — it never creates a duplicate post, and the original post date stays untouched.

> 📋 **Shipless member list (auto-updating, edit-in-place):**
> `!post-shipless-list` — posts the list once in `shipless_list_channel` *(Admin, needs `!setconfig shipless_list_channel <channel>` first)*
> Set `!setconfig belly_rush_role <role>` to only show members who actually play Belly Rush — otherwise every member without a ship shows up, including people who don't participate at all.
> After that it updates **automatically** — no command needed — every time a member gains or loses a ship role or the Belly Rush role (button, `!ship-captain`, `!ship-addpermanent`, or a manual role change), so the list always reflects reality.

> 🔓 **Belly Rush category unlock instructions (edit-in-place):**
> `!post-unlock-info` — posts the unlock steps card in `belly_rush_unlock_channel` *(Admin, needs `!setconfig belly_rush_unlock_channel <channel>` first)*
> Run it again any time to edit the same message — it never duplicates.
```
---

### 📊 Ship Status (HP / Fatigue)

Post a crew-status board for a ship — either manually or by letting AI read it off a screenshot. Same **edit-in-place** pattern as everything else: re-run for the same ship and it updates the existing message instead of posting a new one.

```
!shipstatus title:Embra unit1:EMP Lucky,100 unit2:Jochwirt,92 unit3:Imhotep,33,Team 3 Fatigue -30%
```

```
!shipstatus-image [title]   ← attach 1-8 screenshots of the crew status
```

> 💡 `!shipstatus-image` sends the screenshot(s) to AI — attach more than one if the crew doesn't fit in a single screenshot, and it merges every unit into one combined list — then shows you a **preview with ✅ Confirm / ❌ Cancel buttons** — nothing is posted or overwritten until a Mod/Admin confirms it. If the AI misreads a name or a percentage, just hit Cancel and try `!shipstatus` manually or clearer screenshots.
> 🔒 Both commands require Mod/Admin (same as the other ship-admin commands, `mod_role` or Administrator).
> ⚙️ Bars are rendered as text (`█████░░░░░`) inside a normal embed — not a graphic image — so it needs no extra setup and always works on Railway.
> 📍 By default the status is posted in whichever channel you typed the command in. Set `!setconfig ship_status_channel <channel>` to always post/update in **one fixed channel** instead, no matter where the command is used.

---

### 🏴‍☠️ Belly Rush Blacklist

Names are stored as **plain text**, not Discord users — works even for people not in the server.

```
!black-list                              ← view the current blacklist (anyone)
!blacklist-add Luffy123 duplicate account  ← add a name (Admin)
!blacklist-add "Red Hair Shanks" scammer   ← use quotes for names with spaces (Admin)
!blacklist-remove Luffy123                 ← remove a name (Admin)
```

> 💡 If `blacklist_channel` is configured, the bot keeps **one** live embed message there and edits it on every add/remove instead of spamming new posts.

---

### 🎂 Birthday Messages

```
!setconfig bday_channel <id>   ← channel for the birthday message
!setconfig bday_user    <id>   ← Discord ID of the person having a birthday
!sendbday                      ← manually send the message right now (Admin)
```

> ⚠️ There's no auto-clear — the message is sent **every day at 08:30** (Sofia time) while `bday_user` stays set. Update or overwrite it after the birthday so it doesn't repeat.

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

### 🤖 AI Chat — Password Activation

Disabled by default. Password provided only by the bot owner.

```
!ai-enable <password>   ← activate AI chat for THIS server
!ai-disable             ← disable (Admin only)
```

Once enabled, **@mention the bot** anywhere to chat with it!

```
@Bot what's the strongest Devil Fruit?   ← ask anything
@Bot tell me about the Grand Line        ← One Piece lore
@Bot yo what's up                        ← just vibe
```

> 💡 The bot responds **in character** as a One Piece pirate — in English.
> It remembers the last 10 messages per user during the session.

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

### 🛡️ Link / Phishing Protection (Automatic)

Always on — no setup needed.
- Every message containing a link is scanned via the VirusTotal API.
- **Safe links** are kept (re-posted via webhook under the user's name).
- **Malicious / phishing links** are deleted instantly and the user is warned.
- Threat alerts are logged to `admin_log_channel`.

> ⚠️ Note: detection relies on: 
+ VirusTotal
+ MetaDefender
+ Jotti's Malware 
+ Kaspersky Threat Intelligence Portal.
>  existing database, so brand-new domains it hasn't seen yet may pass. For specific domains you always want
> blocked, add them to a local denylist.
> Requires `API_KEY` in `.env` for all of APIs (without it, all links pass).

---

### 🗑️ Moderation Logging (Automatic)

Logged to `admin_log_channel`.
- **Deleted messages** — author, who deleted it (via Audit Log), channel, content, attachments, original timestamp.
- **Bulk deletes** — a `.txt` file with all deleted messages + who did it.
- **Bans & timeouts** — responsible mod, target, reason, duration.

> 💡 The bot needs the **View Audit Log** permission to detect *who* deleted a message. Self-deletes create no audit entry (Discord limitation), so they show as "self / unknown".

---

## 🇧🇬 БЪЛГАРСКИ

### 🚀 Първи стъпки — Настройка на нов сървър

**1. Включи Developer Mode**
Settings → Advanced → Developer Mode → десен клик на канал/роля → **Copy ID**

**2. Пълна конфигурация (само Админ):**
```
!setconfig level_up_channel         <id>  ← канал за level-up съобщения
!setconfig log_channel              <id>  ← канал за XP логове
!setconfig stats_channel            <id>  ← канал за !top класация
!setconfig admin_log_channel        <id>  ← канал за модерация логове + crew одобрения
!setconfig welcome_channel          <id>  ← канал за нови членове
!setconfig belly_rush_channel       <id>  ← канал за Belly Rush панела
!setconfig crew_approval_channel    <id>  ← канал за одобрения на постоянен екипаж (опционален)
!setconfig belly_rush_roles_channel <id>  ← канал само за ship команди (!want, !ship-captain и т.н. — всичко друго се трие автоматично)
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
!setconfig blacklist_channel        <id>  ← канал за живото blacklist embed (опционален)
!setconfig shipless_list_channel    <id>  ← канал за авто-обновяващия се списък с членове без кораб (опционален)
!setconfig ship_status_channel      <id>  ← канал, в който !shipstatus винаги постира, независимо къде е писана командата (опционален)
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
Реагираш с флаг → превод в канала, изчезва след 2 мин.
```
!translate-enable <парола>   ← активира за ТОЗИ сървър
!translate-disable           ← спира (само Админ)
```
Поддържа 50+ езика. Работи в **всички канали**.

#### 2. Авто-превод на не-английски съобщения
Не-английско съобщение → превод на английски под него. **Не изчезва.**
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

**Управление на кораби (Админ):**
```
!ship-add Sunny ☀️ @mugi-role      ← добавя кораб
!ship-remove Sunny                  ← маха кораб
!ship-list                          ← всички кораби и екипажи
!ship-captain @Luffy Sunny         ← постоянен капитан (не се ресетва)
!ship-uncaptain @Luffy             ← маха капитан
!setup                             ← изпраща панела веднага (авт. Вт/Пт 10:00)
```

**Постоянен екипаж:**
```
!want Sunny                        ← заявява постоянно място (изисква одобрение от Мод)
!ship-addpermanent @user Sunny     ← директно добавя без одобрение (Мод/Админ)
!ship-removepermanent @user        ← маха от постоянен екипаж (Мод/Админ)
!ship-listpermanent                 ← показва всички постоянни членове (Мод/Админ)
```

```
> 💡 **Важно за правата на Модераторите:**
> За да могат вашите модератори да използват корабните команди и бутона за ресет **без да имат реални Администраторски права в Discord**, задължително трябва първо да настроите модераторската роля  за сървъра чрез командата:
> `!setconfig mod_role <ID-на-ролята>`
    > Като ролята трябва да има следните права в Discord
        > * Преглед на канали.
        > * Управление на роли.
        > * С позовавания @EVERYONE, @HERE и Всички роли.
    > Ботът автоматично ще разпознае притежателите на тази роля като оторизирани лица за управление на флота per-сървър!

> 💡 Когато потребител напише `!want Sunny`, ботът изпраща заявка в `crew_approval_channel` (или в `admin_log_channel`, ако той не е зададен) с бутони **✅ Approve** / **❌ Deny**. Мод или Админ натиска бутон и потребителят получава ЛС с резултата.

> ⚠️ **Каналът `belly_rush_roles_channel` приема само команди.** Всяко съобщение, което не е `!` команда (напр. `!want`, `!ship-captain`, `!ship-list`), се трие автоматично с предупреждение: *"this channel is only for ship selection commands"*.

> 📌 **Постоянни инструкции (редактират се на място, не се препращат наново):**
> `!post-roles-info` — праща/обновява правилата в `belly_rush_roles_channel` *(Админ)*
> `!post-crew-info` — праща/обновява гайда за управление на кораби + одобрения в `crew_approval_channel` (или `admin_log_channel`, ако не е зададен) *(Админ)*
> Пускаш командата пак по всяко време, за да **редактираш** същото съобщение с нов текст — никога не създава дубликат, а датата на оригиналния пост остава непроменена.

> 📋 **Списък с членове без кораб (авто-обновяващ се, редактира се на място):**
> `!post-shipless-list` — постван веднъж в `shipless_list_channel` *(Админ, нужен е първо `!setconfig shipless_list_channel <channel>`)*
> Задай `!setconfig belly_rush_role <role>`, за да се показват само хора, които реално играят Belly Rush — иначе излиза всеки член без кораб, включително хора, които изобщо не участват.
> След това се обновява **автоматично** — без команда — всеки път когато член получи или загуби ship роля или Belly Rush ролята (бутон, `!ship-captain`, `!ship-addpermanent`, или ръчна промяна на роля), така че списъкът винаги отразява реалността.

> 🔓 **Инструкции за отключване на Belly Rush категорията (редактира се на място):**
> `!post-unlock-info` — праща картата с инструкции в `belly_rush_unlock_channel` *(Админ, нужен е първо `!setconfig belly_rush_unlock_channel <channel>`)*
> Пускаш командата пак по всяко време, за да редактираш същото съобщение — никога не се дублира.
```
---

### 📊 Ship Status (HP / Fatigue)

Постваш статус табло за екипажа на кораб — ръчно или чрез AI, което го разчита от скрийншот. Работи по същия **edit-in-place** принцип — пускаш пак командата за същия кораб и тя редактира съществуващото съобщение, вместо да постне ново.

```
!shipstatus title:Embra unit1:EMP Lucky,100 unit2:Jochwirt,92 unit3:Imhotep,33,Team 3 Fatigue -30%
```

```
!shipstatus-image [title]   ← прикачи 1-8 скрийншота от статуса на екипажа
```

> 💡 `!shipstatus-image` праща скрийншота(ите) на AI — прикачи повече от един, ако екипажът не се събира в един скрийншот, и то ги обединява в един общ списък — после ти показва **preview с ✅ Confirm / ❌ Cancel бутони** — нищо не се поства или презаписва, докато Мод/Админ не потвърди. Ако AI-то сгреши име или процент, просто натисни Cancel и пробвай `!shipstatus` ръчно или по-ясни скрийншоти.
> 🔒 И двете команди изискват Мод/Админ (както другите ship-admin команди — `mod_role` или Administrator).
> ⚙️ Баровете се рендират като текст (`█████░░░░░`) в обикновен embed, не като графична картинка — затова не иска допълнителна настройка и винаги работи на Railway.
> 📍 По подразбиране статусът се постира в канала, в който е писана командата. Задай `!setconfig ship_status_channel <channel>`, за да постира/обновява винаги в **един фиксиран канал**, независимо откъде е пусната командата.

---

### 🏴‍☠️ Belly Rush Blacklist

Имената се пазят като **обикновен текст**, не Discord потребители — работи дори за хора, които не са в сървъра.

```
!black-list                              ← показва текущия blacklist (всеки)
!blacklist-add Luffy123 duplicate account  ← добавя име (Админ)
!blacklist-add "Red Hair Shanks" scammer   ← кавички за имена с интервали (Админ)
!blacklist-remove Luffy123                 ← маха име (Админ)
```

> 💡 Ако е зададен `blacklist_channel`, ботът пази **едно** живо embed съобщение там и го edit-ва при всяко добавяне/махане, вместо да спамва нови постове.

---

### 🎂 Birthday съобщения

```
!setconfig bday_channel <id>   ← канал за birthday съобщението
!setconfig bday_user    <id>   ← Discord ID на рождника
!sendbday                      ← изпраща съобщението веднага ръчно (Админ)
```

> ⚠️ Няма авто-изчистване — съобщението се изпраща **всеки ден в 08:30** (София час), докато `bday_user` е зададен. Обнови/презапиши го след рождения ден, за да не се повтаря.

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

### 🤖 AI Чат — Активиране с парола

Изключен по подразбиране. Паролата се дава само от собственика на бота.

```
!ai-enable <парола>   ← активира AI чата за ТОЗИ сървър
!ai-disable           ← спира (само Админ)
```

След активиране, **тагни бота** навсякъде за да чатиш с него!

```
@Бот what's the strongest Devil Fruit?   ← питай каквото искаш
@Бот tell me about the Grand Line        ← One Piece лор
@Бот yo what's up                        ← просто си говори
```

> 💡 Ботът отговаря **в роля** на One Piece пират — на английски.
> Помни последните 10 съобщения на всеки потребител по време на сесията.

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

### 🛡️ Защита от линкове / фишинг (автоматична)

Винаги включена — без настройка.
- Всяко съобщение с линк се проверява през VirusTotal API.
- **Безопасните линкове** остават (препращат се през webhook от името на потребителя).
- **Зловредните / фишинг линкове** се трият веднага и потребителят се предупреждава.
- Заплахите се логват в `admin_log_channel`.

> ⚠️ Засичането разчита на базата на VirusTotal, така че съвсем нови домейни, които още не е виждал, може да минат. За конкретни домейни, които винаги искаш блокирани, се добавя локална денлиста.
> Изисква `VIRUSTOTAL_API_KEY` в `.env` (без него всички линкове минават).

---

### 🗑️ Логване на модерация (автоматично)

Логва се в `admin_log_channel`.
- **Изтрити съобщения** — автор, кой го е изтрил (през Audit Log), канал, съдържание, прикачени файлове, време на пращане.
- **Масово триене** — `.txt` файл с всички изтрити съобщения + кой го е направил.
- **Банове и тайм-аути** — отговорен модератор, цел, причина, продължителност.

> 💡 Ботът трябва да има право **View Audit Log**, за да засича *кой* е изтрил съобщение. При самостоятелно триене Discord не прави запис, така че се показва „сам / неизвестно".

---
---



---

> 📌 **Важно / Important:**
> Всичко е **per-сървър** и напълно независимо.
> Everything is **per-server** and fully independent.
>
> 🔐 **Leveling, Flag Translate, Auto-Translate и AI Chat** се активират с парола от собственика на бота.
> 
> 🔐 **Leveling, Flag Translate, Auto-Translate and AI Chat** are activated with a password from the bot owner.
