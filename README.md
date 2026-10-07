# Traveler / Путешественник

Fly a shuttle through the real-scale Solar System in the browser: https://traveler.tomerisr.org.il

- Three.js (no build step), everything in `web/`
- Real distances and radii (1 unit = 1000 km), planets at today's positions (NASA J2000 elements)
- Planet maps: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0), Earth — NASA Blue Marble; facts — NASA Planetary Fact Sheet

Run locally: `python -m http.server 8766 --directory web` → http://localhost:8766
