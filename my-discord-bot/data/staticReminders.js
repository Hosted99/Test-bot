const random = (arr) => arr[Math.floor(Math.random() * arr.length)];

// PREPARATION MESSAGES (11:00)
//const warHype = [
  //"⚔️ 'We're going to be the Pirate Kings!' - Guild War prep has started! Sharpen your blades like Zoro! 🗡️",
 // "🍖 Our feast is over! The crew is ready for the Guild War! Set our course for the battlefield! 🏴‍☠️",
  //"🛡️ 'Our dreams... HAVE NO END!' - Get your gear ready, GUILD WAR preparation is LIVE! 🌊",
  //"⚓ Raise the sails! We need everyone ready for the GW before the storm hits. Prep starts now! 🧭",
  //"🔥 Focus up, Nakama! We're not just a team, we're a Guild War legend in the making. Get ready! 🛡️"
//];

// BATTLE MESSAGES (12, 15, 18:00)
const warBattle = [
  "🔥 OUR GUM-GUM BATTLE IS ON! Guild War is LIVE! Let's go beyond our limits, GEAR SECOND! ⚡",
  "🏹 'The One Piece is real!' - Show them our Guild's power! Don't let them touch our treasure! 💎",
  "💥 'Scars on our backs are a swordsman's shame!' - To the GW front lines, we never run away! 🤜",
  "🌩️ We're bringing the 'D' energy to the Guild War! Charge together and crush them! ⚡",
  "🏴‍☠️ The Grand Line belongs to US! Join the Guild War and show them the strength of our crew! 🔱"
];

// END MESSAGES (21:00)
//const warEnd = [
  //"🍻 'Inherited Will, The Destiny of the Age!' - Our Guild War has ended, let's party like pirates! 🍖",
 // "🏆 We're not just crewmates, we're FAMILY! Great GW today, legends. Rest up for the next voyage! ⚓",
 // "🌊 The dust has settled on the Guild War battlefield. We stood our ground! To the tavern! 🍻",
//  "⭐ Another victory (or a great fight) for our Guild flag! Proud of every single one of you, Nakama! 🚩",
//  "💤 Even the strongest pirates need sleep. The Guild War is over. Rest well, the sea calls tomorrow! 🌙"
//];


// START MESSAGES (10:00)
//const ghostStart = [
  //"💀 YOHOHOHO! A new day begins and the Ghost Trial is waiting! Don't let them steal your shadows! 👻",
  //"🧟‍♂️ Thriller Bark vibes! Ghost Trial is officially OPEN. Let's show these spirits our crew's power! ⚔️",
  //"🌑 Wake up, Nakama! The spirits are restless. Ghost Trial is available for the day, go clear it! 🕯️",
 // "🎻 Binks' Sake is playing... the ghosts are calling! Time to enter the Ghost Trial arena! 💀",
 // "👻 Don't wait for the fog to thicken! The Ghost Trial is open. Claim those rewards now! 🔥"
//];

// LAST CALL MESSAGES (23:00)
//const ghostLastCall = [
 // "⏰ ONLY 1 HOUR LEFT! Stop procrastinating, Nakama! Get the Ghost Trial cleared! 👻",
 // "🏃‍♂️ MOVE IT! Only 60 minutes left for the Ghost Trial! Don't let your rewards vanish into the mist! 🌊",
 // "🏴‍☠️ 'A pirate never misses his mark!' - Finish your Ghost Trial runs RIGHT NOW! ⚔️",
  //"💀 YOHOHOHO! Time is running out for your shadows! Only 1 hour left for Ghost Trial! 🕯️",
 // "⌛ The hourglass is empty! Last chance to enter the Ghost Trial before reset! ⏳"
//];


 

module.exports = [
  { cron: "0 12 * * 3,5,0", message: "Guess what day it is today? Mania day 😈!!", target: "@everyone" },
  { cron: "45 19 * * 3,5,0", message: "15 min until Mania starts! Are you READY?", target: "@everyone" },
  { cron: "0 20 * * 3,5,0", message: "Mania is open Let's party!", target: "@everyone" },


  //SHANDORA !!!
  // 1. Повтаря съобщението за отворено състояние през 3 часа (до 21:00 включително)
  //{ cron: "0 12,15,18,21 * * 2,4", message: "Shandora is open! Watch out or Enel is going to FRY you ⚡!! ", target: "@everyone"},
  // 2. ПРЕДУПРЕЖДЕНИЕ: Изпраща се в 23:50 (10 минути преди края) във вторник и четвъртък
  //{ cron: "50 23 * * 2,4", message: "Shandora is closing soon! 10 minutes left.", target: "@everyone"},
  // 2. Изпраща финално съобщение за затваряне точно в 00:00 (сряда и петък сутрин)
  //{ cron: "0 0 * * 3,5", message: "Shandora is now CLOSED!", target: "@everyone" },

  //BELLY RUSH !!!
  // Ще изпраща съобщението в 12:00, 16:00 и 20:00 във вторник (2) и петък (5) и  в 10:00, сряда и събота това е съобщението където вече плаваме!
  { cron: "0 12,16 * * 2,5", message: "Belly Rush ports are  open  go kidnap NAKAMA to sail together!!", target: "@everyone"},
  //{ cron: "0 10 * * 3,6", message: "Belly Rush. The time we sail is today (at some point) :D", target: "@everyone" },

  // --- GUILD WARS (With Random Messages) !!!
  //{ cron: "0 11 * * 1,3,5", message: () => random(warHype), target: "@everyone" },
  { cron: "0 12 * * 1,3,5",message: () => random(warBattle), target: "@everyone" },
  //{ cron: "0 21 * * 1,3,5", message: () => random(warEnd), target: "@everyone" },

  //Ghost Trial !!!
  // GHOST TRIAL (Last hour reminder - Sunday 23:00)
  //{ cron: "0 23 * * 0", message: () => random(ghostLastCall), target: "@everyone" },
  // GHOST TRIAL (START reiminder - everyday at 10:00)
  //{ cron: "0 10 * * *", message: () => random(ghostStart),target: "@everyone" },
  // SPECIAL FOR HOSTED  тва моето в 10:00 всеки ден 
  //{ cron: "0 10 * * *", message: "The event has started! Get your ass in the Ghost Trial! 💀", target: "@Hosted" },
  //{ cron: "0 23 * * 0", message: () => random(ghostStart),target: "@everyone" },
 
  // --- SUNDAY SPECIAL (Guild Battle) ---
  { cron: "0 10 * * 0", message: "⚔️ Sunday Prep is LIVE! Let's not disappoint our leader and get them SUPER backup!!", target: "@everyone" },
  //{ cron: "0 12 * * 0", message: "🧭 Only 1 hour until the battle starts! Did you support the crew yet? Don't make me come find you... I'm already lost anyway! 🗡️", target: "@everyone" },
  //{ cron: "0 13 * * 0", message: "🔥 THE BATTLE IS ON! The preparation is over, now it's time for blood! Santoryu: OGI... SANZEN SEKAI! 🌪️🗡️", target: "@everyone" },


];
