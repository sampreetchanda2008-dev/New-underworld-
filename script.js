if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker Registered!', reg))
            .catch(err => console.log('Service Worker Registration Failed:', err));
    });
}



let isEnchantingMode = false; // Tracks if we opened the menu from the Enchantment tab
let selectedEnchantWeapon = null; // Stores the weapon object currently being enchanted

let selectedSlotId = null; // Tracks which slot (1-5) is clicked
let activeEnchantTier = null; // Tracks if the user is looking at Simple, Medium, or Mythical

let activeEnchants = {
    poisoning: { stacks: 0, timer: null },
    precisionActive: false,
    overheatActive: false
};

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log("Underworld Offline Mode: Active"))
        .catch((err) => console.log("Service Worker Failed:", err));
}



let resetSafetyLock = false;

window.totalResetGame = function() {
    // If the safety lock is OFF, warn the player
    if (!resetSafetyLock) {
        resetSafetyLock = true;
        showGameNotice("TAP 'LEAGUE' AGAIN TO WIPE ALL PROGRESS!", 'red-mode');
        
        // Reset the lock after 3 seconds if they don't tap again
        setTimeout(() => {
            resetSafetyLock = false;
        }, 3000);
        return; 
    }

    // If they tapped again while the lock was ON:
    // 1. Clear Logic
    if (typeof gems !== 'undefined') gems = 0; 
    localStorage.clear();

    // 2. UI Cleanup
    const gemCount = document.getElementById('gem-count-top');
    if (gemCount) gemCount.innerText = "0";
    
    // 3. Success Notice
    showGameNotice("SYSTEM WIPED. REBOOTING...", 'red-mode');

    // 4. Reboot
    setTimeout(() => {
        location.reload(); 
    }, 1000);
};

function applySimpleEnchants(baseDamage, bossMaxShield) {
    let bonusDamage = 0;
    const equipped = playerStats.weaponEnchants[playerStats.equippedWeapon] || {};
    const enchantsOnWeapon = Object.values(equipped);

    // --- 1. PRECISION & OVERHEAT (Instant Damage Buffs) ---
    // Check if weapon has Precision
    if (enchantsOnWeapon.includes("Precision")) {
        if (Math.random() < 0.15) { // 15% Chance to trigger
            spawnEnchantIcon("Precision", "player");
            bonusDamage += baseDamage * 0.20; 
            
            // Link for Mythical Arcane Martial Art later
            if (typeof updateArcaneStacks === "function") updateArcaneStacks();
        }
    }

    // Check if weapon has Overheat
    if (enchantsOnWeapon.includes("Overheat")) {
        if (Math.random() < 0.10) { // 10% Chance
            spawnEnchantIcon("Overheat", "player");
            bonusDamage += baseDamage * 2.00;
        }
    }

    // --- 2. POISONING (The Ticking Stack) ---
    if (enchantsOnWeapon.includes("Poisoning") && activeEnchants.poisoning.stacks <= 0) {
        if (Math.random() < 0.12) { // 12% Chance
            activeEnchants.poisoning.stacks = 5;
            const icon = spawnEnchantIcon("Poisoning", "player", 5);
            
            // Start the Poison Ticker (5% total shield per pulse)
            activeEnchants.poisoning.timer = setInterval(() => {
                activeEnchants.poisoning.stacks--;
                
                // Deal 5% of TOTAL shield damage
                const poisonDmg = bossMaxShield * 0.05;
                dealEnchantDamage(poisonDmg, "Poisoning");

                // Update UI counter
                const counter = icon.querySelector('.enchant-counter');
                if (counter) counter.innerText = `x${activeEnchants.poisoning.stacks}`;

                // Pulse the icon
                icon.classList.remove('animate-pulse-standard');
                void icon.offsetWidth; // Trigger reflow
                icon.classList.add('animate-pulse-standard');

                if (activeEnchants.poisoning.stacks <= 0) {
                    clearInterval(activeEnchants.poisoning.timer);
                    setTimeout(() => icon.remove(), 1000); // Fade away 1s after x0
                }
            }, 1000); // 1 pulse per second
        }
    }

    return bonusDamage;
}

// Helper to actually reduce the boss shield from DoTs
function dealEnchantDamage(amount, sourceName) {
    // Replace 'currentBossShield' with your actual boss shield variable
    currentBossShield -= amount; 
    updateBossUI(); // Refresh your health bar and numbers
    console.log(`${sourceName} dealt ${amount} damage!`);
}

function showEnchantmentTab() {
    console.log("Attempting to open Enchantment Tab...");
    const overlay = document.getElementById('enchantment-overlay');
    if (overlay) {
        overlay.style.setProperty('display', 'flex', 'important');
        console.log("Tab should now be visible.");
    } else {
        console.error("Error: Could not find element with ID 'enchantment-overlay'");
    }
}

function selectEnchantSlot(element) {
    // 1. Remove highlight from all slots
    document.querySelectorAll('.enchant-slot').forEach(slot => {
        slot.style.border = "1px solid rgba(255,255,255,0.2)";
        slot.style.boxShadow = "none";
    });

    // 2. Highlight the clicked slot
    element.style.border = "2px solid #FFD700";
    element.style.boxShadow = "0 0 15px rgba(255, 215, 0, 0.4)";

    // 3. Save the ID
    selectedSlotId = parseInt(element.getAttribute('data-slot'));
    console.log("System: Slot " + selectedSlotId + " selected for modification.");
}

// --- 1. INITIALIZE DATA ---
let playerStats = JSON.parse(localStorage.getItem('underworldStats')) || {
    voidEnergy: 50,
    gems: 0,
    smallCharges: 0,
    mediumCharges: 0,
    largeCharges: 0,
    currentLeague: "bronze",
    equippedWeapon: "Blade Tonfas",
    ownedWeapons: ["Blade Tonfas"],
    steelKey: 0, flameKey: 0, crystalKey: 0, fungalKey: 0, 
    hydraKey: 0, phantomKey: 0, plagueKey: 0, hoaxKey: 0, 
    famineKey: 0, bloodshedKey: 0, portalKey: 0, obeliskKey: 0,
    unlockedBosses: [],
    rating: 0,
    currentDan: 1,
    currentBelt: "bronze",
    energyBloom: 0,    // Green
    energyCrysonite: 0, // Orange/Yellow
    energyShadow: 0,    // Added missing comma here
    raidCooldowns: {}
};

// --- 2. PURCHASE LOGIC ---
function buyEnergy(type, cost) {
    // FIX: Accessing playerStats directly
    if (playerStats.gems >= cost) {
        playerStats.gems -= cost;
        playerStats[type]++; // FIX: Updated from playerCurrencies to playerStats
        
        // Save to LocalStorage so the purchase persists
        localStorage.setItem('underworldStats', JSON.stringify(playerStats));
        
        updateUI(); 
        console.log(`Purchased ${type}. Current count:`, playerStats[type]);
    } else {
        alert("Not enough Gems!");
    }
}

// Setting up the paths based on your folder structure
const energyPaths = {
    energyBloom: 'underworld/assets/energies/energy_bloom.jpg',
    energyCrysonite: 'underworld/assets/energies/energy_crysonite.jpg',
    energyShadow: 'underworld/assets/energies/energy_shadow.jpg'
};
const raidData = {
    "Emergence": { cost: 50, gems: 250, key: "flame", boss: "volcano" },
    "Unwavered": { cost: 150, gems: 750, key: "crystal", boss: "megalith" },
    "Anamnesis": { cost: 9500, gems: 1800, key: "fungal", boss: "fungus" },
    "Frivolity": { cost: 12000, gems: 2000, key: "hydra", boss: "vortex" },
    "Depths": { cost: 18000, gems: 3600, key: "phantom", boss: "fatum" },
    "Cogitation": { cost: 48000, gems: 4400, key: "plague", boss: "arkhos" },
    "Proficiency": { cost: 88960, gems: 6800, key: "hoax", boss: "hoaxen" },
    "Praxis": { cost: 98900, gems: 8000, key: "famine", boss: "karcer" },
    "Coherence": { cost: 172890, gems: 12000, key: "bloodshed", boss: "drakaina" },
    "Trial of Resolve I": { cost: 2460080, gems: 20000, key: "portal", boss: "tenebris" },
    "Trial of Resolve II": { cost: 9990050, gems: 50000, key: "obelisk", boss: "stalker" }
};

