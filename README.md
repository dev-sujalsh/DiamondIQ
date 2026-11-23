# 💎 DiamondIQ — Diamond Knowledge Dashboard

A premium, fully self-contained web dashboard featuring **100 expert diamond Q&As**, user authentication, real-time stats, interactive charts, and the ability to add your own questions.

---

## 🚀 How to Run (Choose Any Method)

### ▶ Method 1 — Double-Click (Simplest, No Installation)
1. Open the `diamond-dashboard` folder
2. Double-click **`index.html`**
3. It opens directly in your browser — works out of the box ✅

> The dataset loads from the embedded `diamonds-data.js` fallback when no server is present.

---

### ▶ Method 2 — Python Server (Recommended for best performance)
If you have Python installed:

**Windows:**
```
Double-click  start-windows.bat
```
*or in Command Prompt / PowerShell:*
```
python -m http.server 3000
```
Then open: **http://localhost:3000**

**Mac / Linux:**
```
bash start-mac.sh
```
*or manually:*
```bash
python3 -m http.server 3000
```
Then open: **http://localhost:3000**

---

### ▶ Method 3 — VS Code Live Server
1. Open the folder in VS Code
2. Install the **Live Server** extension (by Ritwick Dey)
3. Right-click `index.html` → **Open with Live Server**

---

## 🔐 Login Credentials

| Field    | Value                |
|----------|----------------------|
| Email    | admin@diamond.com    |
| Password | diamond123           |

You can also **register a new account** from the login page.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 Auth | Login / Register — session stored in browser (localStorage) |
| 📊 Dashboard | Animated stat cards, bar chart, doughnut chart, difficulty bars |
| 🔍 Q&A Explorer | Browse, search and filter all 100 diamond questions |
| ➕ Add Question | Your questions instantly update the dashboard charts and stats |
| 👤 Profile | View and delete your contributed questions |
| 📄 JSON Dataset | All 100 base questions stored in `diamonds.json` |

---

## 📁 Project Files

```
diamond-dashboard/
├── index.html          ← Main app entry point
├── styles.css          ← Premium dark glassmorphism design
├── app.js              ← Full SPA logic (auth, routing, charts)
├── diamonds.json       ← Dataset: 100 Q&As in pure JSON format
├── diamonds-data.js    ← Inline JS copy of JSON (enables file:// mode)
├── start-windows.bat   ← Windows: launch Python server + open browser
├── start-mac.sh        ← Mac/Linux: launch Python server + open browser
└── README.md           ← This file
```

---

## 💎 Diamond Q&A Categories

| Category     | Questions | Topics |
|--------------|-----------|--------|
| ⭐ Grading   | 20        | 4 Cs, GIA, clarity scales, cut grades |
| 📜 History   | 15        | Koh-i-Noor, Hope Diamond, De Beers |
| 💰 Pricing   | 15        | Rapaport, carat pricing, lab-grown |
| ⛏️ Mining    | 15        | Kimberlite, Kimberley Process, Argyle |
| 💍 Jewelry   | 15        | Settings, ring styles, metals |
| 🔬 Science   | 10        | Carbon bonds, CVD, HPHT, fluorescence |
| ✨ Care      | 10        | Cleaning, storage, rhodium plating |

---

## ℹ️ Technical Notes

- **No backend required** — all data stored in browser `localStorage`
- **No build step** — pure HTML + CSS + JavaScript
- **Chart.js** loaded from CDN (internet connection needed for charts)
- User-added questions survive page refresh and are stored locally per browser
- Tested on Chrome, Firefox, Edge, and Safari

---

*Built with 💎 by DiamondIQ Platform*
