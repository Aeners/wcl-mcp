# WoW Domain Knowledge for WCL Analysis

## General Coaching Heuristics

### Death Analysis (Highest Leverage)
- Deaths cost **5 seconds each** on the M+ timer and compound: one death often causes a cascade
- Reducing deaths is typically more impactful than increasing DPS
- Check damage taken context before concluding a death was unavoidable
- A death to a boss ability looks unavoidable until you see the player was already at 40% HP from avoidable damage

### Cast Frequency (Most Actionable)
- Comparing a player's ability usage against expected patterns reveals specific improvements
- "You cast Shield Wall 0.8 times per run vs expected 2-3 times" is actionable
- Defensive cooldown usage gaps are the #1 coaching signal for tanks and DPS

### Damage Taken
- Distinguish avoidable vs unavoidable damage sources
- High avoidable damage taken indicates positioning or awareness issues
- Cross-reference with deaths for root cause analysis

### Overhealing
- High overhealing (>30%) suggests inefficient healing patterns
- Some overhealing is normal (HoTs, absorbs, reactive healing)
- Context matters: overhealing in easy content is less concerning

### Buff Uptime
- For specs with maintained buffs/DoTs, uptime is a key performance indicator
- Low uptime on core buffs indicates rotation problems no gear can fix

## M+ Timer Context
- +2 timer: 40% over base time
- +3 timer: 20% over base time
- Each death costs 5 seconds
- Failed timer still completes the key but doesn't upgrade it

## Role-Specific Analysis Tips

### Tanks
- Look at: deaths, defensive cooldown usage, damage taken sources
- Compare damage taken to group average to identify spikey intake
- External defensive usage from healers can mask tank problems

### Healers
- Look at: HPS, overhealing %, deaths prevented, mana efficiency
- Deaths are the primary healer metric (did people die?)
- High HPS with deaths = healing wrong targets or too late

### DPS
- Look at: DPS, damage taken (avoidable), death count, buff uptime
- DPS alone is misleading without death/interrupt context
- A DPS who never dies and interrupts is more valuable than a parse hero who causes wipes

## Difficulty Mappings
- LFR: difficulty 1
- Normal: difficulty 3
- Heroic: difficulty 4
- Mythic: difficulty 5
- M+ keystone level is stored in keystoneLevel field on fights
