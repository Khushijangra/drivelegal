# Screenshots

Place UI screenshots in this directory.

## Required Screenshots for README

| Filename | Content |
|---|---|
| `banner.png` | Project banner / hero image (1280×640px recommended) |
| `query-ui.png` | Natural language query interface with a sample result |
| `evidence-bundle.png` | Evidence bundle showing citations with page numbers |
| `challan-result.png` | Challan breakdown with offense line items and total fine |
| `vision-analysis.png` | Computer vision result with bounding boxes |

## How to Capture

1. Start the app: `docker-compose up -d`
2. Open http://localhost:5173
3. Run a sample query, e.g.: `"Fine for not wearing helmet in Delhi"`
4. Use your OS screenshot tool or browser DevTools → capture at 1280px width

## Tools

- **Windows**: Snipping Tool, ShareX (free, supports GIF recording)
- **macOS**: `Cmd+Shift+4` for screenshots, QuickTime for screen recording
- **GIF**: [ShareX](https://getsharex.com/) or [Gyazo](https://gyazo.com/)

## Demo GIF

Place a `demo.gif` (max 10MB) in the `docs/` directory showing:
1. User types a legal question
2. System resolves jurisdiction (map or text display)
3. Answer appears with evidence citations
4. Challan breakdown is shown