const danThresholds = [
    { dan: 1, belt: "bronze", min: 0, max: 40000 },
    { dan: 2, belt: "bronze", min: 40000, max: 120000 },
    { dan: 3, belt: "bronze", min: 120000, max: 200000 },
    { dan: 4, belt: "bronze", min: 200000, max: 700000 },
    { dan: 5, belt: "bronze", min: 700000, max: 1800000 },
    { dan: 6, belt: "bronze", min: 1800000, max: 3900000 },
    { dan: 7, belt: "bronze", min: 3900000, max: 8000000 },
    { dan: 8, belt: "bronze", min: 8000000, max: 16000000 },
    { dan: 9, belt: "bronze", min: 16000000, max: 45000000 },
    { dan: 10, belt: "bronze", min: 45000000, max: 85000000 },
    { dan: 10, belt: "silver", min: 85000000, max: 123600000 },
    { dan: 10, belt: "gold", min: 123600000, max: 187200000 },
    { dan: 10, belt: "platinum", min: 187200000, max: 215600000 },
    { dan: 10, belt: "emerald", min: 215600000, max: 301200000 },
    { dan: 10, belt: "dragon", min: 301200000, max: 389700000 },
    { dan: 10, belt: "void", min: 389700000, max: 600000000 }
];

// --- 2. WEAPON DATABASE (Updated with League Tags) ---
const weaponData = [
     
    // --- BRONZE ---
    { name: "Blade Tonfas", img: "bdt.webp", league: "bronze", damage: 88, cost: 20 },
    { name: "Spiny Knuckles", img: "sk.webp", league: "bronze", damage: 180, cost: 35 },
    { name: "Lynx's Claws", img: "lc.webp", league: "bronze", damage: 350, cost: 80 },
    { name: "Silent Moon", img: "sm.webp", league: "bronze", damage: 210, cost: 50 },

    // --- SILVER ---
    { name: "Butcher's Knives", img: "bk.webp", league: "silver", damage: 390, cost: 450 },
    { name: "Striking Falcon", img: "sf.webp", league: "silver", damage: 400, cost: 360 },
    { name: "Vulture's Feather", img: "vf.webp", league: "silver", damage: 430, cost: 280 },
    { name: "Fate's End", img: "fatesend.PNG", league: "silver", damage: 510, cost: 100 },
    { name: "Composite Sword", img: "cs.jpg", league: "silver", damage: 700, cost: 950 },
    { name: "Blood Reaper", img: "br.jpg", league: "silver", damage: 650, cost:750 },
    { name: "Fireflies", img: "fireflies.jpg", league: "silver", damage: 570, cost: 400 },
    { name: "Monk's Katars", img: "mkatar.jpg", league: "silver", damage: 720, cost: 900 },

    // --- GOLD ---
    { name: "Ripping Kit", img: "rk.webp", league: "gold", damage: 1500, cost: 2000 },
    { name: "Song of Dawn", img: "sod.webp", league: "gold", damage: 2200, cost: 2500 },
    { name: "Ornamental Sabers", img: "os.webp", league: "gold", damage: 2500, cost: 1900 },
    { name: "Revival", img: "r.webp", league: "gold", damage: 2600, cost: 2050 },
    { name: "The Sting", img: "sting.jpg", league: "gold", damage: 3800, cost: 4050 },
    { name: "Blade of Timelessness", img: "bot.jpg", league: "gold", damage: 5200, cost: 6800 },
    { name: "Harrier Hooks", img: "harrierhooks.jpg", league: "gold", damage: 4400, cost: 5300 },
    { name: "Will of Many", img: "wom.jpg", league: "gold", damage: 4870, cost: 5950 },

    // --- PLATINUM ---
    { name: "Beast's Fury", img: "bf.webp", league: "platinum", damage: 9200, cost: 10200 },
    { name: "Shogun's Katana", img: "skt.webp", league: "platinum", damage: 11560, cost: 17900 },
    { name: "Plasma Rifle", img: "pr.webp", league: "platinum", damage: 10040, cost: 19050 },
    { name: "Key to Infinity", img: "kti.webp", league: "platinum", damage: 14650, cost: 19830 },
    { name: "Pray of the Lost", img: "pol.webp", league: "platinum", damage: 18500, cost: 18450 },
    { name: "Blizzard", img: "blizzard.jpg", league: "platinum", damage: 21270, cost: 20990 },
    { name: "Mind of Ice", img: "mindofice.jpg", league: "platinum", damage: 26560, cost: 24900 },
    { name: "Order's Oath", img: "ordersoath.jpg", league: "platinum", damage: 22250, cost: 20450 },

    // --- EMERALD ---
    { name: "Resonance of Laws", img: "rol.webp", league: "emerald", damage: 48000, cost: 38000 },
    { name: "Undying Watch", img: "uw.webp", league: "emerald", damage: 56000, cost: 50000 },
    { name: "Curse of Teramori", img: "ct.webp", league: "emerald", damage: 68400, cost: 45000 },
    { name: "Tracery of Fate", img: "tof.webp", league: "emerald", damage: 52600, cost: 65500 },
    { name: "World Slicer", img: "worldslicer.jpg", league: "emerald", damage: 77600, cost: 93500 },
    { name: "Dance of Static", img: "dos.jpg", league: "emerald", damage: 51000, cost: 80789 },
    { name: "Edge of Time", img: "edgeoftime.jpg", league: "emerald", damage: 69300, cost: 94800 },
    { name: "Jade of Hearts", img: "jade.webp", league: "emerald", damage: 59090, cost: 79650 },
    { name: "New Beginning", img: "nb.webp", league: "emerald", damage: 84850, cost: 102450 },

    // --- DRAGON ---
    { name: "Last Verses", img: "lv.webp", league: "dragon", damage: 320720, cost: 250000 },
    { name: "Magmium Sequencers", img: "ms.webp", league: "dragon", damage: 210500, cost: 299000 },
    { name: "Daisho", img: "daisho.jpg", league: "dragon", damage: 270000, cost: 544000 },
    { name: "Blazing Logic", img: "blazinglogic.jpg", league: "dragon", damage: 220000, cost: 659600 },
    { name: "Hand of Fire", img: "handoffire.jpg", league: "dragon", damage: 372000, cost: 752070 },
    { name: "Hand of Magmarion", img: "handofmagmarion.jpg", league: "dragon", damage: 400000, cost: 949000 },

    // --- VOID ---
    { name: "Chaos Pulse", img: "cp.webp", league: "void", damage: 980000, cost: 2000000 },
    { name: "Void Piercer", img: "vp.webp", league: "void", damage: 1290000, cost: 3900000},
    { name: "Battle of Laws", img: "battleoflaws.jpg", league: "void", damage: 2400000, cost: 12000000 },
    { name: "Coral Prickles", img: "cp.jpg", league: "void", damage: 3900000, cost: 15000000 },
    { name: "Void Blade", img: "voidblade.jpg", league: "void", damage: 4270000, cost: 24500000 },
    { name: "Void Pearl", img: "vpearls.jpg", league: "void", damage: 5360000, cost: 35700000 },
    { name: "Whispers of the Consumed", img: "woc.webp", league: "void", damage: 6440000, cost: 44500000 }
];
	
	

// --- 3. UI SYNC & DAN SYSTEM ---
function updateDanSystem() {
    const rating = playerStats.rating || 0;
    const currentLevel = danThresholds.find(t => rating >= t.min && rating < t.max) || danThresholds[danThresholds.length - 1];

    playerStats.currentDan = currentLevel.dan;
    playerStats.currentBelt = currentLevel.belt;
    playerStats.currentLeague = currentLevel.belt;

    // Track Best Rating
    if (rating > (playerStats.bestRating || 0)) {
        playerStats.bestRating = rating;
    }

    const range = currentLevel.max - currentLevel.min;
    const progress = rating - currentLevel.min;
    const percent = Math.min(100, (progress / range) * 100);

    // --- MAIN SCREEN UPDATES ---
    const beltImg = document.getElementById('dan-belt-icon');
    const danBar = document.getElementById('dan-bar-fill');
    const danText = document.getElementById('dan-stats-text');
    const danLabel = document.getElementById('dan-display-text');

    if (beltImg) beltImg.src = `assets/beltsrating/belt_${currentLevel.belt}.jpg`;
    if (danBar) danBar.style.width = `${percent}%`;
    if (danText) danText.innerText = `${rating.toLocaleString()} / ${currentLevel.max.toLocaleString()}`;
    if (danLabel) danLabel.innerText = `DAN ${currentLevel.dan}`;

    // --- PROFILE TAB UPDATES (Matching your HTML IDs) ---
    const profDan = document.getElementById('dan-val');
    const profRating = document.getElementById('rating-val');
    const profBest = document.getElementById('best-rating-val');
    const profLeagueName = document.getElementById('league-name');
    const profLeagueBelt = document.getElementById('league-belt');

    if (profDan) profDan.innerText = currentLevel.dan;
    if (profRating) profRating.innerText = rating.toLocaleString();
    if (profBest) profBest.innerText = (playerStats.bestRating || rating).toLocaleString();
    if (profLeagueName) {
        profLeagueName.innerText = `${currentLevel.belt.toUpperCase()} LEAGUE`;
        profLeagueName.className = `league-glow ${currentLevel.belt}-text`; // Allows for belt-specific colors
    }
    if (profLeagueBelt) profLeagueBelt.src = `assets/beltsrating/belt_${currentLevel.belt}.jpg`;
}
// --- 4. NAVIGATION ---
function openRaids() { 
    hideAllScreens(); 
    document.getElementById("raids-tab").style.display = "block"; 
    showHUD(true); 
    updateRaidButtons(); 
}

