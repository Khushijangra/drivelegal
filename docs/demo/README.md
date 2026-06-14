# Demo

Place demo assets in this directory.

## Required Demo Assets

| File | Description | Specs |
|---|---|---|
| `demo.gif` | Animated walkthrough of complete query flow | Max 10MB, 1280×720, 60 seconds |
| `demo-video.mp4` | Full demo video | 2-3 minutes |
| `query-demo.gif` | Natural language query to evidence answer | 15 seconds |
| `vision-demo.gif` | Image upload to violation detection | 10 seconds |

## Demo Script (What to Record)

### Scene 1 — Natural Language Query (0:00–0:20)
1. Open http://localhost:5173
2. Type: `"What is the fine for riding without a helmet in Delhi?"`
3. Show jurisdiction resolution (India → NCT Delhi → West District)
4. Show answer appearing with formatted sections (Fine Summary, Legal Provision, Fine Amount)
5. Scroll to Evidence Bundle — show source document title, page number, excerpt

### Scene 2 — Challan Breakdown (0:20–0:40)
1. Click on the Challan section
2. Show line items: offense code, base fine, compounding fine, source clause
3. Show total calculation with modifiers

### Scene 3 — Computer Vision (0:40–1:00)
1. Click Vision Analysis tab
2. Upload a road image (motorcycle rider)
3. Show YOLOS detection results
4. Show violation report: "Missing helmet on rider — Sec 129/194D MVA — ₹1000"
5. Show stage timings (decode, YOLOS, classifier)

### Scene 4 — Rules Search (1:00–1:10)
1. Navigate to Rules Search
2. Type: `helmet`
3. Show matching rules with verification status and source references

## Recording Tools

- **Windows**: [ShareX](https://getsharex.com/) (free, GIF + MP4)
- **macOS**: QuickTime + [Gifski](https://gif.ski/) for GIF conversion
- **Cross-platform**: [OBS Studio](https://obsproject.com/)

## GIF Optimization

```bash
# Optimize GIF size with gifsicle (optional)
gifsicle --optimize=3 --delay=5 demo.gif > demo-optimized.gif
```
