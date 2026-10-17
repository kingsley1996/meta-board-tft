import type { ReactNode } from 'react';

const ROWS = 4;
const COLS = 7;

// Empty 4x7 TFT board (dark frame, flat hexes, staggered rows). Cells size
// themselves from the container width via CSS; renderCell overlays content in
// a cell without changing the board itself.
export function HexBoard({ renderCell }: { renderCell?: (row: number, col: number) => ReactNode }) {
  return (
    <div className="hex-board-frame">
      <div className="hex-board">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="hex-board-row">
            {Array.from({ length: COLS }, (_, col) => (
              <div key={col} className="hex-board-cell">
                <span className="hex-board-face" />
                {renderCell?.(row, col)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