function openUnderworld() { 
    hideAllScreens(); 
    document.getElementById("underworld-tab").style.display = "block"; 
    // If the "Profile" button is still showing here, we turn HUD OFF
    showHUD(false); 
    updateUnderworldUI(); 
}

function openShop() { 
    hideAllScreens(); 
    document.getElementById("shop-tab").style.display = "block"; 
    showHUD(true); 
    syncBankUI(); 
}

// Add 'main-screen' and 'profile-tab' to your cleanup loop
function hideAllScreens() {
    const screens = [
        "raids-tab", 
        "underworld-tab", 
        "shop-tab", 
        "enchantments-tab", 
        "main-screen", 
        "profile-tab", 
        "battle-overlay"
    ];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

// Use this for EVERY 'Back' button to reach the main menu
function goHome() {
    hideAllScreens();
    const home = document.getElementById('main-screen');
    if (home) home.style.display = 'flex'; // Main screen usually uses flex
    showHUD(true);
}

// Updated Enchantments Function
function openEnchantments() {
    hideAllScreens();
    const enchTab = document.getElementById("enchantments-tab");
    if (enchTab) {
        enchTab.style.display = "block";
        // Corrected path based on your directory info
        enchTab.style.backgroundImage = "url('../Underworld/bg_enchantments.webp')";
        enchTab.style.backgroundSize = "cover";
        enchTab.style.backgroundPosition = "center";
    }
    showHUD(true); 
}





function closeWeapons() {
    openProfile(); // This will automatically trigger hideAllScreens("profile-tab")
}



// --- 1. THE OPEN WEAPONS FUNCTION (The missing link) ---
// --- FIX 1 & 3: Reset Button Leak & Sticky Overlay ---
function openProfile() {
    hideAllScreens(); // Hide everything else
    
    // 1. Show the Profile Tab
    const profileTab = document.getElementById('profile-tab');
    profileTab.style.display = 'block';

    // 2. FORCE the Weapons Overlay to stay hidden until clicked
    document.getElementById('weapons-overlay').style.display = 'none';

    // 3. Make sure the Reset Button is visible on the Profile
    const resetBtn = document.querySelector('.reset-btn');
    if (resetBtn) resetBtn.style.display = 'block';
    
    syncProfileWeaponUI();
}

// --- FIX 2: Back Button Logic ---



// --- 4. SYNCING THE WEAPON ON THE PROFILE PAGE ---
// This makes sure the "WEAPON EQUIPPED" image updates on the profile tab
function syncProfileWeaponUI() {
    const equipped = weaponData.find(w => w.name === playerStats.equippedWeapon);
    const imgEl = document.getElementById('profile-weapon-img');
    const dmgEl = document.getElementById('profile-weapon-damage');
    
    if (equipped && imgEl && dmgEl) {
        imgEl.src = `assets/weapons/${equipped.img}`;
        dmgEl.innerText = `Damage: ${equipped.damage}`;
    }
}

// Update your existing equip function to call this:
function equipWeapon(weaponName) {
    playerStats.equippedWeapon = weaponName;
    saveProgress();
    openWeapons(); // Refresh the list to show "EQUIPPED" status
    syncProfileWeaponUI();
    showGameNotice(`${weaponName} EQUIPPED!`, 'shop');
}


function showHUD(visible) { 
    document.querySelectorAll('.game-hud').forEach(h => { 
        h.style.display = visible ? 'flex' : 'none'; 
    }); 
    
    // Safety check: If 'Profile' button is a separate element not in the HUD, hide it here
    const profBtn = document.querySelector('.profile-btn'); 
    if (profBtn) profBtn.style.display = visible ? 'block' : 'none';
}
// --- 5. SHOP & WEAPONS ---
function buyEnergy(amount, cost) {
    // Force the check against the actual object property
    if (Number(playerStats.gems) >= Number(cost)) {
        playerStats.gems -= Number(cost);
        playerStats.voidEnergy += Number(amount);
        
        showGameNotice(`SUCCESS! +${amount} VOID ENERGY`, 'shop');
        syncBankUI(); 
    } else {
        // This MUST trigger if gems are 0
        showGameNotice("NOT ENOUGH GEMS!");
        console.log("Purchase failed. Current Gems:", playerStats.gems);
    }
}

function buyCharge(type, cost) {
    if (playerStats.gems >= cost) {
        playerStats.gems -= cost;
        // Correctly increments the specific charge type
        playerStats[type + 'Charges']++; 
        showGameNotice(`BOUGHT ${type.toUpperCase()} CHARGE!`, 'shop');
    } else {
        showGameNotice("NOT ENOUGH GEMS!");
    }
    syncBankUI(); // Updates the gem and charge count on screen
}



function buyWeapon(name, cost) {
    if (playerStats.gems >= cost) {
        playerStats.gems -= cost; playerStats.ownedWeapons.push(name);
        equipWeapon(name); showGameNotice("BOUGHT AND EQUIPPED!"); openWeapons(); 
    } else { showGameNotice("NOT ENOUGH GEMS!"); }
}



function updateProfileWeapon() {
    const w = weaponData.find(x => x.name === playerStats.equippedWeapon);
    if (w) {
        const img = document.getElementById('profile-weapon-img');
        const dmgText = document.getElementById('profile-weapon-damage');
        const avgDmgVal = document.getElementById('avg-dmg-val'); // Matches your HTML ID

        if (img) img.src = `assets/weapons/${w.img}`;
        if (dmgText) dmgText.innerText = `Damage: ${w.damage}`;
        if (avgDmgVal) avgDmgVal.innerText = w.damage.toLocaleString(); // Syncs the Profile stat
    }
}

// --- 6. RAIDS & TIMERS ---
function formatTime(ms) {
    let totalSecs = Math.floor(ms / 1000);
    let hrs = Math.floor(totalSecs / 3600);
    let mins = Math.floor((totalSecs % 3600) / 60);
    let secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function completeRaid(raidName) {
    const raid = raidData[raidName];
    if (playerStats.voidEnergy >= raid.cost) {
        playerStats.voidEnergy -= raid.cost;
        playerStats.gems += raid.gems;
        playerStats[raid.key + "Key"] = (playerStats[raid.key + "Key"] || 0) + 1;
        
        // Unlock boss permanently
        if (!playerStats.unlockedBosses.includes(raid.boss)) {
            playerStats.unlockedBosses.push(raid.boss);
        }

        if (!playerStats.raidCooldowns) playerStats.raidCooldowns = {};
playerStats.raidCooldowns[raidName] = {
    endTime: Date.now() + (4 * 60 * 60 * 1000),
    isFinishUsed: false
};        
        saveProgress(); 
        syncBankUI(); 
        showRaidReward(raid.gems, raid.key); 
        updateRaidButtons();
        updateUnderworldUI(); // Trigger underworld update immediately
    } else { showGameNotice("NOT ENOUGH ENERGY"); }
}

function updateRaidButtons() {
    const now = Date.now();
    document.querySelectorAll('.complete-btn').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (!onclickAttr) return;
        
        const match = onclickAttr.match(/'([^']+)'/);
        if (match) {
            const raidName = match[1];
            const cooldownObj = playerStats.raidCooldowns[raidName];

            // 1. SAFE DATA EXTRACTION: Check if it's an object {endTime: X} or just a number
            let endTime = 0;
            if (cooldownObj && typeof cooldownObj === 'object') {
                endTime = cooldownObj.endTime;
            } else if (typeof cooldownObj === 'number') {
                endTime = cooldownObj;
            }

            // 2. LOGIC GATE: If time is in the future, show the timer
            if (endTime && endTime > now) {
                btn.disabled = true; 
                btn.style.backgroundColor = "#555"; 
                btn.innerText = formatTime(endTime - now);
            } else {
                // 3. RESET: If no cooldown or time passed, show "Complete"
                btn.disabled = false; 
                btn.style.backgroundColor = ""; 
                btn.innerText = "Complete";
            }
        }
    });
}

// Run timer update every second
setInterval(() => {
    if (document.getElementById("raids-tab").style.display === "block") {
        updateRaidButtons();
    }
}, 1000);

function showRaidReward(gemAmt, keyType) {
    const overlay = document.getElementById('raid-reward-overlay');
    const content = document.getElementById('reward-text-content');
    if (!overlay || !content) return;
    content.innerHTML = `<h1 style="color:#FFD700;">OBTAINED:</h1>
        <div style="display:flex; align-items:center; justify-content:center; gap:20px; margin-bottom:15px;">
            <img src="assets/currencies/currency_gems.jpg" style="width:50px;"><span style="color:white; font-size:2rem;">${gemAmt.toLocaleString()}</span>
        </div>
        <div style="display:flex; align-items:center; justify-content:center; gap:20px;">
            <img src="assets/key_icons/key_${keyType}.jpg" style="width:50px;"><span style="color:white; font-size:2rem;">1</span>
        </div>`;
    overlay.style.display = 'flex';
}

