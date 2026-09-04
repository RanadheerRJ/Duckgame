# 🦆 Duck Havoc — Ducks vs Shotgun

A single-player arcade shooter in the browser. You're the last hunter in the valley:
waves of ducks fly over — and these ducks **fight back**. Blast them out of the sky
with your double-barrel shotgun, dodge falling eggs and kamikaze dives, and survive
as many waves as you can.

Built with plain **HTML + CSS + JavaScript** (Canvas 2D + Web Audio). No build step,
no assets, no dependencies — every sprite, sound and cloud is generated in code.

## ▶️ Run it

Any static file server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Or just open `index.html` directly in a browser.)

## 🎮 Controls

| Action | Touch / Mobile | Keyboard / Mouse |
|---|---|---|
| Move | 🕹️ Virtual joystick (left side) | `A`/`D` or `←`/`→` |
| Jump-dodge | Flick joystick up | `W`, `↑` |
| Shoot | 🔥 FIRE button (right side — or tap anywhere right) | Click or `Space` |
| Aim | Auto-aim at nearest threat | Mouse |
| Restart | ↻ button (top right) | `R` |
| Mute | 🔊 button | `M` |
| Pause | Auto-pauses when tab hidden | `P` |

## 🕹️ Gameplay

- **Health bar** (top left) — eggs −15 HP, kamikaze ducks −25 HP. +10 HP for clearing
  a wave, ✨ golden ducks drop parachute medkits (+30 HP).
- **Shotgun** — 2 shells, auto-pump reload. Hit multiple ducks with one blast for
  DOUBLE / TRIPLE / RAMPAGE combo bonuses.
- **Waves** — each wave is faster and meaner: 🥚 bomber ducks drop eggs (wave 2+),
  💣 kamikaze ducks dive-bomb you (wave 3+). The sky cycles day → sunset → dusk → night.
- Score, best score (saved locally), wave counter and restart are always on the HUD.

## 🧱 Project layout

```
index.html   — canvas + HUD/overlays (health bar, score, restart, touch controls)
style.css    — HUD, joystick, fire button, screens
game.js      — the whole game: loop, physics, waves, rendering, Web Audio SFX
```

Tuning knobs (speeds, damage, wave sizes…) live at the top of `game.js`
under *tuning constants*.
