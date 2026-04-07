# 🏃 Wall Runner

A side-scrolling runner game. Dodge obstacles, and when you hit a wall, tilt your phone to make the wall the floor!

## 🎮 How to Play

[▶ Open index.html in your browser to play instantly](index.html)

## 🕹️ Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Jump | `Space` / `↑` | Tap upper half of screen |
| Duck | `↓` | Tap lower half of screen |
| Wall rotation | `R` | Tilt phone / Tap |
| Start / Restart | Any key | Tap |

## ⚙️ Game Rules

- The player runs automatically.
- **Tall obstacles (red)** → Jump over them.
- **Low obstacles (orange)** → Duck under them.
- When a **purple wall** appears, press `R` or tilt your phone to rotate the world 90°. The wall becomes the floor!
- The background theme changes with every rotation (4 color cycle).

## ✨ Features

- HTML5 Canvas based, runs directly in the browser with no installation
- Mobile touch & DeviceOrientation API support
- Score / best score saved (within session)
- Increasing difficulty as obstacle gaps narrow
- Jump & landing particle effects & camera shake
- HUD warning bar when approaching a wall

## 🚀 How to Run

```bash
# Open index.html directly in your browser without a local server, or
# spin up a simple local server:
python3 -m http.server 8080
# → Play at http://localhost:8080
```