function closeRaidReward() { document.getElementById('raid-reward-overlay').style.display = 'none'; }

// --- 7. UNDERWORLD & BATTLE ---
const bossData = {
    "volcano": { 
        name: "Volcano", shield: 1757, ratingMin: 50000000000, ratingMax: 15000000000000, sMin: 1, sMax: 2, mMin: 0, mMax: 0, lMin: 0, lMax: 0, key: "flame",
        power: { shield: 186870, rMult: 7, cMult: 2 } 
    },
    "megalith": { 
        name: "Megalith", shield: 5621, ratingMin: 1800, ratingMax: 3800, sMin: 2, sMax: 4, mMin: 0, mMax: 0, lMin: 0, lMax: 0, key: "crystal",
        power: { shield: 310810, rMult: 9, cMult: 2.5 } 
    },
    "fungus": { 
        name: "Fungus", shield: 10095, ratingMin: 4500, ratingMax: 11500, sMin: 2, sMax: 3, mMin: 0, mMax: 1, lMin: 0, lMax: 0, key: "fungal",
        power: { shield: 450740, rMult: 10, cMult: 3 }
    },
    "vortex": { 
        name: "Vortex", shield: 11071, ratingMin: 9000, ratingMax: 20000, sMin: 3, sMax: 5, mMin: 0, mMax: 2, lMin: 0, lMax: 0, key: "hydra",
        power: { shield: 1790760, rMult: 25, cMult: 3 }
    },
    "fatum": { 
        name: "Fatum", shield: 8473, ratingMin: 14000, ratingMax: 22000, sMin: 4, sMax: 6, mMin: 1, mMax: 4, lMin: 0, lMax: 0, key: "phantom",
        power: { shield: 3970080, rMult: 36, cMult: 4 }
    },
    "arkhos": { 
        name: "Arkhos", shield: 8893, ratingMin: 11000, ratingMax: 23000, sMin: 5, sMax: 6, mMin: 1, mMax: 4, lMin: 1, lMax: 2, key: "plague",
        power: { shield: 8020430, rMult: 26, cMult: 4 }
    },
    "hoaxen": { 
        name: "Hoaxen", shield: 12639, ratingMin: 31000, ratingMax: 42000, sMin: 6, sMax: 8, mMin: 1, mMax: 12, lMin: 1, lMax: 2, key: "hoax",
        power: { shield: 24853700, rMult: 19, cMult: 5 }
    },
    "karcer": { 
        name: "Karcer", shield: 10473, ratingMin: 49000, ratingMax: 58000, sMin: 8, sMax: 10, mMin: 2, mMax: 6, lMin: 1, lMax: 2, key: "famine",
        power: { shield: 75950780, rMult: 17, cMult: 5 }
    },
    "drakaina": { 
        name: "Drakaina", shield: 12513, ratingMin: 5500000, ratingMax: 6900000, sMin: 9, sMax: 12, mMin: 5, mMax: 12, lMin: 2, lMax: 4, key: "bloodshed",
        power: { shield: 129340000, rMult: 16, cMult: 6 }
    },
    "tenebris": { 
        name: "Tenebris", shield: 14477, ratingMin: 1200000, ratingMax: 2900000, sMin: 25, sMax: 25, mMin: 20, mMax: 25, lMin: 15, lMax: 18, key: "portal",
        power: { shield: 328508900, rMult: 15, cMult: 6 }
    },
    "stalker": { 
        name: "Stalker", shield: 16911, ratingMin: 4500000, ratingMax: 6000000, sMin: 30, sMax: 30, mMin: 45, mMax: 50, lMin: 20, lMax: 25, key: "obelisk",
        power: { shield: 983670890, rMult: 33, cMult: 8 }
    }
};

let activeBattle = null;
const getLoot = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function syncBankUI() {
    const safeSetText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    const gemVal = (playerStats.gems || 0).toLocaleString();
    // Ensure 'gem-count-top' is in this list!
    ['shop-gem-count', 'gem-val', 'gem-count-top'].forEach(id => safeSetText(id, gemVal));
     
    const energyVal = (playerStats.voidEnergy || 0).toLocaleString();
    ['void-val', 'raid-void-val', 'void-vault-amount'].forEach(id => safeSetText(id, energyVal));

    ['small', 'medium', 'large'].forEach(type => {
        safeSetText(`${type}-count`, playerStats[type + 'Charges'] || 0);
    });

    const keyNames = ['steel', 'flame', 'crystal', 'fungal', 'hydra', 'phantom', 'plague', 'hoax', 'famine', 'bloodshed', 'portal', 'obelisk'];
    keyNames.forEach(key => {
        safeSetText(`${key}-count`, playerStats[`${key}Key`] || 0); 
    });

    updateDanSystem();
    // FORCE UNDERWORLD TO UPDATE EVERY TIME WE SYNC
    updateUnderworldUI(); 
    saveProgress();
	localStorage.setItem('underworldStats', JSON.stringify(playerStats));
}


function updateUnderworldUI() {
    const now = Date.now();
    const raidToBoss = { 
        "Emergence": "volcano", "Unwavered": "megalith", "Anamnesis": "fungus", 
        "Frivolity": "vortex", "Depths": "fatum", "Cogitation": "arkhos", 
        "Proficiency": "hoaxen", "Praxis": "karcer", "Coherence": "drakaina", 
        "Trial of Resolve I": "tenebris", "Trial of Resolve II": "stalker" 
    };

    Object.entries(raidToBoss).forEach(([raidName, bossId]) => {
        const btn = document.getElementById(`btn-${bossId}`);
        if (!btn) return;

        const cooldownObj = playerStats.raidCooldowns[raidName];
        // Check if cooldownObj is an object or just a number (for backward compatibility)
        const endTime = (typeof cooldownObj === 'object') ? cooldownObj.endTime : cooldownObj;
        const isUsed = (typeof cooldownObj === 'object') ? cooldownObj.isFinishUsed : false;
        
        const isOnCooldown = endTime && endTime > now;

        // The button only shows "FINISHING" if it's on cooldown AND hasn't been used yet
        if (isOnCooldown && !isUsed) {
            btn.innerText = "FINISHING";
            btn.style.backgroundColor = "#FFD700";
            btn.style.color = "black";
            btn.setAttribute("onclick", `openBattle('${bossId}')`);
            btn.disabled = false;
        } else {
            btn.innerText = "Not Complete";
            btn.style.backgroundColor = "#333";
            btn.style.color = "#777";
            btn.setAttribute("onclick", "showGameNotice('COMPLETE RAID FIRST')");
        }
    });
}

function openBattle(bossId) {
    const boss = bossData[bossId]; if (!boss) return;
    
    // Create a reverse map to find the Raid Name from the Boss ID
    const bossToRaid = { 
        "volcano": "Emergence", "megalith": "Unwavered", "fungus": "Anamnesis", 
        "vortex": "Frivolity", "fatum": "Depths", "arkhos": "Cogitation", 
        "hoaxen": "Proficiency", "karcer": "Praxis", "drakaina": "Coherence", 
        "tenebris": "Trial of Resolve I", "stalker": "Trial of Resolve II" 
    };
    
    const raidName = bossToRaid[bossId];
    const keyName = boss.key + "Key";
    const cooldownData = playerStats.raidCooldowns[raidName];

    // Check if finish was already used for THIS specific cooldown cycle
    if (cooldownData && cooldownData.isFinishUsed) {
        showGameNotice("FINISH ALREADY USED!", 'red-mode');
        return; 
    }

    if (playerStats[keyName] > 0) {
        // Mark the finish as used in the raidCooldowns object
        if (cooldownData) {
            playerStats.raidCooldowns[raidName].isFinishUsed = true;
        }

        playerStats[keyName]--;

        // --- POWER MODE LOGIC START ---
        const isPower = document.getElementById('powerModeToggle').checked;
        
        activeBattle = JSON.parse(JSON.stringify(boss));
        activeBattle.id = bossId; 
        activeBattle.isPowerMode = isPower; 

        // Set the shield: Use boss.power.shield if toggle is ON, otherwise use boss.shield
        activeBattle.shield = isPower ? boss.power.shield : boss.shield;
        activeBattle.currentShield = activeBattle.shield;
        // --- POWER MODE LOGIC END ---
        
        const bossImg = document.getElementById('boss-battle-img');
        if(bossImg) bossImg.src = `assets/boss_icons/boss_${bossId}.jpg`;
        
        document.getElementById('battle-overlay').style.display = 'flex';
        document.getElementById('battle-screen-content').style.display = 'block';
        document.getElementById('victory-screen').style.display = 'none';
        
        updateBattleUI(); 
        syncBankUI();
    } else { 
        showGameNotice(`YOU NEED 1 ${boss.key.toUpperCase()} KEY`); 
    }
}



