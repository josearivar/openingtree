# Openingtree (with Stockfish Integration)

Fork of [openingtree.com](https://www.openingtree.com) with integrated Stockfish 17.1 engine analysis.

This project downloads chess games in form of a PGN from any source, applies specified filters and constructs an opening tree. The tree is visualized on a chessboard with win percentages and other statistics.

## New Features: Stockfish Integration

This fork adds Lichess-style Stockfish engine analysis:

- **Evaluation Bar** - Vertical bar showing position assessment (like Lichess)
- **Top Move Suggestions** - Display top 3 best moves with evaluations in algebraic notation
- **Interactive Analysis** - Click moves to play them, hover to highlight on board
- **Board Flip Support** - Evaluation bar correctly flips with board orientation

### Screenshots

When engine is enabled, you'll see:
- Evaluation bar on the left side of the board
- Engine analysis panel below the board showing best lines

## Architecture diagram
This does not correlate one to one with the code modules but the interactions at a high level are depicted accurately.

![GitHub Logo](/docs/images/architecture.png)

## Run locally
```
npm install --legacy-peer-deps
NODE_OPTIONS=--openssl-legacy-provider npm start
```
starts a server on port `3000`

## Build for production
```
NODE_OPTIONS=--openssl-legacy-provider npm run build
```

## Attribution

This project uses code and concepts from:
- [OpeningTree](https://github.com/openingtree/openingtree) - GPL-3.0
- [Lichess](https://github.com/lichess-org/lila) - AGPL-3.0 (evaluation concepts)
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) - GPL-3.0
- [Stockfish](https://github.com/official-stockfish/Stockfish) - GPL-3.0

See [ATTRIBUTION.md](ATTRIBUTION.md) for full details.

## License

GPL-3.0 (same as original OpeningTree)