function updateBattleUI() {
    if (!activeBattle) return;
    const percent = (activeBattle.currentShield / activeBattle.shield) * 100;
    const bar = document.getElementById('shield-bar-fill');
    const txt = document.getElementById('shield-value-text');
    if (bar) bar.style.width = percent + "%";
    if (txt) txt.innerText = `${activeBattle.currentShield.toLocaleString()} / ${activeBattle.shield.toLocaleString()}`;
    ['small', 'medium', 'large'].forEach(t => {
        const el = document.getElementById(`${t}-count-ui`);
        if (el) el.innerText = playerStats[t + 'Charges'] || 0;
    });
}

function processVictory() {
    if (!activeBattle) return;
    document.getElementById('battle-screen-content').style.display = 'none';
    document.getElementById('victory-screen').style.display = 'block';
    
    const b = bossData[activeBattle.id];
    
    // 1. Get Base Loot
    let rWon = getLoot(b.ratingMin, b.ratingMax);
    let sWon = getLoot(b.sMin, b.sMax);
    let mWon = getLoot(b.mMin, b.mMax);
    let lWon = getLoot(b.lMin, b.lMax);

    // 2. APPLY MULTIPLIERS IF IN POWER MODE
    if (activeBattle.isPowerMode) {
        rWon = Math.floor(rWon * b.power.rMult);
        sWon = Math.floor(sWon * b.power.cMult);
        mWon = Math.floor(mWon * b.power.cMult);
        lWon = Math.floor(lWon * b.power.cMult);
    }

    // 3. Add to Player Stats
    playerStats.rating += rWon; 
    playerStats.smallCharges += sWon; 
    playerStats.mediumCharges += mWon; 
    playerStats.largeCharges += lWon;

    // 4. Update Victory UI (Text turns red if Power Mode was used)
    const rewardColor = activeBattle.isPowerMode ? "#ff0000" : "#FFD700";
    
    document.getElementById('victory-rewards-list').innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; gap:15px; margin-bottom:20px;">
            <img src="assets/beltsrating/rating.jpg" style="width:50px;">
            <span style="color:${rewardColor}; font-size:2.5rem; text-shadow: ${activeBattle.isPowerMode ? '0 0 10px #ff0000' : 'none'};">
                +${rWon.toLocaleString()}
            </span>
        </div>
        
        <div style="display:flex; flex-direction:row; justify-content:center; align-items:center; gap:30px;">
            ${sWon > 0 ? `<div style="text-align:center;"><img src="assets/energies/charge_small.jpg" style="width:40px; display:block; margin:0 auto;"> +${sWon}</div>` : ''}
            ${mWon > 0 ? `<div style="text-align:center;"><img src="assets/energies/charge_medium.jpg" style="width:40px; display:block; margin:0 auto;"> +${mWon}</div>` : ''}
            ${lWon > 0 ? `<div style="text-align:center;"><img src="assets/energies/charge_large.jpg" style="width:40px; display:block; margin:0 auto;"> +${lWon}</div>` : ''}
        </div>`;
    
    syncBankUI();
}

function closeBattle() {
    // 1. Completely shut down the overlay
    const overlay = document.getElementById('battle-overlay');
    overlay.style.display = 'none';
    
    // 2. Reset the internal battle screens so they are ready for next time
    document.getElementById('battle-screen-content').style.display = 'flex';
    document.getElementById('victory-screen').style.display = 'none';

    // 3. THE FORCE FIX: Manually ensure the Underworld is visible
    // We use !important in JS via setProperty to override any stubborn CSS
    const underworld = document.getElementById('underworld-tab');
    if (underworld) {
        underworld.style.setProperty('display', 'block', 'important');
    }

    // 4. Cleanup
    activeBattle = null; 
    syncBankUI(); 
    
    // 5. If you have a function that usually opens the map, call it here
    if (typeof updateUnderworldUI === "function") updateUnderworldUI();
    
    console.log("Battle Closed: Underworld should be visible now.");
}
// --- UTILS ---
function showGameNotice(msg, type = 'red-mode') {
    let n = document.getElementById('game-notice');
    if (!n) {
        n = document.createElement('div');
        n.id = 'game-notice';
        document.body.appendChild(n);
    }

    // Clear previous state
    n.className = 'game-notification'; 
    n.innerText = msg;

    // Apply color logic
    if (type === 'shop' || type === 'success') {
        n.classList.add('shop-mode'); // Assuming this is your "Green/Gold" style
    } else {
        n.classList.add('red-mode'); // Standard error style
    }

    // Trigger the animation
    n.classList.add('show');

    // Auto-hide
    setTimeout(() => {
        n.classList.remove('show');
    }, 2000);
}
function saveProgress() { localStorage.setItem('underworldStats', JSON.stringify(playerStats)); }

function resetAllCooldowns() { playerStats.raidCooldowns = {}; saveProgress(); updateRaidButtons(); }

window.onload = function() {
	
	if (!playerStats.ownedWeapons.includes("Fate's End")) {
        playerStats.ownedWeapons.push("Fate's End");
    }
    syncBankUI();
    updateRaidButtons();
    updateUnderworldUI();
};

function canPlayFinish(bossId) {
    const cooldownData = playerStats.raidCooldowns[bossId];
    // Only allow if boss is on cooldown AND finish hasn't been used yet
    if (cooldownData && cooldownData.isFinishUsed === false) {
        cooldownData.isFinishUsed = true; // Mark as used immediately
        return true;
    }
    showGameNotice("FINISH ALREADY USED FOR THIS COOLDOWN!");
    return false;
}




function createWeaponCard(weapon) {
    const isOwned = playerStats.ownedWeapons.includes(weapon.name);
    const isEquipped = playerStats.equippedWeapon === weapon.name;
    
    // --- HIERARCHY FIX START ---
    const leagueOrder = ['bronze', 'silver', 'gold', 'platinum', 'emerald', 'dragon', 'void'];
    const playerRankIndex = leagueOrder.indexOf(playerStats.currentBelt.toLowerCase());
    const weaponRankIndex = leagueOrder.indexOf(weapon.league.toLowerCase());
    const isEligible = playerRankIndex >= weaponRankIndex;
    // --- HIERARCHY FIX END ---

    const div = document.createElement('div');
    div.className = 'weapon-card';
    
    // ----------------------------------------------------
    // --- ENCHANTMENT ICONS RACK (NEW INTEGRATION) ---
    // ----------------------------------------------------
    // 1. Create the container for the icons
    const iconRack = document.createElement('div');
    iconRack.className = 'card-enchantment-icons';
    
    // 2. Check if this weapon has saved enchantments
    if (playerStats.weaponEnchants && playerStats.weaponEnchants[weapon.name]) {
        const enchants = playerStats.weaponEnchants[weapon.name];
        
        // Loop through the slots (1 to 5)
        Object.keys(enchants).forEach(slotId => {
            const enchantName = enchants[slotId];
            if (enchantName !== "NONE") { // Prevent empty icons
                const icon = document.createElement('img');
                icon.className = 'mini-enchant-icon';
                icon.src = `assets/currencies/${enchantName.toLowerCase()}.jpg`;
                icon.title = enchantName; // Show name on hover
                iconRack.appendChild(icon);
            }
        });
    }
    // ----------------------------------------------------
    
    let btnHTML = "";

    // NEW: Enchanting Mode Logic
    if (isEnchantingMode) {
        // In this mode, we only show "SELECT" since openWeapons already filtered for owned items
        btnHTML = `<button class="buy-btn" onclick="selectWeaponForEnchant(\`${weapon.name}\`)">SELECT FOR ENCHANT</button>`;
    } else {
        // --- EXISTING SHOP LOGIC (UNTOUCHED) ---
        if (isEquipped) {
            btnHTML = `<button class="buy-btn equipped-btn" disabled>EQUIPPED</button>`;
        } else if (isOwned) {
            btnHTML = `<button class="buy-btn" onclick="equipWeapon(\`${weapon.name}\`)">EQUIP</button>`;
        } else if (!isEligible) {
            btnHTML = `<button class="buy-btn not-eligible" disabled>NOT ELIGIBLE</button>`;
        } else {
            btnHTML = `
                <button class="buy-btn" onclick="buyWeapon(\`${weapon.name}\`, ${weapon.cost})">
                    BUY: ${weapon.cost.toLocaleString()} <img src="assets/currencies/currency_gems.jpg" class="btn-gem-icon">
                </button>`;
        }
    }

    // Define the HTML structure, inserting the new icon rack.
    div.innerHTML = `
        <img src="assets/weapons/${weapon.img}" class="weapon-img" onerror="this.src='assets/weapons/fatesend.PNG'">
        ${iconRack.outerHTML} 
        <p class="damage-glow">Damage: ${weapon.damage}</p>
        <h3 class="gold-text">${weapon.name}</h3>
        ${btnHTML}
    `;
    return div;
}

// Hidden Developer Trigger
function devInject() {
    // Inject Gems
    injectCurrency('gems', 999999);
    
    // Inject Void Energy
    injectCurrency('void', 99999999);
    
    // Visual Confirmation
    if (typeof showGameNotice === 'function') {
        showGameNotice("RESOURCES INJECTED, MASTER.", 'shop');
    }
}

// Your existing function (Ensure it's exactly like this)
function injectCurrency(type, amount) {
    const currency = type.toLowerCase();
    
    if (currency === 'gems') {
        playerStats.gems += amount;
    } else if (currency === 'void') {
        playerStats.voidEnergy += amount;
    }

    // Save to LocalStorage
    localStorage.setItem('underworldStats', JSON.stringify(playerStats));
    
    // Update the UI
    if (typeof syncBankUI === 'function') {
        syncBankUI(); 
    } else if (typeof updateUI === 'function') {
        updateUI();
    }

    console.log(`Dev Mode: Updated ${type}. Total Gems: ${playerStats.gems}`);
}


function togglePowerMode() {
    const toggle = document.getElementById('powerModeToggle');
    const isPower = toggle.checked;

    // 1. Save the choice so it doesn't reset on refresh
    localStorage.setItem('powerModeActive', isPower);

    // 2. Loop through every boss and update the shield text in the list
    Object.keys(bossData).forEach(bossId => {
        const boss = bossData[bossId];
        // Find the button first, then find the shield paragraph next to it
        const btn = document.getElementById(`btn-${bossId}`);
        if (btn) {
            const raidRow = btn.closest('.raid-row');
            const shieldText = raidRow.querySelector('.raid-info p');
            
            // Swap the number based on the toggle
            const displayShield = isPower ? boss.power.shield : boss.shield;
            shieldText.innerHTML = `Shield: ${displayShield.toLocaleString()} 🛡`;
            
            // Optional: Make the text red when in Power Mode
            shieldText.style.color = isPower ? "#ff4444" : "#fff";
        }
    });
}


// Run this when the page finishes loading
window.addEventListener('load', () => {
    const savedState = localStorage.getItem('powerModeActive') === 'true';
    const toggle = document.getElementById('powerModeToggle');
    
    if (toggle) {
        toggle.checked = savedState;
        // Trigger the function once to update all the shield numbers on the screen
        togglePowerMode();
    }
});
 
 
 
 
 
 // enchantment zone 
 
 
 function dealDamage(type) {
    if (!activeBattle) return;

    let dmg = 0;
    let multiplier = 1; 
    
    if (type === 'weapon') {
        const weaponName = playerStats.equippedWeapon;
        const w = weaponData.find(x => x.name === weaponName);
        dmg = w ? Number(w.damage) : 100;

        const weaponEnchantsObj = playerStats.weaponEnchants?.[weaponName] || {};
        const enchantsList = Object.values(weaponEnchantsObj);

        console.log(`[TEST] Weapon: ${weaponName} | Enchants:`, enchantsList);

        enchantsList.forEach(enchantName => {
    // Determine current boss max shield dynamically
    // If activeBattle.maxShield isn't set, it falls back to currentShield 
    // to ensure the math never results in 'undefined' or 'NaN'.
    const currentBossMax = activeBattle.maxShield || activeBattle.currentShield || 0;

    // 1. PRECISION (Merged with Arcane logic)
    if (enchantName === 'Precision' && Math.random() < 0.20) {
        multiplier *= 1.20; 
        spawnEnchantIcon("Precision", "player");
        
        if (enchantsList.includes('Arcane')) {
            triggerArcaneMartialArt(currentBossMax);
        }
    }

    // 2. OVERHEAT
    if (enchantName === 'Overheat' && Math.random() < 0.15) {
        multiplier *= 3.00; 
        spawnEnchantIcon("Overheat", "player");
    }

    // 3. POISONING
    if (enchantName === 'Poisoning' && (!activeEnchants.poisoning || activeEnchants.poisoning.stacks <= 0)) {
        if (Math.random() < 0.15) startPoisoningEffect(currentBossMax);
    }

    // 4. BLEEDING
    if (enchantName === 'Bleeding' && (!activeEnchants.bleeding || activeEnchants.bleeding.stacks <= 0)) {
        if (Math.random() < 0.10) startBleedingEffect(currentBossMax);
    }

    // 5. TIMEBOMB
    if (enchantName === 'Timebomb' && Math.random() < 0.05) {
        startTimeBomb(currentBossMax);
    }

    // 6. FRENZY
    if (enchantName === 'Frenzy' && !activeEnchants.frenzyActive && Math.random() < 0.08) {
        startFrenzyEffect();
    }

    // 7. TEMPEST RAGE 
    if (enchantName === 'Tempest') {
        triggerTempestStrike(currentBossMax);
    }

    // 8. CRIMSON CORRUPTION
    if (enchantName === 'Crimson' && Math.random() < 0.12) {
        updateCrimsonCorruption(currentBossMax);
    }
});
        // Apply Frenzy Buff at the end of weapon calculation
        if (activeEnchants.frenzyActive) multiplier *= 2.5;

        dmg = dmg * multiplier;

    } else {
        // CHARGE LOGIC (Stays the same)
        const chargeKey = type + 'Charges';
        if (playerStats[chargeKey] > 0) {
            dmg = type === 'small' ? 88 : (type === 'medium' ? 551 : 1051);
            playerStats[chargeKey]--;
        } else {
            showGameNotice(`OUT OF ${type.toUpperCase()} CHARGES!`);
            return;
        }
    }

    activeBattle.currentShield = Math.max(0, activeBattle.currentShield - dmg);
    updateBattleUI();
    syncBankUI();

    if (activeBattle.currentShield <= 0) processVictory();
}
 

function syncEnchantmentUI() {
    if (!selectedEnchantWeapon) return; // Safety check

    // 1. Update the Main Preview Image
    const previewImg = document.getElementById('enchant-weapon-preview');
    const noWeaponText = document.getElementById('no-weapon-text');
    const weaponNameText = document.getElementById('enchant-weapon-name');
    const leagueTag = document.getElementById('weapon-league-tag');

    if (previewImg) {
        previewImg.src = `assets/weapons/${selectedEnchantWeapon.img}`;
        previewImg.style.display = 'block';
    }
    if (noWeaponText) noWeaponText.style.display = 'none';
    if (weaponNameText) weaponNameText.innerText = selectedEnchantWeapon.name;
    if (leagueTag) {
        leagueTag.innerText = `${selectedEnchantWeapon.league} League`;
        leagueTag.style.color = getLeagueColor(selectedEnchantWeapon.league); 
    }

    // 2. Clear and Update the 5 Slots
    updateEnchantmentSlots();
}

// Helper function to handle the colors for the league text
function getLeagueColor(league) {
    const colors = {
        bronze: '#cd7f32', silver: '#c0c0c0', gold: '#FFD700',
        platinum: '#e5e4e2', emerald: '#50c878', dragon: '#ff4500', void: '#8a2be2'
    };
    return colors[league.toLowerCase()] || '#FFD700';
}
 
function updateEnchantmentSlots() {
    // We assume your weapon object now has an 'enchantments' array [null, null, null, null, null]
    const enchantments = selectedEnchantWeapon.enchantments || [null, null, null, null, null];

    document.querySelectorAll('.enchant-slot').forEach((slot, index) => {
        const data = enchantments[index];
        const icon = slot.querySelector('.applied-enchant-icon');
        const nameText = slot.querySelector('.enchantment-name');

        if (data) {
            // If there's an enchantment (we'll define 'data' later)
            icon.src = data.img;
            icon.style.display = 'block';
            nameText.innerText = data.name;
            nameText.style.color = '#FFD700';
        } else {
            // Default empty state
            icon.style.display = 'none';
            nameText.innerText = "No Enchantment";
            nameText.style.color = '#666';
        }
    });
}

function executeEnchant(tier) {
    // 1. Check if a weapon is selected
    const previewName = document.getElementById('enchant-weapon-name').innerText;
    if (previewName === "---" || !previewName) {
        showGameNotice("SELECT A WEAPON FIRST!", 'red-mode');
        return;
    }

    // 2. Check if a slot is selected
    if (selectedSlotId === null) {
        showGameNotice("SELECT AN ENCHANTMENT SLOT FIRST!", 'red-mode');
        return;
    }

    const weapon = weaponData.find(w => w.name === previewName);
    const league = weapon.league.toLowerCase();

    // 3. Compatibility Check
    const isCompatible = checkSlotCompatibility(league, selectedSlotId, tier);
    if (!isCompatible) {
        showGameNotice(`SLOT ${selectedSlotId} CANNOT HOLD ${tier.toUpperCase()}!`, 'red-mode');
        return;
    }

    // 4. Resource Check
    const costs = { 'simple': 10000, 'medium': 50000, 'legendary': 200000 };
    if (playerStats.gems < costs[tier]) {
        showGameNotice("NOT ENOUGH GEMS!", 'red-mode');
        return;
    }

    // 5. The Roll
    const pools = {
        'simple': ['Precision', 'Overheat', 'Poisoning', 'DA', 'Weakness'],
        'medium': ['Bleeding', 'Timebomb', 'Stun', 'Frenzy', 'Regeneration', 'Lifesteal'],
        'legendary': ['Karma', 'Arcane', 'Plot Twist', 'Crimson', 'Tempest']
    };
    const randomEnchant = pools[tier][Math.floor(Math.random() * pools[tier].length)];

    // 6. Deduct & Save
    playerStats.gems -= costs[tier];
    
    // Save and Update UI
    saveEnchantment(weapon.name, selectedSlotId, randomEnchant);
    updateSlotUI(selectedSlotId, randomEnchant);
    
    // Success Notification (Using 'shop' or a new 'success' class)
    showGameNotice(`${randomEnchant.toUpperCase()} APPLIED!`, 'shop');
    
    if (typeof updateUI === "function") updateUI();
    console.log(`Success! Applied ${randomEnchant} to Slot ${selectedSlotId}`);
}

function checkSlotCompatibility(league, slot, tier) {
    const isSM = (tier === 'simple' || tier === 'medium');
    const isMyth = (tier === 'legendary');

    if (league === 'bronze') {
        return slot === 1 && isSM;
    }
    if (league === 'silver') {
        if (slot === 1) return isSM;
        if (slot === 2) return isMyth;
    }
    if (league === 'gold' || league === 'platinum') {
        if (slot === 1 || slot === 2) return isSM;
        if (slot === 3) return isMyth;
    }
    if (league === 'emerald') {
        if (slot >= 1 && slot <= 3) return isSM;
        if (slot === 4) return isMyth;
    }
    if (league === 'dragon') {
        if (slot === 1 || slot === 2) return isSM;
        if (slot === 3 || slot === 4) return true; // Any of the three
    }
    if (league === 'void') {
        if (slot >= 1 && slot <= 3) return isSM;
        if (slot === 4 || slot === 5) return isMyth;
    }
    return false;
}

function openWeapons(mode = 'shop') { 
    console.log("1. openWeapons called with mode:", mode); 
    
    isEnchantingMode = (mode === 'enchant');
    const overlay = document.getElementById('weapons-overlay');
    
    if (overlay) {
        // FIX: Only append if it's not already moved to the body
        if (overlay.parentNode !== document.body) {
            document.body.appendChild(overlay); 
        }

        overlay.style.setProperty('display', 'flex', 'important');
        overlay.style.position = 'fixed'; 
        overlay.style.zIndex = '100000'; 
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.95)';
        
        // FIX: Removed overlay.scrollTop = 0; to prevent jumping to top on refresh
        console.log("3. Overlay visibility enforced");
    } else {
        console.error("Critical Error: #weapons-overlay not found!");
        return;
    }

    const leagues = ['bronze', 'silver', 'gold', 'platinum', 'emerald', 'dragon', 'void'];
    leagues.forEach(league => {
        const grid = document.getElementById(`${league}-weapons-grid`);
        if (grid) grid.innerHTML = '';
    });

    weaponData.forEach(weapon => {
        if (isEnchantingMode && !playerStats.ownedWeapons.includes(weapon.name)) {
            return; 
        }
        const card = createWeaponCard(weapon);
        const targetGrid = document.getElementById(`${weapon.league.toLowerCase()}-weapons-grid`);
        if (targetGrid) targetGrid.appendChild(card);
    });
    
    const resetBtn = document.querySelector('.reset-btn');
    if (resetBtn) resetBtn.style.visibility = 'hidden';
}

function selectWeaponForEnchant(weaponName) {
    const weapon = weaponData.find(w => w.name === weaponName);
    if (!weapon) return;

    // 1. Update Preview UI
    document.getElementById('enchant-weapon-name').innerText = weapon.name;
    const previewImg = document.getElementById('enchant-weapon-preview');
    previewImg.src = `assets/weapons/${weapon.img}`;
    previewImg.style.display = 'block';
    document.getElementById('no-weapon-text').style.display = 'none';
    document.getElementById('weapon-league-tag').innerText = `${weapon.league} League`;

    // 2. Reset Selection State
    selectedSlotId = null;
    document.querySelectorAll('.enchant-slot').forEach(slot => {
        slot.style.border = "1px solid rgba(255,255,255,0.2)";
        slot.style.boxShadow = "none";
    });

    // 3. Load Existing Enchantments for this weapon into the Slots
    loadWeaponEnchantments(weapon.name);

    // Close overlay
    document.getElementById('weapons-overlay').style.display = 'none';
}

function updateSlotUI(slotId, enchantName) {
    const slotDiv = document.querySelector(`.enchant-slot[data-slot="${slotId}"]`);
    if (slotDiv) {
        // Update Text
        const nameLabel = slotDiv.querySelector('.enchantment-name');
        if (nameLabel) {
            nameLabel.innerText = enchantName.toUpperCase();
            nameLabel.style.color = "#FFD700";
        }
        // Update & Show Icon
        const iconImg = slotDiv.querySelector('.applied-enchant-icon');
        if (iconImg) {
            iconImg.src = `assets/currencies/${enchantName.toLowerCase()}.jpg`;
            iconImg.style.display = 'block';
        }
    }
}





// Logic to handle the Poisoning Ticker specifically
function startPoisoningEffect(maxShieldValue) {
    const totalShield = Number(maxShieldValue);
    if (isNaN(totalShield) || totalShield <= 0) {
        console.error("Poisoning failed: Boss Max Shield is invalid:", maxShieldValue);
        return;
    }

    if (!activeEnchants) activeEnchants = {};
    activeEnchants.poisoning = { stacks: 5 };

    // CHANGED: "boss" to "player" to move it to the RIGHT side
    const icon = spawnEnchantIcon("Poisoning", "player", 5); 

    activeEnchants.poisoning.timer = setInterval(() => {
        if (!activeBattle || activeBattle.currentShield <= 0) {
            clearInterval(activeEnchants.poisoning.timer);
            if (icon) icon.remove();
            return;
        }

        activeEnchants.poisoning.stacks--;

        const poisonDmg = Math.floor(totalShield * 0.05);
        activeBattle.currentShield = Math.max(0, activeBattle.currentShield - poisonDmg);

        updateBattleUI(); 

        if (icon) {
            icon.classList.remove('animate-pulse-standard');
            void icon.offsetWidth; 
            icon.classList.add('animate-pulse-standard');
            const counter = icon.querySelector('.enchant-counter');
            if (counter) counter.innerText = `x${activeEnchants.poisoning.stacks}`;
        }

        if (activeEnchants.poisoning.stacks <= 0) {
            clearInterval(activeEnchants.poisoning.timer);
            setTimeout(() => { if (icon) icon.remove(); }, 1000);
        }
    }, 1000);
}

function loadWeaponEnchantments(weaponName) {
    // 1. First, clear all existing slots in the UI to "No Enchantment"
    const leagues = [1, 2, 3, 4, 5];
    leagues.forEach(slotId => {
        const slotDiv = document.querySelector(`.enchant-slot[data-slot="${slotId}"]`);
        if (slotDiv) {
            const nameLabel = slotDiv.querySelector('.enchantment-name');
            const iconImg = slotDiv.querySelector('.applied-enchant-icon');
            if (nameLabel) nameLabel.innerText = "NO ENCHANTMENT";
            if (nameLabel) nameLabel.style.color = "rgba(255,255,255,0.5)";
            if (iconImg) iconImg.style.display = 'none';
        }
    });

    // 2. Check if this weapon actually has saved enchants in your playerStats
    if (playerStats.weaponEnchants && playerStats.weaponEnchants[weaponName]) {
        const enchants = playerStats.weaponEnchants[weaponName];
        // Loop through the saved enchants and update the UI
        Object.keys(enchants).forEach(slotId => {
            updateSlotUI(slotId, enchants[slotId]);
        });
    }
}

function updateUI() {
    console.log("Stats synced: Gems and Energy updated.");
    // If you have a specific function like syncBankUI(), call it here:
    if (typeof syncBankUI === "function") syncBankUI();
}

function saveEnchantment(weaponName, slotId, enchantName) {
    // 1. Ensure the weaponEnchants object exists in playerStats
    if (!playerStats.weaponEnchants) {
        playerStats.weaponEnchants = {};
    }

    // 2. Ensure this specific weapon has an entry
    if (!playerStats.weaponEnchants[weaponName]) {
        playerStats.weaponEnchants[weaponName] = {};
    }

    // 3. Save the enchantment name to the specific slot (1-5)
    playerStats.weaponEnchants[weaponName][slotId] = enchantName;

    // 4. Call your existing save function to push to LocalStorage
    if (typeof saveProgress === "function") {
        saveProgress();
    }
    
    console.log(`Data Saved: ${enchantName} is now in ${weaponName} Slot ${slotId}`);
}

const ENCHANTMENT_DATA = {
    // SIMPLE
    "Precision": { tier: "simple", damageMult: 0.20, type: "instant", animation: "animate-fade-smooth" },
    "Overheat": { tier: "simple", damageMult: 2.00, type: "instant", animation: "animate-fade-smooth" },
    "Poisoning": { tier: "simple", dotPercent: 0.05, stacks: 5, animation: "animate-pulse-standard" },

    // MEDIUM
    "Bleeding": { tier: "medium", dotPercent: 0.20, stacks: 7, animation: "animate-pulse-standard" },
    "Timebomb": { tier: "medium", minShieldDmg: 0.40, maxShieldDmg: 0.80, timer: 5, animation: "animate-pulse-large" },
    "Frenzy": { tier: "medium", damageMult: 1.50, duration: 7, animation: "animate-pulse-standard" },

    // MYTHICAL
    "Tempest": { tier: "mythical", hitTrigger: 6, minTrueDmg: 2000, maxTrueDmg: 20000 },
    "Crimson": { tier: "mythical", maxStacks: 12, bleedPerStack: 0.18 },
    "Arcane": { tier: "mythical", require: "Precision", triggerCount: 10, bombCount: 5, bombDmg: 0.10 }
};

function spawnEnchantIcon(enchantName, side = 'player', initialStacks = null) {
    const containerId = (side === 'boss') ? 'boss-status-effects' : 'player-status-effects';
    const container = document.getElementById(containerId);
    if (!container) return null;

    const data = ENCHANTMENT_DATA[enchantName];
    
    // --- PREVENT DUPLICATES ---
    // If it's a stackable/permanent effect, check if it's already there
    let iconDiv = document.getElementById(`battle-icon-${enchantName.toLowerCase()}`);
    
    if (iconDiv) {
        // Just update stacks if it exists
        if (initialStacks !== null) {
            const counter = iconDiv.querySelector('.enchant-counter');
            if (counter) counter.innerText = `x${initialStacks}`;
        }
        return iconDiv;
    }

    // --- CREATE NEW ICON ---
    iconDiv = document.createElement('div');
    iconDiv.className = 'battle-enchant-icon';
    iconDiv.id = `battle-icon-${enchantName.toLowerCase()}`;
    iconDiv.style.backgroundImage = `url('assets/currencies/${enchantName.toLowerCase()}.jpg')`;
    
    if (data && data.animation) iconDiv.classList.add(data.animation);

    if (initialStacks !== null) {
        const counter = document.createElement('span');
        counter.className = 'enchant-counter';
        counter.innerText = `x${initialStacks}`;
        iconDiv.appendChild(counter);
    }

    // --- LAYERED POSITIONING ---
    // Mythical = Top, Medium = Middle, Simple = Bottom
    if (data.tier === "mythical") {
        container.prepend(iconDiv); // Put at the very top
    } else if (data.tier === "medium") {
        // Insert after Mythicals but before Simples
        const firstSimple = container.querySelector('.tier-simple');
        if (firstSimple) {
            container.insertBefore(iconDiv, firstSimple);
        } else {
            container.appendChild(iconDiv);
        }
    } else {
        iconDiv.classList.add('tier-simple');
        container.appendChild(iconDiv); // Standard bottom-add
    }

    // Auto-cleanup for Instant Simple enchants (Precision/Overheat)
    if (data.type === "instant") {
        setTimeout(() => {
            iconDiv.style.opacity = "0";
            setTimeout(() => iconDiv.remove(), 500);
        }, 2000);
    }

    return iconDiv;
}

function startBleedingEffect(maxHealth) {
    const totalDmgPerSec = maxHealth * 0.09; // Reduced rate
    const dmgPerTick = totalDmgPerSec / 20; 
    
    activeEnchants.bleeding = { stacks: 7 };
    const icon = spawnEnchantIcon("Bleeding", "player", 7); // RIGHT SIDE

    let tickCount = 0;
    const bleedInterval = setInterval(() => {
        if (!activeBattle || activeBattle.currentShield <= 0) {
            clearInterval(bleedInterval);
            icon?.remove();
            return;
        }

        activeBattle.currentShield = Math.max(0, activeBattle.currentShield - dmgPerTick);
        updateBattleUI();

        tickCount++;
        if (tickCount >= 10) { 
            tickCount = 0;
            activeEnchants.bleeding.stacks--;
            if (icon) icon.querySelector('.enchant-counter').innerText = `x${activeEnchants.bleeding.stacks}`;

            if (activeEnchants.bleeding.stacks <= 0) {
                clearInterval(bleedInterval);
                icon?.remove();
            }
        }
    }, 100); 
}


function startTimeBomb(maxShield) {
    let timeLeft = 5;
    const icon = spawnEnchantIcon("Timebomb", "player", timeLeft); // RIGHT SIDE

    const bombInterval = setInterval(() => {
        if (!activeBattle || activeBattle.currentShield <= 0) {
            clearInterval(bombInterval);
            icon?.remove();
            return;
        }

        timeLeft--;
        const counter = icon.querySelector('.enchant-counter');
        if (counter) counter.innerText = `x${timeLeft}`;

        if (timeLeft <= 0) {
            clearInterval(bombInterval);
            const explosionDmg = maxShield * 0.40; // Default 40%
            activeBattle.currentShield = Math.max(0, activeBattle.currentShield - explosionDmg);
            updateBattleUI();
            icon.remove();
        }
    }, 1000);
}

let frenzyMultiplier = 1;

function startFrenzyEffect() {
    activeEnchants.frenzyActive = true;
    const icon = spawnEnchantIcon("Frenzy", "player");

    setTimeout(() => {
        activeEnchants.frenzyActive = false;
        if (icon) {
            icon.style.opacity = "0";
            setTimeout(() => icon.remove(), 500);
        }
    }, 7000); 
}

let arcanePrecisionStacks = 0;

function triggerArcaneMartialArt(maxShield) {
    arcanePrecisionStacks++;
    const icon = spawnEnchantIcon("Arcane", "player", arcanePrecisionStacks);

    if (arcanePrecisionStacks >= 10) {
        showGameNotice("ARCANE MARTIAL ART ACTIVATED!");
        let ticks = 5;
        
        const arcaneInterval = setInterval(() => {
            if (!activeBattle || activeBattle.currentShield <= 0 || ticks <= 0) {
                clearInterval(arcaneInterval);
                arcanePrecisionStacks = 0;
                icon?.remove();
                return;
            }

            // Deal exactly 10% of THIS boss's Max Shield
            const burnDmg = maxShield * 0.10;
            activeBattle.currentShield = Math.max(0, activeBattle.currentShield - burnDmg);
            
            updateBattleUI();
            ticks--;
            
            
        }, 1000);
    }
} 

let tempestHitCounter = 0;

function triggerTempestStrike(currentBossMaxShield) {
    tempestHitCounter++;
    const icon = spawnEnchantIcon("Tempest", "player", tempestHitCounter);

    if (tempestHitCounter >= 6) {
        // Roll: 20% to 200% of the CURRENT boss's total shield
        const roll = Math.random() * (0.85 - 0.2) + 0.2;
        const executionDmg = Math.floor(currentBossMaxShield * roll);
        
        activeBattle.currentShield = Math.max(0, activeBattle.currentShield - executionDmg);
        
        console.log(`[Tempest] Scaling to Max: ${currentBossMaxShield} | Roll: ${Math.round(roll*100)}% | Dmg: ${executionDmg}`);
        
        // Reset counter and clear icon
        tempestHitCounter = 0;
        icon.style.filter = "brightness(3) saturate(2)";
        setTimeout(() => icon.remove(), 400);
        
        updateBattleUI();
    }
}

let crimsonStacks = 0;
let crimsonInterval = null;

function updateCrimsonCorruption(maxShield) {
    if (crimsonStacks >= 12) return; 
    crimsonStacks++;
    
    spawnEnchantIcon("Crimson", "player", crimsonStacks);

    if (!crimsonInterval) {
        crimsonInterval = setInterval(() => {
            if (!activeBattle || activeBattle.currentShield <= 0) {
                clearInterval(crimsonInterval);
                crimsonInterval = null;
                crimsonStacks = 0;
                return;
            }
            // 1.8% per stack per second, scaled to THIS boss
            const drainPerTick = ((maxShield * 0.018) * crimsonStacks) / 20; 
            activeBattle.currentShield = Math.max(0, activeBattle.currentShield - drainPerTick);
            updateBattleUI();
        }, 50);
    }
}